import type { Env } from './types';
import { json } from './lib/json';
import { handleOptions, withCors } from './lib/cors';
import { ensureAccount, balance } from './routes/account';
import { spend } from './routes/wallet';
import { decode } from './routes/decode';
import { publish } from './routes/publish';
import { srefUpload, srefUnlock } from './routes/sref';
import { search } from './routes/search';
import { createPost } from './routes/posts';

function generateReqId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function finalizeResponse(env: Env, req: Request, res: Response, reqId: string): Response {
  const withCorsResponse = withCors(env, req, res);
  const headers = new Headers(withCorsResponse.headers);
  headers.set('x-req-id', reqId);
  return new Response(withCorsResponse.body, { status: withCorsResponse.status, headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const reqId = generateReqId();
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
    const hasAuthHeader =
      req.headers.has('authorization') || req.headers.has('Authorization');

    console.log(`[${reqId}] ${method} ${url.pathname} hasAuth=${hasAuthHeader}`);

    if (method === 'OPTIONS') {
      console.log(`[${reqId}] OPTIONS preflight ${url.pathname}`);
      const preflight = handleOptions(env, req);
      const headers = new Headers(preflight.headers);
      headers.set('x-req-id', reqId);
      return new Response(preflight.body, { status: preflight.status, headers });
    }

    try {
      let response: Response;

      if (cleanPath === '/v1/health' && method === 'GET') {
        response = json({ ok: true });
      } else if (cleanPath === '/v1/ensure-account' && method === 'POST') {
        response = await ensureAccount(env, req);
      } else if (cleanPath === '/v1/balance' && method === 'GET') {
        response = await balance(env, req, reqId);
      } else if (cleanPath === '/v1/spend' && method === 'POST') {
        response = await spend(env, req);
      } else if (cleanPath.startsWith('/v1/decode/') && method === 'POST') {
        const modelParam = cleanPath.replace('/v1/decode/', '');
        response = await decode(env, req, modelParam, reqId);
      } else if (cleanPath === '/v1/posts/create' && method === 'POST') {
        response = await createPost(env, req, reqId);
      } else if (cleanPath === '/v1/balance' && method === 'POST') {
        response = json({ ok: false, error: 'method_not_allowed' }, 405);
      } else if (cleanPath === '/v1/publish' && method === 'POST') {
        response = await publish(env, req);
      } else if (cleanPath === '/v1/sref/upload' && method === 'POST') {
        response = await srefUpload(env, req);
      } else if (cleanPath === '/v1/sref/unlock' && method === 'POST') {
        response = await srefUnlock(env, req);
      } else if (cleanPath === '/v1/search' && method === 'GET') {
        response = await search(env, req);
      } else if (cleanPath === '/v1/debug/auth' && method === 'GET') {
        response = await debugAuth(env, req, reqId);
      } else if (cleanPath === '/v1/debug/decode' && method === 'GET') {
        response = await debugDecode(env, req, reqId);
      } else {
        response = json({ ok: false, error: 'not_found', path: url.pathname, method }, 404);
      }

      const finalResponse = finalizeResponse(env, req, response, reqId);
      console.log(`[${reqId}] Response: ${finalResponse.status}`);
      return finalResponse;
    } catch (e:any) {
      console.error(`[${reqId}] Unhandled error:`, e);
      const errorResponse = json({ ok:false, error: e?.message||'server error' }, 500);
      return finalizeResponse(env, req, errorResponse, reqId);
    }
  }
}

async function debugAuth(env: Env, req: Request, reqId: string): Promise<Response> {
  const { requireUser, requireAdmin } = await import('./lib/auth');

  let authResult;
  try {
    authResult = await requireUser(env, req, reqId);
  } catch (e: any) {
    if (e instanceof Response) {
      return e;
    }
    return json({ error: 'auth failed' }, 401);
  }

  try {
    await requireAdmin(env, authResult.user.id, reqId);
  } catch (e: any) {
    if (e instanceof Response) {
      return e;
    }
    return json({ error: 'forbidden' }, 403);
  }

  const h = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const hasAuthHeader = !!h;

  let iss = null;
  if (h) {
    try {
      const token = h.replace(/^Bearer\s+/i, '');
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        iss = payload.iss || null;
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  const origin = req.headers.get('origin') || '';
  const allowedOrigins = (env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const originAllowed =
    allowedOrigins.length === 0 ||
    allowedOrigins.includes('*') ||
    (origin ? allowedOrigins.includes(origin) : false);

  return json({
    ok: true,
    hasAuthHeader,
    userId: authResult.user.id,
    iss,
    originAllowed
  });
}

async function debugDecode(env: Env, req: Request, reqId: string): Promise<Response> {
  const { requireUser, requireAdmin } = await import('./lib/auth');

  let authResult;
  try {
    authResult = await requireUser(env, req, reqId);
  } catch (e: any) {
    if (e instanceof Response) {
      return e;
    }
    return json({ error: 'auth required' }, 401);
  }

  try {
    await requireAdmin(env, authResult.user.id, reqId);
  } catch (e: any) {
    if (e instanceof Response) {
      return e;
    }
    return json({ error: 'admin access required' }, 403);
  }

  const provider = env.AI_PROVIDER || 'gemini';
  const build = new Date().toISOString().slice(0, 10);

  return json({
    ok: true,
    mode: 'sync',
    provider,
    build
  });
}
