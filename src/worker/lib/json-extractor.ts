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
    hasStyleCodes: Array.isArray(parsed.styleCodes),
    hasTags: Array.isArray(parsed.tags),
    hasSubjects: Array.isArray(parsed.subjects),
    hasPrompts: typeof parsed.prompts === 'object' && parsed.prompts !== null
  });

  // Validate and normalize styleCodes
  const styleCodes = Array.isArray(parsed.styleCodes)
    ? parsed.styleCodes.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : [];

  // Validate and normalize tags
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((t: any) => typeof t === 'string' && t.trim().length > 0)
    : [];

  // Validate and normalize subjects
  const subjects = Array.isArray(parsed.subjects)
    ? parsed.subjects.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : [];

  // Validate and normalize prompts
  const prompts = {
    story: typeof parsed.prompts?.story === 'string' ? parsed.prompts.story.trim() : '',
    mix: typeof parsed.prompts?.mix === 'string' ? parsed.prompts.mix.trim() : '',
    expand: typeof parsed.prompts?.expand === 'string' ? parsed.prompts.expand.trim() : '',
    sound: typeof parsed.prompts?.sound === 'string' ? parsed.prompts.sound.trim() : ''
  };

  const result: DecodeResult = {
    styleCodes,
    tags,
    subjects,
    prompts
  };

  console.log(`${logPrefix} Validation complete`, {
    styleCodesCount: styleCodes.length,
    tagsCount: tags.length,
    subjectsCount: subjects.length,
    hasStoryPrompt: prompts.story.length > 0,
    hasMixPrompt: prompts.mix.length > 0,
    hasExpandPrompt: prompts.expand.length > 0,
    hasSoundPrompt: prompts.sound.length > 0
  });

  // Check if we have minimal valid data
  if (styleCodes.length === 0 && tags.length === 0 && subjects.length === 0) {
    console.warn(`${logPrefix} Warning: No array data extracted from response`);
  }

  if (!prompts.story && !prompts.mix && !prompts.expand && !prompts.sound) {
    console.warn(`${logPrefix} Warning: No prompt data extracted from response`);
  }

  return result;
}
