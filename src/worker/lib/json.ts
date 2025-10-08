const DEFAULT_SECURITY_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  Vary: 'Authorization'
};

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

function mergeHeaders(base: Headers, updates?: HeadersInit) {
  if (!updates) return;
  const extra = new Headers(updates);
  extra.forEach((value, key) => {
    if (key.toLowerCase() === 'vary') {
      const merged = mergeVary(base.get('vary'), value);
      base.set('Vary', merged);
      return;
    }

    base.set(key, value);
  });
}

export async function readJSON<T>(req: Request): Promise<T> { return await req.json() as T; }
export function json(data:any, init: number|ResponseInit=200){
  const status = typeof init === 'number' ? init : (init.status ?? 200);
  const headers = new Headers({ 'Content-Type':'application/json' });

  Object.entries(DEFAULT_SECURITY_HEADERS).forEach(([key, value]) => {
    if (key.toLowerCase() === 'vary') {
      const merged = mergeVary(headers.get('Vary'), value);
      headers.set('Vary', merged);
    } else {
      headers.set(key, value);
    }
  });

  if (typeof init === 'object' && init.headers) {
    mergeHeaders(headers, init.headers);
  }

  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}
export function bad(msg:string, code=400){ return json({ ok:false, error: msg }, code); }
