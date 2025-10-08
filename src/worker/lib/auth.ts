import { createClient } from '@supabase/supabase-js';
import type { Env } from '../types';
import { json } from './json';
import { verifyTokenSafe, AuthError } from './jwks';

export interface AuthResult {
  user: {
    id: string;
    email?: string;
    [key: string]: any;
  };
  token: string;
}

/**
 * Extract and verify JWT from request headers using JWKS
 * This replaces the legacy HS256 verification
 */
function authFailure(code: string, message: string, status: number): Response {
  return json({ code, message, status }, status);
}

export async function requireUser(env: Env, req: Request, reqId?: string): Promise<AuthResult> {
  const logPrefix = reqId ? `[${reqId}] [auth]` : '[auth]';

  const h = req.headers.get('authorization') || req.headers.get('Authorization') || '';

  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) {
    console.log(`${logPrefix} authOutcome=NO_AUTH_HEADER`);
    throw authFailure('UNAUTHORIZED', 'Authorization header is required.', 401);
  }

  const token = m[1];
  console.log(`${logPrefix} tokenLen=${token.length}`);

  try {
    const payload = await verifyTokenSafe(token, env, reqId);

    if (!payload.sub) {
      console.log(`${logPrefix} authOutcome=NO_SUB_CLAIM`);
      throw authFailure('UNAUTHORIZED', 'Token is missing the required subject claim.', 401);
    }

    console.log(`${logPrefix} authOutcome=OK userId=${payload.sub}`);

    return {
      user: {
        id: payload.sub,
        email: payload.email,
        ...payload
      },
      token
    };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    if (error instanceof AuthError) {
      const outcome = error.code === 'TOKEN_EXPIRED'
        ? 'EXPIRED'
        : error.code === 'TOKEN_NOT_YET_VALID'
          ? 'NOT_YET_VALID'
          : error.code;
      console.log(`${logPrefix} authOutcome=${outcome} code=${error.code} status=${error.statusCode}`);
      throw authFailure(error.code ?? 'UNAUTHORIZED', error.message || 'Authentication failed.', error.statusCode ?? 401);
    }

    console.log(`${logPrefix} authOutcome=UNEXPECTED_ERROR`);
    throw authFailure('UNAUTHORIZED', 'Authentication failed.', 401);
  }
}

/**
 * Admin guard middleware - checks if user is in allowlist or has admin role
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
