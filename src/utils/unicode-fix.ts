/**
 * Unicode Fix Utility
 *
 * Handles literal unicode escape sequences in data that may come from
 * API responses containing escaped unicode characters.
 */

/**
 * Check if a string contains literal unicode escape sequences
 */
export function hasLiteralUnicodeEscapes(input: unknown): boolean {
  if (typeof input !== 'string') {
    return false;
  }

  // Look for literal unicode patterns like \ud83d\udc65 or \u26a1
  return /\\u[0-9a-fA-F]{4,6}/g.test(input);
}

/**
 * Fix literal unicode escape sequences in a string
 */
export function fixLiteralUnicodeEscapes(input: unknown): unknown {
  if (typeof input !== 'string') {
    return input;
  }

  // Replace literal unicode escapes with actual unicode characters
  // Handle both 4-digit and longer sequences
  return input.replace(/\\u([0-9a-fA-F]{4,6})/g, (match: string, hex: string) => {
    try {
      // Parse the hex value and convert to unicode character
      const codePoint = parseInt(hex, 16);
      return String.fromCodePoint(codePoint);
    } catch {
      // If parsing fails, return the original match
      return match;
    }
  });
}

/**
 * Fix literal unicode escape sequences in nested data structures
 */
export function fixLiteralUnicodeEscapesInData(input: unknown): unknown {
  // Handle primitive values
  if (typeof input === 'string') {
    return fixLiteralUnicodeEscapes(input);
  }

  // Handle null/undefined
  if (input === null || input === undefined) {
    return input;
  }

  // Handle arrays
  if (Array.isArray(input)) {
    return input.map(item => fixLiteralUnicodeEscapesInData(item));
  }

  // Handle objects
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = fixLiteralUnicodeEscapesInData(value);
    }
    return result;
  }

  // Handle other primitives (numbers, booleans)
  return input;
}