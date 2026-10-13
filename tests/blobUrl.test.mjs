import test from 'node:test';
import assert from 'node:assert/strict';
import { isVercelBlobUrl } from '../lib/media/blobUrl.ts';
test('proxy accepts only HTTPS Vercel Blob store hostnames', () => {
  for (const value of ['https://store.public.blob.vercel-storage.com/image.webp', 'https://store.private.blob.vercel-storage.com/audio.mp3']) assert.equal(isVercelBlobUrl(value), true);
  for (const value of ['http://store.public.blob.vercel-storage.com/a', 'https://evil.test/blob.vercel-storage.com/a', 'https://blob.vercel-storage.com.evil.test/a', 'https://store.private.blob.vercel-storage.com@evil.test/a', 'https://user@store.private.blob.vercel-storage.com/a', 'https://store.private.blob.vercel-storage.com:8080/a', 'file:///blob.vercel-storage.com', '/blob.vercel-storage.com']) assert.equal(isVercelBlobUrl(value), false, value);
});
