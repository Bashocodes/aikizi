import { extractAndParseJSON, type DecodeResult } from '../lib/json-extractor';
import { AI_DECODE_PROMPT } from '../lib/ai-prompt';

export interface OpenAIDecodeInput {
  base64?: string;
  mimeType?: string;
  imageUrl?: string;
  model: string;
}

export interface OpenAIDecodeResult {
  result: DecodeResult;
  latencyMs: number;
}

/**
 * Call OpenAI Responses API with vision capabilities to analyze an image
 * Uses the new Responses API for GPT-5 models
 * Supports both base64 encoded images and image URLs
 */
export async function callOpenAIREST(
  env: any,
  input: OpenAIDecodeInput,
  signal?: AbortSignal
): Promise<OpenAIDecodeResult> {
  const startTime = Date.now();
  const logPrefix = '[OpenAI]';

  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

  const keyPrefix = env.OPENAI_API_KEY.substring(0, 7);
  console.log(`${logPrefix} API key loaded: ${keyPrefix}... (length: ${env.OPENAI_API_KEY.length})`);

  if (!env.OPENAI_API_KEY.startsWith('sk-')) {
    console.error(`${logPrefix} Invalid API key format - should start with 'sk-'`);
    throw new Error('Invalid OPENAI_API_KEY format');
  }

  const modelMap: Record<string, string> = {
    'gpt-5': 'gpt-5',
    'gpt-5-mini': 'gpt-5-mini'
  };

  const actualModel = modelMap[input.model] || 'gpt-5';
  console.log(`${logPrefix} Using model: ${input.model} -> ${actualModel}`);

  // ---- Build image block for Responses API ----
  const clean = input.base64?.replace(/\s+/g, '').replace(/^data:[^;]+;base64,/, '');
  const dataUri = input.base64 && input.mimeType
    ? `data:${input.mimeType};base64,${clean}`
    : undefined;
  const imageBlock = { type: 'input_image', image_url: dataUri ?? input.imageUrl };

  if (!imageBlock.image_url) {
    throw new Error('Either base64+mimeType or imageUrl must be provided');
  }

  console.log(`${logPrefix} Image block prepared (${typeof imageBlock.image_url === 'string' && imageBlock.image_url.startsWith('data:') ? `data URI, ${imageBlock.image_url.length} chars` : `URL: ${imageBlock.image_url}`})`);

  // Warn if data URI is too large
  if (typeof imageBlock.image_url === 'string' && imageBlock.image_url.startsWith('data:') && imageBlock.image_url.length > 1_000_000) {
    console.warn(`${logPrefix} Warning: data URI is ${imageBlock.image_url.length} chars (>1MB). Consider reducing image size to avoid 504 timeouts.`);
  }

  // ---- Build Responses API payload ----
  const requestBody: any = {
    model: actualModel,
    instructions: 'Return JSON exactly matching the schema from the image.',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'Analyze the image and fill the schema.' },
          imageBlock
        ]
      }
    ],
    max_output_tokens: 3000,
    temperature: 0.2,
    store: false
  };

  // ---- Enforce output shape with json_schema ----
  requestBody.response_format = {
    type: 'json_schema',
    json_schema: {
      name: 'styledrop_schema',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          style: { type: 'string' },
          prompt: { type: 'string' },
          keyTokens: { type: 'array', items: { type: 'string' }, minItems: 7, maxItems: 7 },
          creativeRemixes: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
          outpaintingPrompts: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
          animationPrompts: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
          musicPrompts: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
          dialoguePrompts: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
          storyPrompts: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 }
        },
        required: ['title', 'style', 'prompt', 'keyTokens', 'creativeRemixes', 'outpaintingPrompts', 'animationPrompts', 'musicPrompts', 'dialoguePrompts', 'storyPrompts'],
        additionalProperties: false
      },
      strict: true
    }
  };

  // Log sanitized preview
  const preview = JSON.parse(JSON.stringify(requestBody));
  const img = preview.input?.[0]?.content?.find((c: any) => c.type === 'input_image');
  if (img?.image_url?.startsWith('data:')) img.image_url = '<data-uri>';
  console.log(`${logPrefix} Request preview`, preview);

  const bodyStr = JSON.stringify(requestBody);
  console.log(`${logPrefix} Request prepared (Responses API)`, {
    model: actualModel,
    bodySize: bodyStr.length,
    maxOutputTokens: 16000
  });

  // ---- Send to Responses API ----
  const fetchStart = Date.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: bodyStr,
    signal
  });

  console.log(`${logPrefix} Fetch completed in ${Date.now() - fetchStart}ms, status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`${logPrefix} Responses API error: ${response.status}`, errorText.slice(0, 300));
    throw new Error(`OpenAI Responses API error: ${response.status}`);
  }

  const data = await response.json();

  // ---- Parse and extract ----
  const messageItem = data.output?.find((o: any) => o.type === 'message');
  if (!messageItem) throw new Error('No message output found');

  const textBlock = messageItem.content?.find((c: any) => c.type === 'output_text');
  const content = textBlock?.text?.trim() || '';

  if (!content) throw new Error('No output text found in response');

  // With json_schema response_format, the output should be valid JSON directly
  let result: DecodeResult;
  try {
    result = JSON.parse(content);
    console.log(`${logPrefix} Parsed structured JSON output directly`);
  } catch (parseErr) {
    console.warn(`${logPrefix} Structured JSON parse failed, falling back to extraction`, parseErr);
    result = extractAndParseJSON(content, logPrefix);
  }

  const latencyMs = Date.now() - startTime;

  console.log(`${logPrefix} Decode completed successfully`, { latencyMs, model: actualModel });
  return { result, latencyMs };
}
