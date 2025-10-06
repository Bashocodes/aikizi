import { supa } from '../lib/supa';
import { json, bad } from '../lib/json';
import { cors } from '../lib/cors';
import type { Env } from '../types';

export async function refreshTokens(env: Env, req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = env.CRON_SECRET || '';

  if (!cronSecret) {
    console.error('[CRON refresh-tokens] CRON_SECRET not configured');
    return cors(bad('cron secret not configured', 500));
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[CRON refresh-tokens] Unauthorized: invalid cron secret');
    return cors(bad('unauthorized', 401));
  }

  console.log('[CRON refresh-tokens] Starting token refresh job');

  try {
    const adminClient = supa(env);

    const { data: result, error } = await adminClient.rpc('refresh_monthly_tokens');

    if (error) {
      console.error('[CRON refresh-tokens] RPC error:', error.message);
      return cors(bad('refresh failed: ' + error.message, 500));
    }

    const processedCount = result || 0;

    console.log('[CRON refresh-tokens] Completed:', processedCount, 'users processed');

    return cors(json({
      ok: true,
      processed: processedCount,
      timestamp: new Date().toISOString()
    }));
  } catch (err: any) {
    console.error('[CRON refresh-tokens] Unexpected error:', err);
    return cors(bad('unexpected error: ' + err.message, 500));
  }
}
