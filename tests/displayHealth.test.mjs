import test from 'node:test';
import assert from 'node:assert/strict';
import { displaySnapshot, parseDisplayReply, assessDisplayHealth, DISPLAY_STALE_MS } from '../lib/diagnostics/displayHealth.ts';
const expected = { version: '2026-09-09T12:00:01Z', phase: 'answer', round: 1, question: 2 };
const reply = { ...expected, probe: 'probe-1', displayId: 'display-1', visible: true, receivedAt: 1000 };
const health = (observations, now = 1001, status = 'SUBSCRIBED', error = null) => assessDisplayHealth(expected, observations, now, status, error);
test('TV is not considered connected until it replies', () => assert.equal(health([]).level, 'unknown'));
test('current visible TV reply is healthy', () => assert.equal(health([reply]).level, 'healthy'));
test('older TV state, hidden tab and missing connection warn', () => {
  assert.equal(health([{ ...reply, version: '2026-09-09T12:00:00Z' }]).level, 'warning');
  assert.equal(health([{ ...reply, visible: false }]).level, 'warning');
  assert.equal(health([reply], 1001, 'CLOSED').level, 'warning');
});
test('TV timeout and multiple displays cannot be masked by one healthy reply', () => {
  assert.equal(health([reply], 1001 + DISPLAY_STALE_MS).level, 'warning');
  assert.equal(health([reply, { ...reply, displayId: 'other', visible: false }]).level, 'warning');
});
test('failed database read does not claim verified display', () => assert.equal(health([reply], 1001, 'SUBSCRIBED', 'offline').level, 'unknown'));
test('foreign probes, expired replies and malformed payloads are rejected', () => {
  const probes = new Map([['probe-1', 900]]);
  assert.ok(parseDisplayReply(reply, probes, 1000));
  assert.equal(parseDisplayReply({ ...reply, probe: 'another-host' }, probes, 1000), null);
  assert.equal(parseDisplayReply(reply, probes, DISPLAY_STALE_MS + 901), null);
  assert.equal(parseDisplayReply({ ...reply, version: 'invalid' }, probes, 1000), null);
  assert.equal(parseDisplayReply({ ...reply, visible: 'yes' }, probes, 1000), null);
});
test('snapshots require database version and contain no question or score content', () => {
  assert.equal(displaySnapshot({ phase: 'answer' }), null);
  assert.deepEqual(displaySnapshot({ updated_at: expected.version, phase: 'answer', round_number: 1, current_question_index: 2, current_question: { correct_answer: 'SECRET' }, scoreboard_data: [42] }), expected);
});
