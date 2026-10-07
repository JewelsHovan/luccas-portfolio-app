export function legacyBookId(type, books) {
  if (!type || type === 'sketchbooks') return '';
  const book = books.find((candidate) => candidate.id === type || candidate.slug === type
    || (type === 'j24' && candidate.slug === 'art-website-library-books-j24'));
  return book?.id || '';
}

export function pageIndexFromScroll(left, width, count) {
  if (!(width > 0) || !(count > 0) || !Number.isFinite(left)) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(left / width)));
}
