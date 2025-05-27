const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

class ApiService {
  async fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please check your connection');
      }
      throw error;
    }
  }

  async fetchAllImages() {
    try {
      const response = await this.fetchWithTimeout(`${API_BASE_URL}/api/images`);
      if (!response.ok) {
        throw new Error('Failed to fetch images');
      }
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  async generateOverlay() {
    try {
      const response = await this.fetchWithTimeout(`${API_BASE_URL}/api/generateOverlay`);
      if (!response.ok) {
        throw new Error('Failed to generate overlay');
      }
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const response = await this.fetchWithTimeout(`${API_BASE_URL}/api/health`);
      return await response.json();
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }
}

export default new ApiService();