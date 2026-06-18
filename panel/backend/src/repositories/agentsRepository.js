// =====================================================================
// HawkDot backend — repositório CRUD da tabela `agents`
//
// CRUD = Create, Read, Update, Delete. Aqui ficam as 5 operações básicas
// usadas pelos endpoints REST /api/agents.
// =====================================================================

import { query } from '../db.js';

const COLUMNS = `id, agent_id, agent_name, hostname, os, os_version, arch, model,
  serial_number, mac_addresses, local_ips, dns_servers, default_gateway,
  created_at, updated_at`;

// READ (lista todos)
export async function listAgents() {
  const { rows } = await query(`SELECT ${COLUMNS} FROM agents ORDER BY id`);
  return rows;
}

// READ (um por id)
export async function getAgent(id) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM agents WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// CREATE
export async function createAgent(data) {
  const { rows } = await query(
    `INSERT INTO agents
       (agent_id, agent_name, hostname, os, os_version, arch, model, serial_number,
        mac_addresses, local_ips, dns_servers, default_gateway)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING ${COLUMNS}`,
    [
      data.agent_id, data.agent_name ?? null, data.hostname ?? null, data.os ?? null,
      data.os_version ?? null, data.arch ?? null, data.model ?? null, data.serial_number ?? null,
      data.mac_addresses ?? null, data.local_ips ?? null, data.dns_servers ?? null,
      data.default_gateway ?? null,
    ],
  );
  return rows[0];
}

// UPDATE (parcial — só atualiza os campos enviados)
export async function updateAgent(id, data) {
  const allowed = ['agent_name', 'hostname', 'os', 'os_version', 'arch', 'model',
    'serial_number', 'mac_addresses', 'local_ips', 'dns_servers', 'default_gateway'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (key in data) {
      values.push(data[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (sets.length === 0) return getAgent(id); // nada para atualizar
  values.push(id);
  const { rows } = await query(
    `UPDATE agents SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${COLUMNS}`,
    values,
  );
  return rows[0] ?? null;
}

// DELETE (cascata remove collections/test_results/snapshots pelas FKs)
export async function deleteAgent(id) {
  const { rowCount } = await query('DELETE FROM agents WHERE id = $1', [id]);
  return rowCount > 0;
}
