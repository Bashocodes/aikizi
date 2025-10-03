import { json, bad } from '../lib/json';
import { supa } from '../lib/supa';
import { idemKey } from '../lib/idem';
import type { Env } from '../types';

type Body = { image_url: string, model?: string };

export async function decode(env: Env, req: Request) {
  const key = idemKey(req); if(!key) return bad('idem-key required', 400);
  const sb = supa(env, req.headers.get('authorization')||undefined);
  const { data: user } = await sb.auth.getUser();
  if (!user?.user) return bad('auth required', 401);
  const spend = await sb.rpc('spend_tokens', { p_cost: 1, p_idem_key: key });
  if (spend.error) return bad('spend failed');

  const body = await req.json() as Body;
  if(!body?.image_url) return bad('image_url required');

  const model_used = body.model || env.AI_PROVIDER || 'gemini';
  const normalized = { style_triplet:'', artist_oneword:null, subjects:[], tokens:[], prompt_short:'', sref_hint:null, model_used, seo_snippet:'' };

  await sb.from('decodes').insert({ user_id: null, input_media_id: null, model: model_used, raw_json: {}, normalized_json: normalized, cost_tokens: 1, private: true });
  return json({ ok:true, normalized });
}
