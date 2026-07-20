import { createLuccasHubClient, type LuccasHubClient } from './luccasHub.ts';
import {
  HOMEPAGE_HUB_COLLECTIONS,
  isPortfolioCollectionSlug,
  listPortfolioImagesFromCollections,
  PORTFOLIO_HUB_COLLECTIONS,
  type PortfolioCollectionSlug,
  type PortfolioImage,
} from './portfolioAssets.ts';

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
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
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private pairQueue: ImagePair[] = [];
  private pairIndex = 0;

  constructor({ token, cacheTimeoutMs = 4 * 60 * 60 * 1000, client }: PortfolioAssetServiceOptions) {
    this.client = client ?? createLuccasHubClient({ token });
    this.cacheTimeoutMs = cacheTimeoutMs;
  }

  private async getCached<T>(key: string, forceRefresh: boolean, load: () => Promise<T>): Promise<CacheResult<T>> {
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < this.cacheTimeoutMs) {
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
      this.cache.set(key, { value, fetchedAt: Date.now() });
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

    return this.getCached(`collection:${slug}`, forceRefresh, () =>
      listPortfolioImagesFromCollections(
        this.client,
        PORTFOLIO_HUB_COLLECTIONS[slug as PortfolioCollectionSlug],
      ),
    );
  }
}
