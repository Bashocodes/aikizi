const ALLOWED_ORIGINS = ['https://aikizi.xyz', 'https://www.aikizi.xyz'];
const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];
const ALLOWED_HEADERS = ['Authorization', 'Content-Type'];

function getAllowOrigin(req: Request): string {
  const origin = req.headers.get('origin') || 'https://aikizi.xyz';
  return ALLOWED_ORIGINS.includes(origin) ? origin : 'https://aikizi.xyz';
}

export function withCORS(env: any, res: Response, req?: Request) {
  const headers = new Headers(res.headers);
  const allowOrigin = req ? getAllowOrigin(req) : 'https://aikizi.xyz';
  headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(res.body, {status: res.status, headers});
}

export function preflight(env: any, req: Request) {
  const headers = new Headers();
  const allowOrigin = getAllowOrigin(req);
  headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 204, headers });
}

export function allowOrigin(env: any, req: Request, res: Response) {
  const headers = new Headers(res.headers);
  const allowOrigin = getAllowOrigin(req);
  headers.set('Access-Control-Allow-Origin', allowOrigin);
  return new Response(res.body, { status: res.status, headers });
}

export function cors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', 'https://aikizi.xyz');
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
  return new Response(res.body, { status: res.status, headers });
}
