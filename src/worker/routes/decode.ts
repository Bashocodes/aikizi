import { json, bad } from '../lib/json';
import { supa } from '../lib/supa';
import { cors } from '../lib/cors';
import { requireUser } from '../lib/auth';
import { callAIProvider } from '../lib/ai-providers';
import type { Env } from '../types';

type Body = { imageUrl: string; model?: string };

const ALLOWED_MODELS = ['gpt-5', 'gpt-5-mini', 'gemini-2.5-pro', 'gemini-2.5-flash'];
const DECODE_TIMEOUT_MS = 50000;

export async function decode(env: Env, req: Request, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [decode]` : '[decode]';
  if (req.method === 'OPTIONS') {
    return cors(new Response(null, { status: 200 }));
  }

  let user;
  try {
    const authResult = await requireUser(env, req, reqId);
    user = authResult.user;
    console.log(`${logPrefix} User authenticated: ${user.id}`);
  } catch (error) {
    if (error instanceof Response) {
      console.log(`${logPrefix} Auth failed`);
      return cors(error);
    }
    console.error(`${logPrefix} Unexpected auth error:`, error);
    return cors(bad('auth required', 401));
  }

  const dbClient = supa(env);
  const { data: userData } = await dbClient.from('users').select('id').eq('auth_id', user.id).single();

  if (!userData) {
    console.log(`${logPrefix} User not found in DB`);
    return cors(json({ ok: false, error: 'auth required' }, 401));
  }

  const { data: entitlementData } = await dbClient
    .from('entitlements')
    .select('tokens_balance')
    .eq('user_id', userData.id)
    .single();

  if (!entitlementData || entitlementData.tokens_balance < 1) {
    console.log(`${logPrefix} Insufficient tokens balance=${entitlementData?.tokens_balance || 0}`);
    return cors(json({ ok: false, error: 'insufficient tokens' }, 402));
  }

  const { error: spendError } = await dbClient
    .from('entitlements')
    .update({ tokens_balance: entitlementData.tokens_balance - 1 })
    .eq('user_id', userData.id);

  if (spendError) {
    console.error(`${logPrefix} Failed to spend token: ${spendError.message}`);
    return cors(json({ ok: false, error: 'internal error' }, 500));
  }

  console.log(`${logPrefix} Spent 1 token, new balance=${entitlementData.tokens_balance - 1}`);

  let body: Body;
  try {
    body = await req.json() as Body;
  } catch (e) {
    console.log(`${logPrefix} Failed to parse body:`, e);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ ok: false, error: 'invalid input' }, 422));
  }

  const imageUrl = body?.imageUrl;
  if (!imageUrl) {
    console.log(`${logPrefix} Missing imageUrl`);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ ok: false, error: 'invalid input' }, 422));
  }

  const defaultModel = (env.AI_PROVIDER === 'openai') ? 'gpt-5-mini' : 'gemini-2.5-flash';
  const model = body.model || defaultModel;
  if (!ALLOWED_MODELS.includes(model)) {
    console.log(`${logPrefix} Invalid model: ${model}`);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ ok: false, error: 'invalid input' }, 422));
  }

  const aiProvider = model.startsWith('gpt-') ? 'openai' : 'gemini';
  console.log(`${logPrefix} Starting decode model=${model} provider=${aiProvider}`);

  const startTime = Date.now();
  let result;

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), DECODE_TIMEOUT_MS);

    try {
      result = await Promise.race([
        callAIProvider(imageUrl, model, env),
        new Promise((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error('DECODE_TIMEOUT'));
          });
        })
      ]);
      clearTimeout(timeoutId);
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.message === 'DECODE_TIMEOUT') {
        const ms = Date.now() - startTime;
        console.log(`${logPrefix} decodeOutcome=TIMEOUT ms=${ms}`);
        await refundToken(dbClient, userData.id, logPrefix);
        return cors(json({ ok: false, error: 'decode timeout' }, 504));
      }
      throw error;
    }
  } catch (error: any) {
    const ms = Date.now() - startTime;
    console.error(`${logPrefix} decodeOutcome=PROVIDER_ERROR ms=${ms} error=${error.message}`);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ ok: false, error: 'internal error' }, 500));
  }

  const normalized = {
    styleCodes: result.styleCodes || [],
    tags: result.tags || [],
    subjects: result.subjects || [],
    story: result.prompts?.story || '',
    mix: result.prompts?.mix || '',
    expand: result.prompts?.expand || '',
    sound: result.prompts?.sound || ''
  };

  const { data: decodeRecord } = await dbClient.from('decodes').insert({
    user_id: userData.id,
    input_media_id: null,
    model: model,
    raw_json: result,
    normalized_json: normalized,
    cost_tokens: 1,
    private: true
  }).select('id').single();

  const ms = Date.now() - startTime;
  console.log(`${logPrefix} decodeOutcome=OK userId=${user.id} model=${model} provider=${aiProvider} ms=${ms}`);

  return cors(json({
    ok: true,
    decode: {
      id: decodeRecord?.id || null,
      model: model,
      normalized: normalized,
      spentTokens: 1
    }
  }));
}

async function refundToken(dbClient: any, userId: string, logPrefix: string): Promise<void> {
  try {
    const { data, error } = await dbClient
      .from('entitlements')
      .select('tokens_balance')
      .eq('user_id', userId)
      .single();

    if (!error && data) {
      await dbClient
        .from('entitlements')
        .update({ tokens_balance: data.tokens_balance + 1 })
        .eq('user_id', userId);
      console.log(`${logPrefix} Refunded 1 token`);
    }
  } catch (e) {
    console.error(`${logPrefix} Refund error:`, e);
  }
}
