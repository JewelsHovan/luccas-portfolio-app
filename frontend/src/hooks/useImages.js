import { useState, useEffect } from 'react';
import apiService from '../services/api';

export const useImages = () => {
  const [images, setImages] = useState({
    baseImage: null,
    overlayImage: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverlay = async () => {
    try {
      setError(null);
      const data = await apiService.generateOverlay();
      setImages({
        baseImage: data.baseImage,
        overlayImage: data.overlayImage
      });
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch overlay:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchOverlay();
      setLoading(false);
    };
    init();
  }, []);

  return {
    images,
    loading,
    error,
    refetch: fetchOverlay,
  };
};