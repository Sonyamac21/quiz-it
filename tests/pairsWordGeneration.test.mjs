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
