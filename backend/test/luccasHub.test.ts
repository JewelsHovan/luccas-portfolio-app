import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLuccasHubClient,
  LuccasHubError,
  type CollectionFilesResponse,
} from '../lib/luccasHub.ts';
import {
  listAllPortfolioImages,
  mapHubFileToPortfolioImage,
  toHubServerError,
} from '../lib/portfolioAssets.ts';

test('client sends server token and builds collection pagination query', async () => {
  let requestedUrl: URL | undefined;
  let requestedAuthorization: string | null = null;

  const fetchImpl: typeof fetch = async (input, init) => {
    requestedUrl = new URL(input.toString());
    requestedAuthorization = new Headers(init?.headers).get('Authorization');

    return new Response(JSON.stringify({
      collection: { id: 'collection-1', slug: 'art-website-paintings', name: 'Paintings', app_scope: 'shared' },
      files: [],
      next_cursor: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const client = createLuccasHubClient({
    token: 'server-secret',
    baseUrl: 'https://hub.example/api/v1/',
    fetchImpl,
  });

  await client.listFilesByCollection('paintings / 2025', { limit: 50, cursor: 'opaque+cursor' });

  assert.equal(requestedUrl?.pathname, '/api/v1/collections/paintings%20%2F%202025/files');
  assert.equal(requestedUrl?.searchParams.get('limit'), '50');
  assert.equal(requestedUrl?.searchParams.get('cursor'), 'opaque+cursor');
  assert.equal(requestedAuthorization, 'Bearer server-secret');
});

test('client exposes all four Hub operations', async () => {
  const requestedPaths: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(input.toString());
    requestedPaths.push(`${url.pathname}${url.search}`);

    if (url.pathname.endsWith('/collections')) {
      return Response.json({ collections: [] });
    }
    if (url.pathname.includes('/collections/')) {
      return Response.json({ collection: {}, files: [], next_cursor: null });
    }
    if (url.pathname.endsWith('/files')) {
      return Response.json({ files: [], next_cursor: null });
    }
    return Response.json({ file: { id: 'file/1', url: 'https://r2.example/file.jpg' } });
  };

  const client = createLuccasHubClient({ token: 'server-secret', baseUrl: 'https://hub.example/api/v1', fetchImpl });

  await client.listCollections();
  await client.listFilesByCollection('paintings');
  await client.searchFiles({ tag: 'blue', search: 'portrait', limit: 10, cursor: 'next' });
  await client.getFile('file/1');

  assert.deepEqual(requestedPaths, [
    '/api/v1/collections',
    '/api/v1/collections/paintings/files',
    '/api/v1/files?tag=blue&search=portrait&limit=10&cursor=next',
    '/api/v1/files/file%2F1',
  ]);
});

test('401 becomes an explicit server authentication error', async () => {
  const client = createLuccasHubClient({
    token: 'revoked-secret',
    fetchImpl: async () => Response.json({ error: 'token_revoked' }, { status: 401 }),
  });

  await assert.rejects(
    () => client.listCollections(),
    (error: unknown) => {
      assert.ok(error instanceof LuccasHubError);
      assert.equal(error.status, 401);
      assert.equal(error.code, 'token_revoked');
      assert.match(error.message, /authentication failed/i);
      assert.match(error.message, /LUCCAS_HUB_TOKEN/);
      assert.doesNotMatch(error.message, /revoked-secret/);
      return true;
    },
  );
});

test('server adapter turns Hub 401 into a clear upstream authentication error', () => {
  const failure = toHubServerError(
    new LuccasHubError(
      'Luccas Asset Hub authentication failed (invalid_token). Check or rotate the server-side LUCCAS_HUB_TOKEN.',
      401,
      { error: 'invalid_token' },
    ),
    'paintings',
  );

  assert.equal(failure.status, 502);
  assert.equal(failure.error, 'Luccas Asset Hub authentication failed');
  assert.match(failure.details, /invalid_token/);
});

test('portfolio adapter supports live name field and documented filename field', () => {
  const fromLiveShape = mapHubFileToPortfolioImage({
    id: 'live-file',
    name: 'live-name.jpg',
    url: 'https://r2.example/live.jpg',
    size: 100,
  });
  const fromDocumentedShape = mapHubFileToPortfolioImage({
    id: 'documented-file',
    filename: 'documented-name.jpg',
    url: 'https://r2.example/documented.jpg',
    thumb_url: 'https://r2.example/documented-thumb.jpg',
  });

  assert.equal(fromLiveShape.name, 'live-name.jpg');
  assert.equal(fromLiveShape.url, 'https://r2.example/live.jpg');
  assert.equal(fromDocumentedShape.name, 'documented-name.jpg');
  assert.equal(fromDocumentedShape.thumb_url, 'https://r2.example/documented-thumb.jpg');
});

test('portfolio listing follows opaque cursors and preserves direct Hub URLs', async () => {
  const pages: CollectionFilesResponse[] = [
    {
      collection: { id: 'collection-1', slug: 'paintings', name: 'Paintings', app_scope: 'shared' },
      files: [{ id: 'file-1', name: 'one.jpg', url: 'https://r2.example/one.jpg' }],
      next_cursor: 'opaque-cursor',
    },
    {
      collection: { id: 'collection-1', slug: 'paintings', name: 'Paintings', app_scope: 'shared' },
      files: [{ id: 'file-2', filename: 'two.jpg', url: 'https://r2.example/two.jpg' }],
      next_cursor: null,
    },
  ];
  const cursors: Array<string | undefined> = [];
  const client = {
    async listFilesByCollection(_slug: string, options: { cursor?: string }) {
      cursors.push(options.cursor);
      return pages.shift() as CollectionFilesResponse;
    },
  };

  const images = await listAllPortfolioImages(client as never, 'paintings');

  assert.deepEqual(cursors, [undefined, 'opaque-cursor']);
  assert.deepEqual(images.map(({ name, url }) => ({ name, url })), [
    { name: 'one.jpg', url: 'https://r2.example/one.jpg' },
    { name: 'two.jpg', url: 'https://r2.example/two.jpg' },
  ]);
});
