// =====================================================================
// HawkDot agent — coleta de informações do SISTEMA (hardware/SO/rede)
//
// Mistura o módulo `os` nativo com leitura de arquivos do Linux
// (/sys/class/dmi, /etc/resolv.conf) e comandos (`ip route`).
// Tudo é best-effort: se algo não existir, volta null (não quebra).
//
// As funções de PARSING são puras (texto -> valor), testáveis via TDD.
// =====================================================================

import os from 'node:os';
import fs from 'node:fs';
import { statfs } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);

// ---- PARSING (puro / testável) --------------------------------------

// Extrai o gateway padrão da saída de `ip route`.
export function parseGateway(ipRouteOutput) {
  const m = ipRouteOutput.match(/default via (\S+)/);
  return m ? m[1] : null;
}

// Extrai os servidores DNS de um /etc/resolv.conf.
export function parseResolvConf(text) {
  const servers = [...text.matchAll(/^\s*nameserver\s+(\S+)/gm)].map((m) => m[1]);
  return servers.length ? servers.join(',') : null;
}

// ---- LEITURAS DO SISTEMA (best-effort) ------------------------------

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; }
}

function networkInfo() {
  const ifaces = os.networkInterfaces();
  const macs = new Set();
  const ips = new Set();
  let active = null;
  for (const [nome, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (a.internal) continue;
      if (a.mac && a.mac !== '00:00:00:00:00:00') macs.add(a.mac);
      if (a.family === 'IPv4' || a.family === 'IPv6') ips.add(a.address);
      if (a.family === 'IPv4' && !active) active = { name: nome, mac: a.mac };
    }
  }
  return {
    mac_addresses: [...macs].join(','),
    local_ips: [...ips].join(','),
    interface_name: active?.name ?? null,
  };
}

async function getGateway() {
  try { return parseGateway((await execFileAsync('ip', ['route'])).stdout); }
  catch { return null; }
}

function getDnsServers() {
  const text = readFileSafe('/etc/resolv.conf');
  return text ? parseResolvConf(text) : null;
}

// Serial e modelo via DMI (Linux). product_serial costuma exigir root;
// caímos para machine-id quando não der.
function getSerial() {
  return readFileSafe('/sys/class/dmi/id/product_serial')
      || readFileSafe('/etc/machine-id');
}
function getModel() {
  return readFileSafe('/sys/class/dmi/id/product_name');
}

async function getDisk() {
  try {
    const s = await statfs('/');
    return {
      disk_total_bytes: s.blocks * s.bsize,
      disk_free_bytes: s.bavail * s.bsize,
    };
  } catch { return { disk_total_bytes: null, disk_free_bytes: null }; }
}

// IP público + operadora (ISP). Best-effort com timeout — não quebra offline.
async function getPublicNet() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch('http://ip-api.com/json/?fields=query,isp', { signal: ctrl.signal });
    const j = await res.json();
    return { public_ip: j.query ?? null, isp: j.isp ?? null };
  } catch {
    return { public_ip: null, isp: null };
  } finally { clearTimeout(timer); }
}

export function buildAgentId() {
  const net = networkInfo();
  const semente = `${os.hostname()}|${net.mac_addresses}`;
  return 'hd-' + crypto.createHash('sha1').update(semente).digest('hex').slice(0, 16);
}

// ---- COLETORES PRINCIPAIS (async) -----------------------------------

// Identidade do agente (tabela `agents`).
export async function collectIdentity(agentName) {
  const net = networkInfo();
  const [default_gateway] = [await getGateway()];
  return {
    agent_id: buildAgentId(),
    agent_name: agentName || os.hostname(),
    hostname: os.hostname(),
    os: os.platform(),
    os_version: os.release(),
    arch: os.arch(),
    serial_number: getSerial(),
    model: getModel(),
    mac_addresses: net.mac_addresses,
    local_ips: net.local_ips,
    dns_servers: getDnsServers(),
    default_gateway,
  };
}

// Snapshot de hardware/recursos (tabela `system_snapshots`).
export async function collectSnapshot() {
  const net = networkInfo();
  const cpus = os.cpus();
  const disk = await getDisk();
  const pub = await getPublicNet();
  return {
    cpu_model: cpus[0]?.model ?? null,
    cpu_cores: cpus.length,
    cpu_logical_cores: cpus.length,
    cpu_load_1: os.loadavg()[0],
    memory_physical_bytes: os.totalmem(),
    memory_free_bytes: os.freemem(),
    memory_used_bytes: os.totalmem() - os.freemem(),
    disk_total_bytes: disk.disk_total_bytes,
    disk_free_bytes: disk.disk_free_bytes,
    public_ip: pub.public_ip,
    isp: pub.isp,
    interface_name: net.interface_name,
    interface_status: 'up',
  };
}
