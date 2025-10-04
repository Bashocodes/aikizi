import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';
import { withCORS, corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders() });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { user } = await requireUser(req, supabaseUrl, supabaseAnonKey);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('users')
      .select('id, entitlements(tokens_balance)')
      .eq('auth_id', user.id)
      .single();

    if (error || !data) {
      console.log('[FN balance] User not found:', user.id);
      return withCORS(
        new Response(
          JSON.stringify({ error: 'not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }

    const entitlements = data.entitlements as any;
    const balance = Array.isArray(entitlements)
      ? entitlements[0]?.tokens_balance
      : entitlements?.tokens_balance;

    console.log('[FN balance] Returning balance for user:', user.id, balance || 0);

    return withCORS(
      new Response(
        JSON.stringify({ ok: true, balance: balance || 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
  } catch (error) {
    if (error instanceof Response) {
      return withCORS(error);
    }

    console.error('[FN balance] Unexpected error:', error);
    return withCORS(
      new Response(
        JSON.stringify({ error: 'internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    );
  }
});
