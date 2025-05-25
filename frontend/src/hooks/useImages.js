import { useState, useEffect } from 'react';
import apiService from '../services/api';

export const useImages = () => {
  const [images, setImages] = useState({
    baseImage: null,
    overlayImage: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchImages = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiService.fetchImages();
      setImages({
        baseImage: data.baseImage || null,
        overlayImage: data.overlayImage || null
      });
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch images:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  return {
    images,
    loading,
    error,
    refetch: fetchImages
  };
};