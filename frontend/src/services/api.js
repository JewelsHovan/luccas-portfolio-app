const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

class ApiService {
  async request(path, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data.details
          ? `${data.error || 'API request failed'}: ${data.details}`
          : data.error || `API request failed with status ${response.status}`;
        throw new Error(message);
      }

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please check your connection');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async fetchAllImages() {
    try {
      return await this.request('/api/images');
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  async generateOverlay() {
    try {
      return await this.request('/api/generateOverlay');
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  async fetchCollectionImages(slug) {
    try {
      const data = await this.request(`/api/${encodeURIComponent(slug)}`);
      return data.images || [];
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      return await this.request('/api/health');
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }
}

export default new ApiService();
