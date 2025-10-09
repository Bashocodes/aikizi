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

  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  // Verify API key format
  const keyPrefix = env.OPENAI_API_KEY.substring(0, 7);
  console.log(`${logPrefix} API key loaded: ${keyPrefix}... (length: ${env.OPENAI_API_KEY.length})`);

  if (!env.OPENAI_API_KEY.startsWith('sk-')) {
    console.error(`${logPrefix} Invalid API key format - should start with 'sk-'`);
    throw new Error('Invalid OPENAI_API_KEY format');
  }

  // Map model names to actual OpenAI model identifiers
  const modelMap: Record<string, string> = {
    'gpt-5': 'gpt-5',
    'gpt-5-mini': 'gpt-5-mini',
  };

  const actualModel = modelMap[input.model] || 'gpt-5';
  console.log(`${logPrefix} Using model: ${input.model} -> ${actualModel}`);

  // Build the image content for Responses API
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

  // Construct the Responses API request
  // Using the new Responses API format for GPT-5
  // Note: Responses API uses 'max_output_tokens' instead of 'max_completion_tokens'
  const requestBody: any = {
    model: actualModel,
    instructions: AI_DECODE_PROMPT,
    input: [imageContent],
    store: false,
    max_output_tokens: 16000
  };

  const requestBodyStr = JSON.stringify(requestBody);
  console.log(`${logPrefix} Request prepared (Responses API)`, {
    model: actualModel,
    bodySize: requestBodyStr.length,
    hasSignal: !!signal,
    imageType: input.base64 ? 'base64' : 'url',
    imageSize: input.base64 ? input.base64.length : (input.imageUrl?.length || 0),
    maxOutputTokens: 16000
  });

  console.log(`${logPrefix} Sending request to OpenAI Responses API...`);
  const fetchStart = Date.now();

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`
      },
      body: requestBodyStr,
      signal
    });

    const fetchDuration = Date.now() - fetchStart;
    console.log(`${logPrefix} Fetch completed in ${fetchDuration}ms, status: ${response.status}`);
  } catch (fetchError: any) {
    const fetchDuration = Date.now() - fetchStart;
    console.error(`${logPrefix} Fetch failed after ${fetchDuration}ms`, {
      error: fetchError.message,
      name: fetchError.name,
      cause: fetchError.cause
    });
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`${logPrefix} Responses API error: ${response.status} ${response.statusText}`, {
      errorPreview: errorText.substring(0, 500),
      errorLength: errorText.length,
      headers: Object.fromEntries(response.headers.entries())
    });

    // Try to parse error as JSON for more details
    try {
      const errorJson = JSON.parse(errorText);
      console.error(`${logPrefix} Parsed error:`, errorJson);
    } catch {
      console.error(`${logPrefix} Raw error text:`, errorText);
    }

    throw new Error(`OpenAI Responses API error: ${response.status} ${response.statusText}`);
  }

  const responseData = await response.json();
  console.log(`${logPrefix} Response received`, {
    hasOutput: Array.isArray(responseData.output),
    outputCount: responseData.output?.length || 0,
    responseId: responseData.id,
    object: responseData.object
  });

  // Parse the Responses API output array
  if (!Array.isArray(responseData.output) || responseData.output.length === 0) {
    console.error(`${logPrefix} No output items in response`, { responseData });
    throw new Error('No output in OpenAI Responses API response');
  }

  // Log all output items for debugging
  console.log(`${logPrefix} Output items:`, responseData.output.map((item: any) => ({
    id: item.id,
    type: item.type,
    status: item.status,
    hasContent: Array.isArray(item.content),
    contentLength: item.content?.length || 0
  })));

  // Find the message item in the output array
  const messageItem = responseData.output.find((item: any) => item.type === 'message');

  if (!messageItem) {
    console.error(`${logPrefix} No message item found in output`, {
      outputTypes: responseData.output.map((item: any) => item.type)
    });
    throw new Error('No message item in OpenAI Responses API output');
  }

  console.log(`${logPrefix} Message item found`, {
    id: messageItem.id,
    status: messageItem.status,
    role: messageItem.role,
    hasContent: Array.isArray(messageItem.content),
    contentCount: messageItem.content?.length || 0
  });

  // Extract text content from the message item
  let content: string | null = null;

  if (Array.isArray(messageItem.content) && messageItem.content.length > 0) {
    // Find the output_text content type
    const textContent = messageItem.content.find((c: any) => c.type === 'output_text');

    if (textContent && textContent.text) {
      content = textContent.text;
      console.log(`${logPrefix} Content extracted from output_text`, {
        contentLength: content.length
      });
    } else {
      // Fallback: try to extract text from any content item
      content = messageItem.content
        .map((c: any) => {
          if (c.text) return c.text;
          if (c.content) return c.content;
          if (typeof c === 'string') return c;
          return '';
        })
        .join('\n')
        .trim();

      if (content) {
        console.log(`${logPrefix} Content extracted from fallback method`, {
          contentLength: content.length
        });
      }
    }
  }

  // Check message status
  if (messageItem.status !== 'completed') {
    console.warn(`${logPrefix} Message status is not completed`, {
      status: messageItem.status,
      hasContent: !!content
    });
  }

  // Final validation
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    console.error(`${logPrefix} No valid content extracted`, {
      contentExists: !!content,
      contentType: typeof content,
      contentLength: content?.length || 0,
      messageItemStructure: JSON.stringify(messageItem).substring(0, 500)
    });
    throw new Error('No content in OpenAI Responses API message item');
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
    model: actualModel,
    apiType: 'Responses API'
  });

  return {
    result,
    latencyMs
  };
}
