export function idemKey(req: Request){ return req.headers.get('idem-key') || ''; }
