import { supabase } from './supabase';

// API base URL - defaults to same origin /v1 for production on aikizi.xyz
// Can be overridden with VITE_API_BASE_URL for local dev or testing
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/v1';

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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    } else {
      console.warn('[API] No access token available for request:', endpoint);
    }

    const url = `${API_BASE}${endpoint}`;
    console.log('[API]', options.method || 'GET', url, { hasToken: !!session?.access_token });

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      console.warn('[API] Error response:', { status: response.status, error: data.error });

      if (response.status === 401 && !isRetry) {
        console.log('[API] 401 detected, attempting token refresh and retry...');

        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshData.session) {
          console.error('[API] Token refresh failed:', refreshError);
          return { ok: false, error: 'Session expired. Please sign in again.' };
        }

        console.log('[API] Token refreshed successfully, retrying request...');
        return apiCall<T>(endpoint, options, true);
      }

      return { ok: false, error: data.error || `Request failed with status ${response.status}` };
    }

    console.log('[API] Success:', data);
    return data;
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T = any>(endpoint: string, options?: RequestInit) =>
    apiCall<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = any>(endpoint: string, body?: any, options?: RequestInit) =>
    apiCall<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(endpoint: string, body?: any, options?: RequestInit) =>
    apiCall<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = any>(endpoint: string, options?: RequestInit) =>
    apiCall<T>(endpoint, { ...options, method: 'DELETE' }),
};
