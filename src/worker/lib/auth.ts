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
 * Extract and verify JWT from request headers
 * Case-insensitive header lookup, project mismatch detection
 */
export async function requireUser(env: Env, req: Request, reqId?: string): Promise<AuthResult> {
  const logPrefix = reqId ? `[${reqId}] [auth]` : '[auth]';

  const h = req.headers.get('authorization') || req.headers.get('Authorization') || '';

  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) {
    console.log(`${logPrefix} authOutcome=NO_AUTH_HEADER`);
    throw new Response(JSON.stringify({ error: 'auth required', code: 'NO_AUTH_HEADER' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = m[1];
  console.log(`${logPrefix} tokenLen=${token.length}`);

  let payload: JWTPayload;
  try {
    const base64Payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    payload = JSON.parse(atob(base64Payload));
  } catch (e) {
    console.log(`${logPrefix} authOutcome=INVALID_TOKEN (decode failed)`);
    throw new Response(JSON.stringify({ error: 'auth required', code: 'INVALID_TOKEN' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    console.error(`${logPrefix} Missing Supabase credentials`);
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
      console.log(`${logPrefix} authOutcome=PROJECT_MISMATCH issHost=${issHost} envHost=${envHost}`);
      throw new Response(JSON.stringify({
        error: 'project mismatch',
        code: 'PROJECT_MISMATCH',
        details: `Token issued by ${issHost}, expected ${envHost}`
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (e) {
    if (e instanceof Response) throw e;
    console.warn(`${logPrefix} Failed to parse issuer URLs:`, e);
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
    console.log(`${logPrefix} authOutcome=INVALID_TOKEN (verification failed) ${error.message}`);
    throw new Response(JSON.stringify({ error: 'auth required', code: 'INVALID_TOKEN' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!data.user) {
    console.log(`${logPrefix} authOutcome=INVALID_TOKEN (no user)`);
    throw new Response(JSON.stringify({ error: 'auth required', code: 'INVALID_TOKEN' }), {
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
 * Admin guard middleware - checks if user is in allowlist or has admin role
 */
export async function requireAdmin(env: Env, userId: string, reqId?: string): Promise<void> {
  const logPrefix = reqId ? `[${reqId}] [admin]` : '[admin]';

  const allowlistStr = env.ADMIN_USER_IDS || '';
  const allowlist = new Set(
    allowlistStr
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0)
  );

  if (allowlist.has(userId)) {
    console.log(`${logPrefix} Admin allowlist match for ${userId}`);
    return;
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  });

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('auth_id', userId)
    .single();

  if (error || !data) {
    console.log(`${logPrefix} User not found in DB: ${userId}`);
    throw new Response(JSON.stringify({ error: 'admin access required', code: 'FORBIDDEN' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (data.role === 'admin') {
    console.log(`${logPrefix} Admin role verified for ${userId}`);
    return;
  }

  console.log(`${logPrefix} Access denied for ${userId} (role: ${data.role})`);
  throw new Response(JSON.stringify({ error: 'admin access required', code: 'FORBIDDEN' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
}
