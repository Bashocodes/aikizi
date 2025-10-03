import { createClient } from '@supabase/supabase-js';
import type { Env } from '../types';
export function supa(env: Env, authJwt?: string) {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    global: { headers: authJwt ? { Authorization: `Bearer ${authJwt}` } : {} }
  });
  return client;
}
