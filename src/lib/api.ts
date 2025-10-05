import { supabase } from './supabase';

export const __dbg = (...args: any[]) => console.log('[AIKIZI]', ...args);

// API base URL - always use https://aikizi.xyz/v1 for production
const API_BASE = 'https://aikizi.xyz/v1';

export interface ApiError {
  ok: false;
  error: string;
}

export interface ApiSuccess {
  ok: true;
  [key: string]: any;
}

export type ApiResponse<T = any> = ApiSuccess | ApiError;

let authReadyResolver: (() => void) | null = null;
let authReadyPromise = new Promise<void>((resolve) => {
  authReadyResolver = resolve;
});

export function setAuthReady() {
  if (authReadyResolver) {
    authReadyResolver();
    authReadyResolver = null;
  }
}

async function waitForAuth(): Promise<void> {
  return authReadyPromise;
}

/**
 * Make an authenticated API call to the Worker
 */
export async function apiCall<T = any>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false
): Promise<ApiResponse<T>> {
  try {
    await waitForAuth();

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      console.warn('[API] No access token available for request:', endpoint);
      return { ok: false, error: 'Not authenticated' };
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${session.access_token}`,
      ...(options.headers as Record<string, string>),
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const url = `${API_BASE}${endpoint}`;
    const timeout = endpoint === '/decode' ? 60000 : 15000;

    console.log('[API]', options.method || 'GET', url, { hasToken: true, timeout });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'omit',
        signal: options.signal || controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.warn('[API] Request timeout:', endpoint);
        return { ok: false, error: 'Request timed out. Please try again.' };
      }
      throw fetchError;
    }

    const data = await response.json();

    if (!response.ok) {
      console.warn('[API] Error response:', { status: response.status, error: data.error, code: data.code });

      if (response.status === 401 && !isRetry) {
        console.log('[API] 401 detected, attempting token refresh and retry...');

        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshData.session) {
          console.error('[API] Token refresh failed:', refreshError);
          return { ok: false, error: 'Authorization failed. Please sign out and back in.' };
        }

        console.log('[API] Token refreshed successfully, retrying request...');
        return apiCall<T>(endpoint, options, true);
      }

      if (response.status === 401) {
        return { ok: false, error: 'Authorization failed. Please sign out and back in.' };
      }

      if (response.status === 504) {
        return { ok: false, error: 'The model took too long. Please try again.' };
      }

      return { ok: false, error: data.error || `Request failed with status ${response.status}`, code: data.code };
    }

    console.log('[API] Success:', data);
    return data;
  } catch (error: any) {
    console.error('[API] Unexpected error:', error);
    if (error.name === 'AbortError') {
      return { ok: false, error: 'Request was canceled.' };
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T = any>(endpoint: string, options?: RequestInit) =>
    apiCall<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, body?: any, options?: RequestInit) => {
    const { headers, ...restOptions } = options || {};
    return apiCall<T>(endpoint, {
      ...restOptions,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...(headers as Record<string, string> || {}),
      },
    });
  },

  put: <T = any>(endpoint: string, body?: any, options?: RequestInit) =>
    apiCall<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = any>(endpoint: string, options?: RequestInit) =>
    apiCall<T>(endpoint, { ...options, method: 'DELETE' }),
};

/**
 * Debug logging helper for upload flow
 * Only logs when debugging upload issues
 */
export function logUploadDebug(...args: any[]) {
  if (typeof window !== 'undefined') {
    console.log('[UploadDebug]', ...args);
  }
}

/**
 * Fetch wrapper with debug logging for Cloudflare Images direct upload
 * Logs timing, status, and errors without modifying the request
 */
export async function uploadWithDebug(req: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const t0 = performance.now();
  const url = String(req);
  const method = init?.method || 'POST';

  logUploadDebug('fetch.start', {
    url,
    method,
    hasBody: !!init?.body,
    bodyType: init?.body?.constructor?.name || 'unknown'
  });

  try {
    const res = await fetch(req, init);
    const t1 = performance.now();

    logUploadDebug('fetch.end', {
      status: res.status,
      ok: res.ok,
      statusText: res.statusText,
      dur_ms: Math.round(t1 - t0)
    });

    return res;
  } catch (e: any) {
    const t1 = performance.now();

    logUploadDebug('fetch.error', {
      dur_ms: Math.round(t1 - t0),
      message: e?.message,
      name: e?.name,
      stack: e?.stack
    });

    throw e;
  }
}

export type DirectUploadResponse = {
  uploadURL: string;
  mediaAssetId: string;
  cfImageId: string;
};

export async function requestDirectUpload(): Promise<DirectUploadResponse> {
  const res = await fetch('/v1/images/direct-upload', { method: 'POST', credentials: 'include' });
  __dbg('direct-upload.status', res.status, res.statusText);

  const j = await res.json().catch((e) => {
    __dbg('direct-upload.json.error', String(e));
    return null;
  });
  __dbg('direct-upload.payload', j);

  const { uploadURL, mediaAssetId, cfImageId } = j || {};
  if (!uploadURL || !mediaAssetId || !cfImageId) {
    throw new Error('Invalid upload URL response');
  }
  // Expose for quick manual curl testing
  (window as any).__aikizi = { uploadURL, mediaAssetId, cfImageId };
  return { uploadURL, mediaAssetId, cfImageId };
}

/**
 * Upload file to Cloudflare Images using a multipart/form-data POST request
 */
export async function uploadToCloudflare(
  uploadURL: string,
  file: Blob,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string; via?: 'xhr' | 'fetch' }> {
  __dbg('upload.begin', { host: new URL(uploadURL).host, type: file.type, size: file.size });

  // 1) Primary path: XHR + FormData
  const viaXhr = await new Promise<{ success: boolean; error?: string }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = 60000;

    xhr.onloadstart = () => __dbg('xhr.onloadstart');
    xhr.onreadystatechange = () => __dbg('xhr.onreadystatechange', { rs: xhr.readyState, st: xhr.status });
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => { __dbg('xhr.onerror'); resolve({ success: false, error: 'Network error during upload (xhr)' }); };
    xhr.onabort = () => { __dbg('xhr.onabort'); resolve({ success: false, error: 'Upload cancelled (xhr)' }); };
    xhr.ontimeout = () => { __dbg('xhr.ontimeout'); resolve({ success: false, error: 'Upload timeout (xhr)' }); };
    xhr.onload = () => {
      __dbg('xhr.onload', { status: xhr.status, len: xhr.responseText?.length ?? 0 });
      if (xhr.status === 200) return resolve({ success: true });
      resolve({ success: false, error: `Upload failed (xhr): ${xhr.status} ${xhr.statusText}` });
    };

    if (signal) signal.addEventListener('abort', () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append('file', file, (file as any).name || 'upload');

    try {
      xhr.open('POST', uploadURL);
      xhr.send(form);
    } catch (e: any) {
      __dbg('xhr.open/send.exception', String(e));
      resolve({ success: false, error: 'XHR open/send threw before request' });
    }
  });

  if (viaXhr.success) return { success: true, via: 'xhr' };
  __dbg('upload.xhr.failed', viaXhr.error);

  // 2) Fallback: fetch + FormData (no progress, just to force visibility in Network)
  try {
    const form = new FormData();
    form.append('file', file, (file as any).name || 'upload');

    const res = await fetch(uploadURL, { method: 'POST', body: form, redirect: 'follow' as RequestRedirect });
    __dbg('fetch.result', { ok: res.ok, status: res.status, statusText: res.statusText });
    if (!res.ok) return { success: false, error: `Upload failed (fetch): ${res.status} ${res.statusText}`, via: 'fetch' };
    return { success: true, via: 'fetch' };
  } catch (e: any) {
    __dbg('fetch.exception', String(e));
    return { success: false, error: 'Network error during upload (fetch)', via: 'fetch' };
  }
}

export async function completeUpload(
  uploadURL: string,
  file: Blob,
  mediaAssetId: string,
  cfImageId: string,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  const up = await uploadToCloudflare(uploadURL, file, onProgress, signal);
  if (!up.success) return { success: false, error: up.error || 'Upload failed' };

  // Verify + persist authoritative metadata
  const res = await api.post('/images/ingest-complete', { mediaAssetId, cfImageId });
  if (!res.ok && !res.success) return { success: false, error: res.error || 'Ingest complete failed' };

  return { success: true };
}

export async function markIngestComplete(
  mediaAssetId: string,
  cfImageId: string
): Promise<any> {
  const response = await api.post<{ success: boolean; message?: string }>(
    '/images/ingest-complete',
    { mediaAssetId, cfImageId }
  );

  if ('ok' in response && response.ok === false) {
    throw new Error(response.error || 'Failed to verify upload');
  }

  console.log('[upload] CF upload verified successful', { mediaAssetId, cfImageId });
  return response;
}
