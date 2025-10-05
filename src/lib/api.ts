import { supabase } from './supabase';

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

/**
 * Request a direct upload URL from Cloudflare Images
 */
export async function requestDirectUpload(): Promise<{ uploadURL: string; mediaAssetId: string; cfImageId: string }> {
  console.log('[upload] requestDirectUpload start');
  const t0 = performance.now();

  const response = await api.post<{ uploadURL: string; mediaAssetId: string; cfImageId: string }>(
    '/images/direct-upload',
    {}
  );

  const t1 = performance.now();

  if (!response.ok) {
    console.error('[upload] requestDirectUpload failed', { error: response.error });
    throw new Error(response.error || 'Failed to request upload URL');
  }

  console.log('[upload] requestDirectUpload end', {
    dur_ms: Math.round(t1 - t0),
    hasUploadURL: !!response.uploadURL,
    hasMediaAssetId: !!response.mediaAssetId,
    hasCfImageId: !!response.cfImageId
  });

  return {
    uploadURL: response.uploadURL,
    mediaAssetId: response.mediaAssetId,
    cfImageId: response.cfImageId
  };
}

// Update in src/lib/api.ts - Replace the uploadToCloudflare function

/**
 * Upload file to Cloudflare Images with verification
 * Uses XMLHttpRequest for progress tracking
 */
export async function uploadToCloudflare(
  uploadURL: string,
  file: Blob,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; response?: Response; error?: string }> {
  console.log('[upload] Starting CF upload', {
    url: uploadURL,
    fileSize: file.size,
    fileType: file.type
  });
  
  const t0 = performance.now();

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    // Setup abort handling
    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        resolve({ 
          success: false, 
          error: 'Upload cancelled by user' 
        });
      });
    }

    // Progress tracking
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.round((e.loaded / e.total) * 100);
        console.log(`[upload] Progress: ${pct}%`);
        onProgress(pct);
      }
    });

    // Success handler
    xhr.addEventListener('load', () => {
      const t1 = performance.now();
      const duration = Math.round(t1 - t0);
      
      console.log('[upload] XHR completed', {
        status: xhr.status,
        duration_ms: duration,
        responseLength: xhr.responseText?.length
      });

      // Cloudflare returns 200 for successful uploads
      if (xhr.status === 200) {
        try {
          // Try to parse response to verify it's valid
          const responseData = JSON.parse(xhr.responseText);
          
          if (responseData.success === false) {
            console.error('[upload] CF returned error', responseData);
            resolve({
              success: false,
              error: responseData.errors?.[0]?.message || 'Cloudflare upload failed'
            });
            return;
          }
          
          console.log('[upload] CF upload verified successful');
          const response = new Response(xhr.responseText, {
            status: xhr.status,
            statusText: xhr.statusText
          });
          
          resolve({ success: true, response });
        } catch (parseError) {
          console.error('[upload] Failed to parse CF response', parseError);
          // If we can't parse but got 200, assume success
          const response = new Response(xhr.responseText, {
            status: xhr.status,
            statusText: xhr.statusText
          });
          resolve({ success: true, response });
        }
      } else {
        console.error('[upload] CF upload failed with status', xhr.status);
        resolve({
          success: false,
          error: `Upload failed with status ${xhr.status}: ${xhr.statusText}`
        });
      }
    });

    // Network error handler
    xhr.addEventListener('error', () => {
      const t1 = performance.now();
      const duration = Math.round(t1 - t0);
      
      console.error('[upload] Network error', { duration_ms: duration });
      resolve({
        success: false,
        error: 'Network error during upload - check your connection'
      });
    });

    // Abort handler
    xhr.addEventListener('abort', () => {
      const t1 = performance.now();
      const duration = Math.round(t1 - t0);
      
      console.log('[upload] Upload aborted', { duration_ms: duration });
      resolve({
        success: false,
        error: 'Upload cancelled'
      });
    });

    // Timeout handler (60 seconds for large files)
    xhr.addEventListener('timeout', () => {
      console.error('[upload] Upload timeout');
      resolve({
        success: false,
        error: 'Upload timeout - file may be too large'
      });
    });

    // Configure and send
    xhr.open('POST', uploadURL);
    xhr.timeout = 60000; // 60 second timeout
    
    console.log('[upload] Sending file to Cloudflare...');
    xhr.send(file);
  });
}

/**
 * Complete upload flow with verification
 */
export async function completeUpload(
  uploadURL: string,
  file: Blob,
  mediaAssetId: string,
  cfImageId: string,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string }> {
  console.log('[upload] Starting complete upload flow');
  
  // Step 1: Upload to Cloudflare
  const uploadResult = await uploadToCloudflare(uploadURL, file, onProgress, signal);
  
  if (!uploadResult.success) {
    console.error('[upload] CF upload failed:', uploadResult.error);
    
    // Mark as failed in our DB
    try {
      await api.post('/images/upload-failed', {
        mediaAssetId,
        cfImageId,
        error: uploadResult.error
      });
    } catch (e) {
      console.error('[upload] Failed to mark upload as failed in DB');
    }
    
    return {
      success: false,
      error: uploadResult.error || 'Upload to Cloudflare failed'
    };
  }
  
  console.log('[upload] CF upload successful, marking as complete...');
  
  // Step 2: Mark as complete and fetch metadata
  try {
    const completeResponse = await api.post('/images/ingest-complete', {
      mediaAssetId,
      cfImageId
    });
    
    if (!completeResponse.ok) {
      throw new Error(completeResponse.error || 'Failed to complete upload');
    }
    
    console.log('[upload] Upload completed successfully with metadata:', completeResponse.metadata);
    return { success: true };
    
  } catch (error: any) {
    console.error('[upload] Failed to mark upload complete:', error);
    return {
      success: false,
      error: 'Upload succeeded but metadata update failed'
    };
  }
}