// Utility to preload images with mobile-optimized settings
export const preloadImage = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    // Set crossOrigin for CORS compliance
    img.crossOrigin = 'anonymous';
    
    // Mobile-friendly event handlers
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to preload: ${url}`));
    
    // Start loading
    img.src = url;
  });
};

// Preload multiple images in parallel
export const preloadImages = async (urls) => {
  try {
    const promises = urls.map(url => preloadImage(url));
    return await Promise.all(promises);
  } catch (error) {
    console.error('Image preload failed:', error);
    throw error;
  }
};

// Check if we're on a mobile device
export const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (window.innerWidth <= 768);
};

// Get optimized canvas size based on device
export const getOptimalCanvasSize = () => {
  const isMobile = isMobileDevice();
  const pixelRatio = window.devicePixelRatio || 1;
  
  if (isMobile) {
    // Smaller canvas for mobile to prevent memory issues
    return {
      width: Math.min(800, window.innerWidth * pixelRatio),
      height: Math.min(480, window.innerHeight * 0.6 * pixelRatio),
      scale: 1 / pixelRatio
    };
  }
  
  return {
    width: 1200,
    height: 720,
    scale: 1
  };
};