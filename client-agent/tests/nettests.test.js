// TDD — testes do módulo de rede do agente.
// Inclui parsing puro + um teste REAL de ping no rota361.com.br.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePing, runPing, runDns } from '../lib/nettests.js';

const PING_OK = `PING rota361.com.br (104.21.52.120) 56(84) bytes of data.
64 bytes from 104.21.52.120: icmp_seq=1 ttl=57 time=7.10 ms
64 bytes from 104.21.52.120: icmp_seq=2 ttl=57 time=7.50 ms
64 bytes from 104.21.52.120: icmp_seq=3 ttl=57 time=7.90 ms

--- rota361.com.br ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2003ms
rtt min/avg/max/mdev = 7.100/7.500/7.900/0.327 ms`;

const PING_LOSS = `PING 10.0.0.9 (10.0.0.9) 56(84) bytes of data.

--- 10.0.0.9 ping statistics ---
3 packets transmitted, 0 received, 100% packet loss, time 2048ms`;

const PING_PARTIAL = `PING x (1.2.3.4) 56(84) bytes of data.
64 bytes from 1.2.3.4: icmp_seq=1 ttl=57 time=20.0 ms

--- x ping statistics ---
3 packets transmitted, 1 received, 66% packet loss, time 2003ms
rtt min/avg/max/mdev = 20.0/20.0/20.0/0.0 ms`;

test('parsePing: ping perfeito => sucesso, latência e jitter', () => {
  const r = parsePing(PING_OK);
  assert.equal(r.success, true);
  assert.equal(r.latency_ms, 7.5);
  assert.equal(r.packet_loss_percent, 0);
  assert.equal(r.jitter_ms, 0.327);
});

test('parsePing: perda total => falha e 100%', () => {
  const r = parsePing(PING_LOSS);
  assert.equal(r.success, false);
  assert.equal(r.packet_loss_percent, 100);
  assert.equal(r.latency_ms, null);
});

test('parsePing: perda parcial => sucesso com perda registrada', () => {
  const r = parsePing(PING_PARTIAL);
  assert.equal(r.success, true);
  assert.equal(r.packet_loss_percent, 66);
  assert.equal(r.latency_ms, 20);
});

// ---- Testes de rede REAIS (pulam se a máquina estiver offline) ----

test('runPing real no rota361.com.br responde', async () => {
  const r = await runPing({ name: 'rota361', target: 'rota361.com.br' }, 2, 5);
  if (!r.success) {
    console.warn('AVISO: sem rede? ping rota361.com.br falhou — teste pulado');
    return; // não falha o build por falta de internet
  }
  assert.equal(r.type, 'ping');
  assert.equal(r.target, 'rota361.com.br');
  assert.ok(r.latency_ms > 0, 'latência deve ser positiva');
  assert.ok(r.packet_loss_percent <= 100);
});

test('runDns real resolve rota361.com.br', async () => {
  const r = await runDns({ name: 'rota361', target: 'rota361.com.br' });
  if (!r.success) { console.warn('AVISO: DNS falhou — teste pulado'); return; }
  assert.ok(r.resolved_address, 'deve ter um IP resolvido');
  assert.ok(r.response_time_ms >= 0);
});
