import { extractAndParseJSON, type DecodeResult } from '../lib/json-extractor';
import { AI_DECODE_PROMPT } from '../lib/ai-prompt';

export interface GeminiDecodeInput {
  base64?: string;
  mimeType?: string;
  imageUrl?: string;
  model: string;
}

export interface GeminiDecodeResult {
  result: DecodeResult;
  latencyMs: number;
}

/**
 * Call Gemini API to analyze an image
 * Supports both base64 encoded images and image URLs
 */
export async function callGeminiREST(
  env: any,
  input: GeminiDecodeInput,
  signal?: AbortSignal
): Promise<GeminiDecodeResult> {
  const startTime = Date.now();
  const logPrefix = '[Gemini]';

  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  // Map model names to actual Gemini model identifiers
  // Using stable Gemini 2.0 models (2.5 is not yet available in production)
  const modelMap: Record<string, string> = {
    'gemini-2.5-pro': 'gemini-2.0-flash-exp',
    'gemini-2.5-flash': 'gemini-2.0-flash-exp',
  };

  const actualModel = modelMap[input.model] || 'gemini-2.0-flash-exp';
  console.log(`${logPrefix} Using model: ${input.model} -> ${actualModel}`);

  // Build the parts array for Gemini API
  const parts: any[] = [{ text: AI_DECODE_PROMPT }];

  if (input.base64 && input.mimeType) {
    // Use base64 encoded image with inline_data
    const cleanBase64 = input.base64.replace(/\s+/g, '');
    parts.push({
      inline_data: {
        mime_type: input.mimeType,
        data: cleanBase64
      }
    });
    console.log(`${logPrefix} Using base64 image (${input.mimeType}, ${cleanBase64.length} bytes)`);
  } else if (input.imageUrl) {
    // For image URLs, Gemini doesn't support direct URL loading in the same way
    // So we note it in the prompt (caller should ideally fetch and convert to base64)
    parts.push({ text: `Analyze the image provided above.` });
    console.log(`${logPrefix} Image URL provided: ${input.imageUrl}`);
  } else {
    throw new Error('Either base64+mimeType or imageUrl must be provided');
  }

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts
      }
    ]
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(actualModel)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  console.log(`${logPrefix} Sending request to Gemini API`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody),
    signal
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = responseData?.error?.message || `Gemini HTTP ${response.status}`;
    console.error(`${logPrefix} API error: ${response.status}`, {
      errorMessage,
      errorDetails: responseData?.error
    });
    throw new Error(errorMessage);
  }

  console.log(`${logPrefix} Response received`, {
    hasCandidates: Array.isArray(responseData.candidates),
    candidatesCount: responseData.candidates?.length || 0
  });

  // Extract text from Gemini's response format
  const parts_out = responseData?.candidates?.[0]?.content?.parts || [];
  const text = parts_out
    .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
    .join('\n')
    .trim();

  if (!text) {
    console.error(`${logPrefix} No text content in response`, { responseData });
    throw new Error('No content in Gemini response');
  }

  console.log(`${logPrefix} Content received`, {
    textLength: text.length,
    textPreview: text.substring(0, 150)
  });

  // Use universal JSON extraction
  const result = extractAndParseJSON(text, logPrefix);

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
