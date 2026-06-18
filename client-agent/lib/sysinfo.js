// =====================================================================
// HawkDot agent — coleta de informações do SISTEMA (hardware/SO/rede)
//
// Suporta Linux e Windows.
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

// Extrai o gateway padrão da saída de `ip route` (Linux).
export function parseGateway(ipRouteOutput) {
  const m = ipRouteOutput.match(/default via (\S+)/);
  return m ? m[1] : null;
}

// Extrai os servidores DNS de um /etc/resolv.conf (Linux).
export function parseResolvConf(text) {
  const servers = [...text.matchAll(/^\s*nameserver\s+(\S+)/gm)].map((m) => m[1]);
  return servers.length ? servers.join(',') : null;
}

// Extrai o gateway da saída de Get-NetRoute (Windows PowerShell).
// A saída é um único IP por linha, ex: "192.168.1.1\r\n"
export function parseWindowsGateway(psOutput) {
  const gw = psOutput.trim();
  return gw && gw !== '0.0.0.0' ? gw : null;
}

// Extrai DNS da saída de Get-DnsClientServerAddress (Windows PowerShell).
// A saída tem um IP por linha; deduplica e une por vírgula.
export function parseWindowsDns(psOutput) {
  const servers = psOutput.trim().split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const unique = [...new Set(servers)];
  return unique.length ? unique.join(',') : null;
}

// ---- LEITURAS DO SISTEMA (best-effort) ------------------------------

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; }
}

// Retorna MACs e IPs IPv4 de todas as interfaces não-internas.
function networkInfo() {
  const ifaces = os.networkInterfaces();
  const macs = new Set();
  const ipv4s = new Set();
  let active = null;
  for (const [nome, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (a.internal) continue;
      if (a.mac && a.mac !== '00:00:00:00:00:00') macs.add(a.mac);
      if (a.family === 'IPv4') {
        ipv4s.add(a.address);
        if (!active) active = { name: nome, mac: a.mac };
      }
    }
  }
  return {
    mac_addresses: [...macs].join(','),
    local_ips: [...ipv4s].join(','),    // IPv4 apenas
    interface_name: active?.name ?? null,
  };
}

async function getGateway() {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        "(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Where-Object { $_.NextHop -notmatch ':' } | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty NextHop)",
      ]);
      return parseWindowsGateway(stdout);
    } catch { return null; }
  }
  try { return parseGateway((await execFileAsync('ip', ['route'])).stdout); }
  catch { return null; }
}

async function getDnsServers() {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        "Get-DnsClientServerAddress -AddressFamily IPv4 | ForEach-Object { $_.ServerAddresses } | Sort-Object | Get-Unique | Where-Object { $_ }",
      ]);
      return parseWindowsDns(stdout);
    } catch { return null; }
  }
  const text = readFileSafe('/etc/resolv.conf');
  return text ? parseResolvConf(text) : null;
}

async function getSerial() {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        "(Get-CimInstance -ClassName Win32_BIOS).SerialNumber",
      ]);
      const s = stdout.trim();
      return s || null;
    } catch { return null; }
  }
  return readFileSafe('/sys/class/dmi/id/product_serial')
      || readFileSafe('/etc/machine-id');
}

async function getModel() {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        "(Get-CimInstance -ClassName Win32_ComputerSystem).Model",
      ]);
      const m = stdout.trim();
      return m || null;
    } catch { return null; }
  }
  return readFileSafe('/sys/class/dmi/id/product_name');
}

async function getDisk() {
  try {
    const root = process.platform === 'win32'
      ? (process.env.SystemDrive || 'C:') + '\\'
      : '/';
    const s = await statfs(root);
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
  const [default_gateway, dns_servers, serial_number, model, pub] = await Promise.all([
    getGateway(),
    getDnsServers(),
    getSerial(),
    getModel(),
    getPublicNet(),
  ]);
  return {
    agent_id: buildAgentId(),
    agent_name: agentName || os.hostname(),
    hostname: os.hostname(),
    os: os.platform(),
    os_version: os.release(),
    arch: os.arch(),
    serial_number,
    model,
    mac_addresses: net.mac_addresses,
    local_ips: net.local_ips,
    dns_servers,
    default_gateway,
    public_ip: pub.public_ip,
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
