// =====================================================================
// HawkDot backend — classificação de SAÚDE da rede (lógica pura)
//
// É o coração do painel: transforma os resultados crus dos testes em um
// status legível (bom / atencao / critico) + um pré-diagnóstico.
// Como é lógica pura (sem banco, sem rede), é 100% testável via TDD.
//
// PASSO A PASSO (debug humano):
//   1. summarizeTests(testResults) -> extrai métricas-chave de uma coleta.
//   2. classifyHealth(metrics)     -> decide o status e o diagnóstico.
// =====================================================================

// Limiares (thresholds). Ajuste aqui para calibrar o que é "bom/atenção/crítico".
export const THRESHOLDS = {
  latencyWarnMs: 100,   // acima disso: atenção
  latencyCritMs: 300,   // acima disso: crítico
  lossWarnPct: 0,       // qualquer perda > 0: atenção
  lossCritPct: 5,       // perda >= 5%: crítico
};

export const STATUS = { GOOD: 'bom', WARN: 'atencao', CRIT: 'critico' };

// Recebe a lista de test_results de UMA coleta e resume as métricas que
// importam para a saúde geral.
export function summarizeTests(testResults = []) {
  const pings = testResults.filter((t) => t.type === 'ping');

  // Latência média entre os pings que mediram latência.
  const latencies = pings
    .map((t) => Number(t.latency_ms))
    .filter((n) => Number.isFinite(n));
  const avgLatencyMs = latencies.length
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : null;

  // Perda de pacotes: a PIOR perda observada entre os pings.
  const losses = pings
    .map((t) => Number(t.packet_loss_percent))
    .filter((n) => Number.isFinite(n));
  const packetLossPercent = losses.length ? Math.max(...losses) : null;

  // Online = pelo menos um teste de conectividade (ping/http) teve sucesso.
  const connectivity = testResults.filter((t) => t.type === 'ping' || t.type === 'http');
  const online = connectivity.length === 0
    ? true // sem testes de conectividade, não dá pra afirmar que está offline
    : connectivity.some((t) => t.success === true);

  // Houve alguma falha em qualquer teste?
  const anyFailure = testResults.some((t) => t.success === false);

  return { avgLatencyMs, packetLossPercent, online, anyFailure };
}

// Decide o status final e monta um pré-diagnóstico textual.
export function classifyHealth(metrics) {
  const { avgLatencyMs, packetLossPercent, online, anyFailure } = metrics;
  const reasons = [];
  let status = STATUS.GOOD;

  // pior status vence — começamos em bom e só pioramos.
  const worsen = (s) => {
    const rank = { [STATUS.GOOD]: 0, [STATUS.WARN]: 1, [STATUS.CRIT]: 2 };
    if (rank[s] > rank[status]) status = s;
  };

  // 1) Offline é sempre crítico.
  if (online === false) {
    worsen(STATUS.CRIT);
    reasons.push('rede offline');
  }

  // 2) Perda de pacotes.
  if (packetLossPercent != null) {
    if (packetLossPercent >= THRESHOLDS.lossCritPct) {
      worsen(STATUS.CRIT);
      reasons.push(`perda alta de pacotes (${packetLossPercent}%)`);
    } else if (packetLossPercent > THRESHOLDS.lossWarnPct) {
      worsen(STATUS.WARN);
      reasons.push(`perda de pacotes (${packetLossPercent}%)`);
    }
  }

  // 3) Latência.
  if (avgLatencyMs != null) {
    if (avgLatencyMs >= THRESHOLDS.latencyCritMs) {
      worsen(STATUS.CRIT);
      reasons.push(`latência muito alta (${Math.round(avgLatencyMs)}ms)`);
    } else if (avgLatencyMs >= THRESHOLDS.latencyWarnMs) {
      worsen(STATUS.WARN);
      reasons.push(`latência alta (${Math.round(avgLatencyMs)}ms)`);
    }
  }

  // 4) Falhas pontuais em testes.
  if (anyFailure) {
    worsen(STATUS.WARN);
    reasons.push('um ou mais testes falharam');
  }

  const diagnostico = reasons.length ? reasons.join('; ') : 'tudo ok';
  return { status, diagnostico };
}
