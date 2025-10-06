import { supa, fromSafe } from '../lib/supa';
import { json, bad } from '../lib/json';
import { idemKey } from '../lib/idem';
import type { Env } from '../types';

type SpendBody = { cost: number, reason?: string };

export async function spend(env: Env, req: Request, reqId?: string){
  const logPrefix = reqId ? `[${reqId}] [spend]` : '[spend]';
  const key = idemKey(req);
  if(!key) {
    console.log(`${logPrefix} Missing idem-key`);
    return bad('idem-key required', 400);
  }

  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const sb = supa(env, authHeader || undefined);
  const { data: user } = await sb.auth.getUser();

  if (!user?.user) {
    console.log(`${logPrefix} Auth check failed`);
    return bad('auth required', 401);
  }

  console.log(`${logPrefix} User authenticated: ${user.user.id}`);

  const body = await req.json() as SpendBody;
  if (!body?.cost || body.cost < 1) {
    console.log(`${logPrefix} Invalid cost: ${body?.cost}`);
    return bad('invalid cost');
  }

  console.log(`${logPrefix} Spending ${body.cost} tokens, idem_key=${key}`);
  const { data, error } = await sb.rpc('spend_tokens', { p_cost: body.cost, p_idem_key: key });

  if (error) {
    console.error(`${logPrefix} Spend failed:`, error.message);
    return bad('spend failed: '+error.message, 400);
  }

  console.log(`${logPrefix} Spend successful, new balance: ${data?.balance ?? null}`);
  return json({ ok:true, balance: data?.balance ?? null });
}
