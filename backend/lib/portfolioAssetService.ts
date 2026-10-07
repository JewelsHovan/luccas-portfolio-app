import { createLuccasHubClient, type LuccasHubClient, type LuccasHubCollection } from './luccasHub.ts';
import {
  HOMEPAGE_HUB_COLLECTIONS,
  isPortfolioCollectionSlug,
  listPortfolioImagesFromCollections,
  PORTFOLIO_HUB_COLLECTIONS,
  type PortfolioCollectionSlug,
  type PortfolioImage,
  PortfolioRequestError,
} from './portfolioAssets.ts';
import { collectionPath, collectionsUnder, GALLERY_ROOTS, mediaReadBudget, pathContains } from './portfolioCollections.ts';
import { type LibraryBookPages, type LibraryShelf, libraryCollections, loadLibraryBook, loadLibraryShelf } from './portfolioLibrary.ts';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheResult<T> {
  data: T;
  cached: boolean;
}

export interface HomepageImages {
  baseImages: PortfolioImage[];
  overlayImages: PortfolioImage[];
}

export interface ImagePair {
  baseImage: PortfolioImage;
  overlayImage: PortfolioImage;
}

export interface PairResult extends ImagePair {
  queueInfo: {
    currentPosition: number;
    totalPairs: number;
    remainingPairs: number;
  };
}

export interface PortfolioAssetServiceOptions {
  token: string;
  cacheTimeoutMs?: number;
  mediaCacheTimeoutMs?: number;
  now?: () => number;
  client?: LuccasHubClient;
}

function shuffle<T>(values: readonly T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createPairs(baseImages: PortfolioImage[], overlayImages: PortfolioImage[]): ImagePair[] {
  if (baseImages.length === 0 || overlayImages.length === 0) {
    return [];
  }

  const shuffledBase = shuffle(baseImages);
  const shuffledOverlay = shuffle(overlayImages);
  const pairCount = Math.max(shuffledBase.length, shuffledOverlay.length);

  return Array.from({ length: pairCount }, (_, index) => ({
    baseImage: shuffledBase[index % shuffledBase.length],
    overlayImage: shuffledOverlay[index % shuffledOverlay.length],
  }));
}

export class PortfolioAssetService {
  private readonly client: LuccasHubClient;
  private readonly cacheTimeoutMs: number;
  private readonly mediaCacheTimeoutMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private pairQueue: ImagePair[] = [];
  private pairIndex = 0;

  constructor({ token, cacheTimeoutMs = 4 * 60 * 60 * 1000, mediaCacheTimeoutMs = 60_000, now = Date.now, client }: PortfolioAssetServiceOptions) {
    this.client = client ?? createLuccasHubClient({ token });
    this.cacheTimeoutMs = cacheTimeoutMs;
    this.mediaCacheTimeoutMs = mediaCacheTimeoutMs;
    this.now = now;
  }

  private async getCached<T>(key: string, forceRefresh: boolean, load: () => Promise<T>, timeoutMs = this.cacheTimeoutMs): Promise<CacheResult<T>> {
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!forceRefresh && cached && this.now() < cached.expiresAt) {
      return { data: cached.value, cached: true };
    }

    const inFlight = this.pending.get(key) as Promise<T> | undefined;
    if (inFlight) {
      return { data: await inFlight, cached: false };
    }

    const request = load();
    this.pending.set(key, request);

    try {
      const value = await request;
      const now = this.now();
      for (const [cachedKey, entry] of this.cache) {
        if (entry.expiresAt <= now) this.cache.delete(cachedKey);
      }
      this.cache.set(key, { value, expiresAt: now + timeoutMs });
      return { data: value, cached: false };
    } finally {
      this.pending.delete(key);
    }
  }

  async listHomepage(forceRefresh = false): Promise<CacheResult<HomepageImages>> {
    const result = await this.getCached('homepage', forceRefresh, async () => {
      const [baseImages, overlayImages] = await Promise.all([
        listPortfolioImagesFromCollections(this.client, HOMEPAGE_HUB_COLLECTIONS.base),
        listPortfolioImagesFromCollections(this.client, HOMEPAGE_HUB_COLLECTIONS.overlay),
      ]);

      if (baseImages.length === 0 || overlayImages.length === 0) {
        throw new Error('Luccas Asset Hub homepage collections must each contain at least one image.');
      }

      return { baseImages, overlayImages };
    });

    if (!result.cached) {
      this.pairQueue = [];
      this.pairIndex = 0;
    }

    return result;
  }

  async nextHomepagePair(): Promise<PairResult> {
    const { data } = await this.listHomepage();

    if (this.pairQueue.length === 0 || this.pairIndex >= this.pairQueue.length) {
      this.pairQueue = createPairs(data.baseImages, data.overlayImages);
      this.pairIndex = 0;
    }

    const pair = this.pairQueue[this.pairIndex];
    if (!pair) {
      throw new Error('Luccas Asset Hub could not provide a homepage image pair.');
    }

    this.pairIndex += 1;
    return {
      ...pair,
      queueInfo: {
        currentPosition: this.pairIndex,
        totalPairs: this.pairQueue.length,
        remainingPairs: this.pairQueue.length - this.pairIndex,
      },
    };
  }

  async listCollection(slug: string, forceRefresh = false): Promise<CacheResult<PortfolioImage[]>> {
    if (!isPortfolioCollectionSlug(slug)) {
      throw new Error(`Unknown portfolio collection "${slug}".`);
    }

    return this.getCached(`collection:${slug}`, forceRefresh, async () => {
      const collections = await this.listHubCollections(forceRefresh);
      const key = slug as PortfolioCollectionSlug;
      const canonicalRoot = collections.find((collection) => collection.slug === PORTFOLIO_HUB_COLLECTIONS[key][0]);
      const root = canonicalRoot ? collectionPath(canonicalRoot) : GALLERY_ROOTS[key];
      if (!pathContains(['Art website'], root)) return [];
      const descendants = collectionsUnder(collections, root);
      return listPortfolioImagesFromCollections(this.client, descendants.map((collection) => collection.slug), {
        order: 'display', limit: 200, beforeRequest: mediaReadBudget(),
      });
    }, this.mediaCacheTimeoutMs);
  }

  private async listHubCollections(forceRefresh: boolean): Promise<LuccasHubCollection[]> {
    const { data } = await this.getCached('metadata:collections', forceRefresh, async () =>
      (await this.client.listCollections()).collections,
    this.mediaCacheTimeoutMs);
    return data;
  }

  async listLibrary(cursor?: string, forceRefresh = false): Promise<CacheResult<LibraryShelf>> {
    return this.getCached(`library:shelf:${cursor ?? ''}`, forceRefresh, async () =>
      loadLibraryShelf(this.client, await this.listHubCollections(forceRefresh), cursor),
    this.mediaCacheTimeoutMs);
  }

  async getLibraryBook(id: string, forceRefresh = false): Promise<CacheResult<LibraryBookPages>> {
    // Resolve inside the current Library scope before using any cached pages.
    // Arbitrary Hub slugs/IDs must never become public portfolio read endpoints.
    const collections = libraryCollections(await this.listHubCollections(forceRefresh));
    const collection = collections.find((candidate) => candidate.id === id);
    if (!collection) throw new PortfolioRequestError('Book not found in Library.', 404);
    return this.getCached(`library:book:${id}`, forceRefresh, () =>
      loadLibraryBook(this.client, collection),
    this.mediaCacheTimeoutMs);
  }
}
