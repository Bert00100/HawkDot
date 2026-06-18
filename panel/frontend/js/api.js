// =====================================================================
// HawkDot frontend — helpers compartilhados (API + formatação)
// Sem framework: só fetch() e funções utilitárias.
// =====================================================================

export const api = {
  get: async (path) => {
    const res = await fetch(`/api${path}`);
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return res.json();
  },
};

// Badge HTML para um status (bom/atencao/critico/null).
export function statusBadge(status) {
  const label = { bom: 'Bom', atencao: 'Atenção', critico: 'Crítico' }[status] || '—';
  const cls = status || 'neutro';
  return `<span class="badge ${cls}">${label}</span>`;
}

// Pontinho verde/vermelho/cinza para booleanos (internet, link local).
export function boolDot(value) {
  if (value === true) return '<span class="dot on" title="ok"></span>';
  if (value === false) return '<span class="dot off" title="falha"></span>';
  return '<span class="dot na" title="sem dado"></span>';
}

export function fmtMs(v) {
  return v == null ? '—' : `${Math.round(Number(v))} ms`;
}
export function fmtPct(v) {
  return v == null ? '—' : `${Number(v).toFixed(0)}%`;
}
export function fmtMbps(v) {
  return v == null ? '—' : `${Number(v).toFixed(1)} Mbps`;
}
export function fmtBytes(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} KB`;
  return `${n} B`;
}
export function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Lê o ?id= da URL.
export function getQueryId() {
  return new URLSearchParams(location.search).get('id');
}
