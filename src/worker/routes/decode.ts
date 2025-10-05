import { json } from '../lib/json';
import { supa } from '../lib/supa';
import { cors } from '../lib/cors';
import { requireUser } from '../lib/auth';
import { callGeminiREST } from '../providers/gemini-rest';
import type { Env } from '../types';

interface DecodeBody {
  image_base64?: string;
  model?: string;
  mime_type?: string;
}

interface AnalysisPayload {
  styleCodes: string[];
  tags: string[];
  subjects: string[];
  story: string;
  mix: string;
  expand: string;
  sound: string;
}

const ALLOWED_MODELS = ['gpt-5', 'gpt-5-mini', 'gemini-2.5-pro', 'gemini-2.5-flash'];
const DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_MODEL_MAP: Record<string, string> = {
  'gemini-2.5-flash': 'gemini-2.0-flash-exp',
  'gemini-2.5-pro': 'gemini-2.0-pro-exp',
};
const DECODE_TIMEOUT_MS = 50000;

export async function decode(env: Env, req: Request, modelParam: string, reqId?: string) {
  const logPrefix = reqId ? `[${reqId}] [decode]` : '[decode]';

  let user;
  try {
    const authResult = await requireUser(env, req, reqId);
    user = authResult.user;
    console.log(`${logPrefix} User authenticated`);
  } catch (error) {
    if (error instanceof Response) {
      return cors(error);
    }
    return cors(json({ success: false, error: 'auth required' }, 401));
  }

  const dbClient = supa(env);
  const { data: userData } = await dbClient
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .single();

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

  let body: DecodeBody;
  try {
    body = (await req.json()) as DecodeBody;
  } catch (error) {
    console.log(`${logPrefix} Invalid JSON`);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'invalid input' }, 422));
  }

  const rawBase64 = typeof body.image_base64 === 'string' ? body.image_base64.trim() : '';
  if (!rawBase64) {
    console.log(`${logPrefix} Missing image_base64`);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'invalid input' }, 422));
  }

  const sanitizedBase64 = rawBase64.replace(/\s+/g, '');

  const requestedModel = (modelParam || body.model || DEFAULT_MODEL).toLowerCase();
  if (!ALLOWED_MODELS.includes(requestedModel)) {
    console.log(`${logPrefix} Invalid model: ${requestedModel}`);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'invalid model' }, 422));
  }

  const mimeType = typeof body.mime_type === 'string' && body.mime_type
    ? body.mime_type
    : 'image/jpeg';

  console.log(`${logPrefix} Starting decode model=${requestedModel}`);
  const startTime = Date.now();
  let analysisText = '';

  try {
    analysisText = await analyzeWithModel(env, requestedModel, sanitizedBase64, mimeType, logPrefix);
  } catch (error) {
    const ms = Date.now() - startTime;
    if (error instanceof Error && error.message === 'DECODE_TIMEOUT') {
      console.warn(`${logPrefix} Timeout ms=${ms}`);
      await refundToken(dbClient, userData.id, logPrefix);
      return cors(json({ success: false, error: 'decode timeout' }, 504));
    }
    console.error(`${logPrefix} Provider error ms=${ms}`, error);
    await refundToken(dbClient, userData.id, logPrefix);
    return cors(json({ success: false, error: 'internal error' }, 500));
  }

  const latencyMs = Date.now() - startTime;
  console.log(`${logPrefix} Success ms=${latencyMs}`);

  const analysis = normalizeAnalysis(analysisText);

  const { data: decodeRecord, error: insertError } = await dbClient
    .from('decodes')
    .insert({
      user_id: userData.id,
      model: requestedModel,
      raw_json: { text: analysisText },
      normalized_json: analysis,
      cost_tokens: 1,
      private: true,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error(`${logPrefix} Failed to save decode:`, insertError);
  }

  return cors(json({
    success: true,
    analysis,
    decodeId: decodeRecord?.id ?? null,
    tokensUsed: 1,
  }));
}

async function analyzeWithModel(
  env: Env,
  model: string,
  base64: string,
  mimeType: string,
  logPrefix: string,
): Promise<string> {
  if (model.startsWith('gemini')) {
    const providerModel = GEMINI_MODEL_MAP[model] || GEMINI_MODEL_MAP[DEFAULT_MODEL];
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

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), DECODE_TIMEOUT_MS);

    try {
      const result = await callGeminiREST(
        env,
        {
          base64,
          mimeType,
          model: providerModel,
          prompt,
        },
        abortController.signal,
      );
      clearTimeout(timeoutId);
      return result.text;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('DECODE_TIMEOUT');
      }
      throw error;
    }
  }

  console.log(`${logPrefix} Using mock analysis for model=${model}`);
  return JSON.stringify({
    styleCodes: [`--sref mock-${model}`, '--profile studio-alpha'],
    tags: ['concept art', 'mock analysis', 'stylized'],
    subjects: ['future city', 'dramatic lighting'],
    story: `Mock analysis generated for ${model}.`,
    mix: `/imagine prompt: futuristic skyline :: model ${model}`,
    expand: `Detailed regeneration prompt for ${model}.`,
    sound: `Immersive ambient soundtrack inspired by ${model}.`,
  });
}

function normalizeAnalysis(payload: unknown): AnalysisPayload {
  const base: AnalysisPayload = {
    styleCodes: [],
    tags: [],
    subjects: [],
    story: '',
    mix: '',
    expand: '',
    sound: '',
  };

  if (!payload) {
    return base;
  }

  if (typeof payload === 'string') {
    const cleaned = payload.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return normalizeAnalysis(parsed);
    } catch {
      return { ...base, story: cleaned };
    }
  }

  const record = payload as Record<string, unknown>;
  const prompts =
    record['prompts'] && typeof record['prompts'] === 'object'
      ? (record['prompts'] as Record<string, unknown>)
      : undefined;

  const toStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];

  const toString = (value: unknown): string => (typeof value === 'string' ? value : '');

  const story = toString(record['story']) || (prompts ? toString(prompts['story']) : '');
  const mix = toString(record['mix']) || (prompts ? toString(prompts['mix']) : '');
  const expand = toString(record['expand']) || (prompts ? toString(prompts['expand']) : '');
  const sound = toString(record['sound']) || (prompts ? toString(prompts['sound']) : '');

  const styleCodesRaw = record['styleCodes'] ?? record['style_codes'];

  return {
    styleCodes: toStringArray(styleCodesRaw),
    tags: toStringArray(record['tags']),
    subjects: toStringArray(record['subjects']),
    story,
    mix,
    expand,
    sound,
  };
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
  } catch (error) {
    console.error(`${logPrefix} Refund error`, error);
  }
}
