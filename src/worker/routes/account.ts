import { supa } from '../lib/supa';
import { json, bad } from '../lib/json';
import type { Env } from '../types';

export async function ensureAccount(env: Env, req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const authJwt = authHeader?.replace('Bearer ', '').replace('bearer ', '');

  if (!authJwt) {
    console.log('[FN ensure-account] No auth header found');
    return bad('auth required', 401);
  }

  console.log('[FN ensure-account] Auth header present, token len:', authJwt.length);

  const authClient = supa(env, authJwt);
  const { data: user, error: authError } = await authClient.auth.getUser();

  if (authError || !user?.user) {
    console.log('[FN ensure-account] Auth verification failed:', authError?.message);
    return bad('auth required', 401);
  }

  const auth_id = user.user.id;
  console.log('[FN ensure-account] User authenticated:', auth_id);

  const dbClient = supa(env);
  const { data: existing } = await dbClient.from('users').select('id').eq('auth_id', auth_id).single();
  let user_id = existing?.id;

  if (!user_id) {
    console.log('[FN ensure-account] Creating new user:', auth_id);
    const { data: inserted, error } = await dbClient.from('users').insert({ auth_id, role: 'viewer' }).select('id').single();
    if (error) {
      console.error('[FN ensure-account] Failed to create user:', error.message);
      return bad('failed to ensure user');
    }
    user_id = inserted.id;
    await dbClient.from('entitlements').insert({
      user_id,
      monthly_quota: 1000,
      tokens_balance: 1000,
      last_reset_at: new Date().toISOString(),
      next_reset_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    });
    console.log('[FN ensure-account] User created with entitlements:', user_id);
  }

  return json({ ok: true, user_id });
}

export async function balance(env: Env, req: Request) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const authJwt = authHeader?.replace('Bearer ', '').replace('bearer ', '');

  if (!authJwt) {
    console.log('[FN balance] No auth header found');
    return bad('auth required', 401);
  }

  console.log('[FN balance] Auth header present, token len:', authJwt.length);

  const authClient = supa(env, authJwt);
  const { data: user, error: authError } = await authClient.auth.getUser();

  if (authError || !user?.user) {
    console.log('[FN balance] Auth verification failed:', authError?.message);
    return bad('auth required', 401);
  }

  console.log('[FN balance] User authenticated:', user.user.id);

  const dbClient = supa(env);
  const { data, error } = await dbClient.from('users').select('id, entitlements(tokens_balance)').eq('auth_id', user.user.id).single();

  if (error || !data) {
    console.log('[FN balance] User not found:', user.user.id);
    return bad('not found', 404);
  }

  return json({ ok: true, balance: data.entitlements?.tokens_balance || 0 });
}
