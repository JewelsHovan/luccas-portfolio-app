import { type LuccasHubClient, LuccasHubError, type LuccasHubFile } from './luccasHub.ts';

export const HOMEPAGE_HUB_COLLECTIONS = {
  base: ['art-website-homepage-large-rectangle-database'],
  overlay: ['art-website-homepage-small-rectangle-database'],
} as const;

// Canonical root slugs also keep the old public routes stable. Gallery reads
// discover current descendants by collection name, not these historical child
// lists. Homepage lists deliberately retain their original behavior.
export const PORTFOLIO_HUB_COLLECTIONS = {
  paintings: ['art-website-paintings'],
  photo: [
    'art-website-photo',
    'art-website-photo-b-w-film',
    'art-website-photo-color-film',
    // Summers Passed was removed; its active photos are now in B&W Film.
  ],
  assemblage: ['art-website-assemblage'],
  drawings: [
    'art-website-drawings',
    'art-website-drawings-works-on-paper',
  ],
  sketchbooks: [
    'art-website-library-sketchbooks',
    'art-website-library-sketchbooks-2020',
    'art-website-library-sketchbooks-2022',
    'art-website-library-sketchbooks-2023',
    'art-website-library-sketchbooks-2025',
  ],
  j24: ['art-website-library-books-j24'],
} as const;

export type PortfolioCollectionSlug = keyof typeof PORTFOLIO_HUB_COLLECTIONS;

export interface PortfolioImage {
  id: string;
  name: string;
  url: string;
  thumb_url: string | null;
  size: number;
  path: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  tags: string[];
}

export interface HubServerError {
  status: number;
  error: string;
  details: string;
}

export class PortfolioRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'PortfolioRequestError';
  }
}

export function isRenderableHubImage(file: LuccasHubFile): boolean {
  return Boolean(file.mime_type?.startsWith('image/') && file.url);
}

export function isPortfolioCollectionSlug(slug: string): slug is PortfolioCollectionSlug {
  return Object.hasOwn(PORTFOLIO_HUB_COLLECTIONS, slug);
}

export function mapHubFileToPortfolioImage(file: LuccasHubFile): PortfolioImage {
  const name = file.filename ?? file.name ?? file.id;
  const url = file.url || file.thumb_url;

  if (!url) {
    throw new Error(`Luccas Asset Hub file ${file.id} has no url or thumb_url.`);
  }

  return {
    id: file.id,
    name,
    url,
    thumb_url: file.thumb_url ?? null,
    size: file.size ?? 0,
    path: name,
    mime_type: file.mime_type ?? null,
    width: file.width ?? null,
    height: file.height ?? null,
    tags: file.tags ?? [],
  };
}

export function toHubServerError(error: unknown, resource: string): HubServerError {
  if (error instanceof PortfolioRequestError) {
    return { status: error.status, error: error.message, details: '' };
  }

  if (error instanceof LuccasHubError && error.status === 401) {
    return {
      status: 502,
      error: 'Luccas Asset Hub authentication failed',
      details: error.message,
    };
  }

  if (error instanceof Error && error.message.includes('LUCCAS_HUB_TOKEN is not configured')) {
    return {
      status: 500,
      error: 'Luccas Asset Hub is not configured on the server',
      details: error.message,
    };
  }

  return {
    status: 502,
    error: `Failed to fetch ${resource} from Luccas Asset Hub`,
    details: error instanceof Error ? error.message : 'Unknown Luccas Asset Hub error.',
  };
}

export interface PortfolioListOptions {
  order?: 'display';
  limit?: number;
  imagesOnly?: boolean;
  beforeRequest?: () => void;
}

export async function listAllPortfolioImages(
  client: LuccasHubClient,
  slug: string,
  options: PortfolioListOptions = {},
): Promise<PortfolioImage[]> {
  const images: PortfolioImage[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    options.beforeRequest?.();
    const page = await client.listFilesByCollection(slug, {
      limit: options.limit ?? 50,
      cursor,
      order: options.order,
    });
    const files = options.imagesOnly ? page.files.filter(isRenderableHubImage) : page.files;
    images.push(...files.map(mapHubFileToPortfolioImage));

    cursor = page.next_cursor ?? undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) {
        throw new Error(`Luccas Asset Hub repeated cursor while listing collection "${slug}".`);
      }
      seenCursors.add(cursor);
    }
  } while (cursor);

  return images;
}

export async function listPortfolioImagesFromCollections(
  client: LuccasHubClient,
  slugs: readonly string[],
  options: PortfolioListOptions = {},
): Promise<PortfolioImage[]> {
  // Bounded, deterministic traversal; don't start an unbounded Hub fan-out.
  const pages: PortfolioImage[][] = [];
  for (const slug of slugs) {
    pages.push(await listAllPortfolioImages(client, slug, options));
  }
  const imagesById = new Map<string, PortfolioImage>();

  for (const images of pages) {
    for (const image of images) {
      if (!imagesById.has(image.id)) {
        imagesById.set(image.id, image);
      }
    }
  }

  return [...imagesById.values()];
}
