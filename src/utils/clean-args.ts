/**
 * Utility to clean arguments by removing undefined values
 * This is needed because exactOptionalPropertyTypes requires optional properties
 * to not include undefined in their type
 */

/**
 * Remove undefined values from an object
 */
export function cleanArgs<T extends Record<string, unknown>>(args: T): T {
  const cleaned = {} as T;
  
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) {
      cleaned[key as keyof T] = value as T[keyof T];
    }
  }
  
  return cleaned;
}