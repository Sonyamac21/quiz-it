import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRY_PACKS, COUNTRY_ROUND, countryAnswerPoints, countryPoints, countryGuessCorrect, countryQuestionError, buildCountryQuestions } from '../lib/quiz/countryRound.ts';
import { getQuizPreflight } from '../lib/quiz/planStatus.ts';
import { isAnswerCorrect } from '../lib/quiz/answerScoring.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import * as countryModule from '../lib/quiz/countryRound.ts';

test('country round awards all five clue bands, with missing or forged bands worth zero', () => {
  assert.deepEqual([0,1,2,3,4].map(countryPoints), [10,8,6,4,2]);
  for (const index of [null,undefined,-1,5,0.5,'0',NaN]) assert.equal(countryPoints(index),0);
  for (let index=0;index<5;index++) {
    assert.equal(countryAnswerPoints({answer_text:'Japan',country_clue_index:index},{correct_answer:'Japan'}),10-index*2);
    assert.equal(countryAnswerPoints({answer_text:'Wrong',country_clue_index:index},{correct_answer:'Japan'}),0);
  }
});
test('country matching accepts explicit international aliases but never confuses neighbouring names', () => {
  const q = { round_type: COUNTRY_ROUND, correct_answer: 'United Arab Emirates', country_aliases: ['UAE', 'U.A.E.'] };
  for (const answer of [' united arab emirates ', 'uae', 'U.A.E.']) assert.equal(countryGuessCorrect(answer,q),true);
  assert.equal(countryGuessCorrect('Dubai',q),false);
  assert.equal(countryGuessCorrect('Iraq',{correct_answer:'Iran'}),false);
  assert.equal(countryGuessCorrect('Austria',{correct_answer:'Australia'}),false);
  assert.equal(countryGuessCorrect('Mexico',{correct_answer:'México'}),true);
  assert.equal(isAnswerCorrect({ answer_text: 'uae' }, { ...q, question_type:'text_answer', option_a:null,option_b:null,option_c:null,option_d:null }),true);
});
test('country packs give exactly five unique clues and countries, then avoid all prior country rounds', () => {
  const history=[];
  for (let run=0;run<4;run++) {
    const questions=buildCountryQuestions(5,history,()=>0.5);
    assert.equal(questions.length,5);
    assert.equal(new Set(questions.map(q=>q.correct_answer)).size,5);
    if (run === 0) assert.ok(questions.some(q=>q.country_flag_src));
    for (const q of questions) {
      assert.equal(countryQuestionError(q),null);
      assert.equal(history.some(old=>old.correct_answer===q.correct_answer),false);
      assert.equal(q.question_text,'Name the country.');
    }
    history.push(...questions);
  }
  assert.equal(history.length,COUNTRY_PACKS.length);
  assert.deepEqual(buildCountryQuestions(5,history),[]);
});
test('country preflight blocks incomplete packs and counts, and accepts a full five-country round', () => {
  const questions=buildCountryQuestions(5);
  const round={id:'country',round_type:COUNTRY_ROUND,questions,target_count:5};
  assert.equal(getQuizPreflight({quiz_rounds:[round]}).ready,true);
  assert.equal(getQuizPreflight({quiz_rounds:[{...round,questions:questions.slice(0,4)}]}).ready,false);
  assert.equal(getQuizPreflight({quiz_rounds:[{...round,questions:[...questions,questions[0]]}]}).ready,false);
  questions[0].country_clues[4]=questions[0].country_clues[0];
  assert.equal(getQuizPreflight({quiz_rounds:[round]}).ready,false);
  assert.equal(getQuizPreflight({quiz_rounds:[{...round,questions:Array(5).fill(null)}]}).ready,false);
});

test('the actual clue component renders a flag only from its chosen clue onward', () => {
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/CountryClues.tsx', import.meta.url),'utf8'), {
    compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.ReactJSX },
  }).outputText,{ exports, require: name=>name==='react/jsx-runtime' ? jsxRuntime : countryModule });
  const question={country_clues:['First secret clue','Second clue','Third clue','Flag clue text','Final secret clue'],country_flag_src:'/country-flags/01.svg',country_flag_clue_index:3};
  const before=renderToStaticMarkup(exports.CountryClues({question,index:0}));
  assert.ok(before.includes('10 points'));
  assert.ok(before.includes('First secret clue'));
  assert.ok(!before.includes('Second clue'));
  assert.ok(!before.includes('/country-flags/'));
  const after=renderToStaticMarkup(exports.CountryClues({question,index:3}));
  assert.ok(after.includes('4 points'));
  assert.ok(after.includes('/country-flags/01.svg'));
  assert.ok(!after.includes('Final secret clue'));
  const preview=renderToStaticMarkup(exports.CountryClues({question,preview:true}));
  assert.ok(preview.includes('Final secret clue'));
});
