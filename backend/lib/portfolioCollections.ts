import type { LuccasHubCollection } from './luccasHub.ts';

export const LIBRARY_ROOT = ['Art website', 'Library'] as const;

export const GALLERY_ROOTS = {
  paintings: ['Art website', 'Paintings'],
  photo: ['Art website', 'Photo'],
  assemblage: ['Art website', 'Assemblage'],
  drawings: ['Art website', 'Drawings'],
  sketchbooks: ['Art website', 'Library', 'Sketchbooks'],
  j24: ['Art website', 'Library', 'Books', 'J24’'],
} as const;

export function collectionPath(collection: LuccasHubCollection): string[] {
  return collection.name.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
}

function normalized(part: string): string {
  return part.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function pathContains(root: readonly string[], path: readonly string[]): boolean {
  return path.length >= root.length && root.every((part, index) => normalized(part) === normalized(path[index]));
}

// Match Boolien Box's tree: files at a level, then alphabetical child folders.
// Compare one segment at a time so a parent's files precede its descendants.
function comparePaths(a: LuccasHubCollection, b: LuccasHubCollection): number {
  const left = collectionPath(a);
  const right = collectionPath(b);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const comparison = left[index].localeCompare(right[index]);
    if (comparison !== 0) return comparison;
  }
  return left.length - right.length || a.id.localeCompare(b.id);
}

export function collectionsUnder(
  collections: readonly LuccasHubCollection[],
  root: readonly string[],
  includeRoot = true,
): LuccasHubCollection[] {
  return collections.filter((collection) => {
    const path = collectionPath(collection);
    return (collection.app_scope === 'portfolio' || collection.app_scope === 'shared')
      && pathContains(root, path)
      && (includeRoot || path.length > root.length);
  }).sort(comparePaths);
}

// Leave margin below the free Worker's 50-subrequest limit. Cached metadata
// may still require one upstream read; all file-page reads share this budget.
export function mediaReadBudget(maxReads = 40): () => void {
  let reads = 0;
  return () => {
    reads += 1;
    if (reads > maxReads) {
      throw new Error('This media request exceeds the safe page budget. Split the collection or use paginated browsing.');
    }
  };
}
