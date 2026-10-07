import assert from 'node:assert/strict';
import test from 'node:test';
import { createLuccasHubClient, type LuccasHubCollection, type LuccasHubFile } from '../lib/luccasHub.ts';
import { PortfolioAssetService } from '../lib/portfolioAssetService.ts';
import { listAllPortfolioImages, PortfolioRequestError } from '../lib/portfolioAssets.ts';
import { collectionsUnder, LIBRARY_ROOT, mediaReadBudget } from '../lib/portfolioCollections.ts';
import { LIBRARY_SHELF_BATCH_SIZE } from '../lib/portfolioLibrary.ts';
import worker from '../worker-fixed.js';

const collection = (id: string, name: string, slug = id, app_scope = 'shared'): LuccasHubCollection => ({ id, name, slug, app_scope });
const image = (id: string, name = `${id}.jpg`): LuccasHubFile => ({ id, name, url: `https://media.example/${id}.jpg`, mime_type: 'image/jpeg', width: 600, height: 800 });

function fixture(collections: LuccasHubCollection[], files: Record<string, LuccasHubFile[]>) {
  const requests: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(input.toString());
    requests.push(url);
    if (url.pathname.endsWith('/collections')) return Response.json({ collections });
    const slug = decodeURIComponent(url.pathname.split('/').at(-2) ?? '');
    assert.ok(Object.hasOwn(files, slug), `Unexpected collection read: ${slug}`);
    return Response.json({ collection: collections.find((c) => c.slug === slug), files: files[slug], next_cursor: null });
  };
  const client = createLuccasHubClient({ token: 'test-secret', baseUrl: 'https://hub.example/api/v1', fetchImpl });
  return { client, requests, fetchImpl };
}

test('saved order is opt-in, survives every cursor, and never sorts filenames', async () => {
  const requests: URL[] = [];
  const client = createLuccasHubClient({ token: 'test-secret', fetchImpl: async (input) => {
    const url = new URL(input.toString()); requests.push(url);
    const second = url.searchParams.has('cursor');
    return Response.json({ files: second ? [image('first-alphabetically', 'a.jpg')] : [image('chosen-first', 'z.jpg')], next_cursor: second ? null : 'opaque+display/cursor' });
  } });
  const pages = await listAllPortfolioImages(client, 'book', { order: 'display' });
  assert.deepEqual(pages.map((page) => page.id), ['chosen-first', 'first-alphabetically']);
  assert.ok(requests.every((url) => url.searchParams.get('order') === 'display'));
  assert.equal(requests[1].searchParams.get('cursor'), 'opaque+display/cursor');
  await client.listFilesByCollection('legacy');
  assert.equal(requests[2].searchParams.has('order'), false);
});

test('gallery follows the actual Box name tree, discovers moved/new child slugs, and deduplicates IDs', async () => {
  const collections = [
    collection('b', 'Art website / Photo / Z folder'),
    collection('nested', 'Art website / Photo / A folder / Inner'),
    collection('root', 'Art website / Photo', 'art-website-photo'),
    collection('a', 'Art website / Photo / A folder', 'old-slug-before-move'),
    collection('wrong', 'Tatu website / Photo'),
  ];
  const { client, requests } = fixture(collections, {
    'art-website-photo': [image('root-page')], 'old-slug-before-move': [image('a-page', 'z.jpg')],
    nested: [image('nested-page'), image('root-page')], b: [image('b-page', 'a.jpg')],
  });
  const result = await new PortfolioAssetService({ token: 'test-secret', client }).listCollection('photo');
  assert.deepEqual(result.data.map((page) => page.id), ['root-page', 'a-page', 'nested-page', 'b-page']);
  assert.deepEqual(requests.slice(1).map((url) => decodeURIComponent(url.pathname.split('/').at(-2) ?? '')), ['art-website-photo', 'old-slug-before-move', 'nested', 'b']);
  assert.ok(requests.slice(1).every((url) => url.searchParams.get('order') === 'display'));
});

test('discovery matches full root segments and public scope, not slug prefixes', () => {
  const collections = [
    collection('moved-in', ' Art   website / Library / Books / A ', 'unrelated-old-slug'),
    collection('moved-out', 'Art website / Photo / Old book', 'art-website-library-old'),
    collection('near', 'Art website / Library archive / A'),
    collection('private', 'Art website / Library / A', 'private', 'tatu'),
    collection('root', 'Art website / Library'),
  ];
  assert.deepEqual(collectionsUnder(collections, LIBRARY_ROOT, false).map((c) => c.id), ['moved-in']);
});

test('Library preserves books, omits empty/PDF-only groups and Symbols, and uses the first ordered image as cover', async () => {
  const collections = [
    collection('group', 'Art website / Library / Books'),
    collection('book', 'Art website / Library / Books / J24’'),
    collection('parent', 'Art website / Library / Sketchbooks'),
    collection('child', 'Art website / Library / Sketchbooks / 2023'),
    collection('pdf', 'Art website / Library / PDF only'),
    collection('symbols', 'Art website / Library / Symbols'),
  ];
  const { client, requests } = fixture(collections, {
    group: [], book: [{ id: 'pdf', mime_type: 'application/pdf', url: '' }, image('z', 'z.jpg'), image('a', 'a.jpg')],
    parent: [image('shared')], child: [image('shared')], pdf: [{ id: 'pdf-only', url: 'https://media.example/file.pdf', mime_type: 'application/pdf' }],
  });
  const service = new PortfolioAssetService({ token: 'test-secret', client });
  const { data: shelf } = await service.listLibrary();
  assert.deepEqual(shelf.books.map((book) => book.id), ['book', 'parent', 'child']);
  assert.equal(shelf.books[0].cover.id, 'z');
  assert.equal(shelf.books[0].title, 'J24’');
  const { data } = await service.getLibraryBook('book');
  assert.deepEqual(data.pages.map((page) => page.id), ['z', 'a']);
  assert.equal(data.book.cover.id, data.pages[0].id);
  assert.ok(requests.filter((url) => url.pathname.endsWith('/files')).every((url) => url.searchParams.get('order') === 'display'));
});

test('shelf pagination includes later books even when early candidates are empty', async () => {
  const collections = Array.from({ length: LIBRARY_SHELF_BATCH_SIZE + 1 }, (_, i) => collection(`book-${i}`, `Art website / Library / Book ${String(i).padStart(2, '0')}`));
  const files = Object.fromEntries(collections.map((c, index) => [c.slug, index < LIBRARY_SHELF_BATCH_SIZE ? [] : [image('last')]]));
  const { client } = fixture(collections, files);
  const service = new PortfolioAssetService({ token: 'test-secret', client });
  const first = (await service.listLibrary()).data;
  assert.deepEqual(first.books, []);
  assert.ok(first.next_cursor);
  const second = (await service.listLibrary(first.next_cursor ?? undefined)).data;
  assert.equal(second.books[0].id, `book-${LIBRARY_SHELF_BATCH_SIZE}`);
  assert.equal(second.next_cursor, null);
  await assert.rejects(() => service.listLibrary('unknown'), (error: unknown) => error instanceof PortfolioRequestError && error.status === 400);
});

test('unknown or moved-out books never use cached pages or fetch arbitrary Hub collections', async () => {
  const book = collection('book', 'Art website / Library / Book');
  const { client, requests } = fixture([book], { book: [image('page')] });
  const service = new PortfolioAssetService({ token: 'test-secret', client });
  await service.getLibraryBook('book');
  const before = requests.length;
  await assert.rejects(() => service.getLibraryBook('outside'), (error: unknown) => error instanceof PortfolioRequestError && error.status === 404);
  assert.equal(requests.length, before);
  book.name = 'Art website / Photo / Moved out';
  await assert.rejects(() => service.getLibraryBook('book', true), /Book not found/);
  assert.equal(requests.at(-1)?.pathname.endsWith('/collections'), true);
});

test('gallery/library caches expire quickly, while homepage cache and legacy ordering stay unchanged', async () => {
  let now = 1000;
  const { client, requests } = fixture([
    collection('paintings', 'Art website / Paintings', 'art-website-paintings'),
    collection('book', 'Art website / Library / Book'),
  ], {
    'art-website-paintings': [image('painting')], book: [image('page')],
    'art-website-homepage-large-rectangle-database': [image('base')],
    'art-website-homepage-small-rectangle-database': [image('overlay')],
  });
  const service = new PortfolioAssetService({ token: 'test-secret', client, now: () => now });
  await service.listHomepage(); await service.listCollection('paintings'); await service.listLibrary(); await service.getLibraryBook('book');
  assert.equal((await service.listCollection('paintings')).cached, true);
  assert.equal((await service.listLibrary()).cached, true);
  assert.equal((await service.getLibraryBook('book')).cached, true);
  now += 60_001;
  assert.equal((await service.listCollection('paintings')).cached, false);
  assert.equal((await service.listLibrary()).cached, false);
  assert.equal((await service.getLibraryBook('book')).cached, false);
  assert.equal((await service.listHomepage()).cached, true);
  assert.ok(requests.filter((url) => url.pathname.includes('homepage-')).every((url) => !url.searchParams.has('order')));
  assert.equal((await service.listLibrary(undefined, true)).cached, false);
});

test('repeated upstream cursors fail explicitly and shared page budgets prevent excessive reads', async () => {
  const client = createLuccasHubClient({ token: 'test-secret', fetchImpl: async () => Response.json({ files: [], next_cursor: 'repeated' }) });
  await assert.rejects(() => listAllPortfolioImages(client, 'book', { order: 'display' }), /repeated cursor/);
  const budget = mediaReadBudget(2);
  budget(); budget(); assert.throws(budget, /safe page budget/);
});

test('Worker exposes shelf and book routes, preserves statuses, and disables stale gallery HTTP caching', async () => {
  const { fetchImpl } = fixture([
    collection('book', 'Art website / Library / Book'),
    collection('paintings', 'Art website / Paintings', 'art-website-paintings'),
  ], { book: [image('page')], 'art-website-paintings': [image('painting')] });
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const env = { LUCCAS_HUB_TOKEN: 'worker-test-secret' };
    for (const path of ['/api/library', '/api/library/book', '/api/paintings']) {
      const response = await worker.fetch(new Request(`https://portfolio.example${path}`), env);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      const body = await response.json();
      assert.equal(body.source, 'luccas-asset-hub');
      assert.doesNotMatch(JSON.stringify(body), /worker-test-secret/);
    }
    const shelf = await worker.fetch(new Request('https://portfolio.example/api/library'), env);
    assert.equal((await shelf.json()).books[0].id, 'book');
    const unknown = await worker.fetch(new Request('https://portfolio.example/api/library/unknown'), env);
    assert.equal(unknown.status, 404);
    const invalid = await worker.fetch(new Request('https://portfolio.example/api/library/%ZZ'), env);
    assert.equal(invalid.status, 400);
    const missingToken = await worker.fetch(new Request('https://portfolio.example/api/library'), {});
    assert.equal(missingToken.status, 500);
  } finally { globalThis.fetch = original; }
});
