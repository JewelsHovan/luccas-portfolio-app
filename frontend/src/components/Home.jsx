import React, { useRef } from 'react';
import ImageOverlay from './ImageOverlay';
import FloatingGlyphs from './FloatingGlyphs';
import { useImages } from '../hooks/useImages';

const Home = () => {
  const { images, loading, error, refetch } = useImages();
  const canvasRef = useRef(null);
  const captionRef = useRef(null);
  const copyrightRef = useRef(null);

  if (loading) {
    return (
      <main className="main-content">
        <div className="artsy-loader">
          <div className="artsy-spinner"></div>
          <p className="artsy-loader-text">Loading artwork...</p>
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
            onRefresh={refetch}
            canvasRef={canvasRef}
          />
          <div className="artwork-info" ref={captionRef}>
            <p className="artwork-title"><em>'source-over'</em></p>
            <p className="artwork-date">2025-ongoing</p>
            <p className="artwork-artists">Luccas Booth & Julien Hovan</p>
          </div>
        </div>
      </main>
      <div className="copyright" ref={copyrightRef}>©luccasbooth</div>
      <FloatingGlyphs
        canvasRef={canvasRef}
        captionRef={captionRef}
        copyrightRef={copyrightRef}
      />
    </>
  );
};

export default Home;
