import { supa } from '../lib/supa';
import { json, bad } from '../lib/json';
import { idemKey } from '../lib/idem';
import type { Env } from '../types';

type SpendBody = { cost: number, reason?: string };

export async function spend(env: Env, req: Request){
  const key = idemKey(req); if(!key) return bad('idem-key required', 400);
  const sb = supa(env, req.headers.get('authorization')||undefined);
  const { data: user } = await sb.auth.getUser();
  if (!user?.user) return bad('auth required', 401);
  const body = await req.json() as SpendBody;
  if (!body?.cost || body.cost < 1) return bad('invalid cost');
  const { data, error } = await sb.rpc('spend_tokens', { p_cost: body.cost, p_idem_key: key });
  if (error) return bad('spend failed: '+error.message, 400);
  return json({ ok:true, balance: data?.balance ?? null });
}
