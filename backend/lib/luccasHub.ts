const DEFAULT_BASE_URL = 'https://luccas-asset-hub-api.julienh15.workers.dev/api/v1';

export interface LuccasHubCollection {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  app_scope: string;
  [key: string]: unknown;
}

export interface LuccasHubFile {
  id: string;
  filename?: string;
  name?: string;
  mime_type?: string | null;
  size?: number;
  url: string;
  thumb_url?: string | null;
  width?: number | null;
  height?: number | null;
  tags?: string[];
  [key: string]: unknown;
}

export interface ListFilesOptions {
  limit?: number;
  cursor?: string;
}

export interface SearchFilesOptions extends ListFilesOptions {
  tag?: string;
  search?: string;
}

export interface CollectionsResponse {
  collections: LuccasHubCollection[];
}

export interface CollectionFilesResponse {
  collection: LuccasHubCollection;
  files: LuccasHubFile[];
  next_cursor: string | null;
}

export interface FilesResponse {
  files: LuccasHubFile[];
  next_cursor: string | null;
}

export interface FileResponse {
  file: LuccasHubFile;
}

interface HubErrorBody {
  error?: string;
  required?: string;
}

export interface LuccasHubClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class LuccasHubError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly required: string | null;

  constructor(message: string, status: number, body: HubErrorBody = {}) {
    super(message);
    this.name = 'LuccasHubError';
    this.status = status;
    this.code = body.error ?? null;
    this.required = body.required ?? null;
  }
}

function appendQuery(url: URL, options: Record<string, string | number | undefined>): void {
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
}

function errorMessage(status: number, body: HubErrorBody): string {
  const code = body.error ? ` (${body.error})` : '';

  if (status === 401) {
    return `Luccas Asset Hub authentication failed${code}. Check or rotate the server-side LUCCAS_HUB_TOKEN.`;
  }

  if (status === 403) {
    return `Luccas Asset Hub rejected this token or collection scope${code}.`;
  }

  if (status === 404) {
    return `Luccas Asset Hub resource was not found${code}.`;
  }

  return `Luccas Asset Hub request failed with status ${status}${code}.`;
}

export class LuccasHubClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ token, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch }: LuccasHubClientOptions) {
    if (!token?.trim()) {
      throw new Error('LUCCAS_HUB_TOKEN is not configured on the server.');
    }

    this.token = token;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  private async request<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    appendQuery(url, query);

    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
    });

    const text = await response.text();
    let body: unknown = {};

    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new LuccasHubError(
          `Luccas Asset Hub returned invalid JSON with status ${response.status}.`,
          response.status,
        );
      }
    }

    if (!response.ok) {
      const errorBody = body && typeof body === 'object' ? body as HubErrorBody : {};
      throw new LuccasHubError(errorMessage(response.status, errorBody), response.status, errorBody);
    }

    return body as T;
  }

  listCollections(): Promise<CollectionsResponse> {
    return this.request('/collections');
  }

  listFilesByCollection(slug: string, { limit, cursor }: ListFilesOptions = {}): Promise<CollectionFilesResponse> {
    return this.request(`/collections/${encodeURIComponent(slug)}/files`, { limit, cursor });
  }

  searchFiles({ tag, search, limit, cursor }: SearchFilesOptions = {}): Promise<FilesResponse> {
    return this.request('/files', { tag, search, limit, cursor });
  }

  getFile(id: string): Promise<FileResponse> {
    return this.request(`/files/${encodeURIComponent(id)}`);
  }
}

export function createLuccasHubClient(options: LuccasHubClientOptions): LuccasHubClient {
  return new LuccasHubClient(options);
}
