export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = new Set([
    'https://aikizi.xyz',
    'https://www.aikizi.xyz',
    'http://localhost:5173',
  ]);

  const allowOrigin = origin && allowed.has(origin) ? origin : 'https://aikizi.xyz';

  console.log('[CORS] origin=', origin, 'allow=', allowOrigin);

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-supabase-auth',
    'Vary': 'Origin',
  };
}

export function preflight(req: Request): Response {
  const headers = corsHeaders(req.headers.get('origin'));
  return new Response(null, { status: 204, headers });
}

export function withCORS(
  body: BodyInit | null,
  init: ResponseInit,
  req: Request
): Response {
  const corsH = corsHeaders(req.headers.get('origin'));
  const headers = new Headers(init.headers || {});

  Object.entries(corsH).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(body, {
    ...init,
    headers,
  });
}
