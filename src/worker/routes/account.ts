import { supa } from '../lib/supa';
import { json, bad } from '../lib/json';
import { requireUser } from '../lib/auth';
import { cors } from '../lib/cors';
import type { Env } from '../types';

export async function ensureAccount(env: Env, req: Request) {
  let user;
  try {
    const authResult = await requireUser(env, req);
    user = authResult.user;
  } catch (error) {
    if (error instanceof Response) {
      return cors(error);
    }
    console.error('[FN ensure-account] Unexpected auth error:', error);
    return cors(bad('auth required', 401));
  }

  const auth_id = user.id;
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
  let user;
  try {
    const authResult = await requireUser(env, req);
    user = authResult.user;
  } catch (error) {
    if (error instanceof Response) {
      return cors(error);
    }
    console.error('[FN balance] Unexpected auth error:', error);
    return cors(bad('auth required', 401));
  }

  const dbClient = supa(env);
  const { data, error } = await dbClient.from('users').select('id, entitlements(tokens_balance)').eq('auth_id', user.id).single();

  if (error || !data) {
    console.log('[FN balance] User not found:', user.id);
    return cors(bad('not found', 404));
  }

  const entitlements = data.entitlements as any;
  const balance = Array.isArray(entitlements) ? entitlements[0]?.tokens_balance : entitlements?.tokens_balance;

  return cors(json({ ok: true, balance: balance || 0 }));
}
