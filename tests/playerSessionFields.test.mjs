import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('reconnected handset restores answers only from the current round', () => {
  const source = readFileSync(new URL('../components/PlayerQuizScreen.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('.select("answer_text")');
  const lookup = source.slice(start, source.indexOf('.maybeSingle()', start));
  assert.match(lookup, /\.eq\("round_number", roundNumber\)/);
  assert.match(lookup, /\.eq\("question_index", questionIndex\)/);
  assert.match(source, /\[phase, mySubmittedDisplay, submitted, sessionPin, teamName, question, questionIndex, roundNumber\]/);
});

test('handset session polling includes round identity used by answer writes', () => {
  const source = readFileSync(new URL('../components/PlayerQuizScreen.tsx', import.meta.url), 'utf8');
  const fetchSession = source.slice(source.indexOf('async function fetchSession()'), source.indexOf('async function fetchTeamOrder()'));
  const projection = fetchSession.match(/\.select\("([^"]+)"\)/)?.[1].split(',').map(field => field.trim());
  assert.ok(projection, 'session poll projection must be found');
  for (const field of ['round_number', 'current_session_round_id', 'current_question_index']) {
    assert.ok(projection.includes(field), `session polling must include ${field}`);
  }
});

test('host confirms round persistence before switching its local round', () => {
  const source = readFileSync(new URL('../app/host/quiz/page.tsx', import.meta.url), 'utf8');
  const chooseRound = source.slice(source.indexOf('async function chooseRound('), source.indexOf('const spacebarHint ='));
  assert.match(chooseRound, /await createSupabaseBrowserClient\(\)\.from\("sessions"\)\.update/);
  assert.match(chooseRound, /current_session_round_id: r\?\.id/);
  assert.match(chooseRound, /phase: "waiting"/);
  assert.match(chooseRound, /current_question_index: 0/);
  assert.match(chooseRound, /if \(error \|\| !data\) throw/);
  assert.ok(chooseRound.indexOf('if (error || !data)') < chooseRound.indexOf('setSelectedRound('));
});
