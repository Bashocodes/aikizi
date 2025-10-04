export function withCORS(env: any, res: Response) {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', 'https://aikizi.xyz');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'authorization,content-type,idem-key,x-supabase-auth');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(res.body, {status: res.status, headers});
}

export function preflight(env: any, req: Request) {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', 'https://aikizi.xyz');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'authorization,content-type,idem-key,x-supabase-auth');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 200, headers });
}

export function allowOrigin(env: any, req: Request, res: Response) {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', 'https://aikizi.xyz');
  return new Response(res.body, { status: res.status, headers });
}

export function cors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', 'https://aikizi.xyz');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'authorization,content-type,idem-key,x-supabase-auth');
  return new Response(res.body, { status: res.status, headers });
}
