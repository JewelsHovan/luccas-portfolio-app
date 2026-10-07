const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:5001';

export class ApiService {
  async request(path, timeout = 15000, { signal, cache } = {}) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
    const timeoutId = setTimeout(cancel, timeout);

    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        signal: controller.signal,
        cache,
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
      if (error.name === 'AbortError' && !signal?.aborted) {
        throw new Error('Request timeout - please check your connection');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', cancel);
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

  async fetchCollectionImages(slug, { signal } = {}) {
    try {
      const data = await this.request(`/api/${encodeURIComponent(slug)}`, 15000, { signal, cache: 'no-store' });
      return data.images || [];
    } catch (error) {
      if (error.name !== 'AbortError') console.error('API Error:', error);
      throw error;
    }
  }

  async fetchLibraryBooks({ signal, refresh = false } = {}) {
    const books = new Map();
    const seenCursors = new Set();
    let cursor;
    do {
      const query = new URLSearchParams();
      if (cursor) query.set('cursor', cursor);
      if (refresh) query.set('refresh', 'true');
      const data = await this.request(`/api/library${query.toString() ? `?${query}` : ''}`, 15000, { signal, cache: 'no-store' });
      if (!Array.isArray(data.books)) throw new Error('The Library response could not be read.');
      for (const book of data.books) books.set(book.id, book);
      cursor = data.next_cursor;
      if (cursor) {
        if (typeof cursor !== 'string' || seenCursors.has(cursor)) {
          throw new Error('The Library returned a repeated or invalid page. Please reload.');
        }
        seenCursors.add(cursor);
      }
    } while (cursor);
    return [...books.values()];
  }

  async fetchLibraryBook(id, { signal, refresh = false } = {}) {
    const data = await this.request(`/api/library/${encodeURIComponent(id)}${refresh ? '?refresh=true' : ''}`, 15000, { signal, cache: 'no-store' });
    if (data.book?.id !== id || !Array.isArray(data.pages) || data.pages.length === 0) {
      throw new Error('This book has no readable pages.');
    }
    return data;
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
