import { useState, useEffect, useCallback } from 'react';
import apiService from '../services/api';

export const useImages = () => {
  const [currentImages, setCurrentImages] = useState({
    baseImage: null,
    overlayImage: null
  });
  const [imageQueue, setImageQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [queueIndex, setQueueIndex] = useState(0);

  // Fetch a batch of images
  const fetchImageBatch = async () => {
    try {
      setError(null);
      
      // Fetch 3 image pairs in parallel
      const promises = Array(3).fill(null).map(() => apiService.fetchImages());
      const results = await Promise.all(promises);
      
      return results.filter(result => 
        result.baseImage && result.overlayImage
      );
    } catch (err) {
      console.error('Failed to fetch image batch:', err);
      throw err;
    }
  };

  // Initial load
  const initializeImages = useCallback(async () => {
    try {
      setLoading(true);
      const batch = await fetchImageBatch();
      
      if (batch.length > 0) {
        setImageQueue(batch);
        setCurrentImages(batch[0]);
        setQueueIndex(0);
        
        // Preload images in the background
        batch.forEach(({ baseImage, overlayImage }) => {
          if (baseImage?.url) new Image().src = baseImage.url;
          if (overlayImage?.url) new Image().src = overlayImage.url;
        });
      } else {
        throw new Error('No images available');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Get next images from queue or fetch new batch
  const getNextImages = useCallback(async () => {
    const nextIndex = queueIndex + 1;
    
    if (nextIndex < imageQueue.length) {
      // Use next from queue
      setCurrentImages(imageQueue[nextIndex]);
      setQueueIndex(nextIndex);
      
      // If we're near the end, fetch more in background
      if (nextIndex === imageQueue.length - 1) {
        fetchImageBatch().then(batch => {
          setImageQueue(prev => [...prev, ...batch]);
          // Preload new batch
          batch.forEach(({ baseImage, overlayImage }) => {
            if (baseImage?.url) new Image().src = baseImage.url;
            if (overlayImage?.url) new Image().src = overlayImage.url;
          });
        }).catch(console.error);
      }
    } else {
      // Queue empty, fetch new batch
      setLoading(true);
      try {
        const batch = await fetchImageBatch();
        if (batch.length > 0) {
          setImageQueue(batch);
          setCurrentImages(batch[0]);
          setQueueIndex(0);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  }, [queueIndex, imageQueue]);

  useEffect(() => {
    initializeImages();
  }, [initializeImages]);

  return {
    images: currentImages,
    loading,
    error,
    refetch: getNextImages,
    queueSize: imageQueue.length - queueIndex
  };
};