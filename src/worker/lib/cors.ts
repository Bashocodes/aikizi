const ALLOWED_ORIGINS = ['https://aikizi.xyz', 'https://www.aikizi.xyz'];
const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];
const ALLOWED_HEADERS = ['Authorization', 'Content-Type', 'idem-key'];

function mergeVary(existing: string | null, incoming: string): string {
  const parts = new Set<string>();

  const add = (value: string | null) => {
    if (!value) return;
    for (const part of value.split(',')) {
      const trimmed = part.trim();
      if (trimmed) {
        parts.add(trimmed);
      }
    }
  };

  add(existing);
  add(incoming);

  return Array.from(parts).join(', ');
}

function ensureVary(headers: Headers, value: string) {
  const merged = mergeVary(headers.get('Vary'), value);
  if (merged) {
    headers.set('Vary', merged);
  }
}

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
  ensureVary(headers, 'Origin');
  return new Response(res.body, {status: res.status, headers});
}

export function preflight(env: any, req: Request) {
  const headers = new Headers();
  const allowOrigin = getAllowOrigin(req);
  headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
  headers.set('Access-Control-Max-Age', '86400');
  ensureVary(headers, 'Origin');
  ensureVary(headers, 'Access-Control-Request-Headers');
  ensureVary(headers, 'Access-Control-Request-Method');
  return new Response(null, { status: 204, headers });
}

export function allowOrigin(env: any, req: Request, res: Response) {
  const headers = new Headers(res.headers);
  const allowOrigin = getAllowOrigin(req);
  headers.set('Access-Control-Allow-Origin', allowOrigin);
  ensureVary(headers, 'Origin');
  return new Response(res.body, { status: res.status, headers });
}

export function cors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', 'https://aikizi.xyz');
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
  ensureVary(headers, 'Origin');
  return new Response(res.body, { status: res.status, headers });
}
