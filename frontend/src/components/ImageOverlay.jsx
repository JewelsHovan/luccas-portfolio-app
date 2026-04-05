import React, { useRef, useEffect, useState, useCallback } from 'react';
import './ImageOverlay.css';

const OVERLAY_SETTINGS = {
  opacity: 0.75,
  scale: 0.55,
  blendMode: 'source-over',
};

const ImageOverlay = ({ baseImage = null, overlayImage = null, showControls = true, onRefresh = null }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const flashRef = useRef(null);
  const retryCountRef = useRef(0);
  const generateOverlayRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 720 });

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

    // Clear canvas with white background 
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    try {
      // Load both images in parallel
      const [baseImg, overlayImg] = await Promise.all([
        loadImageWithRetry(baseImage, true),
        loadImageWithRetry(overlayImage, false)
      ]);

      // Resize canvas to match base image aspect ratio
      const maxWidth = window.innerWidth <= 768 ? 800 : 1200;
      const baseAspectRatio = baseImg.width / baseImg.height;
      const newWidth = maxWidth;
      const newHeight = Math.round(maxWidth / baseAspectRatio);

      canvas.width = newWidth;
      canvas.height = newHeight;
      setCanvasSize({ width: newWidth, height: newHeight });

      // Redraw white background after resize
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, newWidth, newHeight);

      // Draw base image filling the entire canvas
      ctx.drawImage(baseImg, 0, 0, newWidth, newHeight);

      // Calculate overlay dimensions
      const maxOverlaySize = Math.min(canvas.width, canvas.height) * OVERLAY_SETTINGS.scale;
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
      ctx.globalCompositeOperation = OVERLAY_SETTINGS.blendMode;
      ctx.globalAlpha = OVERLAY_SETTINGS.opacity;

      // Draw overlay image
      ctx.drawImage(overlayImg, overlayX, overlayY, overlayWidth, overlayHeight);

      // Reset context state
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      
      // Reset retry count on success
      retryCountRef.current = 0;
      
      // Trigger scale-up transition
      setIsTransitioning(true);
      setTimeout(() => setIsTransitioning(false), 600);

    } catch (error) {
      console.error('Error generating overlay:', error);
      
      // Auto-retry on failure (up to 2 times)
      if (retryCountRef.current < 2) {
        retryCountRef.current++;
        setTimeout(() => {
          console.log('Auto-retrying image generation...');
          generateOverlayRef.current();
        }, 2000);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [baseImage, overlayImage, loadImageWithRetry]);

  generateOverlayRef.current = generateOverlay;

  useEffect(() => {
    if (!baseImage || !overlayImage) return;

    const timer = setTimeout(() => {
      generateOverlayRef.current();
    }, 100);

    return () => clearTimeout(timer);
  }, [baseImage?.url, overlayImage?.url]);

  useEffect(() => {
    const handleResize = () => {
      // Re-render with new max width on resize
      if (baseImage && overlayImage) {
        generateOverlayRef.current();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [baseImage, overlayImage]);

  const downloadImage = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `luccas-booth-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="image-overlay">
      <div className="canvas-container" ref={containerRef}>
        <canvas 
          ref={canvasRef} 
          width={canvasSize.width}
          height={canvasSize.height}
          className={`overlay-canvas ${isTransitioning ? 'transitioning' : ''}`}
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
