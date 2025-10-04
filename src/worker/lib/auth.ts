import { createClient } from '@supabase/supabase-js';
import type { Env } from '../types';
import { json } from './json';

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
 * 🔐 Extract and verify JWT from request headers
 * Used by /v1/balance, /v1/decode, /v1/images, etc.
 */
export async function requireUser(env: Env, req: Request, reqId?: string): Promise<AuthResult> {
  const logPrefix = reqId ? `[${reqId}] [auth]` : '[auth]';
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || '';

  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) {
    console.log(`${logPrefix} authOutcome=NO_AUTH_HEADER`);
    throw new Response(JSON.stringify({ error: 'NO_AUTH_HEADER' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = m[1];
  console.log(`${logPrefix} tokenLen=${token.length}`);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    console.error(`${logPrefix} Missing Supabase credentials`);
    throw new Response(JSON.stringify({ error: 'server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    console.log(`${logPrefix} authOutcome=INVALID_TOKEN ${error?.message || 'no user'}`);
    throw new Response(JSON.stringify({ error: 'INVALID_TOKEN' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  console.log(`${logPrefix} authOutcome=OK userId=${data.user.id}`);

  return {
    user: data.user,
    token
  };
}

/**
 * 🛡️ Admin guard middleware - checks if user is in allowlist or has admin role
 */
export async function requireAdmin(env: Env, userId: string, reqId?: string): Promise<void> {
  const logPrefix = reqId ? `[${reqId}] [admin]` : '[admin]';

  const set = new Set(
    (env.ADMIN_USER_IDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );

  if (set.has(userId)) {
    console.log(`${logPrefix} Admin allowlist match`);
    return;
  }

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  const { data } = await db.from('users').select('role').eq('auth_id', userId).single();

  if (data?.role === 'admin') {
    console.log(`${logPrefix} Admin role verified`);
    return;
  }

  console.log(`${logPrefix} Access denied (role: ${data?.role || 'none'})`);
  throw new Response(JSON.stringify({ error: 'FORBIDDEN' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * 🔑 Create an authenticated Supabase client with the user's JWT
 * This ensures RLS policies evaluate against the authenticated user (auth.uid())
 */
export function getAuthedClient(env: Env, token: string) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

/**
 * 🪪 Compatibility alias for old imports
 * Allows both `requireUser` and `verifyUser` names.
 */
export const verifyUser = requireUser;
