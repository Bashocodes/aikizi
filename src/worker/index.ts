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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (req.method === 'OPTIONS') return preflight(env, req);

    try {
      if (pathname === '/v1/health') return allowOrigin(env, req, json({ ok:true }));

      if (pathname === '/v1/ensure-account' && req.method==='POST') return allowOrigin(env, req, await ensureAccount(env, req));
      if (pathname === '/v1/balance' && req.method==='GET') return allowOrigin(env, req, await balance(env, req));

      if (pathname === '/v1/spend' && req.method==='POST') return allowOrigin(env, req, await spend(env, req));

      if (pathname === '/v1/images/direct-upload' && req.method==='POST') return allowOrigin(env, req, await directUpload(env));
      if (pathname === '/v1/images/ensure-variants' && req.method==='POST') return allowOrigin(env, req, await ensureVariants(env, req));

      if (pathname === '/v1/decode' && req.method==='POST') return allowOrigin(env, req, await decode(env, req));

      if (pathname === '/v1/publish' && req.method==='POST') return allowOrigin(env, req, await publish(env, req));

      if (pathname === '/v1/sref/upload' && req.method==='POST') return allowOrigin(env, req, await srefUpload(env, req));
      if (pathname === '/v1/sref/unlock' && req.method==='POST') return allowOrigin(env, req, await srefUnlock(env, req));

      if (pathname === '/v1/search' && req.method==='GET') return allowOrigin(env, req, await search(env, req));

      return allowOrigin(env, req, bad('not found', 404));
    } catch (e:any) {
      return allowOrigin(env, req, json({ ok:false, error: e?.message||'server error' }, 500));
    }
  }
}
