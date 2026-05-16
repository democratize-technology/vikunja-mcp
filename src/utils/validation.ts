/**
 * Input validation and sanitization for the Vikunja MCP server.
 *
 * Task titles/descriptions and filter values handled here are only ever sent
 * to the Vikunja REST API as JSON field values. They are never interpolated
 * into SQL, a shell command, a filesystem path or an LDAP/NoSQL query, so the
 * sanitization deliberately does NOT try to detect those injection classes —
 * blocklisting them previously rejected legitimate content (file paths, URLs,
 * prose containing words like "select"/"update", "#", "--", "constructor").
 *
 * It does NOT HTML-escape values: these strings are JSON fields for the
 * Vikunja API, not HTML this wrapper renders. Vikunja shows the task title
 * as plain text (escaping displayed a literal "&#x2F;") and sanitizes the
 * description's HTML itself, so escaping here only corrupted content.
 *
 * What it still does:
 * - Rejection of unambiguous <script>/<iframe> HTML injection
 * - Unicode NFC normalization
 * - Stripping of zero-width / invisible Unicode used for spoofing
 * - Prototype-pollution-safe JSON parsing/stringifying for filter expressions
 */

import { z } from 'zod';
import type { FilterExpression, FilterField, FilterOperator, LogicalOperator } from '../types/filters';
import { MCPError, ErrorCode } from '../types/errors';

/**
 * Maximum allowed nesting depth for filter expressions (prevents DoS)
 */
const MAX_NESTING_DEPTH = 10;

/**
 * Maximum allowed number of conditions per expression (prevents DoS)
 */
const MAX_CONDITIONS = 50;

/**
 * Maximum string length for sanitized values.
 *
 * Vikunja does not cap task description length (the column is a longtext and
 * the field stores HTML), so this is only a generous backstop against
 * pathological payloads — not a limit the wrapper should impose on real
 * content. Descriptions of several thousand characters are routine.
 */
const MAX_STRING_LENGTH = 1_000_000;

/**
 * Zod schemas for type-safe validation
 */
const FieldSchema: z.ZodType<FilterField> = z.enum([
  'done', 'priority', 'percentDone', 'dueDate', 'assignees',
  'labels', 'created', 'updated', 'title', 'description'
]);

const OperatorSchema: z.ZodType<FilterOperator> = z.enum([
  '=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'not in'
]);

const LogicalOperatorSchema: z.ZodType<LogicalOperator> = z.enum(['&&', '||']);

/**
 * Server-appropriate security validation patterns
 * Created fresh each call to avoid regex state issues
 */

/**
 * Allowed characters for additional strictness (optional, can be relaxed)
 */

/**
 * Validate a string value for use as a Vikunja API field.
 *
 * Rejects unambiguous <script>/<iframe> injection, then NFC-normalizes and
 * strips invisible spoofing characters. It does NOT HTML-escape the value:
 * see the module header for why escaping here corrupted titles and paths.
 */
export function sanitizeString(value: string): string {
  if (typeof value !== 'string') {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Value must be a string');
  }

  if (value.length > MAX_STRING_LENGTH) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `String value exceeds maximum length of ${MAX_STRING_LENGTH}`);
  }

  // Step 1: Reject only unambiguous HTML/script injection. Blocklisting SQL,
  // shell, path or LDAP/NoSQL "patterns" here only ever rejected legitimate
  // task content (file paths, URLs, prose with words like "select"/"update").
  const lowerValue = value.toLowerCase();

  const dangerousPatterns = [
    /<script[\s/>]/i,
    /<\/script\s*>/i,
    /<iframe[\s/>]/i,
    /<\/iframe\s*>/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(lowerValue)) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'String contains potentially dangerous content');
    }
  }

  // Step 2: Normalize Unicode. No HTML-entity escaping and no path-traversal
  // rewriting: these values are JSON fields for the Vikunja API, not HTML or
  // filesystem paths, and doing either here corrupted legitimate content.
  let normalizedValue = value.normalize('NFC');

  // Strip zero-width / invisible characters used for spoofing.
  normalizedValue = normalizedValue.replace(/[\u200b-\u200f\u2060\u180e\ufeff]/g, '');
  normalizedValue = normalizedValue.replace(/[\uFE00-\uFE0F]/g, '');

  return normalizedValue;
}

/**
 * Validate a field name against Zod schema
 */
export function validateField(field: string): FilterField {
  if (typeof field !== 'string') {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Field must be a string');
  }

  // Check for prototype pollution attempts first
  const pollutionPatterns = ['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];
  if (pollutionPatterns.includes(field)) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid field name: potential prototype pollution');
  }

  try {
    const result = FieldSchema.parse(field);
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, `Invalid field: ${error.issues[0]?.message || 'Unknown validation error'}`);
    }
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid field: Validation failed');
  }
}

/**
 * Validate an operator against Zod schema
 */
export function validateOperator(operator: string): FilterOperator {
  if (typeof operator !== 'string') {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Operator must be a string');
  }

  try {
    const result = OperatorSchema.parse(operator);
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, `Invalid operator: ${error.issues[0]?.message || 'Unknown validation error'}`);
    }
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid operator: Validation failed');
  }
}

/**
 * Validate a logical operator against Zod schema
 */
export function validateLogicalOperator(operator: string): LogicalOperator {
  if (typeof operator !== 'string') {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Logical operator must be a string');
  }

  try {
    const result = LogicalOperatorSchema.parse(operator);
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, `Invalid logical operator: ${error.issues[0]?.message || 'Unknown validation error'}`);
    }
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid logical operator: Validation failed');
  }
}

/**
 * Validate and normalize a value using custom logic (more comprehensive than Zod for this use case)
 */
export function validateValue(value: unknown): string | number | boolean | string[] | number[] {
  // Handle null/undefined
  if (value === null || value === undefined) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid value type');
  }

  // Handle string values
  if (typeof value === 'string') {
    return value;
  }

  // Handle boolean values
  if (typeof value === 'boolean') {
    return value;
  }

  // Handle number values with infinite/NaN checks
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Numeric values must be finite, not infinite or NaN');
    }
    return value;
  }

  // Handle array values
  if (Array.isArray(value)) {
    if (value.length > 100) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Array values cannot exceed 100 elements');
    }

    if (value.length === 0) {
      return [];
    }

    // Check array type consistency with proper type guards
    const firstElementType = typeof value[0];
    if (firstElementType !== 'string' && firstElementType !== 'number') {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Array elements must be all strings or all finite numbers, not mixed');
    }

    // Validate all elements are of the same type and valid
    for (let i = 0; i < value.length; i++) {
      const element: unknown = value[i];
      const elementType = typeof element;

      // Additional safety: reject null/undefined/object elements
      if (element === null || element === undefined || typeof element === 'object') {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Array elements must be strings, numbers, or booleans, not objects');
      }

      if (elementType !== firstElementType) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Array elements must be all strings or all finite numbers, not mixed');
      }

      if (firstElementType === 'number') {
        // Type-safe numeric validation without casting
        if (typeof element !== 'number' || !Number.isFinite(element)) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Array numeric values must be finite, not infinite or NaN');
        }
      }

      if (firstElementType === 'string') {
        // Type-safe string validation with comprehensive sanitization
        if (typeof element !== 'string') {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Array string elements must be strings');
        }

        // Apply comprehensive input sanitization to all string array elements
        // This prevents injection attacks in bulk operations
        try {
          (value as string[])[i] = sanitizeString(element);
        } catch (sanitizationError) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, `Array element ${i} contains potentially dangerous content: ${sanitizationError instanceof Error ? sanitizationError.message : 'Unknown error'}`);
        }
      }
    }

    // Type-safe return without unsafe casting - we've validated the types above
    if (firstElementType === 'string') {
      // We've proven all elements are strings
      return value as string[];
    } else if (firstElementType === 'number') {
      // We've proven all elements are finite numbers
      return value as number[];
    } else {
      // This should never happen due to earlier validation
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Array contains unsupported element types');
    }
  }

  // Reject all other types
  throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid value type');
}

/**
 * Schema for filter conditions
 */
const ConditionSchema = z.object({
  field: FieldSchema,
  operator: OperatorSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
    z.null()
  ]),
});

/**
 * Validate a filter condition object using Zod schema
 */
export function validateCondition(condition: unknown): {
  field: FilterField;
  operator: FilterOperator;
  value: string | number | boolean | string[] | number[] | null;
} {
  try {
    const result = ConditionSchema.parse(condition);
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, `Invalid condition: ${error.issues[0]?.message || 'Condition validation failed'}`);
    }
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid condition: Validation failed');
  }
}

/**
 * Zod schema for filter groups
 */
const FilterGroupSchema = z.object({
  operator: LogicalOperatorSchema,
  conditions: z.array(ConditionSchema).min(1).max(MAX_CONDITIONS)
});

/**
 * Zod schema for filter expressions
 */
const FilterExpressionSchema = z.object({
  groups: z.array(FilterGroupSchema).min(1).max(MAX_NESTING_DEPTH),
  operator: LogicalOperatorSchema.optional()
}).refine(
  (expr) => {
    // Check total conditions across all groups
    const totalConditions = expr.groups.reduce((sum, group) => sum + group.conditions.length, 0);
    return totalConditions <= MAX_CONDITIONS;
  },
  {
    message: `Filter expression cannot exceed ${MAX_CONDITIONS} total conditions`
  }
);

/**
 * Validate a filter expression using Zod schema with comprehensive type safety
 */
export function validateFilterExpression(expression: unknown): FilterExpression {
  try {
    // Use Zod for comprehensive type-safe validation
    const result = FilterExpressionSchema.parse(expression);

    // Additional runtime checks for edge cases Zod might not catch
    if (result.groups.length === 0) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Filter expression must have at least one group');
    }

    // Validate each condition individually for additional safety
    let totalConditions = 0;
    for (let i = 0; i < result.groups.length; i++) {
      const group = result.groups[i];

      // Type guard to ensure group is defined
      if (!group) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, `Group ${i} is undefined`);
      }

      // Validate operator with stricter validation
      try {
        validateLogicalOperator(group.operator);
      } catch (error) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, `Group ${i} has invalid operator: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Validate each condition individually
      for (let j = 0; j < group.conditions.length; j++) {
        const condition = group.conditions[j];
        try {
          validateCondition(condition);
        } catch (error) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, `Group ${i}, condition ${j}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        totalConditions++;
      }
    }

    // Final check for total conditions
    if (totalConditions > MAX_CONDITIONS) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, `Filter expression cannot exceed ${MAX_CONDITIONS} total conditions`);
    }

    // Type-safe return - Zod has validated the structure
    return result as FilterExpression;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Check for specific Zod errors and provide better error messages
      const firstIssue = error.issues[0];
      if (firstIssue) {
        // Handle empty groups array
        if (firstIssue.code === 'too_small' && firstIssue.path.length > 0 && firstIssue.path[firstIssue.path.length - 1] === 'groups') {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Filter expression must have at least one group');
        }
        // Handle exceed maximum nesting depth or array size
        if (firstIssue.code === 'too_big') {
          if (firstIssue.message.includes('Array must contain at most 10 element(s)')) {
            throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Filter expression exceeds maximum nesting depth of 10');
          }
          if (firstIssue.message.includes('conditions') || firstIssue.message.includes('50') || firstIssue.message.includes('Array must contain at most 50')) {
            throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Filter expression cannot exceed 50 total conditions');
          }
          // Generic too_big error for filter expressions
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Filter expression exceeds maximum nesting depth of 10');
        }

        // Handle "Required" errors which might indicate missing required fields in deeply nested structures
        if (firstIssue.code === 'invalid_type' && firstIssue.message === 'Required') {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Filter expression exceeds maximum nesting depth of 10');
        }

        // Check if any issue mentions conditions or 50
        if (error.issues.some(issue =>
          issue.message.includes('conditions') ||
          issue.message.includes('50') ||
          issue.message.includes('Array must contain at most 50')
        )) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Filter expression cannot exceed 50 total conditions');
        }
      }

      const errorDetails = error.issues.map(issue => issue.message).join('; ');
      throw new MCPError(ErrorCode.VALIDATION_ERROR, `Invalid filter expression: ${errorDetails}`);
    }
    if (error instanceof MCPError) {
      throw error; // Re-throw MCPError as-is
    }
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `Filter expression validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Safely stringify JSON with comprehensive protection
 * Prevents prototype pollution and sanitizes string values
 */
export function safeJsonStringify(obj: unknown): string {
  try {
    // Validate the object structure first - this will throw for invalid structures
    const validated = validateFilterExpression(obj);

    // Create a safe copy to prevent prototype pollution
    const safeObj = createSafeObjectCopy(validated);

    // Check for circular references before sanitizing
    if (safeObj === null) {
      throw new Error('Circular reference detected');
    }

    // Recursively sanitize string values in the object (but not operators)
    const sanitizedObj = sanitizeObjectStrings(safeObj);

    const jsonString = JSON.stringify(sanitizedObj);
    return jsonString; // No need to sanitize the JSON string itself since we sanitized values
  } catch (error) {
    if (error instanceof MCPError) {
      throw error; // Re-throw MCPError as-is
    }
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `Failed to stringify object: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Safely parse JSON with comprehensive protection
 * Prevents prototype pollution and validates against dangerous content
 */
export function safeJsonParse(jsonString: string): FilterExpression {
  if (typeof jsonString !== 'string') {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'JSON string must be a string');
  }

  // Check for maximum length
  if (jsonString.length > 50000) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'JSON string exceeds maximum length');
  }

  // Check for prototype pollution patterns before parsing
  if (containsPrototypePollution(jsonString)) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'JSON contains potentially dangerous prototype pollution patterns');
  }

  try {
    const parsed: unknown = JSON.parse(jsonString);

    // Create a safe copy to prevent prototype pollution attacks
    const safeObj = createSafeObjectCopy(parsed);

    // Validate and sanitize the parsed object
    return validateFilterExpression(safeObj);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, `Invalid JSON: ${error.message}`);
    }
    if (error instanceof MCPError) {
      throw error; // Re-throw our validation errors
    }
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate ID parameters
 */
export function validateId(id: number, fieldName: string): void {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `${fieldName} must be a positive integer`);
  }
}

/**
 * Validate and convert ID from various formats
 */
export function validateAndConvertId(id: unknown, fieldName: string): number {
  // Handle booleans - true converts to 1, false is rejected
  if (typeof id === 'boolean') {
    if (id === true) {
      return 1;
    }
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `${fieldName} must be a positive integer`);
  }

  if (typeof id === 'string') {
    // Use Number() instead of parseInt for better conversion handling
    // This handles hex strings like '0x42', exponential like '1e5', etc.
    const parsed = Number(id);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, `${fieldName} must be a positive integer`);
    }
    return parsed;
  }

  if (typeof id === 'number') {
    validateId(id, fieldName);
    return id;
  }

  throw new MCPError(ErrorCode.VALIDATION_ERROR, `${fieldName} must be a number or positive integer string`);
}

/**
 * Helper functions for comprehensive input sanitization
 */

/**
 * Checks for prototype pollution patterns in JSON strings
 */
function containsPrototypePollution(jsonString: string): boolean {
  const lowerJson = jsonString.toLowerCase();

  // Check for dangerous prototype pollution patterns
  const pollutionPatterns = [
    '__proto__',
    'constructor',
    'prototype',
    '"__proto__":',
    '"constructor":',
    '"prototype":',
    '"__proto__":',
    '{"__proto__"',
    'constructor.prototype',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__'
  ];

  return pollutionPatterns.some(pattern => lowerJson.includes(pattern));
}

/**
 * Creates a deep copy of an object while preventing prototype pollution
 */
function createSafeObjectCopy(obj: unknown, visited = new WeakSet()): unknown {
  // Handle null and primitive types
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Prevent circular reference issues
  if (visited.has(obj)) {
    return null;
  }
  visited.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => createSafeObjectCopy(item, visited));
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  // Handle objects - create safe copy without prototype chain
  const safeObj: Record<string, unknown> = {};

  for (const key in obj) {
    // Skip dangerous prototype properties
    if (isSafeProperty(key)) {
      try {
        const value = (obj as Record<string, unknown>)[key];
        safeObj[key] = createSafeObjectCopy(value, visited);
      } catch {
        // Skip properties that cause errors during copying
        continue;
      }
    }
  }

  return safeObj;
}

/**
 * Checks if a property key is safe (not dangerous for prototype pollution)
 */
function isSafeProperty(key: string): boolean {
  const dangerousKeys = [
    '__proto__',
    'constructor',
    'prototype',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString',
    'toString',
    'valueOf'
  ];

  return !dangerousKeys.includes(key) && typeof key === 'string';
}

/**
 * Recursively sanitizes all string values in an object
 * Skips known operator values to avoid HTML entity encoding
 */
function sanitizeObjectStrings(obj: unknown, visited = new WeakSet(), key: string | null = null): unknown {
  // Handle null and primitive types
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      // Don't sanitize known operator values
      const knownOperators = ['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'not in', '&&', '||'];
      if (knownOperators.includes(obj)) {
        return obj;
      }
      return sanitizeString(obj);
    }
    return obj;
  }

  // Prevent circular reference issues
  if (visited.has(obj)) {
    return null;
  }
  visited.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectStrings(item, visited, key));
  }

  // Handle Date objects (don't modify)
  if (obj instanceof Date) {
    return obj;
  }

  // Handle objects
  const sanitizedObj: Record<string, unknown> = {};

  for (const key in obj) {
    if (isSafeProperty(key)) {
      try {
        const value = (obj as Record<string, unknown>)[key];
        sanitizedObj[key] = sanitizeObjectStrings(value, visited, key);
      } catch {
        // Skip properties that cause errors during sanitization
        continue;
      }
    }
  }

  return sanitizedObj;
}