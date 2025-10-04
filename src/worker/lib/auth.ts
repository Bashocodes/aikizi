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

interface JWTPayload {
  iss?: string;
  sub?: string;
  [key: string]: any;
}

/**
 * Extract and verify JWT from request headers
 * Case-insensitive header lookup, project mismatch detection
 */
export async function requireUser(env: Env, req: Request): Promise<AuthResult> {
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || '';

  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) {
    console.log('[FN auth] No Bearer token found');
    throw new Response(JSON.stringify({ error: 'auth required', code: 'NO_AUTH_HEADER' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = m[1];
  console.log('[FN auth] Token length:', token.length);

  let payload: JWTPayload;
  try {
    const base64Payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    payload = JSON.parse(atob(base64Payload));
  } catch (e) {
    console.log('[FN auth] Failed to decode JWT payload');
    throw new Response(JSON.stringify({ error: 'auth required', code: 'INVALID_TOKEN' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    console.error('[FN auth] Missing Supabase credentials');
    throw new Response(JSON.stringify({ error: 'server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let issHost = 'unknown';
  let envHost = 'unknown';

  try {
    if (payload.iss) {
      issHost = new URL(payload.iss).host;
    }
    envHost = new URL(env.SUPABASE_URL).host;

    if (issHost !== envHost && issHost !== 'unknown') {
      console.log('[FN auth] Project mismatch:', { issHost, envHost });
      throw new Response(JSON.stringify({
        error: 'project mismatch',
        code: 'PROJECT_MISMATCH',
        issHost: issHost.slice(0, 15) + '...',
        envHost: envHost.slice(0, 15) + '...'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (e) {
    if (e instanceof Response) throw e;
    console.warn('[FN auth] Failed to parse issuer URLs:', e);
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.log('[FN auth] Token verification failed:', error.message);
    throw new Response(JSON.stringify({ error: 'auth required', code: 'INVALID_TOKEN' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!data.user) {
    console.log('[FN auth] No user found for token');
    throw new Response(JSON.stringify({ error: 'auth required', code: 'INVALID_TOKEN' }), {
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
