import assert from 'node:assert/strict';
import test from 'node:test';
import { imageSource, nextImageAttempt } from '../src/services/imageLoading.js';

const image = { url: 'https://media.luccasbooth.com/2026/05/photo.jpg' };

test('successful originals keep their source and quality', () => {
  assert.equal(imageSource(image, 0), image.url);
});

test('a transient error retries a Hub URL once with a stable cache key', () => {
  assert.equal(nextImageAttempt(image, 0), 1);
  assert.equal(imageSource(image, 1), `${image.url}?portfolio_retry=1`);
  assert.equal(nextImageAttempt(image, 1), null);
  const legacy = { url: 'https://pub-example.r2.dev/photo.jpg' };
  assert.equal(imageSource(legacy, 1), `${legacy.url}?portfolio_retry=1`);
});

test('a distinct thumbnail is a final fallback, never an infinite loop', () => {
  const withThumb = { ...image, thumb_url: 'https://media.luccasbooth.com/thumb.jpg' };
  assert.equal(nextImageAttempt(withThumb, 1), 2);
  assert.equal(imageSource(withThumb, 2), withThumb.thumb_url);
  assert.equal(nextImageAttempt(withThumb, 2), null);
  assert.equal(nextImageAttempt({ ...image, thumb_url: image.url }, 1), null);
});

test('signed, external, relative, and insecure URLs are not rewritten', () => {
  for (const url of [
    `${image.url}?signature=abc`,
    'https://example.com/photo.jpg',
    '/photo.jpg',
    'http://media.luccasbooth.com/photo.jpg',
  ]) {
    assert.equal(imageSource({ url }, 1), url);
  }
});
