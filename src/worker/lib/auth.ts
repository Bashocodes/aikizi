import { createClient } from '@supabase/supabase-js';
import type { Env } from '../types';

export interface AuthResult {
  user: {
    id: string;
    email?: string;
    [key: string]: any;
  };
  token: string;
}

/**
 * Extract and verify JWT from request headers
 * Supports Authorization header, x-supabase-auth header, and cookies
 */
export async function requireUser(env: Env, req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const xSupabaseAuth = req.headers.get('x-supabase-auth');
  const cookieHeader = req.headers.get('cookie');

  let token: string | null = null;

  const hasAuthHeader = !!authHeader;
  const hasXSupabaseAuth = !!xSupabaseAuth;
  const hasCookie = !!cookieHeader;

  console.log('[FN auth] Sources present:', { hasAuthHeader, hasXSupabaseAuth, hasCookie });

  if (authHeader) {
    token = authHeader.replace(/^Bearer\s+/i, '').trim();
  } else if (xSupabaseAuth) {
    token = xSupabaseAuth.trim();
  } else if (cookieHeader) {
    const match = cookieHeader.match(/sb-access-token=([^;]+)/);
    if (match) {
      token = match[1];
    }
  }

  if (!token) {
    console.log('[FN auth] No token found in any source');
    throw new Response(JSON.stringify({ error: 'auth required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  console.log('[FN auth] Token length:', token.length);

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.error('[FN auth] Missing Supabase credentials');
    throw new Response(JSON.stringify({ error: 'server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  const { data, error } = await supabase.auth.getUser(token);

  if (error) {
    console.log('[FN auth] Token verification failed:', error.message);
    throw new Response(JSON.stringify({ error: 'auth required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!data.user) {
    console.log('[FN auth] No user found for token');
    throw new Response(JSON.stringify({ error: 'auth required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  console.log('[FN auth] User authenticated:', data.user.id);

  return {
    user: data.user,
    token
  };
}
