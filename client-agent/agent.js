#!/usr/bin/env node
// =====================================================================
// HawkDot agent — programa que roda na máquina do cliente
//
// O que ele faz (a cada ciclo):
//   1. Monta a identidade da máquina (agent_id estável).
//   2. Roda os testes de rede (ping/dns/http), incluindo rota361.com.br.
//   3. Coleta um snapshot do sistema (CPU/memória/rede).
//   4. Envia tudo para o backend em POST /api/collect.
//
// Uso:
//   node agent.js            -> roda em loop (a cada intervalSeconds)
//   node agent.js --once     -> roda UMA coleta e sai (usado no instalador)
//
// Config: caminho em HAWKDOT_CONFIG ou ./config.json (veja config.example.json)
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAllTests } from './lib/nettests.js';
import { collectIdentity, collectSnapshot } from './lib/sysinfo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.HAWKDOT_CONFIG || path.join(__dirname, 'config.json');
const STATE_PATH = process.env.HAWKDOT_STATE || path.join(__dirname, 'state.json');

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`config não encontrada em ${CONFIG_PATH} (copie config.example.json)`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// Contador sequencial de coletas, persistido entre execuções.
function nextCollectionNumber() {
  let n = 0;
  try { n = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')).collection_number || 0; } catch {}
  n += 1;
  fs.writeFileSync(STATE_PATH, JSON.stringify({ collection_number: n }));
  return n;
}

// Executa um ciclo completo de coleta e envio.
async function collectOnce(config) {
  // 1) identidade
  const agent = await collectIdentity(config.agentName);
  log(`coletando como ${agent.agent_id} (${agent.hostname})`);

  // 2) testes de rede
  const test_results = await runAllTests(config.targets || {});
  const okCount = test_results.filter((t) => t.success).length;
  log(`testes de rede: ${okCount}/${test_results.length} com sucesso`);

  // 3) snapshot do sistema
  const system_snapshot = await collectSnapshot();

  // 4) monta e envia o payload
  const payload = {
    agent,
    collection: { collection_number: nextCollectionNumber(), local_time: new Date().toISOString(), queue_depth: 0 },
    test_results,
    system_snapshot,
  };

  const url = `${config.backendUrl.replace(/\/$/, '')}/api/collect`;
  log(`enviando coleta #${payload.collection.collection_number} para ${url}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`backend respondeu ${res.status}: ${await res.text()}`);
  const body = await res.json();
  log(`OK — coleta gravada (collectionId=${body.collectionId}, agentDbId=${body.agentDbId})`);
  return body;
}

async function main() {
  const once = process.argv.includes('--once');
  const config = loadConfig();
  log(`HawkDot agent iniciado (backend=${config.backendUrl}, once=${once})`);

  if (once) {
    await collectOnce(config);
    return;
  }

  // Loop contínuo. Erros de um ciclo não derrubam o agente.
  const intervalMs = (config.intervalSeconds || 60) * 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await collectOnce(config); }
    catch (err) { log(`ERRO no ciclo: ${err.message}`); }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main().catch((err) => { log(`FALHA: ${err.message}`); process.exit(1); });
