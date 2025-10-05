import { supabase } from './supabase';

// API base URL - always use https://aikizi.xyz for production
const API_BASE = 'https://aikizi.xyz';

export interface ApiError {
  ok: false;
  error: string;
  code?: string;
}

export type ApiResponse<T = unknown> = ApiError | T;

let authReadyResolver: (() => void) | null = null;
const authReadyPromise = new Promise<void>((resolve) => {
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
export async function apiCall<T = unknown>(
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
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers as Record<string, string> | undefined),
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const url = `${API_BASE}${endpoint}`;
    const timeout = endpoint.startsWith('/v1/decode') ? 60000 : 15000;

    console.log('[API]', options.method || 'GET', url, { hasToken: true, timeout });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'omit',
        signal: options.signal || controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.warn('[API] Request timeout:', endpoint);
        return { ok: false, error: 'Request timed out. Please try again.' };
      }
      throw fetchError;
    }

    const data = (await response.json()) as unknown;

    if (!response.ok) {
      const errorPayload = data as { error?: string; code?: string } | undefined;
      console.warn('[API] Error response:', { status: response.status, error: errorPayload?.error, code: errorPayload?.code });

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

      return {
        ok: false,
        error: errorPayload?.error || `Request failed with status ${response.status}`,
        code: errorPayload?.code,
      };
    }

    console.log('[API] Success:', data);
    return data as T;
  } catch (error: unknown) {
    console.error('[API] Unexpected error:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: 'Request was canceled.' };
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T = unknown>(endpoint: string, options?: RequestInit) =>
    apiCall<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: RequestInit) => {
    const { headers, ...restOptions } = options || {};
    const headerRecord = headers as Record<string, string> | undefined;
    return apiCall<T>(endpoint, {
      ...restOptions,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...(headerRecord || {}),
      },
    });
  },

  put: <T = unknown>(endpoint: string, body?: unknown, options?: RequestInit) =>
    apiCall<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T = unknown>(endpoint: string, options?: RequestInit) =>
    apiCall<T>(endpoint, { ...options, method: 'DELETE' }),
};

export const decodeImage = <T = unknown>(model: string, image_base64: string, user_id: string) =>
  api.post<T>(`/v1/decode/${model}`, { image_base64, user_id, model });

export const createPost = <T = unknown>(model: string, image_base64: string, analysis: unknown) =>
  api.post<T>('/v1/posts/create', { model, image_base64, analysis });
