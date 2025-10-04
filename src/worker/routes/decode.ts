import { json, bad } from '../lib/json';
import { supa } from '../lib/supa';
import { idemKey } from '../lib/idem';
import { cors } from '../lib/cors';
import { requireUser } from '../lib/auth';
import type { Env } from '../types';

type Body = { image_url: string, model?: string };

const ALLOWED_MODELS = ['gpt-5', 'gpt-5-mini', 'gemini-2.5-pro', 'gemini-2.5-flash'];

export async function decode(env: Env, req: Request) {
  if (req.method === 'OPTIONS') {
    return cors(new Response(null, { status: 200 }));
  }

  let user;
  try {
    const authResult = await requireUser(env, req);
    user = authResult.user;
  } catch (error) {
    if (error instanceof Response) {
      return cors(error);
    }
    console.error('[FN decode] Unexpected auth error:', error);
    return cors(bad('auth required', 401));
  }

  const key = idemKey(req);
  if (!key) {
    return cors(bad('idem-key required', 400));
  }

  const dbClient = supa(env);
  const spend = await dbClient.rpc('spend_tokens', { p_cost: 1, p_idem_key: key });

  if (spend.error) {
    console.log('[FN decode] Spend tokens failed:', spend.error.message);
    const errorCode = spend.error.message.includes('insufficient') ? 'NO_TOKENS' : 'SPEND_FAILED';
    return cors(json({ ok: false, error: spend.error.message.includes('insufficient') ? 'insufficient tokens' : 'spend failed', code: errorCode }, 400));
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

  const { data: userData } = await dbClient.from('users').select('id').eq('auth_id', user.id).single();

  await dbClient.from('decodes').insert({
    user_id: userData?.id || null,
    input_media_id: null,
    model: model,
    raw_json: {},
    normalized_json: normalized,
    cost_tokens: 1,
    private: true
  });

  console.log('[FN decode] Decode successful for user:', user.id);

  return cors(json({ ok: true, normalized }));
}
