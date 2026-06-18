// =====================================================================
// HawkDot agent — testes de REDE (ping, dns, http, speed)
//
// As funções de PARSING são puras (recebem texto, devolvem objeto),
// testáveis via TDD sem precisar de rede.
// =====================================================================

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dns from 'node:dns';

const execFileAsync = promisify(execFile);
const dnsLookup = promisify(dns.lookup);

// ---- PARSING (puro / testável) --------------------------------------

// Extrai a % de perda de pacotes (funciona em Linux e Windows EN/PT).
function parseLoss(stdout) {
  const m = stdout.match(/(\d+(?:\.\d+)?)\s*%\s*(?:packet\s*)?loss/i)
        || stdout.match(/(\d+(?:\.\d+)?)\s*%\s*de\s*perda/i)
        || stdout.match(/\((\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

function avg(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function stddev(nums) {
  if (nums.length < 2) return 0;
  const m = avg(nums);
  return Math.sqrt(avg(nums.map((n) => (n - m) ** 2)));
}

// Extrai latência média, jitter e perda da saída do `ping`.
export function parsePing(stdout) {
  const packet_loss_percent = parseLoss(stdout);

  const rtt = stdout.match(/=\s*[\d.]+\/([\d.]+)\/[\d.]+\/([\d.]+)\s*ms/);
  let latency_ms = null;
  let jitter_ms = null;

  if (rtt) {
    latency_ms = Number(rtt[1]);
    jitter_ms = Number(rtt[2]);
  } else {
    const times = [...stdout.matchAll(/(?:time|tempo)[=<]\s*([\d.]+)\s*ms/gi)]
      .map((m) => Number(m[1]));
    if (times.length) {
      latency_ms = Number(avg(times).toFixed(2));
      jitter_ms = Number(stddev(times).toFixed(2));
    }
  }

  const success = latency_ms != null && (packet_loss_percent == null || packet_loss_percent < 100);
  return { success, latency_ms, packet_loss_percent, jitter_ms };
}

// ---- EXECUÇÃO -------------------------------------------------------

function pingArgs(target, count, timeoutSec) {
  if (process.platform === 'win32') {
    return ['-n', String(count), target];
  }
  return ['-c', String(count), '-w', String(timeoutSec), target];
}

export async function runPing({ name, target }, count = 3, timeoutSec = 5) {
  const base = { type: 'ping', name, target };
  try {
    const { stdout } = await execFileAsync('ping', pingArgs(target, count, timeoutSec));
    return { ...base, ...parsePing(stdout) };
  } catch (err) {
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

// Baixa `target` e mede throughput em Mbps.
// Devolve os campos do tipo 'speed' da tabela test_results.
export async function runSpeedTest({ name, target, speed_kind = 'internet' }, timeoutMs = 15000) {
  const base = { type: 'speed', name, target, speed_kind };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(target, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const elapsed_ms = performance.now() - start;
    const bytes = buffer.byteLength;
    const throughput_mbps = Number(((bytes * 8) / (elapsed_ms / 1000) / 1_000_000).toFixed(2));
    return {
      ...base,
      success: true,
      throughput_mbps,
      bytes_transferred: bytes,
      total_time_ms: Number(elapsed_ms.toFixed(2)),
    };
  } catch {
    return { ...base, success: false, throughput_mbps: null, bytes_transferred: null, total_time_ms: null };
  } finally {
    clearTimeout(timer);
  }
}

// Roda todos os testes definidos na config e devolve um array achatado.
// options.includeSpeed=false pula os speed tests (para ciclos rápidos).
export async function runAllTests(targets, options = {}) {
  const { includeSpeed = true } = options;
  const jobs = [
    ...(targets.ping  || []).map((t) => runPing(t)),
    ...(targets.dns   || []).map((t) => runDns(t)),
    ...(targets.http  || []).map((t) => runHttp(t)),
    ...(includeSpeed ? (targets.speed || []).map((t) => runSpeedTest(t)) : []),
  ];
  return Promise.all(jobs);
}
