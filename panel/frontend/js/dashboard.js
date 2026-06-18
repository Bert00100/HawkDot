// =====================================================================
// HawkDot frontend — Página principal (lista de máquinas/redes)
//
// PASSO A PASSO (debug humano):
//   1. carrega() busca /dashboard/summary e /dashboard/networks.
//   2. Preenche os cards do topo e a tabela "Resultado por Rede".
//   3. Clicar numa linha vai para machine.html?id=<agent_id>.
//   4. setInterval recarrega tudo a cada 10 segundos.
// =====================================================================

import { api, statusBadge, boolDot, fmtMs, fmtPct, fmtDate, escapeHtml } from './api.js';

const REFRESH_MS = 10_000;

function renderCards(s) {
  document.getElementById('c-agentes').textContent = s.agentes;
  document.getElementById('c-boas').textContent = s.redes_boas;
  document.getElementById('c-atencao').textContent = s.atencao;
  document.getElementById('c-criticas').textContent = s.criticas;
}

function renderLinhas(rows) {
  const tbody = document.getElementById('linhas');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty">Nenhuma rede cadastrada ainda. Instale um agente.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r) => `
    <tr class="clickable" onclick="location.href='machine.html?id=${r.agent_id}'">
      <td>${escapeHtml(r.rede)}</td>
      <td>${escapeHtml(r.usuario) || '—'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="muted">${escapeHtml(r.diagnostico)}</td>
      <td>${fmtMs(r.latencia_ms)}</td>
      <td>${fmtPct(r.perda_pct)}</td>
      <td>${escapeHtml(r.servicos) || '—'}</td>
      <td>${boolDot(r.internet)}</td>
      <td>${boolDot(r.link_local)}</td>
      <td class="muted">${fmtDate(r.ultima_coleta)}</td>
    </tr>`).join('');
}

async function carrega() {
  try {
    const [summary, networks] = await Promise.all([
      api.get('/dashboard/summary'),
      api.get('/dashboard/networks'),
    ]);
    renderCards(summary);
    renderLinhas(networks);
    document.getElementById('atualizado').textContent =
      `atualizado ${new Date().toLocaleTimeString('pt-BR')}`;
  } catch (err) {
    console.error('Falha ao carregar painel:', err);
    document.getElementById('atualizado').textContent = 'erro ao atualizar';
  }
}

carrega();
setInterval(carrega, REFRESH_MS);
