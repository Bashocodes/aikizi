export function withCORS(env: any, res: Response) {
  const origins = (env.CORS_ORIGIN || '').split(',').map((s: string)=>s.trim());
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Methods', env.CORS_METHODS || 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', env.CORS_HEADERS || 'authorization,content-type,idem-key');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(res.body, {status: res.status, headers});
}

export function preflight(env: any, req: Request) {
  const reqOrigin = req.headers.get('origin') || '';
  const allowed = (env.CORS_ORIGIN || '').split(',').map((s:string)=>s.trim());
  const headers = new Headers();
  if (allowed.includes(reqOrigin)) headers.set('Access-Control-Allow-Origin', reqOrigin);
  headers.set('Access-Control-Allow-Methods', env.CORS_METHODS || 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', env.CORS_HEADERS || 'authorization,content-type,idem-key');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 204, headers });
}

export function allowOrigin(env: any, req: Request, res: Response) {
  const reqOrigin = req.headers.get('origin') || '';
  const allowed = (env.CORS_ORIGIN || '').split(',').map((s:string)=>s.trim());
  const headers = new Headers(res.headers);
  if (allowed.includes(reqOrigin)) headers.set('Access-Control-Allow-Origin', reqOrigin);
  return new Response(res.body, { status: res.status, headers });
}
