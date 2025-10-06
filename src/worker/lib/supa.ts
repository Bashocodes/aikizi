import { createClient } from '@supabase/supabase-js';
import type { Env } from '../types';

export function supa(env: Env, authJwt?: string) {
  console.log('[supa] client creation:', {
    hasUrl: !!env.SUPABASE_URL,
    hasAnonKey: !!env.SUPABASE_ANON_KEY,
    hasServiceKey: !!env.SUPABASE_SERVICE_KEY,
    authJwt: !!authJwt
  });

  if (!env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL is required');
  }

  if (authJwt) {
    if (!env.SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_ANON_KEY is required');
    }

    console.log('[supa] Creating client with user token for RLS');
    return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${authJwt}`
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  if (!env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY is required');
  }

  console.log('[supa] Creating service client (bypasses RLS)');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
