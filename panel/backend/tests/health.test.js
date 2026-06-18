// TDD — lógica pura de classificação de saúde da rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTests, classifyHealth, STATUS } from '../src/lib/health.js';

test('summarizeTests: calcula latência média e pior perda entre pings', () => {
  const m = summarizeTests([
    { type: 'ping', success: true, latency_ms: 10, packet_loss_percent: 0 },
    { type: 'ping', success: true, latency_ms: 30, packet_loss_percent: 2 },
    { type: 'dns', success: true, response_time_ms: 5 },
  ]);
  assert.equal(m.avgLatencyMs, 20);
  assert.equal(m.packetLossPercent, 2);
  assert.equal(m.online, true);
  assert.equal(m.anyFailure, false);
});

test('classifyHealth: rede saudável => bom', () => {
  const r = classifyHealth({ avgLatencyMs: 15, packetLossPercent: 0, online: true, anyFailure: false });
  assert.equal(r.status, STATUS.GOOD);
  assert.equal(r.diagnostico, 'tudo ok');
});

test('classifyHealth: latência alta => atenção', () => {
  const r = classifyHealth({ avgLatencyMs: 150, packetLossPercent: 0, online: true, anyFailure: false });
  assert.equal(r.status, STATUS.WARN);
  assert.match(r.diagnostico, /latência alta/);
});

test('classifyHealth: perda >= 5% => crítico', () => {
  const r = classifyHealth({ avgLatencyMs: 20, packetLossPercent: 10, online: true, anyFailure: false });
  assert.equal(r.status, STATUS.CRIT);
  assert.match(r.diagnostico, /perda alta/);
});

test('classifyHealth: offline => crítico (vence outros)', () => {
  const r = classifyHealth({ avgLatencyMs: 5, packetLossPercent: 0, online: false, anyFailure: true });
  assert.equal(r.status, STATUS.CRIT);
  assert.match(r.diagnostico, /offline/);
});

test('classifyHealth: falha pontual sem perda => atenção', () => {
  const r = classifyHealth({ avgLatencyMs: 20, packetLossPercent: 0, online: true, anyFailure: true });
  assert.equal(r.status, STATUS.WARN);
});

test('summarizeTests: ping sem sucesso e sem http => offline', () => {
  const m = summarizeTests([{ type: 'ping', success: false, packet_loss_percent: 100 }]);
  assert.equal(m.online, false);
  const r = classifyHealth(m);
  assert.equal(r.status, STATUS.CRIT);
});
