import type { Env } from './types';
import { json, bad } from './lib/json';
import { preflight, allowOrigin } from './lib/cors';
import { ensureAccount, balance } from './routes/account';
import { spend } from './routes/wallet';
import { directUpload, ensureVariants } from './routes/images';
import { decode } from './routes/decode';
import { publish, createPost, savePost, getPublicPosts } from './routes/publish';
import { srefUpload, srefUnlock } from './routes/sref';
import { search } from './routes/search';
import { refreshTokens } from './routes/cron';

function generateReqId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('[CRON] Scheduled event triggered:', event.cron);

    const cronReq = new Request('https://internal/v1/cron/refresh-tokens', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.CRON_SECRET || ''}`
      }
    });

    ctx.waitUntil(refreshTokens(env, cronReq));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const reqId = generateReqId();
    const { pathname, searchParams } = new URL(req.url);
    const hasAuthHeader = !!req.headers.get('authorization');

    console.log(`[${reqId}] ${req.method} ${pathname} hasAuth=${hasAuthHeader}`);

    if (req.method === 'OPTIONS') {
      console.log(`[${reqId}] OPTIONS preflight`);
      return preflight(env, req);
    }

    try {
      let response: Response;

      if (pathname === '/v1/health') {
        response = allowOrigin(env, req, json({ ok:true }));
      } else if (pathname === '/v1/ensure-account' && req.method==='POST') {
        response = allowOrigin(env, req, await ensureAccount(env, req));
      } else if (pathname === '/v1/balance' && req.method==='GET') {
        response = allowOrigin(env, req, await balance(env, req, reqId));
      } else if (pathname === '/v1/spend' && req.method==='POST') {
        response = allowOrigin(env, req, await spend(env, req, reqId));
      } else if (pathname === '/v1/images/direct-upload' && req.method==='POST') {
        response = allowOrigin(env, req, await directUpload(env));
      } else if (pathname === '/v1/images/ensure-variants' && req.method==='POST') {
        response = allowOrigin(env, req, await ensureVariants(env, req));
      } else if (pathname === '/v1/decode' && req.method==='POST') {
        response = allowOrigin(env, req, await decode(env, req, reqId));
      } else if (pathname === '/v1/publish' && req.method==='POST') {
        response = allowOrigin(env, req, await publish(env, req));
      } else if (pathname === '/v1/posts/create' && req.method==='POST') {
        response = allowOrigin(env, req, await createPost(env, req, reqId));
      } else if (pathname === '/v1/posts/save' && req.method==='POST') {
        response = allowOrigin(env, req, await savePost(env, req, reqId));
      } else if (pathname === '/v1/posts/public' && req.method==='GET') {
        response = allowOrigin(env, req, await getPublicPosts(env, req));
      } else if (pathname === '/v1/sref/upload' && req.method==='POST') {
        response = allowOrigin(env, req, await srefUpload(env, req));
      } else if (pathname === '/v1/sref/unlock' && req.method==='POST') {
        response = allowOrigin(env, req, await srefUnlock(env, req));
      } else if (pathname === '/v1/search' && req.method==='GET') {
        response = allowOrigin(env, req, await search(env, req));
      } else if (pathname === '/v1/cron/refresh-tokens' && req.method==='POST') {
        response = allowOrigin(env, req, await refreshTokens(env, req));
      } else if (pathname === '/v1/debug/auth' && req.method==='GET') {
        response = allowOrigin(env, req, await debugAuth(env, req, reqId));
      } else if (pathname === '/v1/debug/decode' && req.method==='GET') {
        response = allowOrigin(env, req, await debugDecode(env, req, reqId));
      } else {
        response = allowOrigin(env, req, bad('not found', 404));
      }

      const headers = new Headers(response.headers);
      headers.set('x-req-id', reqId);
      console.log(`[${reqId}] Response: ${response.status}`);
      return new Response(response.body, { status: response.status, headers });
    } catch (e:any) {
      console.error(`[${reqId}] Unhandled error:`, e);
      const headers = new Headers();
      headers.set('x-req-id', reqId);
      const errorResponse = json({ ok:false, error: e?.message||'server error' }, 500);
      const withHeaders = new Response(errorResponse.body, { status: errorResponse.status, headers });
      return allowOrigin(env, req, withHeaders);
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
const allowedOrigins = (env.CORS_ORIGIN || "").split(",");
if (!allowedOrigins.includes(request.headers.get("Origin") || "")) {
  return new Response(JSON.stringify({ ok: false, error: "CORS not allowed" }), { status: 403 });
}
  const originAllowed = allowedOrigins.includes(origin);

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
