import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';
import { withCORS, corsHeaders } from '../_shared/cors.ts';

const ALLOWED_MODELS = ['gpt-5', 'gpt-5-mini', 'gemini-2.5-pro', 'gemini-2.5-flash'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders() });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { user } = await requireUser(req, supabaseUrl, supabaseAnonKey);

    const body = await req.json();
    const { image_url, model = 'gpt-5' } = body;

    if (!image_url) {
      return withCORS(
        new Response(
          JSON.stringify({ error: 'image_url required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }

    if (!ALLOWED_MODELS.includes(model)) {
      return withCORS(
        new Response(
          JSON.stringify({ error: `model must be one of: ${ALLOWED_MODELS.join(', ')}` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }

    const idemKey = req.headers.get('idem-key') || `decode-${Date.now()}-${crypto.randomUUID()}`;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single();

    if (!userData) {
      return withCORS(
        new Response(
          JSON.stringify({ error: 'user not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }

    const { error: spendError } = await supabase.rpc('spend_tokens', {
      p_cost: 1,
      p_idem_key: idemKey,
    });

    if (spendError) {
      console.log('[FN decode] Spend tokens failed:', spendError.message);
      return withCORS(
        new Response(
          JSON.stringify({
            error: spendError.message.includes('insufficient')
              ? 'insufficient tokens'
              : 'spend failed',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }

    const normalized = {
      style_triplet: 'Sample Style • Modern • Clean',
      artist_oneword: 'Contemporary',
      subjects: ['abstract', 'geometric'],
      tokens: ['minimalist', 'modern', 'clean'],
      prompt_short: 'A modern abstract composition with clean geometric forms',
      sref_hint: '--sref 1234567890',
      model_used: model,
      seo_snippet: 'Modern abstract style',
    };

    await supabase.from('decodes').insert({
      user_id: userData.id,
      input_media_id: null,
      model: model,
      raw_json: {},
      normalized_json: normalized,
      cost_tokens: 1,
      private: true,
    });

    console.log('[FN decode] Decode successful for user:', user.id);

    return withCORS(
      new Response(
        JSON.stringify({ ok: true, normalized }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
  } catch (error) {
    if (error instanceof Response) {
      return withCORS(error);
    }

    console.error('[FN decode] Unexpected error:', error);
    return withCORS(
      new Response(
        JSON.stringify({ error: 'internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    );
  }
});
