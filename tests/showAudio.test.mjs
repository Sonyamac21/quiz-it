import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as mixer from '../lib/audio/mixer.ts';

function harness() {
  const players = [];
  class Audio {
    constructor(src) { this.src = src; this.volume = 1; this.currentTime = 0; this.paused = true; players.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const storage = new Map();
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../lib/audio/showAudio.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', 'Audio', 'window', code)(name => {
    if (name === './mixer') return mixer;
    if (name.includes('config')) return { PLATFORM_CONFIG: { audio: { cue: 1, music: 1, timer: 1 } } };
    return { platformLogger: { warn() {} } };
  }, module, module.exports, Audio, { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  return { api: module.exports, players };
}

test('master and channel controls limit both new and already playing audio', () => {
  const { api } = harness();
  api.setShowAudioMix({ master: 0.5, music: 0.4 });
  const song = api.playShowAudio('team.mp3', { channel: 'music', volume: 0.8 });
  assert.ok(Math.abs(song.volume - 0.16) < 0.0001);
  api.setShowAudioMix({ master: 0, music: 1 });
  assert.equal(song.volume, 0);
  api.setShowAudioLevel(song, 1);
  assert.equal(song.volume, 0, 'fade-in must not bypass mute');
  api.setShowAudioMix({ master: 1, music: 0.3 });
  assert.equal(song.volume, 0.3);
});

test('duplicate deliveries retain the song, explicit stop allows immediate replay', () => {
  const { api } = harness();
  const first = api.playShowAudio('team.mp3', { channel: 'music' });
  assert.equal(api.playShowAudio('team.mp3', { channel: 'music' }), first);
  assert.equal(first.paused, false);
  api.stopShowAudio('music');
  assert.equal(first.paused, true);
  const replay = api.playShowAudio('team.mp3', { channel: 'music' });
  assert.notEqual(replay, first);
  assert.equal(replay.paused, false);
});

test('cue and timer transitions do not interrupt a victory song', () => {
  const { api } = harness();
  const song = api.playShowAudio('team.mp3', { channel: 'music' });
  api.playShowAudio('airhorn.mp3', { channel: 'cue' });
  api.playShowAudio('tick.mp3', { channel: 'timer' });
  api.stopShowAudio('timer');
  assert.equal(song.paused, false);
});

test('invalid mixer settings are bounded and partial saved settings have defaults', () => {
  const mix = mixer.readAudioMix({ master: 9, cue: -1, music: NaN });
  assert.equal(mix.master, 1);
  assert.equal(mix.cue, 0);
  assert.equal(mix.music, mixer.DEFAULT_AUDIO_MIX.music);
});

test('live timer preview changes playing audio and survives stale session polling', () => {
  const { api } = harness();
  api.setShowAudioMix({ master: 1, timer: 1 });
  const timer = api.playShowAudio('countdown.mp3', { channel: 'timer', volume: 0.8 });
  api.previewShowAudioMix({ master: 1, timer: 0.25 });
  assert.equal(timer.volume, 0.2);
  api.setShowAudioMix({ master: 1, timer: 1 });
  assert.equal(timer.volume, 0.2);
  api.previewShowAudioMix({ master: 1, timer: 0 });
  assert.equal(timer.volume, 0);
  assert.equal(api.getShowAudioVolume('timer', 0.3), 0, 'synthesized ticks use the live preview too');
  api.setShowAudioMix({ master: 1, timer: 0 });
  api.previewShowAudioMix(null);
  assert.equal(timer.volume, 0, 'closing the controls retains saved mute');
  api.stopShowAudio('timer');
  assert.equal(api.playShowAudio('lock.mp3', { channel: 'timer' }).volume, 0);
});
