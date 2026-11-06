import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function audioRunner() {
  const calls = [];
  const exports = {};
  const audio = {
    playShowAudio: (file, opts) => calls.push(['play', file, opts.channel]),
    stopShowAudio: channel => calls.push(['stop', channel]),
    victorySongAudioFile: song => `resolved:${song}`,
  };
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/audio/teamCelebration.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports, require:()=>audio});
  return { calls, play: exports.playPositiveSpinAudio };
}
test('positive spin deliberately restarts the team song alongside its airhorn', () => {
  const r = audioRunner();
  r.play('team-song');
  assert.deepEqual(r.calls, [['play','airhorn.mp3','cue'],['stop','music'],['play','resolved:team-song','music']]);
  r.play('team-song');
  assert.equal(r.calls.filter(call=>call[0]==='stop').length,2);
  assert.equal(r.calls.filter(call=>call[1]==='resolved:team-song').length,2);
});
test('host and phone previews stay silent; teams without songs still get the accent', () => {
  const r = audioRunner();
  r.play('team-song',false);
  assert.deepEqual(r.calls,[]);
  r.play();
  assert.deepEqual(r.calls,[['play','airhorn.mp3','cue']]);
});
test('first-place reveal and winner screen are sent together without a delayed second write', () => {
  const host=readFileSync('app/host/quiz/page.tsx','utf8');
  const reveal=host.slice(host.indexOf('async function doRevealNextTeam()'), host.indexOf('async function revealAllFinalResults()'));
  assert.match(reveal,/quiz_end_revealed_count: nextCount, scoreboard_data: finalScores, quiz_end_trophy_visible: nextCount >= total/);
  assert.doesNotMatch(reveal,/setTimeout/);
  const display=readFileSync('app/host/display/page.tsx','utf8');
  assert.match(display,/scores.length > 0 && syncedCount >= scores.length/);
  assert.match(display,/trophyVisible \|\| \(sorted.length > 0 && revealedCount >= sorted.length\)/);
});
test('spin landing reads the latest song without restarting the reel animation', () => {
  const source=readFileSync('components/SlotReels.tsx','utf8');
  assert.match(source,/playPositiveSounds\(songRef.current\)/);
  assert.match(source,/if \(actualResult.positive\)/);
  assert.match(source,/playPositiveSpinAudio\(songFile, audioEnabled\)/);
});
