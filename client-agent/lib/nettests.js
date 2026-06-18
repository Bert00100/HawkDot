// =====================================================================
// HawkDot agent — testes de REDE (ping, dns, http)
//
// Cada função roda uma ferramenta do sistema e devolve um objeto no
// formato esperado pela tabela test_results do backend.
//
// As funções de PARSING são puras (recebem texto, devolvem objeto), então
// dá para testá-las via TDD sem precisar de rede.
//
// PASSO A PASSO (debug humano):
//   1. runPing  -> executa `ping` e usa parsePing() para extrair métricas.
//   2. runDns   -> resolve o domínio (dns nativo do Node) e mede o tempo.
//   3. runHttp  -> faz um GET e mede tempo total + status HTTP.
// =====================================================================

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dns from 'node:dns';

const execFileAsync = promisify(execFile);
const dnsLookup = promisify(dns.lookup);

// ---- PARSING (puro / testável) --------------------------------------

// Extrai latência média, jitter e perda de pacotes da saída do `ping` (Linux).
export function parsePing(stdout) {
  const lossMatch = stdout.match(/(\d+(?:\.\d+)?)%\s*packet loss/i);
  const rttMatch = stdout.match(/=\s*[\d.]+\/([\d.]+)\/[\d.]+\/([\d.]+)\s*ms/);

  const packet_loss_percent = lossMatch ? Number(lossMatch[1]) : null;
  const latency_ms = rttMatch ? Number(rttMatch[1]) : null;
  const jitter_ms = rttMatch ? Number(rttMatch[2]) : null;

  // sucesso = conseguiu medir latência e perda < 100%
  const success = latency_ms != null && (packet_loss_percent == null || packet_loss_percent < 100);

  return { success, latency_ms, packet_loss_percent, jitter_ms };
}

// ---- EXECUÇÃO --------------------------------------------------------

// Executa um ping com `count` pacotes e timeout total em segundos.
export async function runPing({ name, target }, count = 3, timeoutSec = 5) {
  const base = { type: 'ping', name, target };
  try {
    const { stdout } = await execFileAsync(
      'ping', ['-c', String(count), '-w', String(timeoutSec), target],
    );
    return { ...base, ...parsePing(stdout) };
  } catch (err) {
    // ping retorna código != 0 quando há perda total; ainda há stdout útil.
    const stdout = err.stdout || '';
    const parsed = parsePing(stdout);
    return {
      ...base,
      success: false,
      latency_ms: parsed.latency_ms,
      packet_loss_percent: parsed.packet_loss_percent ?? 100,
      jitter_ms: parsed.jitter_ms,
    };
  }
}

// Resolve um domínio e mede o tempo de resolução.
export async function runDns({ name, target }) {
  const base = { type: 'dns', name, target };
  const start = performance.now();
  try {
    const { address } = await dnsLookup(target);
    return {
      ...base,
      success: true,
      response_time_ms: Number((performance.now() - start).toFixed(2)),
      resolved_address: address,
    };
  } catch {
    return { ...base, success: false, response_time_ms: null, resolved_address: null };
  }
}

// Faz um GET e mede tempo total + status HTTP.
export async function runHttp({ name, target }, timeoutMs = 8000) {
  const base = { type: 'http', name, target };
  const start = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(target, { signal: ctrl.signal, redirect: 'follow' });
    return {
      ...base,
      success: res.ok,
      total_time_ms: Number((performance.now() - start).toFixed(2)),
      http_status_code: res.status,
    };
  } catch {
    return { ...base, success: false, total_time_ms: null, http_status_code: null };
  } finally {
    clearTimeout(timer);
  }
}

// Roda todos os testes definidos na config e devolve um array achatado.
export async function runAllTests(targets) {
  const jobs = [
    ...(targets.ping || []).map((t) => runPing(t)),
    ...(targets.dns || []).map((t) => runDns(t)),
    ...(targets.http || []).map((t) => runHttp(t)),
  ];
  return Promise.all(jobs);
}
