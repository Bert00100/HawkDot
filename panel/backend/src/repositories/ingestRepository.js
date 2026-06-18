// =====================================================================
// HawkDot backend — repositório de INGESTÃO
//
// Recebe o payload de uma coleta vinda do agente e grava em 3 tabelas
// dentro de UMA transação (tudo ou nada):
//   1. agents          -> upsert (cria na 1ª vez, atualiza depois)
//   2. collections     -> 1 linha por envio
//   3. test_results    -> N linhas (uma por teste)
//   4. system_snapshots-> 1 linha (dados de hardware/SO)
//
// PASSO A PASSO (debug humano):
//   - Se a coleta não aparecer no banco, comece olhando se o agent_id
//     chegou no payload (sem ele não dá pra associar a coleta).
//   - A constraint UNIQUE(agent_id, collection_number) evita duplicar a
//     mesma coleta; usamos ON CONFLICT DO NOTHING para ser idempotente.
// =====================================================================

import { withTransaction } from '../db.js';

// Faz upsert do agente pelo agent_id (chave natural) e devolve o id interno.
async function upsertAgent(client, agent) {
  const sql = `
    INSERT INTO agents
      (agent_id, agent_name, hostname, os, os_version, arch, model, serial_number,
       mac_addresses, local_ips, dns_servers, default_gateway)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (agent_id) DO UPDATE SET
       agent_name      = EXCLUDED.agent_name,
       hostname        = EXCLUDED.hostname,
       os              = EXCLUDED.os,
       os_version      = EXCLUDED.os_version,
       arch            = EXCLUDED.arch,
       model           = EXCLUDED.model,
       serial_number   = EXCLUDED.serial_number,
       mac_addresses   = EXCLUDED.mac_addresses,
       local_ips       = EXCLUDED.local_ips,
       dns_servers     = EXCLUDED.dns_servers,
       default_gateway = EXCLUDED.default_gateway
    RETURNING id;`;
  const { rows } = await client.query(sql, [
    agent.agent_id,
    agent.agent_name ?? null,
    agent.hostname ?? null,
    agent.os ?? null,
    agent.os_version ?? null,
    agent.arch ?? null,
    agent.model ?? null,
    agent.serial_number ?? null,
    agent.mac_addresses ?? null,
    agent.local_ips ?? null,
    agent.dns_servers ?? null,
    agent.default_gateway ?? null,
  ]);
  return rows[0].id;
}

// Insere a coleta. Idempotente: se a mesma (agent_id, collection_number)
// já existir, não duplica e devolve o id existente.
async function insertCollection(client, agentDbId, c) {
  const insert = `
    INSERT INTO collections (agent_id, collection_number, local_time, queue_depth)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (agent_id, collection_number) DO NOTHING
    RETURNING id;`;
  const res = await client.query(insert, [
    agentDbId,
    c.collection_number ?? null,
    c.local_time ?? null,
    c.queue_depth ?? null,
  ]);
  if (res.rows.length) return { id: res.rows[0].id, duplicated: false };

  // Já existia: busca o id para não quebrar o resto.
  const found = await client.query(
    'SELECT id FROM collections WHERE agent_id = $1 AND collection_number = $2',
    [agentDbId, c.collection_number ?? null],
  );
  return { id: found.rows[0].id, duplicated: true };
}

async function insertTestResults(client, collectionId, tests = []) {
  for (const t of tests) {
    await client.query(
      `INSERT INTO test_results
        (collection_id, type, name, target, success,
         latency_ms, packet_loss_percent, jitter_ms,
         response_time_ms, resolved_address,
         total_time_ms, http_status_code, throughput_mbps, bytes_transferred, speed_kind,
         route_hop_count, route_last_hop, connect_time_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        collectionId, t.type, t.name ?? null, t.target ?? null, t.success ?? null,
        t.latency_ms ?? null, t.packet_loss_percent ?? null, t.jitter_ms ?? null,
        t.response_time_ms ?? null, t.resolved_address ?? null,
        t.total_time_ms ?? null, t.http_status_code ?? null, t.throughput_mbps ?? null,
        t.bytes_transferred ?? null, t.speed_kind ?? null,
        t.route_hop_count ?? null, t.route_last_hop ?? null, t.connect_time_ms ?? null,
      ],
    );
  }
}

async function insertSnapshot(client, collectionId, s) {
  if (!s) return;
  await client.query(
    `INSERT INTO system_snapshots
      (collection_id, cpu_model, cpu_cores, cpu_logical_cores, cpu_load_1,
       memory_physical_bytes, memory_used_bytes, memory_free_bytes, memory_alloc_bytes,
       disk_total_bytes, disk_free_bytes, temperature_c, temp_source, public_ip, isp,
       interface_name, interface_status, interface_speed_mbps, interface_hardware_port)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (collection_id) DO NOTHING`,
    [
      collectionId, s.cpu_model ?? null, s.cpu_cores ?? null, s.cpu_logical_cores ?? null,
      s.cpu_load_1 ?? null, s.memory_physical_bytes ?? null, s.memory_used_bytes ?? null,
      s.memory_free_bytes ?? null, s.memory_alloc_bytes ?? null, s.disk_total_bytes ?? null,
      s.disk_free_bytes ?? null, s.temperature_c ?? null, s.temp_source ?? null,
      s.public_ip ?? null, s.isp ?? null, s.interface_name ?? null, s.interface_status ?? null,
      s.interface_speed_mbps ?? null, s.interface_hardware_port ?? null,
    ],
  );
}

// Ponto de entrada: grava a coleta inteira de forma atômica.
export function ingestCollection(payload) {
  return withTransaction(async (client) => {
    const agentDbId = await upsertAgent(client, payload.agent);
    const { id: collectionId, duplicated } = await insertCollection(
      client, agentDbId, payload.collection ?? {},
    );
    if (!duplicated) {
      await insertTestResults(client, collectionId, payload.test_results);
      await insertSnapshot(client, collectionId, payload.system_snapshot);
    }
    return { agentDbId, collectionId, duplicated };
  });
}
