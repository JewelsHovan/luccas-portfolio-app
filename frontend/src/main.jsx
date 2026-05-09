import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Add preload link for API endpoint to speed up initial load
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const preloadLink = document.createElement('link');
preloadLink.rel = 'preload';
preloadLink.href = `${API_BASE_URL}/api/images`;
preloadLink.as = 'fetch';
preloadLink.crossOrigin = 'anonymous';
document.head.appendChild(preloadLink);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
