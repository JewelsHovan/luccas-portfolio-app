import assert from 'node:assert/strict';
import test from 'node:test';
import { createLuccasHubClient } from '../lib/luccasHub.ts';
import { PortfolioAssetService } from '../lib/portfolioAssetService.ts';
import { listAllPortfolioImages } from '../lib/portfolioAssets.ts';

const picture = (id: string) => ({ id, name: `${id}.jpg`, mime_type: 'image/jpeg', url: `https://media.example/${id}.jpg` });

test('a 75-image saved sequence crosses the pagination boundary without sorting, skipping, or repeating', async () => {
  const saved = Array.from({ length: 75 }, (_, index) => picture(`chosen-${75 - index}`));
  const queries: URL[] = [];
  const client = createLuccasHubClient({ token: 'test-secret', fetchImpl: async (input) => {
    const url = new URL(input.toString()); queries.push(url);
    const second = url.searchParams.get('cursor') === 'after-first-fifty';
    return Response.json({ files: second ? saved.slice(50) : saved.slice(0, 50), next_cursor: second ? null : 'after-first-fifty' });
  } });
  const images = await listAllPortfolioImages(client, 'book', { order: 'display', limit: 50 });
  assert.deepEqual(images.map((image) => image.id), saved.map((image) => image.id));
  assert.equal(queries.length, 2);
  assert.ok(queries.every((url) => url.searchParams.get('order') === 'display'));
});

test('a cover behind a non-image cursor page matches page one of the filtered reader', async () => {
  const collection = { id: 'book', slug: 'book', name: 'Art website / Library / Book', app_scope: 'shared' };
  const queries: URL[] = [];
  const client = createLuccasHubClient({ token: 'test-secret', fetchImpl: async (input) => {
    const url = new URL(input.toString()); queries.push(url);
    if (url.pathname.endsWith('/collections')) return Response.json({ collections: [collection] });
    const second = url.searchParams.get('cursor') === 'after-pdf';
    return Response.json({ files: second ? [picture('cover'), picture('next')] : [{ id: 'pdf', mime_type: 'application/pdf' }], next_cursor: second ? null : 'after-pdf' });
  } });
  const service = new PortfolioAssetService({ token: 'test-secret', client });
  const shelf = (await service.listLibrary()).data;
  const reader = (await service.getLibraryBook('book')).data;
  assert.equal(shelf.books[0].cover.id, 'cover');
  assert.deepEqual(reader.pages.map((page) => page.id), ['cover', 'next']);
  assert.equal(reader.book.cover.id, shelf.books[0].cover.id);
  assert.ok(queries.slice(1).every((url) => url.searchParams.get('order') === 'display'));
});

test('a cold shelf stops before its file-read budget, never returning a misleading partial shelf', async () => {
  let fileReads = 0;
  const client = createLuccasHubClient({ token: 'test-secret', fetchImpl: async (input) => {
    const url = new URL(input.toString());
    if (url.pathname.endsWith('/collections')) return Response.json({ collections: [{ id: 'book', slug: 'book', name: 'Art website / Library / Book', app_scope: 'shared' }] });
    fileReads += 1;
    return Response.json({ files: [{ id: `pdf-${fileReads}`, mime_type: 'application/pdf' }], next_cursor: `cursor-${fileReads}` });
  } });
  const service = new PortfolioAssetService({ token: 'test-secret', client });
  await assert.rejects(() => service.listLibrary(), /safe page budget/);
  assert.equal(fileReads, 40);
});
