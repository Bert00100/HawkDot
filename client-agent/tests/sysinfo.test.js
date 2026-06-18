// TDD — parsers puros do sysinfo (gateway e DNS) + coletores async.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGateway, parseResolvConf,
  parseWindowsGateway, parseWindowsDns,
  collectIdentity, collectSnapshot,
} from '../lib/sysinfo.js';

// ---- Linux parsers --------------------------------------------------

test('parseGateway: extrai o gateway padrão de `ip route`', () => {
  const out = `default via 192.168.15.1 dev wlp0s20f3 proto dhcp metric 600
192.168.15.0/24 dev wlp0s20f3 proto kernel scope link src 192.168.15.35`;
  assert.equal(parseGateway(out), '192.168.15.1');
});

test('parseGateway: sem rota default => null', () => {
  assert.equal(parseGateway('10.0.0.0/24 dev eth0 scope link'), null);
});

test('parseResolvConf: junta os nameservers por vírgula', () => {
  const txt = `# comentario
nameserver 127.0.0.53
nameserver 8.8.8.8
options edns0`;
  assert.equal(parseResolvConf(txt), '127.0.0.53,8.8.8.8');
});

test('parseResolvConf: sem nameserver => null', () => {
  assert.equal(parseResolvConf('# vazio\noptions edns0'), null);
});

// ---- Windows parsers -----------------------------------------------

test('parseWindowsGateway: extrai IP do stdout do PowerShell', () => {
  assert.equal(parseWindowsGateway('192.168.1.1\r\n'), '192.168.1.1');
  assert.equal(parseWindowsGateway('  10.0.0.1  \n'), '10.0.0.1');
});

test('parseWindowsGateway: 0.0.0.0 ou vazio => null', () => {
  assert.equal(parseWindowsGateway('0.0.0.0\r\n'), null);
  assert.equal(parseWindowsGateway('  \n'), null);
  assert.equal(parseWindowsGateway(''), null);
});

test('parseWindowsDns: une IPs de múltiplas linhas, deduplica', () => {
  const ps = '8.8.8.8\r\n1.1.1.1\r\n8.8.8.8\r\n';
  assert.equal(parseWindowsDns(ps), '8.8.8.8,1.1.1.1');
});

test('parseWindowsDns: saída vazia => null', () => {
  assert.equal(parseWindowsDns(''), null);
  assert.equal(parseWindowsDns('  \r\n  '), null);
});

test('parseWindowsDns: único servidor', () => {
  assert.equal(parseWindowsDns('192.168.1.1\n'), '192.168.1.1');
});

// ---- Coletores assíncronos -----------------------------------------

test('collectIdentity: monta identidade com os campos obrigatórios', async () => {
  const id = await collectIdentity('Maquina X');
  assert.ok(id.agent_id.startsWith('hd-'), 'agent_id deve começar com hd-');
  assert.equal(id.agent_name, 'Maquina X');
  assert.ok(id.arch, 'deve ter arch');
  assert.ok(typeof id.hostname === 'string');
  assert.ok('serial_number' in id);
  assert.ok('model' in id);
  assert.ok('default_gateway' in id);
  assert.ok('dns_servers' in id);
  assert.ok('public_ip' in id, 'deve incluir public_ip na identidade');
  assert.ok('mac_addresses' in id);
  // local_ips deve ter apenas IPv4 (sem ":")
  if (id.local_ips) {
    const hasIpv6 = id.local_ips.split(',').some((ip) => ip.includes(':'));
    assert.equal(hasIpv6, false, 'local_ips não deve conter IPv6');
  }
});

test('collectSnapshot: traz RAM e disco (bytes)', async () => {
  const s = await collectSnapshot();
  assert.ok(s.memory_physical_bytes > 0, 'RAM total > 0');
  assert.ok(s.memory_used_bytes >= 0);
  assert.ok('disk_total_bytes' in s);
  assert.ok('isp' in s);
  assert.ok('public_ip' in s);
});
