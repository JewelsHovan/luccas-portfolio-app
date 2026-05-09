import { useState, useEffect, useRef } from 'react';
import apiService from '../services/api';

export const useImages = () => {
  const [images, setImages] = useState({
    baseImage: null,
    overlayImage: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Store all available images
  const allImagesRef = useRef({
    baseImages: [],
    overlayImages: []
  });

  // Initialize by fetching all images once
  const initializeImages = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch all images
      const data = await apiService.fetchAllImages();
      console.log('Fetched all images:', {
        baseCount: data.baseImages?.length,
        overlayCount: data.overlayImages?.length
      });
      
      // Store all images
      allImagesRef.current = {
        baseImages: data.baseImages || [],
        overlayImages: data.overlayImages || []
      };
      
      // Get initial random pair
      const initialPair = await apiService.generateOverlay();
      setImages({
        baseImage: initialPair.baseImage,
        overlayImage: initialPair.overlayImage
      });
      
    } catch (err) {
      setError(err.message);
      console.error('Failed to initialize images:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get new random pair
  const generateNewOverlay = async () => {
    try {
      setError(null);
      
      const data = await apiService.generateOverlay();
      console.log('Generated new overlay:', {
        base: data.baseImage?.name,
        overlay: data.overlayImage?.name
      });
      
      setImages({
        baseImage: data.baseImage,
        overlayImage: data.overlayImage
      });
      
    } catch (err) {
      setError(err.message);
      console.error('Failed to generate overlay:', err);
    }
  };

  useEffect(() => {
    initializeImages();
  }, []);

  return {
    images,
    loading,
    error,
    refetch: generateNewOverlay,
    allImages: allImagesRef.current
  };
};