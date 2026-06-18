// =====================================================================
// HawkDot backend — camada de acesso ao PostgreSQL
//
// PASSO A PASSO (debug humano):
//   1. Criamos UM pool de conexões (reaproveitado por toda a app).
//   2. query(texto, params) é o atalho usado em todo lugar.
//   3. withTransaction(fn) roda várias queries de forma atômica
//      (BEGIN/COMMIT/ROLLBACK) — usado na ingestão, que grava em 3 tabelas.
// =====================================================================

import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool(config.db);

// Atalho simples para consultas avulsas.
export function query(text, params) {
  return pool.query(text, params);
}

// Executa `fn(client)` dentro de uma transação. Se `fn` lançar erro,
// faz ROLLBACK; se terminar, faz COMMIT. Sempre devolve a conexão ao pool.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Fecha o pool (usado ao encerrar a app e no fim dos testes).
export function closePool() {
  return pool.end();
}
