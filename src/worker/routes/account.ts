import { supa } from '../lib/supa';
import { json, bad } from '../lib/json';
import type { Env } from '../types';

export async function ensureAccount(env: Env, req: Request) {
  const sb = supa(env, req.headers.get('authorization')||undefined);
  const { data: user } = await sb.auth.getUser();
  if (!user?.user) return bad('auth required', 401);
  const auth_id = user.user.id;

  const { data: existing } = await sb.from('users').select('id').eq('auth_id', auth_id).single();
  let user_id = existing?.id;
  if (!user_id) {
    const { data: inserted, error } = await sb.from('users').insert({ auth_id, role: 'viewer' }).select('id').single();
    if (error) return bad('failed to ensure user');
    user_id = inserted.id;
    await sb.from('entitlements').insert({ user_id, monthly_quota: 1000, tokens_balance: 1000, last_reset_at: new Date().toISOString(), next_reset_at: new Date(Date.now()+30*24*3600*1000).toISOString() });
  }
  return json({ ok: true, user_id });
}

export async function balance(env: Env, req: Request) {
  const sb = supa(env, req.headers.get('authorization')||undefined);
  const { data: user } = await sb.auth.getUser();
  if (!user?.user) return bad('auth required', 401);
  const { data, error } = await sb.from('users').select('id, entitlements(tokens_balance)').eq('auth_id', user.user.id).single();
  if (error || !data) return bad('not found', 404);
  return json({ ok:true, balance: data.entitlements?.tokens_balance||0 });
}
