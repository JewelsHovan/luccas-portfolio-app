import React from 'react';
import Header from './components/Header';
import ImageOverlay from './components/ImageOverlay';
import { useImages } from './hooks/useImages';
import './App.css';

function App() {
  const { images, loading, error, refetch } = useImages();

  if (loading) {
    return (
      <div className="app">
        <Header />
        <main className="main-content">
          <div className="loading-state">
            <div className="spinner-large"></div>
            <p>Loading images from Dropbox...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <Header />
        <main className="main-content">
          <div className="error-state">
            <h2>Unable to load images</h2>
            <p>{error}</p>
            <button onClick={refetch} className="retry-btn">
              Try Again
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Header />
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
    </div>
  );
}

export default App;