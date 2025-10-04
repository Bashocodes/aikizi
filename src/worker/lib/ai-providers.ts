import type { Env } from '../types';

export interface DecodeResult {
  styleCodes: string[];
  tags: string[];
  subjects: string[];
  prompts: {
    story: string;
    mix: string;
    expand: string;
    sound: string;
  };
  meta: {
    model: string;
    latencyMs: number;
  };
}

const SYSTEM_PROMPT = `Analyze this image and return a JSON object with the following structure:
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

export async function callOpenAI(imageUrl: string, model: string, env: Env): Promise<DecodeResult> {
  const startTime = Date.now();

  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: model === 'gpt-5' ? 'gpt-4o' : 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 1500,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[OpenAI] Error:', response.status, error);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const latencyMs = Date.now() - startTime;

  return {
    styleCodes: parsed.styleCodes || [],
    tags: parsed.tags || [],
    subjects: parsed.subjects || [],
    prompts: {
      story: parsed.prompts?.story || '',
      mix: parsed.prompts?.mix || '',
      expand: parsed.prompts?.expand || '',
      sound: parsed.prompts?.sound || ''
    },
    meta: {
      model: model,
      latencyMs
    }
  };
}

export async function callGemini(imageUrl: string, model: string, env: Env): Promise<DecodeResult> {
  const startTime = Date.now();

  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const imageData = await fetch(imageUrl);
  const imageBuffer = await imageData.arrayBuffer();
  const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

  const geminiModel = model === 'gemini-2.5-pro' ? 'gemini-2.0-flash-exp' : 'gemini-2.0-flash-exp';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: SYSTEM_PROMPT
            },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1500
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[Gemini] Error:', response.status, error);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.candidates[0]?.content?.parts[0]?.text;

  if (!content) {
    throw new Error('No content in Gemini response');
  }

  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const latencyMs = Date.now() - startTime;

  return {
    styleCodes: parsed.styleCodes || [],
    tags: parsed.tags || [],
    subjects: parsed.subjects || [],
    prompts: {
      story: parsed.prompts?.story || '',
      mix: parsed.prompts?.mix || '',
      expand: parsed.prompts?.expand || '',
      sound: parsed.prompts?.sound || ''
    },
    meta: {
      model: model,
      latencyMs
    }
  };
}

export async function callAIProvider(imageUrl: string, model: string, env: Env): Promise<DecodeResult> {
  const provider = model.startsWith('gpt-') ? 'openai' : 'gemini';

  console.log(`[AI] Calling ${provider} with model ${model}`);

  if (provider === 'openai') {
    return callOpenAI(imageUrl, model, env);
  } else {
    return callGemini(imageUrl, model, env);
  }
}
