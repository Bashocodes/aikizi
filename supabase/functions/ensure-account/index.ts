import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';
import { withCORS, preflight } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return preflight(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { user } = await requireUser(req, supabaseUrl, supabaseAnonKey);

    const auth_id = user.id;
    console.log('[FN ensure-account] User authenticated:', auth_id);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', auth_id)
      .single();

    let user_id = existing?.id;

    if (!user_id) {
      console.log('[FN ensure-account] Creating new user:', auth_id);

      const { data: inserted, error } = await supabase
        .from('users')
        .insert({ auth_id, role: 'viewer' })
        .select('id')
        .single();

      if (error) {
        console.error('[FN ensure-account] Failed to create user:', error.message);
        return withCORS(
          JSON.stringify({ error: 'failed to ensure user' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
          req
        );
      }

      user_id = inserted.id;

      await supabase.from('entitlements').insert({
        user_id,
        monthly_quota: 1000,
        tokens_balance: 1000,
        last_reset_at: new Date().toISOString(),
        next_reset_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      });

      console.log('[FN ensure-account] User created with entitlements:', user_id);
    }

    return withCORS(
      JSON.stringify({ ok: true, user_id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
      req
    );
  } catch (error) {
    if (error instanceof Response) {
      return withCORS(error.body, { status: error.status, headers: error.headers }, req);
    }

    console.error('[FN ensure-account] Unexpected error:', error);
    return withCORS(
      JSON.stringify({ error: 'internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
      req
    );
  }
});
