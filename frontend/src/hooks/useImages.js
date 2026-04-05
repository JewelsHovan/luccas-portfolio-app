import { useState, useEffect, useRef, useCallback } from 'react';
import apiService from '../services/api';

export const useImages = () => {
  const [images, setImages] = useState({ baseImage: null, overlayImage: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const nextPairRef = useRef(null);

  const prefetchNext = useCallback(async () => {
    try {
      const data = await apiService.generateOverlay();
      nextPairRef.current = data;
    } catch (err) {
      console.warn('Prefetch failed:', err.message);
      nextPairRef.current = null;
    }
  }, []);

  const fetchOverlay = useCallback(async () => {
    try {
      setError(null);

      // Use prefetched data if available
      if (nextPairRef.current) {
        const prefetched = nextPairRef.current;
        nextPairRef.current = null;
        setImages({ baseImage: prefetched.baseImage, overlayImage: prefetched.overlayImage });
        prefetchNext();
        return;
      }

      const data = await apiService.generateOverlay();
      setImages({ baseImage: data.baseImage, overlayImage: data.overlayImage });
      prefetchNext();
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch overlay:', err);
    }
  }, [prefetchNext]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchOverlay();
      setLoading(false);
    };
    init();
  }, []);

  return { images, loading, error, refetch: fetchOverlay };
};
