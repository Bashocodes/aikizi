export interface DecodeResult {
  title: string;
  style: string;
  prompt: string;
  keyTokens: string[];
  creativeRemixes: string[];
  outpaintingPrompts: string[];
  animationPrompts: string[];
  musicPrompts: string[];
  dialoguePrompts: string[];
  storyPrompts: string[];
}

/**
 * Extract and parse JSON from AI model response text
 * Handles markdown code blocks, backticks, and other formatting artifacts
 * Works consistently across OpenAI, Gemini, Anthropic, and other AI providers
 */
export function extractAndParseJSON(responseText: string, logPrefix: string = '[JSON]'): DecodeResult {
  console.log(`${logPrefix} Starting JSON extraction`, {
    textLength: responseText.length,
    textPreview: responseText.substring(0, 150),
    hasCodeBlockStart: responseText.includes('```json'),
    hasCodeBlockEnd: responseText.includes('```'),
    startsWithBrace: responseText.trim().startsWith('{'),
    endsWithBrace: responseText.trim().endsWith('}')
  });

  let cleanedText = responseText.trim();

  // Strategy 1: Try parsing as-is first (in case it's already clean JSON)
  if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
    try {
      const result = JSON.parse(cleanedText);
      console.log(`${logPrefix} Direct JSON parse successful`);
      return validateAndNormalize(result, logPrefix);
    } catch (directParseError) {
      console.log(`${logPrefix} Direct parse failed, attempting cleaning`, {
        error: directParseError instanceof Error ? directParseError.message : 'Unknown error'
      });
    }
  }

  // Strategy 2: Comprehensive text cleaning
  try {
    console.log(`${logPrefix} Starting comprehensive text cleaning`);

    // Remove all possible markdown code block variations
    cleanedText = cleanedText
      // Remove opening code blocks (case insensitive, with optional whitespace)
      .replace(/^```\s*(?:json|JSON)?\s*\n?/gi, '')
      // Remove closing code blocks
      .replace(/\n?\s*```\s*$/gi, '')
      // Remove any remaining backticks at start/end
      .replace(/^`+|`+$/g, '')
      // Remove any leading/trailing whitespace
      .trim();

    // Strategy 3: Extract JSON object using regex
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedText = jsonMatch[0];
      console.log(`${logPrefix} JSON object extracted using regex`);
    }

    // Strategy 4: Find first { and last } to extract core JSON
    const firstBrace = cleanedText.indexOf('{');
    const lastBrace = cleanedText.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
      console.log(`${logPrefix} JSON boundaries identified and extracted`);
    }

    // Strategy 5: Clean up common JSON formatting issues
    cleanedText = cleanedText
      // Remove trailing commas before closing brackets/braces
      .replace(/,(\s*[}\]])/g, '$1')
      // Remove any control characters that might break parsing
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '');

    console.log(`${logPrefix} Text cleaning completed`, {
      cleanedLength: cleanedText.length,
      cleanedStart: cleanedText.substring(0, 150),
      startsWithBrace: cleanedText.startsWith('{'),
      endsWithBrace: cleanedText.endsWith('}')
    });

    const result = JSON.parse(cleanedText);
    console.log(`${logPrefix} Cleaned JSON parse successful`);
    return validateAndNormalize(result, logPrefix);

  } catch (cleanParseError) {
    console.error(`${logPrefix} All parsing strategies failed`, {
      error: cleanParseError instanceof Error ? cleanParseError.message : 'Unknown error',
      originalText: responseText.substring(0, 500),
      cleanedText: cleanedText.substring(0, 500),
      fullCleanedText: cleanedText
    });

    throw new Error(`Failed to parse AI response: ${cleanParseError instanceof Error ? cleanParseError.message : 'Unknown parsing error'}`);
  }
}

/**
 * Validate and normalize the parsed JSON to ensure it matches expected structure
 */
function validateAndNormalize(parsed: any, logPrefix: string): DecodeResult {
  console.log(`${logPrefix} Validating parsed JSON`, {
    hasTitle: typeof parsed.title === 'string',
    hasStyle: typeof parsed.style === 'string',
    hasPrompt: typeof parsed.prompt === 'string',
    hasKeyTokens: Array.isArray(parsed.keyTokens),
    hasCreativeRemixes: Array.isArray(parsed.creativeRemixes),
    hasOutpaintingPrompts: Array.isArray(parsed.outpaintingPrompts),
    hasAnimationPrompts: Array.isArray(parsed.animationPrompts),
    hasMusicPrompts: Array.isArray(parsed.musicPrompts),
    hasDialoguePrompts: Array.isArray(parsed.dialoguePrompts),
    hasStoryPrompts: Array.isArray(parsed.storyPrompts)
  });

  // Validate and normalize string fields
  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const style = typeof parsed.style === 'string' ? parsed.style.trim() : '';
  const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';

  // Validate and normalize array fields
  const keyTokens = Array.isArray(parsed.keyTokens)
    ? parsed.keyTokens.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : [];

  const creativeRemixes = Array.isArray(parsed.creativeRemixes)
    ? parsed.creativeRemixes.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : [];

  const outpaintingPrompts = Array.isArray(parsed.outpaintingPrompts)
    ? parsed.outpaintingPrompts.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : [];

  const animationPrompts = Array.isArray(parsed.animationPrompts)
    ? parsed.animationPrompts.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : [];

  const musicPrompts = Array.isArray(parsed.musicPrompts)
    ? parsed.musicPrompts.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : [];

  const dialoguePrompts = Array.isArray(parsed.dialoguePrompts)
    ? parsed.dialoguePrompts.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : [];

  const storyPrompts = Array.isArray(parsed.storyPrompts)
    ? parsed.storyPrompts.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : [];

  const result: DecodeResult = {
    title,
    style,
    prompt,
    keyTokens,
    creativeRemixes,
    outpaintingPrompts,
    animationPrompts,
    musicPrompts,
    dialoguePrompts,
    storyPrompts
  };

  console.log(`${logPrefix} Validation complete`, {
    titleLength: title.length,
    styleLength: style.length,
    promptLength: prompt.length,
    keyTokensCount: keyTokens.length,
    creativeRemixesCount: creativeRemixes.length,
    outpaintingPromptsCount: outpaintingPrompts.length,
    animationPromptsCount: animationPrompts.length,
    musicPromptsCount: musicPrompts.length,
    dialoguePromptsCount: dialoguePrompts.length,
    storyPromptsCount: storyPrompts.length
  });

  // Check if we have minimal valid data
  if (!title && !style && !prompt) {
    console.warn(`${logPrefix} Warning: No basic fields (title/style/prompt) extracted from response`);
  }

  const totalArrayItems = keyTokens.length + creativeRemixes.length + outpaintingPrompts.length +
                          animationPrompts.length + musicPrompts.length + dialoguePrompts.length +
                          storyPrompts.length;

  if (totalArrayItems === 0) {
    console.warn(`${logPrefix} Warning: No array data extracted from response`);
  }

  return result;
}
