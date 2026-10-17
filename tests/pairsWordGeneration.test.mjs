import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('three word pairs need one AI call and no media or database requests', async () => {
  const exports = {};
  let calls = 0;
  const draft = [['Hammer', 'Nail'], ['Pencil', 'Paper'], ['Sock', 'Shoe']].map(([a, b]) => ({ a: { label: a }, b: { label: b } }));
  const source = readFileSync(new URL('../lib/quiz/generatePairs.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    require: name => {
      assert.equal(name, '@/lib/quiz/questionGenerationCore');
      return { audienceBrief: () => 'Kids and families', GENERATION_MODEL: 'test', callAPI: async prompt => {
        calls++;
        assert.match(prompt, /exactly one obvious partner/);
        assert.match(prompt, /Kids and families/);
        return JSON.stringify(draft);
      } };
    },
  });
  const result = await exports.generatePairs(3, 'Everyday things', { used: [], usedAnswers: [] }, 'families');
  assert.equal(calls, 1);
  assert.equal(result.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(result.map(p => [p.a.label, p.b.label]))), [['Hammer', 'Nail'], ['Pencil', 'Paper'], ['Sock', 'Shoe']]);
  assert.ok(result.every(pair => !pair.a.image_url && !pair.b.image_url));
});

test('rejected historical pairs guide retries while fresh relationships can share a familiar word', async () => {
  const exports = {};
  const prompts = [];
  const pair = (a, b) => ({ a: { label: a }, b: { label: b } });
  const batches = [[pair('Salt', 'Pepper'), pair('Socks', 'Shoes'), pair('Bread', 'Butter')], [pair('Salt', 'Pepper'), pair('France', 'Paris'), pair('Dog', 'Puppy'), pair('Bread', 'Flour'), pair('Cat', 'Kitten'), pair('Italy', 'Rome')]];
  const source = readFileSync(new URL('../lib/quiz/generatePairs.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: () => ({ audienceBrief: () => 'Families', GENERATION_MODEL: 'test', callAPI: async prompt => {
      prompts.push(prompt);
      return JSON.stringify(batches.shift());
    } }),
  });
  const result = await exports.generatePairs(3, '', { used: [], usedAnswers: ['pepper + salt', 'shoes + socks', 'bread + butter', 'dog + bone'] });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /already attempted items.*salt, pepper, socks, shoes, bread, butter/i);
  assert.equal(result.length, 3);
  assert.ok(result.some(p => p.a.label === 'Dog' && p.b.label === 'Puppy'));
  assert.ok(!result.some(p => p.a.label === 'Salt'));
  assert.match(prompts[0], /relationship category/);
});
