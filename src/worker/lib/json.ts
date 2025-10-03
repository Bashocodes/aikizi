export async function readJSON<T>(req: Request): Promise<T> { return await req.json() as T; }
export function json(data:any, init: number|ResponseInit=200){ return new Response(JSON.stringify(data), { status: typeof init==='number'? init: (init.status||200), headers: { 'content-type':'application/json', ...(typeof init==='object'? init.headers: {}) }}); }
export function bad(msg:string, code=400){ return json({ ok:false, error: msg }, code); }
