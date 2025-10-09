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
  let imageBlock: any;

  if (input.base64 && input.mimeType) {
    const cleanBase64 = input.base64.replace(/\s+/g, '').replace(/^data:[^;]+;base64,/, '');
    const dataUri = `data:${input.mimeType};base64,${cleanBase64}`;
    imageBlock = { type: 'input_image', image_url: dataUri };
    console.log(`${logPrefix} Using base64 data URI (${dataUri.length} chars)`);
  } else if (input.imageUrl) {
    imageBlock = { type: 'input_image', image_url: input.imageUrl };
    console.log(`${logPrefix} Using image URL: ${input.imageUrl}`);
  } else {
    throw new Error('Either base64+mimeType or imageUrl must be provided');
  }

  // ---- Build Responses API payload ----
  const requestBody = {
    model: actualModel,
    instructions: AI_DECODE_PROMPT,
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'Analyze this image based on the given style and structure.' },
          imageBlock
        ]
      }
    ],
    store: false,
    max_output_tokens: 16000
  };

  // Log sanitized preview
  const preview = JSON.parse(JSON.stringify(requestBody));
  if (preview.input?.[0]?.content?.[1]?.image_url?.startsWith('data:')) {
    preview.input[0].content[1].image_url = '<data-uri>';
  }
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

  const result = extractAndParseJSON(content, logPrefix);
  const latencyMs = Date.now() - startTime;

  console.log(`${logPrefix} Decode completed successfully`, { latencyMs, model: actualModel });
  return { result, latencyMs };
}
