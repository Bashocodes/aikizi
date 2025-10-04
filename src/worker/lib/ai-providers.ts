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

export aasync function callGemini(
  env: Env,
  imageBase64: string | undefined,
  prompt: string,
  model: string
): Promise<{ content: string; metadata?: any }> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  // Build the minimal parts array without any spread/circular refs
  const parts: any[] = [{ text: prompt }];
  if (imageBase64 && imageBase64.length > 0) {
    // Trim whitespace to avoid accidental very long strings
    const data = imageBase64.replace(/\s+/g, "");
    parts.push({
      inlineData: { mimeType: "image/jpeg", data },
    });
  }

  // Minimal, schema-correct payload
  const payload = { contents: [{ role: "user", parts }] };

  // IMPORTANT: JSON.stringify can blow up on circulars; force a safe stringify
  const body = JSON.stringify(payload, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v
  );

  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(
    model
  )}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Gemini HTTP ${res.status} ${res.statusText}${
        text ? ` — ${text.slice(0, 300)}` : ""
      }`
    );
  }

  const json = (await res.json()) as any;

  // Robust extraction
  const candidate = json?.candidates?.[0];
  const partsOut: any[] = candidate?.content?.parts ?? [];
  const textOut =
    partsOut
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("\n")
      .trim() || "";

  return { content: textOut, metadata: { raw: undefined } }; // avoid echoing huge JSON
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
