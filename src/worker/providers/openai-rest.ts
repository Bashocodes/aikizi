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
 * Call OpenAI API with vision capabilities to analyze an image
 * Supports both base64 encoded images and image URLs
 */
export async function callOpenAIREST(
  env: any,
  input: OpenAIDecodeInput,
  signal?: AbortSignal
): Promise<OpenAIDecodeResult> {
  const startTime = Date.now();
  const logPrefix = '[OpenAI]';

  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  // Map model names to actual OpenAI model identifiers
  // Using the actual model names directly - no mapping needed
  const modelMap: Record<string, string> = {
    'gpt-5': 'gpt-5',
    'gpt-5-mini': 'gpt-5-mini',
  };

  const actualModel = modelMap[input.model] || 'gpt-5';
  console.log(`${logPrefix} Using model: ${input.model} -> ${actualModel}`);

  // Build the image content based on input type
  let imageContent: any;

  if (input.base64 && input.mimeType) {
    // Use base64 encoded image
    const cleanBase64 = input.base64.replace(/\s+/g, '');
    imageContent = {
      type: 'image_url',
      image_url: {
        url: `data:${input.mimeType};base64,${cleanBase64}`
      }
    };
    console.log(`${logPrefix} Using base64 image (${input.mimeType}, ${cleanBase64.length} bytes)`);
  } else if (input.imageUrl) {
    // Use image URL
    imageContent = {
      type: 'image_url',
      image_url: {
        url: input.imageUrl
      }
    };
    console.log(`${logPrefix} Using image URL: ${input.imageUrl}`);
  } else {
    throw new Error('Either base64+mimeType or imageUrl must be provided');
  }

  // Construct the API request
  // GPT-5 models use max_completion_tokens instead of max_tokens
  // GPT-5 only supports temperature=1 (default)
  const isGPT5 = actualModel.startsWith('gpt-5');
  const requestBody: any = {
    model: actualModel,
    messages: [
      {
        role: 'system',
        content: AI_DECODE_PROMPT
      },
      {
        role: 'user',
        content: [imageContent]
      }
    ]
  };

  if (isGPT5) {
    requestBody.max_completion_tokens = 1500;
    // GPT-5 only supports temperature=1, so we omit it (uses default)
  } else {
    requestBody.max_tokens = 1500;
    requestBody.temperature = 0.7;
  }

  console.log(`${logPrefix} Sending request to OpenAI API`);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(requestBody),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`${logPrefix} API error: ${response.status} ${response.statusText}`, {
      errorPreview: errorText.substring(0, 300)
    });
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const responseData = await response.json();
  console.log(`${logPrefix} Response received`, {
    hasChoices: Array.isArray(responseData.choices),
    choicesCount: responseData.choices?.length || 0
  });

  const content = responseData.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string') {
    console.error(`${logPrefix} No content in response`, { responseData });
    throw new Error('No content in OpenAI response');
  }

  console.log(`${logPrefix} Content received`, {
    contentLength: content.length,
    contentPreview: content.substring(0, 150)
  });

  // Use universal JSON extraction
  const result = extractAndParseJSON(content, logPrefix);

  const latencyMs = Date.now() - startTime;
  console.log(`${logPrefix} Decode completed successfully`, {
    latencyMs,
    model: actualModel
  });

  return {
    result,
    latencyMs
  };
}
