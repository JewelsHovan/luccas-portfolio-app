import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Collections.css';

// Helper function to calculate image saturation
const calculateImageSaturation = (img) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Create a reasonably sized canvas for sampling
    const maxSize = 100;
    const scale = Math.min(maxSize / img.width, maxSize / img.height);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      let totalSaturation = 0;
      let pixelCount = 0;
      
      // Sample every 4th pixel for performance
      for (let i = 0; i < data.length; i += 16) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        
        // Calculate saturation
        if (max !== 0) {
          const saturation = delta / max;
          totalSaturation += saturation;
          pixelCount++;
        }
      }
      
      const avgSaturation = pixelCount > 0 ? totalSaturation / pixelCount : 0;
      resolve(avgSaturation);
    } catch (error) {
      console.warn('Could not analyze image:', error);
      resolve(0.5); // Default middle value if analysis fails
    }
  });
};

// Helper function to get cached saturation or calculate new
const getImageSaturation = async (imageUrl) => {
  const cacheKey = `saturation_${imageUrl}`;
  const cached = localStorage.getItem(cacheKey);
  
  if (cached !== null) {
    return parseFloat(cached);
  }
  
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = async () => {
      const saturation = await calculateImageSaturation(img);
      try {
        localStorage.setItem(cacheKey, saturation.toString());
      } catch (e) {
        console.warn('Could not cache saturation value:', e);
      }
      resolve(saturation);
    };
    
    img.onerror = () => {
      console.warn('Could not load image for analysis:', imageUrl);
      resolve(0.5); // Default middle value
    };
    
    img.src = imageUrl;
  });
};

const Collections = ({ selectedCollection, setSelectedCollection }) => {
  const [images, setImages] = useState([]);
  const [sortedImages, setSortedImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedImageIndex, setExpandedImageIndex] = useState(null);
  const [sortingImages, setSortingImages] = useState(false);
  const containerRef = useRef(null);
  const imageRefs = useRef([]);
  const photoGridRef = useRef(null);

  // Fetch images from API
  useEffect(() => {
    if (!selectedCollection) return;

    const fetchImages = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`https://luccas-portfolio-backend.julienh15.workers.dev/api/${selectedCollection}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch images');
        }
        
        const data = await response.json();
        const fetchedImages = data.images || [];
        setImages(fetchedImages);
        setSortedImages(fetchedImages); // Set initial unsorted images
        setCurrentIndex(0);
        
        // Sort images by saturation for photo collection
        if (selectedCollection === 'photo' && fetchedImages.length > 0) {
          setSortingImages(true);
          sortImagesBySaturation(fetchedImages);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchImages();
  }, [selectedCollection]);

  // Sort images by saturation
  const sortImagesBySaturation = async (imagesToSort) => {
    try {
      // Calculate saturation for each image
      const imagesWithSaturation = await Promise.all(
        imagesToSort.map(async (image) => {
          const saturation = await getImageSaturation(image.url);
          return { ...image, saturation };
        })
      );
      
      // Sort from low saturation (B&W) to high saturation (colorful)
      const sorted = [...imagesWithSaturation].sort((a, b) => a.saturation - b.saturation);
      setSortedImages(sorted);
    } catch (error) {
      console.error('Error sorting images:', error);
      setSortedImages(imagesToSort); // Fallback to unsorted
    } finally {
      setSortingImages(false);
    }
  };

  // Handle scroll for endless scroll effect
  const handleScroll = useCallback(() => {
    if (!containerRef.current || images.length === 0) return;

    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;

    // Find which image is currently most visible
    let newIndex = 0;
    for (let i = 0; i < imageRefs.current.length; i++) {
      const imageEl = imageRefs.current[i];
      if (!imageEl) continue;

      const rect = imageEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const imageTop = rect.top - containerRect.top;
      const imageBottom = rect.bottom - containerRect.top;
      
      // Check if image center is in the viewport
      const imageCenter = (imageTop + imageBottom) / 2;
      if (imageCenter >= 0 && imageCenter <= containerHeight) {
        newIndex = i;
        break;
      }
    }

    setCurrentIndex(newIndex);
  }, [images]);

  // Scroll to specific image
  const scrollToImage = (index) => {
    if (imageRefs.current[index] && containerRef.current) {
      imageRefs.current[index].scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Handle photo grid full-screen close
      if (selectedCollection === 'photo' && expandedImageIndex !== null) {
        if (e.key === 'Escape') {
          setExpandedImageIndex(null);
        }
      } 
      // Handle photo grid horizontal scrolling with arrow keys
      else if (selectedCollection === 'photo' && photoGridRef.current) {
        const scrollAmount = 300; // pixels to scroll
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          photoGridRef.current.scrollLeft += scrollAmount;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          photoGridRef.current.scrollLeft -= scrollAmount;
        }
      }
      // Handle vertical scroll navigation for other collections
      else if (selectedCollection !== 'photo') {
        if (e.key === 'ArrowDown' && currentIndex < images.length - 1) {
          scrollToImage(currentIndex + 1);
        } else if (e.key === 'ArrowUp' && currentIndex > 0) {
          scrollToImage(currentIndex - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images.length, selectedCollection, expandedImageIndex]);

  return (
    <div className="collections-page">
      {!selectedCollection && (
        <div className="no-collection-selected">
          <p>Select a collection to view</p>
        </div>
      )}

      {selectedCollection && loading && (
        <div className="collections-loading">
          <div className="spinner"></div>
          <p>Loading collection...</p>
        </div>
      )}

      {selectedCollection && !loading && error && (
        <div className="collections-error">
          <h3>Error loading collection</h3>
          <p>{error}</p>
          <button onClick={() => setSelectedCollection('')}>Back to Collections</button>
        </div>
      )}

      {selectedCollection && !loading && !error && (
        <>
          {/* Photo collection - Grid with horizontal scroll */}
          {selectedCollection === 'photo' ? (
            <div className="photo-grid-container" ref={photoGridRef}>
              {images.length === 0 ? (
                <div className="no-images">
                  <p>No images found in this collection</p>
                </div>
              ) : (
                <>
                  {sortingImages && (
                    <div className="sorting-indicator">
                      <span>Organizing photos by color...</span>
                    </div>
                  )}
                  <div className="photo-grid">
                  {sortedImages.map((image, index) => (
                    <div 
                      key={image.id || index} 
                      className="photo-grid-item"
                      onClick={() => setExpandedImageIndex(index)}
                    >
                      <img 
                        src={image.url} 
                        alt={image.name || `Photo ${index + 1}`}
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
                </>
              )}
            </div>
          ) : (
            /* Other collections - Vertical scroll layout */
            <div 
              className="collections-container" 
              ref={containerRef}
              onScroll={handleScroll}
            >
              {images.length === 0 ? (
                <div className="no-images">
                  <p>No images found in this collection</p>
                </div>
              ) : (
                <div className="images-scroll">
                  {images.map((image, index) => (
                    <div 
                      key={image.id || index} 
                      className={`image-container ${index === currentIndex ? 'active' : ''}`}
                      ref={el => imageRefs.current[index] = el}
                    >
                      <img 
                        src={image.url} 
                        alt={image.name || `Image ${index + 1}`}
                        loading="lazy"
                      />
                      <div className="image-info">
                        <p>{image.name || `Image ${index + 1}`}</p>
                        <span>{index + 1} / {images.length}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Progress indicator - only for non-photo collections */}
      {selectedCollection && selectedCollection !== 'photo' && !loading && images.length > 0 && (
        <div className="progress-indicator">
          <div 
            className="progress-bar" 
            style={{ width: `${((currentIndex + 1) / images.length) * 100}%` }}
          />
        </div>
      )}

      {/* Full-screen overlay for photo collection */}
      {selectedCollection === 'photo' && expandedImageIndex !== null && sortedImages[expandedImageIndex] && (
        <div className="photo-overlay" onClick={() => setExpandedImageIndex(null)}>
          <button 
            className="photo-overlay-close" 
            onClick={() => setExpandedImageIndex(null)}
            aria-label="Close"
          >
            ×
          </button>
          
          <div className="photo-overlay-content" onClick={(e) => e.stopPropagation()}>
            <img 
              src={sortedImages[expandedImageIndex].url} 
              alt={sortedImages[expandedImageIndex].name || `Photo ${expandedImageIndex + 1}`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Collections;