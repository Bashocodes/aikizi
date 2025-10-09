export const AI_DECODE_PROMPT = `Analyze this image and return ONLY a valid JSON object with the following structure. Do not include any markdown formatting, code blocks, or additional text. The response MUST start with '{' and end with '}'.

{
  "title": "string",
  "style": "string",
  "prompt": "string",
  "keyTokens": ["string", "string", "string", "string", "string", "string", "string"],
  "creativeRemixes": ["string", "string", "string"],
  "outpaintingPrompts": ["string", "string", "string"],
  "animationPrompts": ["string", "string", "string"],
  "musicPrompts": ["string", "string", "string"],
  "dialoguePrompts": ["string", "string", "string"],
  "storyPrompts": ["string", "string", "string"]
}

STRICT REQUIREMENTS FOR EACH FIELD:
- "title": A creative title for the image. Must be exactly 2 to 3 words long.
- "style": A creative description of the art style. Must be exactly 3 to 4 words long.
- "prompt": A complete and detailed scene description. Must be exactly 25 to 40 words long. Describe the image comprehensively including composition, subjects, mood, and visual details.
- "keyTokens": An array containing EXACTLY 7 descriptive tokens. Each token must be exactly 2 words long. Focus on style elements, techniques, subjects, colors, mood, and distinctive visual features.
- "creativeRemixes": An array containing EXACTLY 3 reimagined descriptions. Each description must be between 15 and 21 words long. Present alternative interpretations or creative variations of the image concept.
- "outpaintingPrompts": An array containing EXACTLY 3 prompts to expand the scene beyond its current frame. Each prompt must be between 15 and 21 words long. Describe what could exist outside the current composition.
- "animationPrompts": An array containing EXACTLY 3 video animation descriptions. Each prompt must be between 15 and 21 words long. Describe potential 5-second animations that would bring elements of this image to life.
- "musicPrompts": An array containing EXACTLY 3 music style descriptions. Each description must be between 150 and 180 characters long. Describe musical atmospheres, instrumentation, tempo, and mood that would complement the visual aesthetic.
- "dialoguePrompts": An array containing EXACTLY 3 dialogue or narration prompts. Each prompt must be between 5 and 10 words long. These could be spoken words, internal thoughts, or narrative captions.
- "storyPrompts": An array containing EXACTLY 3 unique story concepts inspired by the image. Each concept must be between 15 and 21 words long. Develop different narrative directions the image could inspire.

IMPORTANT:
- Your response MUST be a single, valid JSON object.
- DO NOT include any introductory or concluding remarks.
- DO NOT wrap the JSON in markdown code blocks (e.g., \`\`\`json).
- Adhere strictly to the word and character counts for each field.
- Ensure all array fields contain the exact number of elements specified.
- All string values must be non-empty and meaningful.
- Focus on the actual visual content and style of the image provided.`;
