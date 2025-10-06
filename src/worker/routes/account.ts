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
    const { data: inserted, error: insertUserError } = await fromSafe(dbClient, 'users').insert({ auth_id, role: 'viewer' }).select('id').single();
    if (insertUserError) {
      console.error('[FN ensure-account] Failed to create user:', insertUserError.message);
      return cors(bad('failed to ensure user', 500));
    }
    user_id = inserted.id;
    console.log('[FN ensure-account] User created, id:', user_id);

    const freePlanResult = await fromSafe(dbClient, 'plans').select('id').eq('name', 'free').single();
    const freePlanId = freePlanResult.data?.id;

    if (!freePlanId) {
      console.error('[FN ensure-account] Free plan not found');
      return cors(bad('free plan not found', 500));
    }

    const { error: entitlementError } = await fromSafe(dbClient, 'entitlements').insert({
      user_id,
      plan_id: freePlanId,
      tokens_balance: 1000
    });

    if (entitlementError) {
      console.error('[FN ensure-account] Failed to create entitlements:', entitlementError.message);
      return cors(bad('failed to create entitlements', 500));
    }

    const { error: transactionError } = await fromSafe(dbClient, 'transactions').insert({
      user_id,
      kind: 'welcome_grant',
      amount: 1000,
      ref: { reason: 'signup', plan: 'free' }
    });

    if (transactionError) {
      console.warn('[FN ensure-account] Failed to log welcome transaction:', transactionError.message);
    }

    console.log('[FN ensure-account] User created with entitlements: user_id=' + user_id + ' balance=1000');
  } else {
    console.log('[FN ensure-account] User already exists:', user_id);
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
  console.log(`${logPrefix} [balance] Using RLS client for auth_id=${authResult.user.id}`);

  // First get user's internal ID
  const { data: userRecord, error: userError } = await sb
    .from('users')
    .select('id')
    .eq('auth_id', authResult.user.id)
    .maybeSingle();

  if (userError || !userRecord) {
    console.error(`${logPrefix} [balance] User lookup failed: auth_id=${authResult.user.id} error=${userError?.message}`);
    return cors(bad('not found', 404));
  }

  const userId = userRecord.id;
  console.log(`${logPrefix} [balance] Resolved: auth_id=${authResult.user.id} -> internal_id=${userId}`);

  // Query entitlements with RLS
  const { data: ent, error } = await sb
    .from('entitlements')
    .select('tokens_balance')
    .eq('user_id', userId)
    .maybeSingle();

  console.log(`${logPrefix} [balance] Query result: user_id=${userId} balance=${ent?.tokens_balance ?? 'null'} error=${error?.message ?? 'none'}`);

  const balance = ent?.tokens_balance ?? 0;
  return cors(json({ ok: true, balance }));
}
