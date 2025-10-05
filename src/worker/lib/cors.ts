const ALLOWED_METHODS = 'GET,POST,OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type, X-Requested-With';

function parseAllowedOrigins(env: { CORS_ORIGIN?: string }): string[] {
  if (!env?.CORS_ORIGIN) {
    // TODO tighten when CORS_ORIGIN is configured across environments.
    return [];
  }
  return env.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean);
}

function resolveAllowedOrigin(env: { CORS_ORIGIN?: string }, req: Request): string | null {
  const origin = req.headers.get('Origin') || req.headers.get('origin') || '';
  const allowedOrigins = parseAllowedOrigins(env);

  if (!origin) {
    return allowedOrigins.length ? allowedOrigins[0] ?? null : '*';
  }

  if (!allowedOrigins.length || allowedOrigins.includes('*')) {
    return origin;
  }

  return allowedOrigins.includes(origin) ? origin : null;
}

function applyCommonCorsHeaders(headers: Headers, allowOrigin: string | null): Headers {
  if (allowOrigin) {
    headers.set('Access-Control-Allow-Origin', allowOrigin);
  }
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.append('Vary', 'Origin');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

export function withCors(env: { CORS_ORIGIN?: string }, req: Request, res: Response): Response {
  const headers = applyCommonCorsHeaders(new Headers(res.headers), resolveAllowedOrigin(env, req));
  return new Response(res.body, { status: res.status, headers });
}

export function handleOptions(env: { CORS_ORIGIN?: string }, req: Request): Response {
  const allowOrigin = resolveAllowedOrigin(env, req);
  const headers = applyCommonCorsHeaders(new Headers(), allowOrigin);
  const status = allowOrigin ? 204 : 403;
  return new Response(null, { status, headers });
}
