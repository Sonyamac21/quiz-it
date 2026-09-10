import test from 'node:test';
import assert from 'node:assert/strict';
import { leaderboardVisibilityUpdate, displayLeaderboardVisible } from '../lib/quiz/leaderboardVisibility.ts';

test('each audience toggle writes only its own flag, never phase or timer', () => {
  for (const visible of [true, false]) {
    assert.deepEqual(leaderboardVisibilityUpdate('display', visible), { show_scoreboard_on_display: visible });
    assert.deepEqual(leaderboardVisibilityUpdate('handsets', visible), { show_scoreboard: visible });
  }
});
test('display overlay leaves active game state intact and ignores handset flag', () => {
  const session = { phase: 'timer', timer_started_at: 'test', show_scoreboard: false };
  const shown = { ...session, ...leaderboardVisibilityUpdate('display', true) };
  assert.equal(displayLeaderboardVisible(shown), true);
  const hidden = { ...shown, ...leaderboardVisibilityUpdate('display', false) };
  assert.equal(displayLeaderboardVisible(hidden), false);
  assert.equal(hidden.phase, 'timer');
  assert.equal(hidden.timer_started_at, 'test');
  assert.equal(hidden.show_scoreboard, false);
  assert.equal(displayLeaderboardVisible({ phase: 'question', show_scoreboard: true }), false);
});
test('hidden rounds and quiz-end override display flag; legacy scoreboard still renders', () => {
  assert.equal(displayLeaderboardVisible({ phase: 'question', show_scoreboard_on_display: true, hide_leaderboard: true }), false);
  assert.equal(displayLeaderboardVisible({ phase: 'quiz_end', show_scoreboard_on_display: true }), false);
  assert.equal(displayLeaderboardVisible({ phase: 'scoreboard' }), true);
});
