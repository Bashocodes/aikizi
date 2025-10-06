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
  const logPrefix = reqId ? `[${reqId}] [balance]` : '[balance]';

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
  console.log(`${logPrefix} Fetching user record for auth_id=${authResult.user.id}`);

  const { data: userRecord, error: userError } = await fromSafe(sb, 'users')
    .select('id')
    .eq('auth_id', authResult.user.id)
    .maybeSingle();

  if (userError) {
    console.error(`${logPrefix} User lookup error:`, userError.message);
    return cors(bad('user_lookup_failed', 500));
  }

  if (!userRecord) {
    console.log(`${logPrefix} User not found: ${authResult.user.id}`);
    return cors(bad('not found', 404));
  }

  const userId = userRecord.id;
  console.log(`${logPrefix} User found, userId=${userId}, querying entitlements`);

  const { data: entitlement, error: entitlementError } = await fromSafe(sb, 'entitlements')
    .select('tokens_balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (entitlementError) {
    console.error(`${logPrefix} Entitlements query error:`, entitlementError.message);
    console.log(`${logPrefix} Defaulting to balance: 0`);
    return cors(json({ ok: true, balance: 0 }));
  }

  const balance = entitlement?.tokens_balance ?? 0;
  console.log(`${logPrefix} RLS balance result`, { userId, balance, hasEntitlement: !!entitlement });
  console.log(`${logPrefix} Balance retrieved: ${balance}`);
  return cors(json({ ok: true, balance }));
}
