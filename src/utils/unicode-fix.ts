/**
 * Unicode handling utilities
 * Fixes double-escaped unicode sequences in API responses
 */

/**
 * Fixes literal unicode escape sequences in strings
 *
 * Strings that contain literal "\uXXXX" sequences will be decoded to actual
 * unicode characters. This handles the case where API data contains escaped
 * unicode that hasn't been properly decoded.
 *
 * @param input - String that may contain literal unicode escape sequences
 * @returns String with properly decoded unicode characters
 */
export function fixLiteralUnicodeEscapes(input: string): string {
  if (typeof input !== 'string') {
    return input as string;
  }

  if (!hasLiteralUnicodeEscapes(input)) {
    return input; // No escapes to fix
  }

  try {
    // Use JSON.parse to decode the unicode sequences
    // We wrap the string in quotes to make it valid JSON
    return JSON.parse(`"${input}"`) as string;
  } catch {
    // If parsing fails, return the original string
    return input;
  }
}

/**
 * Recursively fixes literal unicode escape sequences in data structures
 *
 * @param data - Any data structure that may contain literal unicode escape sequences
 * @returns Data structure with fixed unicode sequences
 */
export function fixLiteralUnicodeEscapesInData(data: unknown): unknown {
  if (typeof data === 'string') {
    return fixLiteralUnicodeEscapes(data);
  } else if (Array.isArray(data)) {
    return data.map(item => fixLiteralUnicodeEscapesInData(item));
  } else if (data !== null && typeof data === 'object') {
    const fixed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      fixed[key] = fixLiteralUnicodeEscapesInData(value);
    }
    return fixed;
  }

  return data;
}

/**
 * Detects if a string contains literal unicode escape sequences
 *
 * This detects strings that contain the literal text "\uXXXX" rather than
 * the actual unicode character. These need to be decoded.
 *
 * @param input - String to check
 * @returns True if literal unicode escape sequences are detected
 */
export function hasLiteralUnicodeEscapes(input: string): boolean {
  if (typeof input !== 'string') {
    return false;
  }

  // Look for literal \uXXXX sequences (backslash followed by u and 4 hex digits)
  // This would match strings like "MCP Test Team \ud83d\udc65" that haven't been decoded
  return /\\u[0-9a-fA-F]{4}/.test(input);
}