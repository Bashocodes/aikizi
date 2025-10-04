import { supabase } from './supabase';

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

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
 * Make an authenticated API call to Supabase Edge Functions
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<any> {
  try {
    await waitForAuth();

    const { data: { session } } = await supabase.auth.getSession();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    };

    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    } else {
      console.warn('[API] No access token available for request:', path);
    }

    const url = `${API_BASE}/${path}`;
    const method = init.method || 'GET';
    console.log('[API]', method, path, { hasToken: !!session?.access_token });

    const response = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    });

    console.log('[API]', method, path, `status:${response.status}`);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.warn('[API] Error response:', { status: response.status, error: data.error });

      if (response.status === 401) {
        console.log('[API] 401 detected, attempting token refresh and retry...');

        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshData.session) {
          console.error('[API] Token refresh failed:', refreshError);
          return { ok: false, error: 'Session expired. Please sign in again.' };
        }

        console.log('[API] Token refreshed successfully, retrying request...');

        const retryHeaders = {
          ...headers,
          'Authorization': `Bearer ${refreshData.session.access_token}`,
        };

        const retryResponse = await fetch(url, {
          ...init,
          headers: retryHeaders,
          credentials: 'include',
        });

        console.log('[API]', method, path, `status:${retryResponse.status} (retry)`);
        const retryData = await retryResponse.json().catch(() => ({}));

        if (!retryResponse.ok) {
          return { ok: false, error: retryData.error || `Request failed with status ${retryResponse.status}` };
        }

        return retryData;
      }

      return { ok: false, error: data.error || `Request failed with status ${response.status}` };
    }

    return data;
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Convenience methods for common HTTP verbs
 * @deprecated Use apiFetch directly
 */
export const api = {
  get: (path: string, options?: RequestInit) =>
    apiFetch(path, { ...options, method: 'GET' }),

  post: (path: string, body?: any, options?: RequestInit) => {
    const { headers, ...restOptions } = options || {};
    return apiFetch(path, {
      ...restOptions,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...(headers as Record<string, string> || {}),
      },
    });
  },

  put: (path: string, body?: any, options?: RequestInit) =>
    apiFetch(path, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: (path: string, options?: RequestInit) =>
    apiFetch(path, { ...options, method: 'DELETE' }),
};
