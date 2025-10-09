import { json } from '../lib/json';
import { supa } from '../lib/supa';
import { cors } from '../lib/cors';
import { requireUser } from '../lib/auth';
import { idemKey } from '../lib/idem';
import { callGeminiREST } from '../providers/gemini-rest';
import { callOpenAIREST } from '../providers/openai-rest';
import type { Env } from '../types';

type Body = {
  base64?: string;
  mimeType?: string;
  imageUrl?: string;
  model?: string;
};

const ALLOWED_MODELS = ['gpt-5', 'gpt-5-mini', 'gemini-2.5-pro', 'gemini-2.5-flash'];
const DECODE_TIMEOUT_MS = 120000; // 120 seconds for GPT-5 reasoning models

export async function decode(env: Env, req: Request, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [decode]` : '[decode]';

  if (req.method === 'OPTIONS') {
    return cors(new Response(null, { status: 200 }));
  }

  let authResult;
  try {
    authResult = await requireUser(env, req, reqId);
    console.log(`${logPrefix} User authenticated`);
  } catch (error) {
    if (error instanceof Response) {
      return cors(error);
    }
    return cors(json({ success: false, error: 'auth required' }, 401));
  }

  const dbClient = supa(env, authResult.token);
  console.log(`${logPrefix} Looking up user by auth_id=${authResult.user.id}`);

  const { data: userData } = await dbClient.from('users').select('id').eq('auth_id', authResult.user.id).single();

  if (!userData) {
    console.log(`${logPrefix} User not found in DB: auth_id=${authResult.user.id}`);
    return cors(json({ success: false, error: 'auth required' }, 401));
  }

  const userId = userData.id;
  console.log(`${logPrefix} Resolved: auth_id=${authResult.user.id} -> internal_id=${userId}`);

  // Check balance first
  const { data: entitlementData } = await dbClient
    .from('entitlements')
    .select('tokens_balance')
    .eq('user_id', userId)
    .single();

  if (!entitlementData || entitlementData.tokens_balance < 1) {
    console.log(`${logPrefix} Insufficient tokens: user_id=${userId} balance=${entitlementData?.tokens_balance ?? 'null'}`);
    return cors(json({ success: false, error: 'insufficient tokens' }, 402));
  }

  const oldBalance = entitlementData.tokens_balance;
  console.log(`${logPrefix} About to spend token: user_id=${userId} ${oldBalance} -> ${oldBalance - 1}`);

  // Generate idempotency key for this decode request
  const idemKeyValue = idemKey(req) || `decode-${authResult.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Use spend_tokens RPC function (SECURITY DEFINER)
  const { data: spendResult, error: spendError } = await dbClient.rpc('spend_tokens', {
    p_cost: 1,
    p_idem_key: idemKeyValue
  });

  if (spendError) {
    console.error(`${logPrefix} Failed to spend token: user_id=${userId} error=${spendError.message}`);
    return cors(json({ success: false, error: 'insufficient tokens' }, 402));
  }

  const newBalance = spendResult?.[0]?.balance ?? (oldBalance - 1);
  console.log(`${logPrefix} Token spent successfully: user_id=${userId} new_balance=${newBalance}`);

  let body: Body;
  try {
    body = await req.json() as Body;
  } catch (e) {
    console.log(`${logPrefix} Invalid JSON`);
    const refundedBalance = await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'invalid input', newBalance: refundedBalance }, 422));
  }

  const hasBase64 = body?.base64 && body?.mimeType;
  const hasImageUrl = body?.imageUrl;

  if (!hasBase64 && !hasImageUrl) {
    console.log(`${logPrefix} Missing image data`);
    const refundedBalance = await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'invalid input', newBalance: refundedBalance }, 422));
  }

  const defaultModel = 'gemini-2.5-flash';
  const model = body.model || defaultModel;

  if (!ALLOWED_MODELS.includes(model)) {
    console.log(`${logPrefix} Invalid model: ${model}`);
    const refundedBalance = await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'invalid input', newBalance: refundedBalance }, 422));
  }

  console.log(`${logPrefix} Starting decode model=${model}`);

  const startTime = Date.now();
  let decodeResult: any;
  let latencyMs: number;

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log(`${logPrefix} Timeout triggered after ${DECODE_TIMEOUT_MS}ms, aborting...`);
      abortController.abort();
    }, DECODE_TIMEOUT_MS);

    console.log(`${logPrefix} Timeout set to ${DECODE_TIMEOUT_MS}ms`);

    try {
      // Determine which provider to use based on model name
      const isOpenAI = model.startsWith('gpt-');
      const isGemini = model.startsWith('gemini-');

      if (!isOpenAI && !isGemini) {
        throw new Error(`Unknown model type: ${model}`);
      }

      console.log(`${logPrefix} Using ${isOpenAI ? 'OpenAI' : 'Gemini'} provider`);

      if (isOpenAI) {
        // Call OpenAI provider
        console.log(`${logPrefix} Calling OpenAI API with model=${model}`);
        const providerStart = Date.now();

        const result = await Promise.race([
          callOpenAIREST(env, {
            base64: body.base64,
            mimeType: body.mimeType,
            imageUrl: body.imageUrl,
            model: model
          }, abortController.signal),
          new Promise<never>((_, reject) => {
            abortController.signal.addEventListener('abort', () => {
              const elapsed = Date.now() - providerStart;
              console.log(`${logPrefix} Abort signal fired after ${elapsed}ms`);
              reject(new Error('DECODE_TIMEOUT'));
            });
          })
        ]);

        console.log(`${logPrefix} OpenAI provider returned successfully`);
        decodeResult = result.result;
        latencyMs = result.latencyMs;
      } else {
        // Call Gemini provider
        const result = await Promise.race([
          callGeminiREST(env, {
            base64: body.base64,
            mimeType: body.mimeType,
            imageUrl: body.imageUrl,
            model: model
          }, abortController.signal),
          new Promise<never>((_, reject) => {
            abortController.signal.addEventListener('abort', () => {
              reject(new Error('DECODE_TIMEOUT'));
            });
          })
        ]);

        decodeResult = result.result;
        latencyMs = result.latencyMs;
      }

      clearTimeout(timeoutId);
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.message === 'DECODE_TIMEOUT') {
        const ms = Date.now() - startTime;
        console.log(`${logPrefix} Timeout after ${ms}ms (limit: ${DECODE_TIMEOUT_MS}ms)`);
        const refundedBalance = await refundToken(dbClient, userData.id, logPrefix);
        return cors(json({ success: false, error: 'decode timeout', newBalance: refundedBalance }, 504));
      }
      throw error;
    }
  } catch (error: any) {
    const ms = Date.now() - startTime;
    console.error(`${logPrefix} Provider error after ${ms}ms`, {
      message: error.message,
      name: error.name,
      stack: error.stack?.substring(0, 200)
    });
    const refundedBalance = await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'internal error', newBalance: refundedBalance }, 500));
  }

  const ms = Date.now() - startTime;
  console.log(`${logPrefix} Success ms=${ms}, latencyMs=${latencyMs}`);

  await dbClient.from('decodes').insert({
    user_id: userData.id,
    input_media_id: null,
    model: model,
    raw_json: decodeResult,
    normalized_json: decodeResult,
    cost_tokens: 1,
    private: true
  });

  const { data: updatedBalance } = await dbClient
    .from('entitlements')
    .select('tokens_balance')
    .eq('user_id', userId)
    .single();

  const finalBalance = updatedBalance?.tokens_balance ?? newBalance;
  console.log(`${logPrefix} Returning final balance: ${finalBalance}`);

  // Format response to match expected structure
  const responseContent = JSON.stringify(decodeResult);

  return cors(json({
    success: true,
    result: {
      content: responseContent,
      tokensUsed: 1,
      newBalance: finalBalance
    }
  }));
}

async function refundToken(dbClient: any, userId: string, logPrefix: string): Promise<number | null> {
  try {
    console.log(`${logPrefix} Attempting refund for user_id=${userId}`);
    const { data, error } = await dbClient
      .from('entitlements')
      .select('tokens_balance')
      .eq('user_id', userId)
      .single();

    if (!error && data) {
      const oldBalance = data.tokens_balance;
      const newBalance = oldBalance + 1;
      await dbClient
        .from('entitlements')
        .update({ tokens_balance: newBalance })
        .eq('user_id', userId);
      console.log(`${logPrefix} Refunded 1 token: user_id=${userId} ${oldBalance} -> ${newBalance}`);
      return newBalance;
    } else {
      console.error(`${logPrefix} Refund failed to get balance: user_id=${userId} error=${error?.message}`);
      return data?.tokens_balance ?? null;
    }
  } catch (e) {
    console.error(`${logPrefix} Refund error: user_id=${userId}`, e);
    return null;
  }
}
