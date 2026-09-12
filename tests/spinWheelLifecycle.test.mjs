import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/SpinWheel.tsx', import.meta.url), 'utf8');
test('reels register asynchronous work and clean up when their spin effect ends', () => {
  const reels = readFileSync(new URL('../components/SlotReels.tsx', import.meta.url), 'utf8');
  assert.equal(reels.match(/\bsetTimeout\(/g)?.length, 1, 'only the tracked scheduler may start a timeout');
  assert.equal(reels.match(/\brequestAnimationFrame\(/g)?.length, 1, 'only the tracked scheduler may start a frame');
  assert.match(reels, /pendingTimers.current.forEach\(clearTimeout\)/);
  assert.match(reels, /pendingFrames.current.forEach\(cancelAnimationFrame\)/);
  assert.match(reels, /fireworkCanvases.current.forEach\(canvas => canvas.remove\(\)\)/);
  assert.match(reels, /return cancelPendingWork;/);
});
test('wheel dispatches spin-start once and guards rapid repeated clicks', () => {
  assert.equal(source.match(/onSpinStart\?\.\(\)/g)?.length, 1);
  assert.match(source, /if \(spinningRef.current\) return/);
});
test('wheel owns and cancels its animation and delayed result on unmount', () => {
  assert.match(source, /cancelAnimationFrame\(spinRaf.current\)/);
  assert.match(source, /clearTimeout\(resultTimeout.current\)/);
  assert.equal(source.match(/spinRaf.current = requestAnimationFrame\(tick\)/g)?.length, 2);
});

test('host reconnect resumes the stored spin identity instead of drawing again', () => {
  const host = readFileSync(new URL('../app/host/quiz/page.tsx', import.meta.url), 'utf8');
  assert.match(host, /const hasStoredIdentity = Number\.isInteger\(existingTargetIdx\)/);
  assert.match(host, /const winIdx = hasStoredIdentity \? existingTargetIdx!/);
  assert.match(host, /if \(data\.spin_choice === "spin"\)[\s\S]*?restoredSpinTarget,[\s\S]*?restoredSpinNonce/);
});

test('host retains an unconfirmed spin and exposes an idempotent payout retry', () => {
  const host = readFileSync(new URL('../app/host/quiz/page.tsx', import.meta.url), 'utf8');
  assert.match(host, /if \(confirmed\) setTimeout\(\(\) => finalizeSpinSession\(pin\), 9800\)/);
  assert.doesNotMatch(host, /\}, 20000\)/);
  assert.match(host, /Retry Spin Payout/);
  assert.match(host, /result\.applied \? result\.scoreboardSyncError : \(await syncScoreboardData/);
});
