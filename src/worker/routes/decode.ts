import { json } from '../lib/json';
import { supa } from '../lib/supa';
import { cors } from '../lib/cors';
import { requireUser } from '../lib/auth';
import { idemKey } from '../lib/idem';
import { callGeminiREST } from '../providers/gemini-rest';
import type { Env } from '../types';

type Body = {
  base64?: string;
  mimeType?: string;
  imageUrl?: string;
  model?: string;
};

const ALLOWED_MODELS = ['gpt-5', 'gpt-5-mini', 'gemini-2.5-pro', 'gemini-2.5-flash'];
const DECODE_TIMEOUT_MS = 50000;
const IDEM_KEY_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function withDecodeHeaders(res: Response): Response {
  const corsRes = cors(res);
  const headers = new Headers(corsRes.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  const vary = headers.get('Vary');
  if (vary) {
    const parts = vary.split(',').map((part) => part.trim()).filter(Boolean);
    if (!parts.includes('Authorization')) {
      parts.push('Authorization');
      headers.set('Vary', parts.join(', '));
    }
  } else {
    headers.set('Vary', 'Authorization');
  }

  return new Response(corsRes.body, { status: corsRes.status, headers });
}

export async function decode(env: Env, req: Request, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [decode]` : '[decode]';

  if (req.method === 'OPTIONS') {
    return withDecodeHeaders(new Response(null, { status: 200 }));
  }

  let authResult;
  try {
    authResult = await requireUser(env, req, reqId);
    console.log(`${logPrefix} User authenticated`);
  } catch (error) {
    if (error instanceof Response) {
      return withDecodeHeaders(error);
    }
    return withDecodeHeaders(json({ success: false, error: 'auth required' }, 401));
  }

  const dbClient = supa(env, authResult.token);
  console.log(`${logPrefix} Looking up user by auth_id=${authResult.user.id}`);

  const { data: userData } = await dbClient.from('users').select('id').eq('auth_id', authResult.user.id).single();

  if (!userData) {
    console.log(`${logPrefix} User not found in DB: auth_id=${authResult.user.id}`);
    return withDecodeHeaders(json({ success: false, error: 'auth required' }, 401));
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
    return withDecodeHeaders(json({ success: false, error: 'insufficient tokens' }, 402));
  }

  const oldBalance = entitlementData.tokens_balance;

  const idemKeyValue = idemKey(req);
  if (!idemKeyValue || !IDEM_KEY_V4_REGEX.test(idemKeyValue)) {
    console.log(`${logPrefix} Invalid idempotency key`, { attemptId: idemKeyValue || 'missing', userId });
    const status = 400;
    console.log(`${logPrefix} telemetry status=${status}`, JSON.stringify({ attemptId: idemKeyValue || 'missing', userId, outcome: 'spend:idem_key_invalid' }));
    return withDecodeHeaders(json({
      code: 'IDEMPOTENCY_KEY_INVALID'
    }, status));
  }

  console.log(`${logPrefix} About to spend token: user_id=${userId} ${oldBalance} -> ${oldBalance - 1}`, {
    attemptId: idemKeyValue,
  });
  console.log(`${logPrefix} telemetry`, JSON.stringify({ attemptId: idemKeyValue, userId, outcome: 'spend:start' }));

  // Use spend_tokens RPC function (SECURITY DEFINER)
  let spendResult;
  try {
    const { data, error } = await dbClient.rpc('spend_tokens', {
      p_cost: 1,
      p_idem_key: idemKeyValue
    });

    if (error) {
      throw error;
    }

    spendResult = data;
  } catch (err: any) {
    const errorMessage = err?.message || '';
    const errorCode = err?.code;
    let status = 500;
    let body: Record<string, string | boolean> = { success: false, code: 'UNKNOWN', message: 'Unexpected error' };

    if (errorMessage.includes('INSUFFICIENT_FUNDS') || errorCode === 'INSUFFICIENT_FUNDS') {
      status = 402;
      body = { success: false, code: 'INSUFFICIENT_FUNDS', message: 'Not enough tokens' };
    } else if (errorMessage.includes('invalid input syntax for type uuid') || errorCode === 'IDEMPOTENCY_KEY_INVALID') {
      status = 400;
      body = { success: false, code: 'IDEMPOTENCY_KEY_INVALID', message: 'Idempotency key must be a UUID' };
    } else if (errorMessage.includes('could not find function') || errorCode === 'SERVER_MISCONFIG') {
      status = 500;
      body = { success: false, code: 'SERVER_MISCONFIG', message: 'Server misconfiguration' };
    }

    console.error(`${logPrefix} Failed to spend token: user_id=${userId} attemptId=${idemKeyValue} error=${errorMessage} status=${status}`);
    console.log(`${logPrefix} telemetry status=${status}`, JSON.stringify({ attemptId: idemKeyValue, userId, outcome: 'spend:error' }));

    return withDecodeHeaders(json(body, status));
  }

  const newBalance = spendResult?.[0]?.balance ?? (oldBalance - 1);
  console.log(`${logPrefix} Token spent successfully: user_id=${userId} new_balance=${newBalance}`, {
    attemptId: idemKeyValue,
  });
  console.log(`${logPrefix} telemetry`, JSON.stringify({ attemptId: idemKeyValue, userId, outcome: 'spend:ok', balance: newBalance }));

  let body: Body;
  try {
    body = await req.json() as Body;
  } catch (e) {
    console.log(`${logPrefix} Invalid JSON`);
    await refundToken(dbClient, userData.id, logPrefix);
    const status = 422;
    console.log(`${logPrefix} telemetry status=${status}`, JSON.stringify({ attemptId: idemKeyValue, userId, outcome: 'decode:invalid_json' }));
    return withDecodeHeaders(json({ success: false, error: 'invalid input', message: 'invalid input', code: 'INVALID_INPUT' }, status));
  }

  const hasBase64 = body?.base64 && body?.mimeType;
  const hasImageUrl = body?.imageUrl;

  if (!hasBase64 && !hasImageUrl) {
    console.log(`${logPrefix} Missing image data`);
    await refundToken(dbClient, userData.id, logPrefix);
    const status = 422;
    console.log(`${logPrefix} telemetry status=${status}`, JSON.stringify({ attemptId: idemKeyValue, userId, outcome: 'decode:invalid_payload' }));
    return withDecodeHeaders(json({ success: false, error: 'invalid input', message: 'invalid input', code: 'INVALID_INPUT' }, status));
  }

  const defaultModel = 'gemini-2.5-flash';
  const model = body.model || defaultModel;

  if (!ALLOWED_MODELS.includes(model)) {
    console.log(`${logPrefix} Invalid model: ${model}`);
    await refundToken(dbClient, userData.id, logPrefix);
    const status = 422;
    console.log(`${logPrefix} telemetry status=${status}`, JSON.stringify({ attemptId: idemKeyValue, userId, outcome: 'decode:invalid_model' }));
    return withDecodeHeaders(json({ success: false, error: 'invalid input', message: 'invalid input', code: 'INVALID_INPUT' }, status));
  }

  console.log(`${logPrefix} Starting decode model=${model}`);

  const startTime = Date.now();
  let text: string;

  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), DECODE_TIMEOUT_MS);

    try {
      const prompt = `Analyze this image and return a JSON object with the following structure:
{
  "styleCodes": ["--sref 123456789", "--profile abc", "--moodboard xyz"],
  "tags": ["minimalist", "modern", "clean", "geometric"],
  "subjects": ["abstract shapes", "architecture", "composition"],
  "prompts": {
    "story": "A narrative prompt describing the image's story",
    "mix": "A Midjourney prompt mixing styles: /imagine prompt: ...",
    "expand": "An expanded detailed prompt for regeneration",
    "sound": "A sound design prompt describing the audio atmosphere"
  }
}

Focus on:
- Style codes: Midjourney style references (--sref), profiles, moodboards
- Tags: Style descriptors, techniques, mood
- Subjects: Main visual elements
- Prompts: Creative variations for different use cases

Return ONLY valid JSON, no markdown formatting.`;

      const result = await Promise.race([
        callGeminiREST(env, {
          base64: body.base64,
          mimeType: body.mimeType,
          imageUrl: body.imageUrl,
          model: model === 'gemini-2.5-flash' ? 'gemini-2.0-flash-exp' : 'gemini-2.0-flash-exp',
          prompt
        }, abortController.signal),
        new Promise<never>((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error('DECODE_TIMEOUT'));
          });
        })
      ]);

      text = result.text;
      clearTimeout(timeoutId);
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.message === 'DECODE_TIMEOUT') {
        const ms = Date.now() - startTime;
        console.log(`${logPrefix} Timeout ms=${ms}`);
        await refundToken(dbClient, userData.id, logPrefix);
        const status = 504;
        console.log(`${logPrefix} telemetry status=${status}`, JSON.stringify({ attemptId: idemKeyValue, userId, outcome: 'decode:timeout' }));
        return withDecodeHeaders(json({
          success: false,
          error: 'decode timeout',
          message: 'decode timeout',
          code: 'DECODE_TIMEOUT'
        }, status));
      }
      throw error;
    }
  } catch (error: any) {
    const ms = Date.now() - startTime;
    console.error(`${logPrefix} Provider error ms=${ms}`);
    await refundToken(dbClient, userData.id, logPrefix);
    const status = 500;
    console.log(`${logPrefix} telemetry status=${status}`, JSON.stringify({ attemptId: idemKeyValue, userId, outcome: 'decode:error' }));
    return withDecodeHeaders(json({
      success: false,
      error: 'Server misconfiguration',
      message: 'Server misconfiguration',
      code: 'SERVER_MISCONFIG'
    }, status));
  }

  const ms = Date.now() - startTime;
  console.log(`${logPrefix} Success ms=${ms}`);
  console.log(`${logPrefix} telemetry status=200`, JSON.stringify({ attemptId: idemKeyValue, userId, outcome: 'decode:ok', ms }));

  await dbClient.from('decodes').insert({
    user_id: userData.id,
    input_media_id: null,
    model: model,
    raw_json: { text },
    normalized_json: { content: text },
    cost_tokens: 1,
    private: true
  });

  return withDecodeHeaders(json({
    success: true,
    result: {
      content: text,
      tokensUsed: 1
    }
  }));
}

async function refundToken(dbClient: any, userId: string, logPrefix: string): Promise<void> {
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
    } else {
      console.error(`${logPrefix} Refund failed to get balance: user_id=${userId} error=${error?.message}`);
    }
  } catch (e) {
    console.error(`${logPrefix} Refund error: user_id=${userId}`, e);
  }
}
