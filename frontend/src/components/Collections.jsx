import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiService from '../services/api';
import GalleryImage from './GalleryImage';
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
    const controller = new AbortController();
    imageRefs.current = [];
    setImages([]);

    const fetchImages = async () => {
      try {
        setLoading(true);
        setError(null);
        const collectionImages = await apiService.fetchCollectionImages(selectedCollection, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setImages(collectionImages);
        setCurrentIndex(0);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchImages();
    return () => controller.abort();
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

  const scrollToImage = useCallback((index) => {
    if (imageRefs.current[index] && containerRef.current) {
      imageRefs.current[index].scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.target?.closest?.('.header, input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowDown' && currentIndex < images.length - 1) {
        e.preventDefault();
        scrollToImage(currentIndex + 1);
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        e.preventDefault();
        scrollToImage(currentIndex - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images.length, scrollToImage]);

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
                  <GalleryImage
                    key={`${selectedCollection}:${image.id || index}:${image.url}`}
                    image={image}
                    index={index}
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
