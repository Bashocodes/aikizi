export function withCORS(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', 'https://aikizi.xyz');
  headers.set('Access-Control-Allow-Headers', 'authorization, content-type, x-supabase-auth, apikey, x-client-info');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Max-Age', '86400');

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://aikizi.xyz',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-supabase-auth, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}
