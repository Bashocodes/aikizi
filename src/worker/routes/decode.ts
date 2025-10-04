import { json, bad } from '../lib/json';
import { supa } from '../lib/supa';
import { idemKey } from '../lib/idem';
import { cors } from '../lib/cors';
import { requireUser } from '../lib/auth';
import { callAIProvider } from '../lib/ai-providers';
import type { Env } from '../types';

type Body = { imageUrl?: string, image_url?: string, fileId?: string, model?: string };

const ALLOWED_MODELS = ['gpt-5', 'gpt-5-mini', 'gemini-2.5-pro', 'gemini-2.5-flash'];
const DECODE_TIMEOUT_MS = 55000;

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

  const key = idemKey(req);
  if (!key) {
    console.log(`${logPrefix} Missing idem-key header`);
    return cors(bad('idem-key required', 400));
  }

  const dbClient = supa(env);
  const spend = await dbClient.rpc('spend_tokens', { p_cost: 1, p_idem_key: key });

  if (spend.error) {
    console.log(`${logPrefix} Spend tokens failed: ${spend.error.message}`);
    const errorCode = spend.error.message.includes('insufficient') ? 'NO_TOKENS' : 'SPEND_FAILED';
    const statusCode = errorCode === 'NO_TOKENS' ? 402 : 400;
    return cors(json({ ok: false, error: spend.error.message.includes('insufficient') ? 'insufficient tokens' : 'spend failed', code: errorCode }, statusCode));
  }

  let body: Body;
  try {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      body = {
        image_url: formData.get('image_url') as string || '',
        model: formData.get('model') as string || undefined,
      };
    } else {
      body = await req.json() as Body;
    }
  } catch (e) {
    console.log(`${logPrefix} Failed to parse body:`, e);
    return cors(bad('invalid request body', 400));
  }

  const imageUrl = body?.imageUrl || body?.image_url;
  if (!imageUrl) {
    console.log(`${logPrefix} Missing imageUrl`);
    return cors(bad('imageUrl required', 400));
  }

  const model = body.model || 'gpt-5';
  if (!ALLOWED_MODELS.includes(model)) {
    console.log(`${logPrefix} Invalid model: ${model}`);
    return cors(bad(`model must be one of: ${ALLOWED_MODELS.join(', ')}`, 400));
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
        console.log(`${logPrefix} decodeOutcome=TIMEOUT ms=${Date.now() - startTime}`);
        return cors(json({ ok: false, error: 'DECODE_TIMEOUT', code: 'DECODE_TIMEOUT' }, 504));
      }
      throw error;
    }
  } catch (error: any) {
    const ms = Date.now() - startTime;
    console.error(`${logPrefix} decodeOutcome=PROVIDER_ERROR ms=${ms} error=${error.message}`);
    return cors(json({ ok: false, error: 'PROVIDER_ERROR', code: 'PROVIDER_ERROR', detailsMasked: true }, 502));
  }

  const { data: userData } = await dbClient.from('users').select('id').eq('auth_id', user.id).single();

  const { data: decodeRecord } = await dbClient.from('decodes').insert({
    user_id: userData?.id || null,
    input_media_id: null,
    model: model,
    raw_json: {},
    normalized_json: result,
    cost_tokens: 1,
    private: true
  }).select('id').single();

  const ms = Date.now() - startTime;
  console.log(`${logPrefix} decodeOutcome=OK userId=${user.id} model=${model} provider=${aiProvider} ms=${ms}`);

  return cors(json({ ok: true, decodeId: decodeRecord?.id, result }));
}

