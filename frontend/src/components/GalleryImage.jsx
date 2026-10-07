import { useEffect, useRef, useState } from 'react';
import { imageSource, nextImageAttempt } from '../services/imageLoading';

export default function GalleryImage({ image, index, showRetry = true }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retryTimer = useRef(null);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  const handleError = () => {
    if (retryTimer.current !== null) return;
    const nextAttempt = nextImageAttempt(image, attempt);
    if (nextAttempt === null) {
      setFailed(true);
      setRetrying(false);
      return;
    }
    setRetrying(true);
    // Back off before retrying the original; do not hammer an unavailable host.
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      setAttempt(nextAttempt);
    }, 1000);
  };

  const handleLoad = () => {
    clearTimeout(retryTimer.current);
    retryTimer.current = null;
    setRetrying(false);
  };

  const retry = () => {
    clearTimeout(retryTimer.current);
    retryTimer.current = null;
    setAttempt(0);
    setFailed(false);
    setRetrying(false);
  };

  return (
    <>
      {!failed && (
        <img
          key={attempt}
          src={imageSource(image, attempt)}
          alt={image.name || `Image ${index + 1}`}
          width={image.width || undefined}
          height={image.height || undefined}
          data-sized={image.width > 0 && image.height > 0}
          style={image.width > 0 && image.height > 0 ? {
            '--image-natural-width': `${image.width}px`,
            '--image-aspect': image.width / image.height,
          } : undefined}
          loading={index === 0 ? 'eager' : 'lazy'}
          fetchPriority={index === 0 ? 'high' : 'auto'}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {(failed || retrying) && (
        <div className="image-load-error" role="status">
          <p>{failed ? 'This image could not load.' : 'Retrying image…'}</p>
          {failed && showRetry && <button type="button" onClick={retry}>Retry image</button>}
        </div>
      )}
    </>
  );
}
