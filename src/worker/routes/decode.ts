import { json } from '../lib/json';
import { supa } from '../lib/supa';
import { cors } from '../lib/cors';
import { requireUser } from '../lib/auth';
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
  const { data: userData } = await dbClient.from('users').select('id').eq('auth_id', authResult.user.id).single();

  if (!userData) {
    console.log(`${logPrefix} User not found in DB`);
    return cors(json({ success: false, error: 'auth required' }, 401));
  }

  const { data: entitlementData } = await dbClient
    .from('entitlements')
    .select('tokens_balance')
    .eq('user_id', userData.id)
    .single();

  if (!entitlementData || entitlementData.tokens_balance < 1) {
    console.log(`${logPrefix} Insufficient tokens`);
    return cors(json({ success: false, error: 'insufficient tokens' }, 402));
  }

  const { error: spendError } = await dbClient
    .from('entitlements')
    .update({ tokens_balance: entitlementData.tokens_balance - 1 })
    .eq('user_id', userData.id);

  if (spendError) {
    console.error(`${logPrefix} Failed to spend token`);
    return cors(json({ success: false, error: 'internal error' }, 500));
  }

  console.log(`${logPrefix} Spent 1 token`);

  let body: Body;
  try {
    body = await req.json() as Body;
  } catch (e) {
    console.log(`${logPrefix} Invalid JSON`);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'invalid input' }, 422));
  }

  const hasBase64 = body?.base64 && body?.mimeType;
  const hasImageUrl = body?.imageUrl;

  if (!hasBase64 && !hasImageUrl) {
    console.log(`${logPrefix} Missing image data`);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'invalid input' }, 422));
  }

  const defaultModel = 'gemini-2.5-flash';
  const model = body.model || defaultModel;

  if (!ALLOWED_MODELS.includes(model)) {
    console.log(`${logPrefix} Invalid model: ${model}`);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'invalid input' }, 422));
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
        return cors(json({ success: false, error: 'decode timeout' }, 504));
      }
      throw error;
    }
  } catch (error: any) {
    const ms = Date.now() - startTime;
    console.error(`${logPrefix} Provider error ms=${ms}`);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'internal error' }, 500));
  }

  const ms = Date.now() - startTime;
  console.log(`${logPrefix} Success ms=${ms}`);

  await dbClient.from('decodes').insert({
    user_id: userData.id,
    input_media_id: null,
    model: model,
    raw_json: { text },
    normalized_json: { content: text },
    cost_tokens: 1,
    private: true
  });

  return cors(json({
    success: true,
    result: {
      content: text,
      tokensUsed: 1
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
    console.error(`${logPrefix} Refund error`);
  }
}
