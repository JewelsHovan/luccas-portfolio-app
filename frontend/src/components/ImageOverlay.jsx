import React, { useRef, useEffect, useState, useCallback } from 'react';
import './ImageOverlay.css';

const ImageOverlay = ({ baseImage = null, overlayImage = null, showControls = true, onRefresh = null }) => {
  const canvasRef = useRef(null);
  const flashRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [settings, setSettings] = useState({
    opacity: 0.75,
    scale: 0.55,
    blendMode: 'source-over',
    position: 'center'
  });

  const loadImageWithRetry = useCallback(async (imageData, isBase = true) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Critical for CORS on mobile
    
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 3;
      
      const tryLoad = () => {
        const timeout = setTimeout(() => {
          img.src = ''; // Cancel current load
          if (attempts < maxAttempts) {
            attempts++;
            console.log(`Retrying ${isBase ? 'base' : 'overlay'} image (${attempts}/${maxAttempts})`);
            setTimeout(tryLoad, 1000 * attempts); // Exponential backoff
          } else {
            reject(new Error(`Failed to load ${isBase ? 'base' : 'overlay'} image`));
          }
        }, 30000); // 30 second timeout for slow mobile networks
        
        img.onload = () => {
          clearTimeout(timeout);
          resolve(img);
        };
        
        img.onerror = () => {
          clearTimeout(timeout);
          if (attempts < maxAttempts) {
            attempts++;
            console.log(`${isBase ? 'Base' : 'Overlay'} image error, retrying (${attempts}/${maxAttempts})`);
            setTimeout(tryLoad, 1000 * attempts);
          } else {
            reject(new Error(`Failed to load ${isBase ? 'base' : 'overlay'} image`));
          }
        };
        
        // Add cache buster on retry to force fresh load
        img.src = attempts > 0 
          ? `${imageData.url}${imageData.url.includes('?') ? '&' : '?'}t=${Date.now()}`
          : imageData.url;
      };
      
      tryLoad();
    });
  }, []);

  const generateOverlay = useCallback(async () => {
    if (!baseImage || !overlayImage || !canvasRef.current) return;

    setIsGenerating(true);
    const canvas = canvasRef.current;
    
    // Get context with performance hints
    const ctx = canvas.getContext('2d', { 
      alpha: false, // No transparency needed, improves performance
      desynchronized: true // Allows async rendering
    });

    // Clear canvas with background color
    ctx.fillStyle = '#c4b5b5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    try {
      // Load both images in parallel
      const [baseImg, overlayImg] = await Promise.all([
        loadImageWithRetry(baseImage, true),
        loadImageWithRetry(overlayImage, false)
      ]);

      // Calculate base image dimensions
      const baseAspectRatio = baseImg.width / baseImg.height;
      const canvasAspectRatio = canvas.width / canvas.height;
      
      let baseDrawWidth, baseDrawHeight, baseX, baseY;
      
      if (baseAspectRatio > canvasAspectRatio) {
        baseDrawWidth = canvas.width;
        baseDrawHeight = canvas.width / baseAspectRatio;
        baseX = 0;
        baseY = (canvas.height - baseDrawHeight) / 2;
      } else {
        baseDrawHeight = canvas.height;
        baseDrawWidth = canvas.height * baseAspectRatio;
        baseX = (canvas.width - baseDrawWidth) / 2;
        baseY = 0;
      }
      
      // Draw base image
      ctx.drawImage(baseImg, baseX, baseY, baseDrawWidth, baseDrawHeight);

      // Calculate overlay dimensions
      const maxOverlaySize = Math.min(canvas.width, canvas.height) * settings.scale;
      const overlayAspectRatio = overlayImg.width / overlayImg.height;
      
      let overlayWidth, overlayHeight;
      
      if (overlayAspectRatio > 1) {
        overlayWidth = maxOverlaySize;
        overlayHeight = maxOverlaySize / overlayAspectRatio;
      } else {
        overlayHeight = maxOverlaySize;
        overlayWidth = maxOverlaySize * overlayAspectRatio;
      }

      // Center the overlay
      const overlayX = (canvas.width - overlayWidth) / 2;
      const overlayY = (canvas.height - overlayHeight) / 2;

      // Apply blend mode and opacity
      ctx.globalCompositeOperation = settings.blendMode;
      ctx.globalAlpha = settings.opacity;

      // Draw overlay image
      ctx.drawImage(overlayImg, overlayX, overlayY, overlayWidth, overlayHeight);

      // Reset context state
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      
      // Reset retry count on success
      setRetryCount(0);

    } catch (error) {
      console.error('Error generating overlay:', error);
      
      // Auto-retry on failure (up to 2 times)
      if (retryCount < 2) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          console.log('Auto-retrying image generation...');
          generateOverlay();
        }, 2000);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [baseImage, overlayImage, settings, loadImageWithRetry, retryCount]);

  useEffect(() => {
    if (!baseImage || !overlayImage) return;
    
    console.log('ImageOverlay effect triggered:', {
      base: baseImage.name,
      overlay: overlayImage.name
    });
    
    // Only generate if not already generating
    if (!isGenerating) {
      // Add small delay to ensure component is mounted
      const timer = setTimeout(() => {
        generateOverlay();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [baseImage?.url, overlayImage?.url]); // Use URLs as dependencies

  const downloadImage = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `luccas-booth-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  // Adjust canvas size for mobile
  const isMobile = window.innerWidth <= 768;
  const canvasWidth = isMobile ? 800 : 1200;
  const canvasHeight = isMobile ? 480 : 720;

  return (
    <div className="image-overlay">
      <div className="canvas-container">
        <canvas 
          ref={canvasRef} 
          width={canvasWidth} 
          height={canvasHeight}
          className="overlay-canvas"
          onClick={async () => {
            if (!isGenerating && onRefresh) {
              console.log('Canvas clicked, triggering flash and refresh');
              // Trigger flash animation
              setIsFlashing(true);
              
              // Wait a moment for flash to be visible
              await new Promise(resolve => setTimeout(resolve, 50));
              
              // Call refresh
              onRefresh();
              
              // Remove flash after animation completes
              setTimeout(() => setIsFlashing(false), 300);
            }
          }}
          style={{ cursor: isGenerating ? 'wait' : 'pointer' }}
        />
        {/* Flash overlay */}
        <div 
          ref={flashRef}
          className={`flash-overlay ${isFlashing ? 'active' : ''}`}
        />
      </div>
      
      {showControls && (
        <div className="controls">
          <button 
            onClick={generateOverlay}
            disabled={!baseImage || !overlayImage || isGenerating}
            className="generate-btn"
          >
            {isGenerating ? 'Generating...' : 'Generate New'}
          </button>
          
          <button 
            onClick={downloadImage}
            disabled={isGenerating}
            className="download-btn"
          >
            Download
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageOverlay;