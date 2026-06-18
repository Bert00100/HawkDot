// TDD — testes de integração da API (precisam do Postgres rodando).
// Usam o banco hawkdot_test (definido via PGDATABASE no script de teste).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, truncateAll, closeDb } from './helpers.js';

let srv;

before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); await closeDb(); });
beforeEach(async () => { await truncateAll(); });

function samplePayload(overrides = {}) {
  return {
    agent: {
      agent_id: 'agent-test-1',
      agent_name: 'Maquina Teste',
      hostname: 'pc-teste',
      os: 'win32',
      os_version: '10.0.26100',
      arch: 'x64',
      model: 'Latitude 7420',
      serial_number: 'SN-12345',
      local_ips: '192.168.0.10',
      mac_addresses: 'aa:bb:cc:dd:ee:ff',
      default_gateway: '192.168.0.1',
      dns_servers: '8.8.8.8,1.1.1.1',
      public_ip: '203.0.113.10',
    },
    collection: { collection_number: 1, queue_depth: 0 },
    test_results: [
      { type: 'ping', name: 'Cloudflare', target: '1.1.1.1', success: true, latency_ms: 12, packet_loss_percent: 0 },
      { type: 'ping', name: 'rota361', target: 'rota361.com.br', success: true, latency_ms: 18, packet_loss_percent: 0 },
      { type: 'http', name: 'site', target: 'https://rota361.com.br', success: true, total_time_ms: 120, http_status_code: 200 },
      { type: 'speed', name: 'VPS Download', target: 'http://backend/api/speed-test', success: true,
        throughput_mbps: 85.5, bytes_transferred: 1000000, total_time_ms: 93, speed_kind: 'internet' },
    ],
    system_snapshot: {
      cpu_model: 'Test CPU', cpu_cores: 4, interface_name: 'eth0',
      interface_status: 'up', interface_speed_mbps: 1000, public_ip: '203.0.113.10',
      isp: 'Operadora Teste',
      memory_physical_bytes: 16 * 1024 ** 3, memory_used_bytes: 8 * 1024 ** 3,
      disk_total_bytes: 500 * 1024 ** 3, disk_free_bytes: 200 * 1024 ** 3,
    },
    ...overrides,
  };
}

async function post(path, body) {
  const res = await fetch(`${srv.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function get(path) {
  const res = await fetch(`${srv.url}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('healthcheck responde ok', async () => {
  const r = await get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('speed-test endpoint devolve bytes binários', async () => {
  const res = await fetch(`${srv.url}/api/speed-test?bytes=512`);
  assert.equal(res.status, 200);
  const buf = await res.arrayBuffer();
  assert.equal(buf.byteLength, 512);
});

test('speed-test endpoint limita a 5 MB', async () => {
  const res = await fetch(`${srv.url}/api/speed-test?bytes=999999999`);
  assert.equal(res.status, 200);
  const buf = await res.arrayBuffer();
  assert.ok(buf.byteLength <= 5_000_000);
});

test('POST /api/collect grava agente, coleta, testes e snapshot', async () => {
  const r = await post('/api/collect', samplePayload());
  assert.equal(r.status, 201);
  assert.equal(r.body.ok, true);
  assert.ok(r.body.collectionId);

  const agents = await get('/api/agents');
  assert.equal(agents.body.length, 1);
  assert.equal(agents.body[0].agent_id, 'agent-test-1');
  assert.equal(agents.body[0].public_ip, '203.0.113.10', 'public_ip deve estar na tabela agents');
});

test('POST /api/collect sem agent_id retorna 400', async () => {
  const r = await post('/api/collect', { agent: {} });
  assert.equal(r.status, 400);
});

test('POST /api/collect é idempotente para a mesma coleta', async () => {
  await post('/api/collect', samplePayload());
  const r2 = await post('/api/collect', samplePayload());
  assert.equal(r2.status, 201);
  assert.equal(r2.body.duplicated, true);
});

test('CRUD de agentes funciona', async () => {
  const created = await post('/api/agents', { agent_id: 'crud-1', agent_name: 'Original' });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal((await get(`/api/agents/${id}`)).body.agent_name, 'Original');
  const upd = await fetch(`${srv.url}/api/agents/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agent_name: 'Alterado' }),
  });
  assert.equal((await upd.json()).agent_name, 'Alterado');
  const del = await fetch(`${srv.url}/api/agents/${id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
  assert.equal((await get(`/api/agents/${id}`)).status, 404);
});

test('dashboard: summary e networks refletem a coleta', async () => {
  await post('/api/collect', samplePayload());

  const summary = await get('/api/dashboard/summary');
  assert.equal(summary.body.agentes, 1);
  assert.equal(summary.body.redes_boas, 1);

  const networks = await get('/api/dashboard/networks');
  assert.equal(networks.body.length, 1);
  assert.equal(networks.body[0].status, 'bom');
  assert.equal(networks.body[0].internet, true);
});

test('dashboard: detalhe traz mac, ip_local e ip_publico separados', async () => {
  await post('/api/collect', samplePayload());
  const agentDbId = (await get('/api/agents')).body[0].id;

  const detail = await get(`/api/dashboard/machines/${agentDbId}`);
  assert.equal(detail.body.status, 'bom');

  // Identidade — campos novos
  const i = detail.body.identidade;
  assert.equal(i.mac, 'aa:bb:cc:dd:ee:ff', 'mac deve estar em identidade');
  assert.equal(i.ip_local, '192.168.0.10', 'ip_local deve ser IPv4');
  assert.equal(i.ip_publico, '203.0.113.10', 'ip_publico deve vir de agents.public_ip');
  assert.equal(i.gateway, '192.168.0.1');
  assert.equal(i.dns, '8.8.8.8,1.1.1.1');
  assert.equal(i.serial, 'SN-12345');
  assert.equal(i.cpu, 'Test CPU');
  assert.equal(i.modelo, 'Latitude 7420');

  // Resumo
  const r = detail.body.resumo;
  assert.equal(r.operadora, 'Operadora Teste');
  assert.equal(r.ram_total_gb, 16);
  assert.equal(r.ram_usada_gb, 8);
  assert.equal(r.disco_livre_gb, 200);
  assert.match(r.usuario, /win32.*x64/);
});

test('dashboard: speed test aparece nos testes da coleta', async () => {
  await post('/api/collect', samplePayload());
  const agentDbId = (await get('/api/agents')).body[0].id;

  const tests = await get(`/api/dashboard/machines/${agentDbId}/tests`);
  assert.equal(tests.body.length, 4);
  const speedTest = tests.body.find((t) => t.type === 'speed');
  assert.ok(speedTest, 'deve haver um resultado de speed test');
  assert.equal(speedTest.throughput_mbps, 85.5);
  assert.equal(speedTest.bytes_transferred, 1000000);
  assert.equal(speedTest.speed_kind, 'internet');
});

test('dashboard: histórico e interfaces da máquina', async () => {
  await post('/api/collect', samplePayload());
  const agentDbId = (await get('/api/agents')).body[0].id;

  const hist = await get(`/api/dashboard/machines/${agentDbId}/history?period=24h`);
  assert.equal(hist.body.length, 1);
  assert.ok(hist.body[0].speed_mbps != null, 'histórico deve incluir speed_mbps');

  const ifaces = await get(`/api/dashboard/machines/${agentDbId}/interfaces`);
  assert.equal(ifaces.body.interface_name, 'eth0');
});

test('dashboard: período inválido no histórico retorna 400', async () => {
  await post('/api/collect', samplePayload());
  const agentDbId = (await get('/api/agents')).body[0].id;
  const r = await get(`/api/dashboard/machines/${agentDbId}/history?period=banana`);
  assert.equal(r.status, 400);
});

test('dashboard: rede com perda alta vira crítica', async () => {
  const p = samplePayload();
  p.agent.agent_id = 'agent-crit';
  p.test_results = [
    { type: 'ping', target: '1.1.1.1', success: true, latency_ms: 20, packet_loss_percent: 30 },
  ];
  await post('/api/collect', p);
  const networks = await get('/api/dashboard/networks');
  const row = networks.body.find((n) => n.usuario === p.agent.agent_name);
  assert.equal(row.status, 'critico');
});
