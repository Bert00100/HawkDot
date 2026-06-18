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

// Extrai a % de perda de pacotes (funciona em Linux e Windows EN/PT).
function parseLoss(stdout) {
  const m = stdout.match(/(\d+(?:\.\d+)?)\s*%\s*(?:packet\s*)?loss/i)   // Linux / Windows EN
        || stdout.match(/(\d+(?:\.\d+)?)\s*%\s*de\s*perda/i)            // Windows PT
        || stdout.match(/\((\d+(?:\.\d+)?)\s*%/);                       // "(0% loss)" / "(0% de perda)"
  return m ? Number(m[1]) : null;
}

// Média e desvio-padrão (jitter) de uma lista de números.
function avg(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function stddev(nums) {
  if (nums.length < 2) return 0;
  const m = avg(nums);
  return Math.sqrt(avg(nums.map((n) => (n - m) ** 2)));
}

// Extrai latência média, jitter e perda da saída do `ping`.
// Estratégia multiplataforma:
//   1. Se houver a linha "rtt min/avg/max/mdev" (Linux), usa avg + mdev.
//   2. Senão, calcula a média/jitter dos tempos de cada resposta
//      ("time=8ms" / "tempo=8ms" / "time<1ms") — cobre Windows EN e PT.
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

// ---- EXECUÇÃO --------------------------------------------------------

// Monta os argumentos do `ping` conforme o sistema operacional.
function pingArgs(target, count, timeoutSec) {
  if (process.platform === 'win32') {
    // Windows: -n contagem (não tem timeout total como o Linux).
    return ['-n', String(count), target];
  }
  // Linux/Mac: -c contagem, -w timeout total em segundos.
  return ['-c', String(count), '-w', String(timeoutSec), target];
}

// Executa um ping com `count` pacotes e timeout total em segundos.
export async function runPing({ name, target }, count = 3, timeoutSec = 5) {
  const base = { type: 'ping', name, target };
  try {
    const { stdout } = await execFileAsync('ping', pingArgs(target, count, timeoutSec));
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
