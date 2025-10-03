import { supabase } from './supabase';

// API base URL - defaults to same origin /v1 for production on aikizi.xyz
// Can be overridden with VITE_API_BASE_URL for local dev or testing
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/v1';

export interface ApiError {
  ok: false;
  error: string;
}

export interface ApiSuccess<T = any> {
  ok: true;
  [key: string]: any;
}

export type ApiResponse<T = any> = ApiSuccess<T> | ApiError;

/**
 * Make an authenticated API call to the Worker
 */
export async function apiCall<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add Authorization header if session exists
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const url = `${API_BASE}${endpoint}`;
    console.log('[API]', options.method || 'GET', url);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      console.warn('[API] Error response:', { status: response.status, error: data.error });
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
