import { createClient } from '@supabase/supabase-js';
import type { Env } from '../types';

export function supa(env: Env, authJwt?: string) {
  // Debug logging
  console.log('Supabase client creation:', {
    hasUrl: !!env.SUPABASE_URL,
    hasAnonKey: !!env.SUPABASE_ANON_KEY,
    hasServiceKey: !!env.SUPABASE_SERVICE_KEY,
    authJwt: !!authJwt,
    urlLength: env.SUPABASE_URL?.length,
    anonKeyLength: env.SUPABASE_ANON_KEY?.length,
    serviceKeyLength: env.SUPABASE_SERVICE_KEY?.length
  });

  if (!env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL is required');
  }

  // Use anon key for JWT validation, service key for database operations
  const key = authJwt ? env.SUPABASE_ANON_KEY : env.SUPABASE_SERVICE_KEY;
  
  if (!key) {
    const missingKey = authJwt ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_KEY';
    throw new Error(`${missingKey} is required`);
  }

  // For JWT validation, we need both anon key and service key
  if (authJwt && !env.SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY is required for JWT validation');
  }

  const client = createClient(env.SUPABASE_URL, key, {
    global: { headers: authJwt ? { Authorization: `Bearer ${authJwt}` } : {} }
  });
  return client;
}
