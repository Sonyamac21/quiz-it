import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/SpinWheel.tsx', import.meta.url), 'utf8');
test('wheel dispatches spin-start once and guards rapid repeated clicks', () => {
  assert.equal(source.match(/onSpinStart\?\.\(\)/g)?.length, 1);
  assert.match(source, /if \(spinningRef.current\) return/);
});
test('wheel owns and cancels its animation and delayed result on unmount', () => {
  assert.match(source, /cancelAnimationFrame\(spinRaf.current\)/);
  assert.match(source, /clearTimeout\(resultTimeout.current\)/);
  assert.equal(source.match(/spinRaf.current = requestAnimationFrame\(tick\)/g)?.length, 2);
});
