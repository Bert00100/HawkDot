// =====================================================================
// HawkDot frontend — Página de DETALHE da máquina
//
// Seções: Identidade · Resumo · Speed Test · Gráficos · Testes Atuais.
// =====================================================================

import {
  api, statusBadge, fmtMs, fmtPct, fmtMbps, fmtBytes, fmtDate, escapeHtml, getQueryId,
} from './api.js';
import { renderBarChart } from './charts.js';

const REFRESH_MS = 10_000;
const id = getQueryId();
let periodoAtual = '24h';

function kv(k, v) {
  return `<div class="kv"><div class="k">${k}</div><div class="v">${v}</div></div>`;
}
const ou = (v) => (v == null || v === '' ? '—' : escapeHtml(v));

if (!id) {
  document.getElementById('identidade').innerHTML = '<div class="empty">ID da máquina não informado.</div>';
}

async function carregaDetalhe() {
  const d = await api.get(`/dashboard/machines/${id}`);
  document.getElementById('titulo').textContent =
    `🦅 ${d.identidade.agente || d.identidade.hostname || 'Máquina'}`;
  document.getElementById('subtitulo').textContent =
    `${d.identidade.hostname || ''} • atualizado ${fmtDate(d.ultima_coleta)}`;

  // Identidade
  const i = d.identidade;
  document.getElementById('identidade').innerHTML = [
    kv('Agente',     ou(i.agente)),
    kv('Hostname',   ou(i.hostname)),
    kv('Serial',     ou(i.serial)),
    kv('MAC',        ou(i.mac)),
    kv('IP Interno', ou(i.ip_local)),
    kv('IP Público', ou(i.ip_publico)),
    kv('Gateway',    ou(i.gateway)),
    kv('DNS',        ou(i.dns)),
    kv('CPU',        ou(i.cpu)),
    kv('Modelo',     ou(i.modelo)),
  ].join('');

  // Resumo
  const r = d.resumo;
  const ram = r.ram_total_gb != null ? `${r.ram_usada_gb ?? '?'} / ${r.ram_total_gb} GB` : '—';
  const disco = r.disco_total_gb != null ? `${r.disco_livre_gb ?? '?'} / ${r.disco_total_gb} GB` : '—';
  document.getElementById('resumo').innerHTML = [
    kv('Status',    statusBadge(r.status)),
    kv('OS',        ou(r.usuario)),
    kv('Operadora', ou(r.operadora)),
    kv('RAM Usada', ram),
    kv('Disco Livre', disco),
  ].join('');
}

async function carregaTestes() {
  const tests = await api.get(`/dashboard/machines/${id}/tests`);

  // --- Seção Speed Test ---
  const speedTests = tests.filter((t) => t.type === 'speed');
  const speedEl = document.getElementById('speed-test');
  if (speedTests.length) {
    speedEl.innerHTML = speedTests.map((t) => [
      kv('Destino',    ou(t.name)),
      kv('Throughput', t.throughput_mbps != null ? fmtMbps(t.throughput_mbps) : '—'),
      kv('Status',     statusBadge(t.success === true ? 'bom' : 'critico')),
      kv('Tempo',      fmtMs(t.total_time_ms)),
      kv('Baixado',    fmtBytes(t.bytes_transferred)),
      kv('Tipo',       ou(t.speed_kind)),
    ].join('')).join('');
  } else {
    speedEl.innerHTML = '<div class="empty">Speed test não executado ainda (roda a cada 5 ciclos).</div>';
  }

  // --- Tabela de Testes Atuais ---
  const tbody = document.getElementById('testes');
  if (!tests.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Sem testes.</td></tr>';
    return;
  }
  tbody.innerHTML = tests.map((t) => {
    const tempo = t.latency_ms ?? t.response_time_ms ?? t.total_time_ms ?? t.connect_time_ms;
    return `<tr>
      <td>${escapeHtml(t.type)}</td>
      <td>${ou(t.name)}</td>
      <td>${ou(t.target)}</td>
      <td>${statusBadge(t.success === true ? 'bom' : t.success === false ? 'critico' : null)}</td>
      <td>${fmtMs(tempo)}</td>
      <td>${fmtPct(t.packet_loss_percent)}</td>
      <td class="muted">${detalheTeste(t)}</td>
    </tr>`;
  }).join('');
}

function detalheTeste(t) {
  switch (t.type) {
    case 'dns':   return t.resolved_address ? `resolveu ${escapeHtml(t.resolved_address)}` : '';
    case 'http':  return t.http_status_code ? `HTTP ${t.http_status_code}` : '';
    case 'speed': return t.throughput_mbps != null ? fmtMbps(t.throughput_mbps) : '';
    case 'route': return t.route_last_hop ? `${t.route_hop_count} hops → ${escapeHtml(t.route_last_hop)}` : '';
    case 'ping':  return t.jitter_ms != null ? `jitter ${fmtMs(t.jitter_ms)}` : '';
    default: return '';
  }
}

async function carregaGraficos() {
  const rows = await api.get(`/dashboard/machines/${id}/history?period=${periodoAtual}`);
  const pontos = [...rows].reverse();
  const labels = pontos.map((p) => fmtDate(p.quando));

  renderBarChart(document.getElementById('chart-latencia'),
    pontos.map((p, idx) => ({ label: labels[idx], value: p.latencia_maxima_ms })),
    { color: '#3d6ea5', unit: ' ms' });

  renderBarChart(document.getElementById('chart-speed'),
    pontos.map((p, idx) => ({ label: labels[idx], value: p.speed_mbps })),
    { color: '#1f7a4d', unit: ' Mbps', decimals: 1 });

  renderBarChart(document.getElementById('chart-perda'),
    pontos.map((p, idx) => ({ label: labels[idx], value: (p.perda_pct ?? 0) + (p.falhas || 0) })),
    { color: '#a32430', unit: '' });
}

document.getElementById('filtros').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#filtros button').forEach((b) => b.classList.remove('ativo'));
  btn.classList.add('ativo');
  periodoAtual = btn.dataset.period;
  carregaGraficos().catch(console.error);
});

async function atualizaTudo() {
  if (!id) return;
  try {
    await Promise.all([carregaDetalhe(), carregaTestes(), carregaGraficos()]);
  } catch (err) {
    console.error('Falha ao carregar detalhe:', err);
  }
}

atualizaTudo();
setInterval(() => {
  if (!id) return;
  Promise.all([carregaDetalhe(), carregaTestes(), carregaGraficos()]).catch(console.error);
}, REFRESH_MS);
