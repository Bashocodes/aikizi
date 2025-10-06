import { supa, fromSafe } from '../lib/supa';
import { json, bad } from '../lib/json';
import { requireUser } from '../lib/auth';
import { cors } from '../lib/cors';
import type { Env } from '../types';

async function generateUniqueHandle(dbClient: any, baseHandle: string, maxAttempts = 5): Promise<string> {
  const cleanBase = baseHandle.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  let attempt = 0;

  while (attempt < maxAttempts) {
    const handle = attempt === 0
      ? cleanBase
      : `${cleanBase}_${Math.random().toString(36).slice(2, 6)}`;

    const { data: existing } = await fromSafe(dbClient, 'profiles')
      .select('user_id')
      .eq('handle', handle)
      .maybeSingle();

    if (!existing) {
      return handle;
    }

    attempt++;
  }

  return `${cleanBase}_${Date.now().toString(36)}`;
}

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
  const userEmail = authResult.user.email || '';
  const userMetadata = authResult.user.user_metadata || {};
  console.log('[FN ensure-account] User authenticated:', auth_id);

  const dbClient = supa(env, authResult.token);

  const { data: existingUser } = await fromSafe(dbClient, 'users')
    .select('id')
    .eq('auth_id', auth_id)
    .maybeSingle();

  let user_id = existingUser?.id;
  let isNewUser = false;

  if (!user_id) {
    console.log('[FN ensure-account] Creating new user:', auth_id);
    const { data: inserted, error: insertUserError } = await fromSafe(dbClient, 'users')
      .insert({ auth_id, role: 'viewer' })
      .select('id')
      .single();

    if (insertUserError) {
      console.error('[FN ensure-account] Failed to create user:', insertUserError.message);
      return cors(bad('failed to ensure user', 500));
    }

    user_id = inserted.id;
    isNewUser = true;
    console.log('[FN ensure-account] User created, id:', user_id);
  } else {
    console.log('[FN ensure-account] User already exists:', user_id);
  }

  const { data: existingProfile } = await fromSafe(dbClient, 'profiles')
    .select('user_id')
    .eq('user_id', user_id)
    .maybeSingle();

  if (!existingProfile) {
    console.log('[FN ensure-account] Creating profile for user:', user_id);

    const baseHandle = userEmail.split('@')[0] || `user${user_id.slice(0, 8)}`;
    const uniqueHandle = await generateUniqueHandle(dbClient, baseHandle);

    const displayName = userMetadata.full_name || userMetadata.name || userEmail.split('@')[0] || 'User';

    const { error: profileError } = await fromSafe(dbClient, 'profiles').insert({
      user_id,
      handle: uniqueHandle,
      display_name: displayName,
      is_public: false
    });

    if (profileError) {
      console.error('[FN ensure-account] Failed to create profile:', profileError.message);
      return cors(bad('failed to create profile', 500));
    }

    console.log('[FN ensure-account] Profile created with handle:', uniqueHandle);
  }

  const { data: existingEntitlement } = await fromSafe(dbClient, 'entitlements')
    .select('user_id, tokens_balance')
    .eq('user_id', user_id)
    .maybeSingle();

  if (!existingEntitlement) {
    console.log('[FN ensure-account] Creating entitlements for user:', user_id);

    const freePlanResult = await fromSafe(dbClient, 'plans')
      .select('id, tokens_granted')
      .eq('name', 'free')
      .single();

    const freePlan = freePlanResult.data;

    if (!freePlan) {
      console.error('[FN ensure-account] Free plan not found');
      return cors(bad('free plan not found', 500));
    }

    const renewsAt = new Date();
    renewsAt.setMonth(renewsAt.getMonth() + 1);
    renewsAt.setDate(1);
    renewsAt.setHours(0, 0, 0, 0);

    const { error: entitlementError } = await fromSafe(dbClient, 'entitlements').insert({
      user_id,
      plan_id: freePlan.id,
      tokens_balance: 1000,
      renews_at: renewsAt.toISOString()
    });

    if (entitlementError) {
      console.error('[FN ensure-account] Failed to create entitlements:', entitlementError.message);
      return cors(bad('failed to create entitlements', 500));
    }

    const { data: existingWelcomeGrant } = await fromSafe(dbClient, 'transactions')
      .select('id')
      .eq('user_id', user_id)
      .eq('kind', 'welcome_grant')
      .maybeSingle();

    if (!existingWelcomeGrant) {
      const { error: transactionError } = await fromSafe(dbClient, 'transactions').insert({
        user_id,
        kind: 'welcome_grant',
        amount: 1000,
        ref: { reason: 'signup', plan: 'free', granted_at: new Date().toISOString() }
      });

      if (transactionError) {
        console.warn('[FN ensure-account] Failed to log welcome transaction:', transactionError.message);
      }
    }

    console.log('[FN ensure-account] Entitlements created: user_id=' + user_id + ' balance=1000 renews_at=' + renewsAt.toISOString());
  } else {
    console.log('[FN ensure-account] Entitlements already exist: user_id=' + user_id + ' balance=' + existingEntitlement.tokens_balance);
  }

  return json({ ok: true, user_id, created: isNewUser });
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
