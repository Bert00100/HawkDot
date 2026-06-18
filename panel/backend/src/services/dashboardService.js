// =====================================================================
// HawkDot backend — serviço do DASHBOARD
// =====================================================================

import * as repo from '../repositories/dashboardRepository.js';
import * as agentsRepo from '../repositories/agentsRepository.js';
import { summarizeTests, classifyHealth, STATUS } from '../lib/health.js';

const PERIODS = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' };

function connectivityFlags(tests) {
  const ext = tests.filter((t) => (t.type === 'ping' || t.type === 'http') && t.speed_kind !== 'internal');
  const internet = ext.length ? ext.some((t) => t.success === true) : null;
  const local = tests.filter((t) => t.speed_kind === 'internal' || t.type === 'route');
  const linkLocal = local.length ? local.some((t) => t.success === true) : null;
  const services = tests.filter((t) => t.type === 'http' || t.type === 'tcp');
  const servicesOk = services.length
    ? `${services.filter((s) => s.success === true).length}/${services.length}`
    : null;
  return { internet, linkLocal, servicesOk };
}

async function buildNetworkRow(latest) {
  const tests = await repo.getTestResults(latest.collection_id);
  const metrics = summarizeTests(tests);
  const { status, diagnostico } = classifyHealth(metrics);
  const flags = connectivityFlags(tests);
  return {
    agent_id: latest.agent_id,
    rede: latest.agent_name || latest.hostname || `agente ${latest.agent_id}`,
    usuario: latest.agent_name || null,
    status,
    diagnostico,
    latencia_ms: metrics.avgLatencyMs,
    perda_pct: metrics.packetLossPercent,
    servicos: flags.servicesOk,
    internet: flags.internet,
    link_local: flags.linkLocal,
    ultima_coleta: latest.received_at,
  };
}

export async function getSummary() {
  const agents = await agentsRepo.listAgents();
  const latest = await repo.latestCollectionPerAgent();
  const rows = await Promise.all(latest.map(buildNetworkRow));

  const count = (s) => rows.filter((r) => r.status === s).length;
  return {
    agentes: agents.length,
    redes_boas: count(STATUS.GOOD),
    atencao: count(STATUS.WARN),
    criticas: count(STATUS.CRIT),
  };
}

export async function getNetworks() {
  const latest = await repo.latestCollectionPerAgent();
  return Promise.all(latest.map(buildNetworkRow));
}

function toGB(bytes) {
  return bytes == null ? null : Number((Number(bytes) / 1024 ** 3).toFixed(1));
}

// Extrai o primeiro IPv4 de uma string de IPs separados por vírgula.
function firstIpv4(ips) {
  if (!ips) return null;
  return ips.split(',').map((s) => s.trim()).find((ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) ?? null;
}

// Primeiro MAC da lista separada por vírgula.
function firstMac(macs) {
  if (!macs) return null;
  return macs.split(',')[0].trim() || null;
}

function buildIdentidade(agent, snapshot) {
  return {
    agente:     agent.agent_name,
    hostname:   agent.hostname,
    serial:     agent.serial_number,
    mac:        firstMac(agent.mac_addresses),
    ip_local:   firstIpv4(agent.local_ips),
    ip_publico: agent.public_ip ?? snapshot?.public_ip ?? null,
    gateway:    agent.default_gateway,
    dns:        agent.dns_servers,
    cpu:        snapshot?.cpu_model ?? null,
    modelo:     agent.model,
  };
}

function buildResumo(agent, snapshot, status) {
  const arch = agent.arch ? ` (${agent.arch})` : '';
  return {
    status,
    serial:        agent.serial_number,
    usuario:       `${agent.os ?? '—'}${arch}`,
    operadora:     snapshot?.isp ?? null,
    ip_publico:    agent.public_ip ?? snapshot?.public_ip ?? null,
    ram_usada_gb:  toGB(snapshot?.memory_used_bytes),
    ram_total_gb:  toGB(snapshot?.memory_physical_bytes),
    disco_livre_gb: toGB(snapshot?.disk_free_bytes),
    disco_total_gb: toGB(snapshot?.disk_total_bytes),
  };
}

export async function getMachineDetail(agentDbId) {
  const agent = await agentsRepo.getAgent(agentDbId);
  if (!agent) return null;
  const latest = (await repo.latestCollectionPerAgent())
    .find((l) => l.agent_id === Number(agentDbId));
  if (!latest) {
    return {
      agent, status: null, diagnostico: 'sem coletas ainda', metrics: null,
      identidade: buildIdentidade(agent, null), resumo: buildResumo(agent, null, null),
      ultima_coleta: null,
    };
  }
  const [tests, snapshot] = await Promise.all([
    repo.getTestResults(latest.collection_id),
    repo.getSnapshot(latest.collection_id),
  ]);
  const metrics = summarizeTests(tests);
  const { status, diagnostico } = classifyHealth(metrics);
  return {
    agent,
    status,
    diagnostico,
    metrics,
    identidade: buildIdentidade(agent, snapshot),
    resumo: buildResumo(agent, snapshot, status),
    ultima_coleta: latest.received_at,
  };
}

export async function getMachineTests(agentDbId) {
  const latest = (await repo.latestCollectionPerAgent())
    .find((l) => l.agent_id === Number(agentDbId));
  if (!latest) return [];
  return repo.getTestResults(latest.collection_id);
}

export async function getMachineHistory(agentDbId, period) {
  const interval = PERIODS[period];
  if (!interval) {
    const err = new Error(`período inválido: ${period}. Use 24h, 7d ou 30d.`);
    err.statusCode = 400;
    throw err;
  }
  const rows = await repo.getHistory(agentDbId, interval);
  return rows.map((r) => {
    const metrics = {
      avgLatencyMs: r.avg_latency_ms != null ? Number(r.avg_latency_ms) : null,
      packetLossPercent: r.max_packet_loss != null ? Number(r.max_packet_loss) : null,
      online: true,
      anyFailure: Number(r.failures) > 0,
    };
    return {
      quando: r.received_at,
      status: classifyHealth(metrics).status,
      latencia_media_ms: metrics.avgLatencyMs,
      latencia_maxima_ms: r.max_latency_ms != null ? Number(r.max_latency_ms) : null,
      perda_pct: metrics.packetLossPercent,
      speed_mbps: r.max_throughput_mbps != null ? Number(r.max_throughput_mbps) : null,
      falhas: Number(r.failures),
    };
  });
}

export async function getMachineInterfaces(agentDbId) {
  return repo.getInterfaces(agentDbId);
}
