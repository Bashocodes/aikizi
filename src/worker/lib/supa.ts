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

  if (!env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY is required for anon client');
  }

  console.log('[supa] Creating anon client');
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function fromSafe(sb: any, table: string) {
  if (/^public[._]/i.test(table)) {
    table = table.replace(/^public[._]/i, '');
  }
  if (table.includes('.')) {
    throw new Error(`Do not pass dotted names: ${table}`);
  }
  return sb.from(table);
}
