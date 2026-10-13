import test from 'node:test';
import assert from 'node:assert/strict';
import { isPreviewAudioUrl } from '../lib/media/previewUrl.ts';
test('preview proxy rejects lookalike, insecure and credential-bearing destinations', () => {
  for (const url of ['https://cdns-preview-a.dzcdn.net/stream/a.mp3','https://audio-ssl.itunes.apple.com/a.mp3','https://audio.mzstatic.com/a.mp3']) assert.equal(isPreviewAudioUrl(url),true);
  for (const url of ['https://127.0.0.1/?apple.com','https://evil.test/mzstatic.com','https://deezer.com.evil.test/a','https://deezer.com@localhost/a','http://deezer.com/a','https://user@deezer.com/a','https://deezer.com:444/a']) assert.equal(isPreviewAudioUrl(url),false,url);
});
