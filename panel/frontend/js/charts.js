// =====================================================================
// HawkDot frontend — gráfico de BARRAS VERTICAIS em SVG (sem dependência)
//
// renderBarChart(el, points, opts):
//   points = [{ label, value }]  (eixo do tempo na horizontal)
//   opts   = { color, unit, decimals }
//
// PASSO A PASSO (debug humano):
//   1. Calcula o valor máximo para escalar a altura das barras.
//   2. Desenha cada barra como um <rect>; a altura é proporcional ao valor.
//   3. Cada barra tem um <title> (tooltip nativo) com label + valor.
// =====================================================================

const W = 600;   // largura lógica (viewBox; escala sozinha na tela)
const H = 180;   // altura lógica
const PAD = 24;  // margem interna

export function renderBarChart(el, points, opts = {}) {
  const { color = '#3d6ea5', unit = '', decimals = 0 } = opts;

  // Sem dados: mostra um aviso amigável.
  const valid = points.filter((p) => p.value != null && Number.isFinite(Number(p.value)));
  if (!valid.length) {
    el.innerHTML = '<div class="empty">Sem dados no período.</div>';
    return;
  }

  const max = Math.max(...valid.map((p) => Number(p.value)), 0.0001);
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const n = points.length;
  const slot = innerW / n;
  const barW = Math.max(2, slot * 0.6);

  const bars = points.map((p, i) => {
    const v = Number(p.value);
    if (!Number.isFinite(v)) return '';
    const h = (v / max) * innerH;
    const x = PAD + i * slot + (slot - barW) / 2;
    const y = PAD + (innerH - h);
    const titulo = `${p.label}: ${v.toFixed(decimals)}${unit}`;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}"
              rx="2" fill="${color}"><title>${titulo}</title></rect>`;
  }).join('');

  // Linha de base + rótulo do valor máximo.
  const baseY = PAD + innerH;
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-svg" role="img">
      <line x1="${PAD}" y1="${baseY}" x2="${W - PAD}" y2="${baseY}" stroke="#dce6f1" stroke-width="1"/>
      <text x="${PAD}" y="${PAD - 8}" class="chart-max">máx ${max.toFixed(decimals)}${unit}</text>
      ${bars}
    </svg>`;
}
