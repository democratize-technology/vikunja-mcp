/**
 * CSV Parser utilities for parsing CSV formatted strings according to RFC 4180.
 *
 * This module provides functions to parse CSV lines with proper handling of:
 * - Quoted fields containing commas
 * - Escaped quotes within quoted fields (double quotes)
 * - Empty fields
 * - Whitespace trimming
 */

/**
 * Parses a single CSV line into an array of fields.
 *
 * Implements RFC 4180 compliance:
 * - Fields may be enclosed in double quotes
 * - Fields containing commas, quotes, or newlines must be quoted
 * - Quotes within fields are escaped by doubling them (""")
 * - Empty fields are returned as empty strings
 * - Leading/trailing whitespace is trimmed from unquoted fields
 *
 * @param line - The CSV line to parse
 * @returns Array of parsed field values
 *
 * @example
 * ```typescript
 * parseCSVLine('title,description,done')
 * // Returns: ['title', 'description', 'done']
 *
 * parseCSVLine('"Task with, comma","Description with ""quotes""",true')
 * // Returns: ['Task with, comma', 'Description with "quotes"', 'true']
 *
 * parseCSVLine('simple,"quoted, with, commas",unquoted')
 * // Returns: ['simple', 'quoted, with, commas', 'unquoted']
 * ```
 */
export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Don't forget the last field
  result.push(current.trim());
  return result;
}