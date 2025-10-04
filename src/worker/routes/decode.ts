import { json, bad } from '../lib/json';
import { supa } from '../lib/supa';
import { idemKey } from '../lib/idem';
import { cors } from '../lib/cors';
import type { Env } from '../types';

type Body = { image_url: string, model?: string };

const ALLOWED_MODELS = ['gpt-5', 'gpt-5-mini', 'gemini-2.5-pro', 'gemini-2.5-flash'];

export async function decode(env: Env, req: Request) {
  if (req.method === 'OPTIONS') {
    return cors(new Response(null, { status: 200 }));
  }

  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const authJwt = authHeader?.replace('Bearer ', '').replace('bearer ', '');

  if (!authJwt) {
    console.log('[FN decode] No auth header found');
    return cors(bad('auth required', 401));
  }

  console.log('[FN decode] Auth header present, token len:', authJwt.length);

  const authClient = supa(env, authJwt);
  const { data: user, error: authError } = await authClient.auth.getUser();

  if (authError || !user?.user) {
    console.log('[FN decode] Auth verification failed:', authError?.message);
    return cors(bad('auth required', 401));
  }

  console.log('[FN decode] User authenticated:', user.user.id);

  const key = idemKey(req);
  if (!key) {
    return cors(bad('idem-key required', 400));
  }

  const dbClient = supa(env);
  const spend = await dbClient.rpc('spend_tokens', { p_cost: 1, p_idem_key: key });

  if (spend.error) {
    console.log('[FN decode] Spend tokens failed:', spend.error.message);
    return cors(bad(spend.error.message.includes('insufficient') ? 'insufficient tokens' : 'spend failed'));
  }

  const body = await req.json() as Body;
  if (!body?.image_url) {
    return cors(bad('image_url required'));
  }

  const model = body.model || 'gpt-5';
  if (!ALLOWED_MODELS.includes(model)) {
    return cors(bad(`model must be one of: ${ALLOWED_MODELS.join(', ')}`));
  }

  const normalized = {
    style_triplet: 'Sample Style • Modern • Clean',
    artist_oneword: 'Contemporary',
    subjects: ['abstract', 'geometric'],
    tokens: ['minimalist', 'modern', 'clean'],
    prompt_short: 'A modern abstract composition with clean geometric forms',
    sref_hint: '--sref 1234567890',
    model_used: model,
    seo_snippet: 'Modern abstract style'
  };

  const { data: userData } = await dbClient.from('users').select('id').eq('auth_id', user.user.id).single();

  await dbClient.from('decodes').insert({
    user_id: userData?.id || null,
    input_media_id: null,
    model: model,
    raw_json: {},
    normalized_json: normalized,
    cost_tokens: 1,
    private: true
  });

  console.log('[FN decode] Decode successful for user:', user.user.id);

  return cors(json({ ok: true, normalized }));
}
