import assert from 'node:assert/strict';
import test from 'node:test';
import type { CollectionFilesResponse, LuccasHubClient } from '../lib/luccasHub.ts';
import { PortfolioAssetService } from '../lib/portfolioAssetService.ts';
import {
  HOMEPAGE_HUB_COLLECTIONS,
  PORTFOLIO_HUB_COLLECTIONS,
} from '../lib/portfolioAssets.ts';

function createFakeClient(filesByCollection: Record<string, Array<{ id: string; name: string; url: string }>>) {
  const calls: string[] = [];
  const client = {
    async listFilesByCollection(slug: string): Promise<CollectionFilesResponse> {
      calls.push(slug);
      return {
        collection: { id: slug, slug, name: slug, app_scope: 'shared' },
        files: filesByCollection[slug] ?? [],
        next_cursor: null,
      };
    },
  } as LuccasHubClient;

  return { client, calls };
}

test('service maps homepage collections, caches lists, and returns queued pairs', async () => {
  const baseSlug = HOMEPAGE_HUB_COLLECTIONS.base[0];
  const overlaySlug = HOMEPAGE_HUB_COLLECTIONS.overlay[0];
  const { client, calls } = createFakeClient({
    [baseSlug]: [{ id: 'base-1', name: 'base.jpg', url: 'https://r2.example/base.jpg' }],
    [overlaySlug]: [{ id: 'overlay-1', name: 'overlay.jpg', url: 'https://r2.example/overlay.jpg' }],
  });
  const service = new PortfolioAssetService({ token: 'server-secret', client });

  const first = await service.listHomepage();
  const second = await service.listHomepage();
  const pair = await service.nextHomepagePair();

  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(pair.baseImage.url, 'https://r2.example/base.jpg');
  assert.equal(pair.overlayImage.url, 'https://r2.example/overlay.jpg');
  assert.deepEqual(calls, [baseSlug, overlaySlug]);
});

test('service aggregates recursive collection equivalents and removes duplicate IDs', async () => {
  const photoSlugs = PORTFOLIO_HUB_COLLECTIONS.photo;
  const duplicate = { id: 'duplicate', name: 'same.jpg', url: 'https://r2.example/same.jpg' };
  const filesByCollection = Object.fromEntries(photoSlugs.map((slug, index) => [
    slug,
    index < 2
      ? [duplicate]
      : [{ id: `photo-${index}`, name: `${index}.jpg`, url: `https://r2.example/${index}.jpg` }],
  ]));
  const { client, calls } = createFakeClient(filesByCollection);
  const service = new PortfolioAssetService({ token: 'server-secret', client });

  const first = await service.listCollection('photo');
  const second = await service.listCollection('photo');

  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(first.data.length, 3);
  assert.deepEqual(new Set(calls), new Set(photoSlugs));
  assert.equal(calls.length, photoSlugs.length);
});

test('service rejects unknown public collection slugs without calling the Hub', async () => {
  const { client, calls } = createFakeClient({});
  const service = new PortfolioAssetService({ token: 'server-secret', client });

  await assert.rejects(() => service.listCollection('not-a-collection'), /Unknown portfolio collection/);
  assert.deepEqual(calls, []);
});
