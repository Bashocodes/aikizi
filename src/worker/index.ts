import type { Env } from './types';
import { json, bad } from './lib/json';
import { preflight, allowOrigin } from './lib/cors';
import { ensureAccount, balance } from './routes/account';
import { spend } from './routes/wallet';
import { directUpload, ensureVariants } from './routes/images';
import { decode } from './routes/decode';
import { publish } from './routes/publish';
import { srefUpload, srefUnlock } from './routes/sref';
import { search } from './routes/search';

function generateReqId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default {
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
        response = allowOrigin(env, req, await spend(env, req));
      } else if (pathname === '/v1/images/direct-upload' && req.method==='POST') {
        response = allowOrigin(env, req, await directUpload(env));
      } else if (pathname === '/v1/images/ensure-variants' && req.method==='POST') {
        response = allowOrigin(env, req, await ensureVariants(env, req));
      } else if (pathname === '/v1/decode' && req.method==='POST') {
        response = allowOrigin(env, req, await decode(env, req, reqId));
      } else if (pathname === '/v1/publish' && req.method==='POST') {
        response = allowOrigin(env, req, await publish(env, req));
      } else if (pathname === '/v1/sref/upload' && req.method==='POST') {
        response = allowOrigin(env, req, await srefUpload(env, req));
      } else if (pathname === '/v1/sref/unlock' && req.method==='POST') {
        response = allowOrigin(env, req, await srefUnlock(env, req));
      } else if (pathname === '/v1/search' && req.method==='GET') {
        response = allowOrigin(env, req, await search(env, req));
      } else if (pathname === '/v1/debug/auth' && req.method==='GET') {
        response = allowOrigin(env, req, await debugAuth(env, req, reqId));
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
  const tokenLen = authResult.token.length;

  return json({
    hasAuthHeader,
    tokenLen,
    userId: authResult.user.id
  });
}
