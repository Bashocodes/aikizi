export const AI_DECODE_PROMPT = `Analyze this image and return ONLY a valid JSON object with the following structure. Do not include any markdown formatting, code blocks, or additional text. The response MUST start with '{' and end with '}'.

{
  "styleCodes": ["string", "string", "string"],
  "tags": ["string", "string", "string", "string"],
  "subjects": ["string", "string", "string"],
  "prompts": {
    "story": "string",
    "mix": "string",
    "expand": "string",
    "sound": "string"
  }
}

STRICT REQUIREMENTS FOR EACH FIELD:
- "styleCodes": An array containing EXACTLY 3 Midjourney-style reference codes. Each code should be a plausible style reference like "--sref 123456789", "--profile abc", or "--moodboard xyz". If the image doesn't clearly suggest specific codes, generate creative but realistic-looking codes that match the image's aesthetic.
- "tags": An array containing EXACTLY 4 descriptive style tags. Each tag must be exactly 1 to 3 words long. Focus on style descriptors, techniques, mood, and artistic qualities (e.g., "minimalist", "vibrant colors", "dramatic lighting", "geometric").
- "subjects": An array containing EXACTLY 3 main visual subjects or elements. Each subject must be exactly 2 to 4 words long (e.g., "abstract shapes", "urban architecture", "portrait composition").
- "prompts.story": A narrative description of the image's story or concept. Must be exactly 20 to 35 words long. Describe what story or emotion the image conveys.
- "prompts.mix": A Midjourney-style prompt that mixes the image's styles. Must be exactly 25 to 40 words long. Start with "/imagine prompt: " followed by a detailed prompt that captures the image's aesthetic and could be used to generate similar images.
- "prompts.expand": An expanded, detailed prompt for image regeneration or variation. Must be exactly 30 to 50 words long. Include specific details about composition, lighting, color palette, and style that would help recreate or expand upon this image.
- "prompts.sound": A sound design or music prompt describing the audio atmosphere that would complement this image. Must be exactly 20 to 35 words long. Describe mood, instrumentation, tempo, or sound effects that match the visual aesthetic.

IMPORTANT:
- Your response MUST be a single, valid JSON object.
- DO NOT include any introductory or concluding remarks.
- DO NOT wrap the JSON in markdown code blocks (e.g., \`\`\`json).
- Adhere strictly to the word counts for each field.
- Ensure all array fields contain the exact number of elements specified.
- All string values must be non-empty and meaningful.
- Focus on the actual visual content and style of the image provided.`;
