import React, { useRef, useEffect, useState } from 'react';
import './ImageOverlay.css';

const ImageOverlay = ({ baseImage = null, overlayImage = null, showControls = true }) => {
  const canvasRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [settings, setSettings] = useState({
    opacity: 0.75,
    scale: 0.55,
    blendMode: 'source-over',
    position: 'center'
  });

  const generateOverlay = async () => {
    if (!baseImage || !overlayImage) return;

    setIsGenerating(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Clear canvas with background color matching the design
    ctx.fillStyle = '#c4b5b5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    try {
      // Load base image
      const baseImg = new Image();
      
      await new Promise((resolve, reject) => {
        baseImg.onload = resolve;
        baseImg.onerror = () => reject(new Error('Failed to load base image'));
        baseImg.src = baseImage.url;
      });

      // Calculate how to fit base image in canvas (maintain aspect ratio)
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

      // Load overlay image
      const overlayImg = new Image();
      
      await new Promise((resolve, reject) => {
        overlayImg.onload = resolve;
        overlayImg.onerror = () => reject(new Error('Failed to load overlay image'));
        overlayImg.src = overlayImage.url;
      });

      // Calculate overlay dimensions (smaller than base)
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

      // Draw overlay image centered
      ctx.drawImage(overlayImg, overlayX, overlayY, overlayWidth, overlayHeight);

      // Reset
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;

    } catch (error) {
      console.error('Error generating overlay:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (baseImage && overlayImage) {
      generateOverlay();
    }
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
      <div className="canvas-container">
        <canvas 
          ref={canvasRef} 
          width={1200} 
          height={720}
          className="overlay-canvas"
        />
        {isGenerating && (
          <div className="loading-overlay">
            <div className="spinner"></div>
          </div>
        )}
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