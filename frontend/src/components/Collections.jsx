import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import './Collections.css';

const Collections = () => {
  const { type } = useParams();
  const selectedCollection = type || '';
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef(null);
  const imageRefs = useRef([]);

  // Fetch images from API based on URL param
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

  // Track which image is most visible while scrolling
  const handleScroll = useCallback(() => {
    if (!containerRef.current || images.length === 0) return;

    const container = containerRef.current;
    const containerHeight = container.clientHeight;

    let newIndex = 0;
    for (let i = 0; i < imageRefs.current.length; i++) {
      const imageEl = imageRefs.current[i];
      if (!imageEl) continue;

      const rect = imageEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const imageTop = rect.top - containerRect.top;
      const imageBottom = rect.bottom - containerRect.top;

      const imageCenter = (imageTop + imageBottom) / 2;
      if (imageCenter >= 0 && imageCenter <= containerHeight) {
        newIndex = i;
        break;
      }
    }

    setCurrentIndex(newIndex);
  }, [images]);

  const scrollToImage = (index) => {
    if (imageRefs.current[index] && containerRef.current) {
      imageRefs.current[index].scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown' && currentIndex < images.length - 1) {
        scrollToImage(currentIndex + 1);
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        scrollToImage(currentIndex - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images.length]);

  return (
    <div className="collections-page">
      {!selectedCollection && (
        <div className="no-collection-selected">
          <p>Open the menu to select a collection</p>
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
        </div>
      )}

      {selectedCollection && !loading && !error && (
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

      {/* Progress indicator */}
      {selectedCollection && !loading && images.length > 0 && (
        <div className="progress-indicator">
          <div
            className="progress-bar"
            style={{ width: `${((currentIndex + 1) / images.length) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default Collections;
