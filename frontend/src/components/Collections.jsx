import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Collections.css';

const Collections = () => {
  const [selectedCollection, setSelectedCollection] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedImageIndex, setExpandedImageIndex] = useState(null);
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
        setImages(data.images || []);
        setCurrentIndex(0);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchImages();
  }, [selectedCollection]);

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
      <div className="collections-header">
        <nav className="collections-nav">
          <button 
            className={`collection-link ${selectedCollection === 'paintings' ? 'active' : ''}`}
            onClick={() => setSelectedCollection('paintings')}
          >
            Paintings
          </button>
          <button 
            className={`collection-link ${selectedCollection === 'photo' ? 'active' : ''}`}
            onClick={() => setSelectedCollection('photo')}
          >
            Photo
          </button>
          <button 
            className={`collection-link ${selectedCollection === 'sketchbooks' ? 'active' : ''}`}
            onClick={() => setSelectedCollection('sketchbooks')}
          >
            Sketchbooks
          </button>
        </nav>
      </div>

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
                <div className="photo-grid">
                  {images.map((image, index) => (
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
      {selectedCollection === 'photo' && expandedImageIndex !== null && images[expandedImageIndex] && (
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
              src={images[expandedImageIndex].url} 
              alt={images[expandedImageIndex].name || `Photo ${expandedImageIndex + 1}`}
            />
            <div className="photo-overlay-info">
              <span>{expandedImageIndex + 1} / {images.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Collections;