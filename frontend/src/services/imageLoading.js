// One retry for transient failures, then an optional distinct thumbnail fallback.
export function nextImageAttempt(image, attempt) {
  if (attempt === 0) return 1;
  if (attempt === 1 && image.thumb_url && image.thumb_url !== image.url) return 2;
  return null;
}

export function imageSource(image, attempt) {
  if (attempt === 2) return image.thumb_url;
  if (attempt !== 1) return image.url;

  try {
    const url = new URL(image.url);
    const isHubMedia = url.hostname === 'media.luccasbooth.com'
      || url.hostname.endsWith('.r2.dev');
    // Never modify query-bearing URLs: they may be signed. A fixed retry key
    // avoids unbounded cache entries while bypassing a cached transient failure.
    if (url.protocol === 'https:' && isHubMedia && !url.search) {
      url.searchParams.set('portfolio_retry', '1');
      return url.toString();
    }
  } catch {
    // Preserve any relative or otherwise nonstandard source verbatim.
  }
  return image.url;
}
