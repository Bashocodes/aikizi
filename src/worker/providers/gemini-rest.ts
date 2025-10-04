export type GeminiDecodeInput = { base64?: string; mimeType?: string; imageUrl?: string; model: string; prompt?: string };

export async function callGeminiREST(env: any, inp: GeminiDecodeInput, signal?: AbortSignal): Promise<{ text: string }>{
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  const model = inp.model || 'gemini-2.0-flash-exp';
  const prompt = inp.prompt || 'Describe the image precisely. Extract style, subjects, and key tokens. Return concise text.';

  const parts: any[] = [{ text: prompt }];
  if (inp.base64 && inp.mimeType) {
    parts.push({ inline_data: { mime_type: inp.mimeType, data: inp.base64.replace(/\s+/g, '') } });
  } else if (inp.imageUrl) {
    parts.push({ text: `Image URL: ${inp.imageUrl}` });
  }

  const body = { contents: [{ role: 'user', parts }] };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `gemini http ${res.status}`);

  const text = (json?.candidates?.[0]?.content?.parts || [])
    .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
    .join('\n')
    .trim();
  return { text };
}
