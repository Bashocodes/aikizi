import { supa, fromSafe } from '../lib/supa';
import { json, bad } from '../lib/json';
import { requireUser } from '../lib/auth';
import { cors } from '../lib/cors';
import type { Env } from '../types';

export async function ensureAccount(env: Env, req: Request) {
  let authResult;
  try {
    authResult = await requireUser(env, req);
  } catch (error) {
    if (error instanceof Response) {
      return cors(error);
    }
    console.error('[FN ensure-account] Unexpected auth error:', error);
    return cors(bad('auth required', 401));
  }

  const auth_id = authResult.user.id;
  console.log('[FN ensure-account] User authenticated:', auth_id);

  const dbClient = supa(env, authResult.token);
  const { data: existing } = await fromSafe(dbClient, 'users').select('id').eq('auth_id', auth_id).single();
  let user_id = existing?.id;

  if (!user_id) {
    console.log('[FN ensure-account] Creating new user:', auth_id);
    const { data: inserted, error } = await fromSafe(dbClient, 'users').insert({ auth_id, role: 'viewer' }).select('id').single();
    if (error) {
      console.error('[FN ensure-account] Failed to create user:', error.message);
      return bad('failed to ensure user');
    }
    user_id = inserted.id;
    await fromSafe(dbClient, 'entitlements').insert({
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

export async function balance(env: Env, req: Request, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}]` : '';

  let authResult;
  try {
    authResult = await requireUser(env, req, reqId);
  } catch (error) {
    if (error instanceof Response) {
      return cors(error);
    }
    console.error(`${logPrefix} Unexpected auth error:`, error);
    return cors(bad('auth required', 401));
  }

  const sb = supa(env, authResult.token);
  console.log(`${logPrefix} [balance] Using RLS client for user=${authResult.user.id}`);

  // First get user's internal ID
  const { data: userRecord, error: userError } = await sb
    .from('users')
    .select('id')
    .eq('auth_id', authResult.user.id)
    .maybeSingle();

  if (userError || !userRecord) {
    console.error(`${logPrefix} [balance] User lookup failed:`, userError?.message);
    return cors(bad('not found', 404));
  }

  const userId = userRecord.id;

  // Query entitlements with RLS
  const { data: ent, error } = await sb
    .from('entitlements')
    .select('tokens_balance')
    .eq('user_id', userId)
    .maybeSingle();

  console.log(`${logPrefix} [balance] RLS result`, { ent, error: error?.message });

  const balance = ent?.tokens_balance ?? 0;
  return cors(json({ ok: true, balance }));
}
