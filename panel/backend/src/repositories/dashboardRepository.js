// =====================================================================
// HawkDot backend — repositório do DASHBOARD (consultas de leitura)
//
// Reúne as queries que alimentam as telas:
//   - latestCollectionPerAgent: a coleta mais recente de cada agente
//     (base da tabela "Resultado por Rede" e dos cards do topo).
//   - getTestResults / getSnapshot: detalhe de uma coleta.
//   - getHistory: histórico agregado por período (24h / 7d / 30d).
//   - getInterfaces: interfaces de rede da máquina (último snapshot).
// =====================================================================

import { query } from '../db.js';

// Pega, para cada agente, o id da coleta mais recente (por received_at).
// Usamos DISTINCT ON, que é a forma idiomática de "última linha por grupo"
// no PostgreSQL.
export async function latestCollectionPerAgent() {
  const { rows } = await query(`
    SELECT DISTINCT ON (c.agent_id)
           a.id            AS agent_id,
           a.agent_name,
           a.hostname,
           c.id            AS collection_id,
           c.collection_number,
           c.received_at,
           c.local_time
    FROM collections c
    JOIN agents a ON a.id = c.agent_id
    ORDER BY c.agent_id, c.received_at DESC, c.id DESC
  `);
  return rows;
}

// Todos os testes de uma coleta.
export async function getTestResults(collectionId) {
  const { rows } = await query(
    `SELECT type, name, target, success,
            latency_ms, packet_loss_percent, jitter_ms,
            response_time_ms, resolved_address,
            total_time_ms, http_status_code, throughput_mbps, bytes_transferred, speed_kind,
            route_hop_count, route_last_hop, connect_time_ms
     FROM test_results WHERE collection_id = $1 ORDER BY id`,
    [collectionId],
  );
  return rows;
}

// Snapshot (hardware/rede) de uma coleta.
export async function getSnapshot(collectionId) {
  const { rows } = await query(
    'SELECT * FROM system_snapshots WHERE collection_id = $1',
    [collectionId],
  );
  return rows[0] ?? null;
}

// Histórico agregado por coleta dentro do período pedido.
// `interval` é uma string segura controlada pela camada de rota (não vem do usuário cru).
export async function getHistory(agentDbId, interval) {
  const { rows } = await query(
    `
    SELECT c.id AS collection_id,
           c.received_at,
           AVG(tr.latency_ms)               AS avg_latency_ms,
           MAX(tr.latency_ms)               AS max_latency_ms,
           MAX(tr.packet_loss_percent)      AS max_packet_loss,
           MAX(tr.throughput_mbps)          AS max_throughput_mbps,
           COUNT(*) FILTER (WHERE tr.success = false) AS failures
    FROM collections c
    LEFT JOIN test_results tr ON tr.collection_id = c.id
    WHERE c.agent_id = $1
      AND c.received_at >= now() - $2::interval
    GROUP BY c.id, c.received_at
    ORDER BY c.received_at DESC
    `,
    [agentDbId, interval],
  );
  return rows;
}

// Interfaces de rede: como o esquema atual guarda 1 interface ativa por
// snapshot, devolvemos a do último snapshot da máquina.
export async function getInterfaces(agentDbId) {
  const { rows } = await query(
    `
    SELECT ss.interface_name, ss.interface_status, ss.interface_speed_mbps,
           ss.interface_hardware_port, a.local_ips, a.mac_addresses, ss.public_ip
    FROM collections c
    JOIN agents a ON a.id = c.agent_id
    LEFT JOIN system_snapshots ss ON ss.collection_id = c.id
    WHERE c.agent_id = $1
    ORDER BY c.received_at DESC
    LIMIT 1
    `,
    [agentDbId],
  );
  return rows[0] ?? null;
}
