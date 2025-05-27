import React from 'react';
import ImageOverlay from './ImageOverlay';
import { useImages } from '../hooks/useImages';

const Home = () => {
  const { images, loading, error, refetch } = useImages();

  if (loading) {
    return (
      <main className="main-content">
        <div className="loading-state">
          <div className="spinner-large"></div>
          <p>Loading images from Dropbox...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="main-content">
        <div className="error-state">
          <h2>Unable to load images</h2>
          <p>{error}</p>
          <button onClick={refetch} className="retry-btn">
            Try Again
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="main-content">
        <div className="hero-section">
          <ImageOverlay 
            baseImage={images.baseImage}
            overlayImage={images.overlayImage}
            showControls={false}
          />
        </div>
      </main>
      <div className="copyright">©luccasbooth</div>
    </>
  );
};

export default Home;