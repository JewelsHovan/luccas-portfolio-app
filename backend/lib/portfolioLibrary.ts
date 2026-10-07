import type { LuccasHubClient, LuccasHubCollection } from './luccasHub.ts';
import {
  isRenderableHubImage,
  listAllPortfolioImages,
  mapHubFileToPortfolioImage,
  type PortfolioImage,
  PortfolioRequestError,
} from './portfolioAssets.ts';
import { collectionPath, collectionsUnder, LIBRARY_ROOT, mediaReadBudget } from './portfolioCollections.ts';

export const LIBRARY_SHELF_BATCH_SIZE = 20;

export interface LibraryBook {
  id: string;
  slug: string;
  title: string;
  cover: PortfolioImage;
}

export interface LibraryShelf {
  books: LibraryBook[];
  next_cursor: string | null;
}

export interface LibraryBookPages {
  book: LibraryBook;
  pages: PortfolioImage[];
}

export function libraryCollections(collections: readonly LuccasHubCollection[]): LuccasHubCollection[] {
  return collectionsUnder(collections, LIBRARY_ROOT, false).filter((collection) =>
    // Symbols is the existing static glyph page, not a Hub-backed book.
    collectionPath(collection)[LIBRARY_ROOT.length].toLowerCase() !== 'symbols',
  );
}

function mapBook(collection: LuccasHubCollection, cover: PortfolioImage): LibraryBook {
  const path = collectionPath(collection);
  return { id: collection.id, slug: collection.slug, title: path[path.length - 1], cover };
}

async function firstImage(
  client: LuccasHubClient,
  collection: LuccasHubCollection,
  beforeRequest: () => void,
): Promise<PortfolioImage | null> {
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  do {
    beforeRequest();
    const page = await client.listFilesByCollection(collection.slug, { limit: 50, order: 'display', cursor });
    const cover = page.files.find(isRenderableHubImage);
    if (cover) return mapHubFileToPortfolioImage(cover);
    cursor = page.next_cursor ?? undefined;
    if (cursor && seenCursors.has(cursor)) {
      throw new Error(`Luccas Asset Hub repeated cursor while finding cover for "${collection.slug}".`);
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return null;
}

export async function loadLibraryShelf(
  client: LuccasHubClient,
  collections: readonly LuccasHubCollection[],
  cursor?: string,
): Promise<LibraryShelf> {
  const candidates = libraryCollections(collections);
  const previousIndex = cursor ? candidates.findIndex((collection) => collection.id === cursor) : -1;
  if (cursor && previousIndex < 0) {
    throw new PortfolioRequestError('Library changed while browsing. Reload the shelf.', 400);
  }
  const start = previousIndex + 1;
  const batch = candidates.slice(start, start + LIBRARY_SHELF_BATCH_SIZE);
  const beforeRequest = mediaReadBudget();
  const books: LibraryBook[] = [];
  for (const collection of batch) {
    const cover = await firstImage(client, collection, beforeRequest);
    // Folder-only groups and genuinely empty books do not become fake books.
    // A collection with its own pages remains a book even if it has children.
    if (cover) books.push(mapBook(collection, cover));
  }
  return {
    books,
    next_cursor: start + batch.length < candidates.length ? batch[batch.length - 1].id : null,
  };
}

export async function loadLibraryBook(
  client: LuccasHubClient,
  collection: LuccasHubCollection,
): Promise<LibraryBookPages> {
  const images = await listAllPortfolioImages(client, collection.slug, {
    order: 'display', limit: 200, imagesOnly: true, beforeRequest: mediaReadBudget(),
  });
  const seen = new Set<string>();
  const pages = images.filter((image) => {
    if (seen.has(image.id)) return false;
    seen.add(image.id);
    return true;
  });
  if (pages.length === 0) throw new PortfolioRequestError('This book has no published image pages.', 404);
  return { book: mapBook(collection, pages[0]), pages };
}
