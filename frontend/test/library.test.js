import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiService } from '../src/services/api.js';
import { legacyBookId, pageIndexFromScroll } from '../src/services/libraryNavigation.js';

const books = [{ id: 'stable-j24', slug: 'art-website-library-books-j24' }, { id: 'stable-2023', slug: 'old-path' }];

test('legacy J24 URLs select the same book by stable ID; Sketchbooks opens the flat shelf', () => {
  assert.equal(legacyBookId('j24', books), 'stable-j24');
  assert.equal(legacyBookId('stable-2023', books), 'stable-2023');
  assert.equal(legacyBookId('old-path', books), 'stable-2023');
  assert.equal(legacyBookId('sketchbooks', books), '');
  assert.equal(legacyBookId('unknown', books), '');
});

test('horizontal page counters round to the visible page and clamp overscroll', () => {
  assert.equal(pageIndexFromScroll(0, 320, 4), 0);
  assert.equal(pageIndexFromScroll(320, 320, 4), 1);
  assert.equal(pageIndexFromScroll(490, 320, 4), 2);
  assert.equal(pageIndexFromScroll(-10, 320, 4), 0);
  assert.equal(pageIndexFromScroll(10000, 320, 4), 3);
  assert.equal(pageIndexFromScroll(10, 0, 4), 0);
  assert.equal(pageIndexFromScroll(NaN, 320, 4), 0);
});

test('shelf reads every page, including empty candidate batches, without duplicate books', async () => {
  const original = globalThis.fetch;
  const requests = [];
  const responses = [
    { books: [], next_cursor: 'empty-batch' },
    { books: [books[0]], next_cursor: 'next cursor' },
    { books, next_cursor: null },
  ];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: new URL(input), cache: init.cache });
    return Response.json(responses.shift());
  };
  try {
    assert.deepEqual(await new ApiService().fetchLibraryBooks(), books);
    assert.equal(requests.length, 3);
    assert.equal(requests[1].url.searchParams.get('cursor'), 'empty-batch');
    assert.equal(requests[2].url.searchParams.get('cursor'), 'next cursor');
    assert.ok(requests.every((request) => request.cache === 'no-store'));
  } finally { globalThis.fetch = original; }
});

test('repeated shelf cursors and invalid API shapes fail rather than silently losing books', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ books, next_cursor: 'same' });
    await assert.rejects(() => new ApiService().fetchLibraryBooks(), /repeated or invalid page/);
    globalThis.fetch = async () => Response.json({ error: 'upstream failed' }, { status: 502 });
    await assert.rejects(() => new ApiService().fetchLibraryBooks(), /upstream failed/);
    globalThis.fetch = async () => Response.json({ books: null });
    await assert.rejects(() => new ApiService().fetchLibraryBooks(), /could not be read/);
  } finally { globalThis.fetch = original; }
});

test('book API encodes stable IDs, propagates refresh, and rejects mismatched/empty books', async () => {
  const original = globalThis.fetch;
  try {
    let url;
    globalThis.fetch = async (input) => {
      url = new URL(input);
      return Response.json({ book: { id: 'id/with space' }, pages: [{ id: 'page' }] });
    };
    await new ApiService().fetchLibraryBook('id/with space', { refresh: true });
    assert.equal(url.pathname, '/api/library/id%2Fwith%20space');
    assert.equal(url.searchParams.get('refresh'), 'true');
    await assert.rejects(() => new ApiService().fetchLibraryBook('wrong-id'), /no readable pages/);
    globalThis.fetch = async () => Response.json({ book: { id: 'empty' }, pages: [] });
    await assert.rejects(() => new ApiService().fetchLibraryBook('empty'), /no readable pages/);
  } finally { globalThis.fetch = original; }
});

test('caller cancellation aborts a pending read without being mistaken for a timeout', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_input, { signal }) => new Promise((_resolve, reject) => {
    const rejectAbort = () => reject(new DOMException('Cancelled', 'AbortError'));
    if (signal.aborted) rejectAbort();
    else signal.addEventListener('abort', rejectAbort, { once: true });
  });
  try {
    const controller = new AbortController();
    const request = new ApiService().fetchLibraryBooks({ signal: controller.signal });
    controller.abort();
    await assert.rejects(request, (error) => error.name === 'AbortError');
    const galleryController = new AbortController();
    const galleryRequest = new ApiService().fetchCollectionImages('photo', { signal: galleryController.signal });
    galleryController.abort();
    await assert.rejects(galleryRequest, (error) => error.name === 'AbortError');
    await assert.rejects(() => new ApiService().request('/api/library', 1), /Request timeout/);
  } finally { globalThis.fetch = original; }
});
