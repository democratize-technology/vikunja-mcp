/**
 * Simplified Security Validation using Zod + HTML Escaping
 *
 * Replaces 479 lines of custom security validation with battle-tested
 * Zod for schema validation and HTML escaping for XSS protection.
 * More appropriate for server-side MCP contexts than browser-focused DOMPurify.
 */

import { z } from 'zod';
import type { FilterExpression, FilterField, FilterOperator, LogicalOperator } from '../types/filters';
import { StorageDataError } from './storage-errors';
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
 * Maximum string length for filter values (prevents storage bloat)
 */
const MAX_STRING_LENGTH = 1000;

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
 * Validate and sanitize a string value to prevent XSS using pattern matching + HTML escaping
 * Server-appropriate approach that avoids DOM parsing while providing comprehensive protection
 */
export function sanitizeString(value: string): string {
  if (typeof value !== 'string') {
    throw new StorageDataError('Value must be a string');
  }

  if (value.length > MAX_STRING_LENGTH) {
    throw new StorageDataError(`String value exceeds maximum length of ${MAX_STRING_LENGTH}`);
  }

  // Step 1: Check for dangerous HTML/JavaScript patterns and REJECT them (don't sanitize)
  // Convert to lowercase for case-insensitive pattern matching
  const lowerValue = value.toLowerCase();

  // Create fresh patterns each time to avoid regex state issues
  const dangerousPatterns = [
    // Direct dangerous content
    /<script[^>]*>/gi,
    /<\/script>/gi,
    /<iframe[^>]*>/gi,
    /<\/iframe>/gi,
    /<object[^>]*>/gi,
    /<\/object>/gi,
    /<embed[^>]*>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi,
    /<svg[^>]*>/gi,
    /<\/svg>/gi,
    /<style[^>]*>/gi,
    /<\/style>/gi,
    /<img[^>]*on[^>]*>/gi,
    /<div[^>]*on[^>]*>/gi,
    /<a[^>]*on[^>]*>/gi,
    /<body[^>]*on[^>]*>/gi,

    // Event handlers and JavaScript
    /on\w+\s*=/gi,
    /onclick/gi,
    /onload/gi,
    /onerror/gi,
    /onmouseover/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:text\/html/gi,
    /data:application\/javascript/gi,
    /expression\s*\(/gi,
    /@import/gi,
    /url\s*\(/gi,
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /<!--.*?-->/gis,

    // HTML-encoded dangerous content (prevent XSS through encoded vectors)
    /&lt;script[^&]*&gt;/gi,
    /&lt;\/script&gt;/gi,
    /&lt;iframe[^&]*&gt;/gi,
    /&lt;\/iframe&gt;/gi,
    /&lt;object[^&]*&gt;/gi,
    /&lt;svg[^&]*&gt;/gi,
    /&lt;img[^&]*on[^&]*&gt;/gi,
    /&lt;div[^&]*on[^&]*&gt;/gi,
    /&lt;a[^&]*on[^&]*&gt;/gi,
    /&lt;body[^&]*on[^&]*&gt;/gi,
    /&lt;style[^&]*&gt;/gi,
    /javascript:[^&]*/gi,
    /on\w+[^&]*=/gi,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(lowerValue)) {
      throw new StorageDataError('String contains potentially dangerous content');
    }
  }

  // Step 2: Apply proper HTML escaping (order matters: & must be first)
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate a field name against Zod schema
 */
export function validateField(field: string): FilterField {
  if (typeof field !== 'string') {
    throw new StorageDataError('Field must be a string');
  }

  try {
    const result = FieldSchema.parse(field);
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new StorageDataError(`Invalid field: ${error.issues[0]?.message || 'Unknown validation error'}`);
    }
    throw new StorageDataError('Invalid field: Validation failed');
  }
}

/**
 * Validate an operator against Zod schema
 */
export function validateOperator(operator: string): FilterOperator {
  if (typeof operator !== 'string') {
    throw new StorageDataError('Operator must be a string');
  }

  try {
    const result = OperatorSchema.parse(operator);
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new StorageDataError(`Invalid operator: ${error.issues[0]?.message || 'Unknown validation error'}`);
    }
    throw new StorageDataError('Invalid operator: Validation failed');
  }
}

/**
 * Validate a logical operator against Zod schema
 */
export function validateLogicalOperator(operator: string): LogicalOperator {
  if (typeof operator !== 'string') {
    throw new StorageDataError('Logical operator must be a string');
  }

  try {
    const result = LogicalOperatorSchema.parse(operator);
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new StorageDataError(`Invalid logical operator: ${error.issues[0]?.message || 'Unknown validation error'}`);
    }
    throw new StorageDataError('Invalid logical operator: Validation failed');
  }
}

/**
 * Validate and normalize a value using custom logic (more comprehensive than Zod for this use case)
 */
export function validateValue(value: unknown): string | number | boolean | string[] | number[] {
  // Handle null/undefined
  if (value === null || value === undefined) {
    throw new StorageDataError('Invalid value type');
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
      throw new StorageDataError('Numeric values must be finite, not infinite or NaN');
    }
    return value;
  }

  // Handle array values
  if (Array.isArray(value)) {
    if (value.length > 100) {
      throw new StorageDataError('Array values cannot exceed 100 elements');
    }

    if (value.length === 0) {
      return [];
    }

    // Check array type consistency with proper type guards
    const firstElementType = typeof value[0];
    if (firstElementType !== 'string' && firstElementType !== 'number') {
      throw new StorageDataError('Array elements must be all strings or all finite numbers, not mixed');
    }

    // Validate all elements are of the same type and valid
    for (let i = 0; i < value.length; i++) {
      const element: unknown = value[i];
      const elementType = typeof element;

      // Additional safety: reject null/undefined/object elements
      if (element === null || element === undefined || typeof element === 'object') {
        throw new StorageDataError('Array elements must be strings, numbers, or booleans, not objects');
      }

      if (elementType !== firstElementType) {
        throw new StorageDataError('Array elements must be all strings or all finite numbers, not mixed');
      }

      if (firstElementType === 'number') {
        // Type-safe numeric validation without casting
        if (typeof element !== 'number' || !Number.isFinite(element)) {
          throw new StorageDataError('Array numeric values must be finite, not infinite or NaN');
        }
      }

      if (firstElementType === 'string') {
        // Type-safe string validation
        if (typeof element !== 'string') {
          throw new StorageDataError('Array string elements must be strings');
        }
        // Check for XSS in string arrays - this should be handled by the caller
        if (element.toLowerCase().includes('<script')) {
          throw new StorageDataError('Array contains potentially dangerous content');
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
      throw new StorageDataError('Array contains unsupported element types');
    }
  }

  // Reject all other types
  throw new StorageDataError('Invalid value type');
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
      throw new StorageDataError(`Invalid condition: ${error.issues[0]?.message || 'Condition validation failed'}`);
    }
    throw new StorageDataError('Invalid condition: Validation failed');
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
      throw new StorageDataError('Filter expression must have at least one group');
    }

    // Validate each condition individually for additional safety
    let totalConditions = 0;
    for (let i = 0; i < result.groups.length; i++) {
      const group = result.groups[i];

      // Type guard to ensure group is defined
      if (!group) {
        throw new StorageDataError(`Group ${i} is undefined`);
      }

      // Validate operator with stricter validation
      try {
        validateLogicalOperator(group.operator);
      } catch (error) {
        throw new StorageDataError(`Group ${i} has invalid operator: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Validate each condition individually
      for (let j = 0; j < group.conditions.length; j++) {
        const condition = group.conditions[j];
        try {
          validateCondition(condition);
        } catch (error) {
          throw new StorageDataError(`Group ${i}, condition ${j}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        totalConditions++;
      }
    }

    // Final check for total conditions
    if (totalConditions > MAX_CONDITIONS) {
      throw new StorageDataError(`Filter expression cannot exceed ${MAX_CONDITIONS} total conditions`);
    }

    // Type-safe return - Zod has validated the structure
    return result as FilterExpression;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorDetails = error.issues.map(issue => issue.message).join('; ');
      throw new StorageDataError(`Invalid filter expression: ${errorDetails}`);
    }
    if (error instanceof StorageDataError) {
      throw error; // Re-throw our own validation errors
    }
    throw new StorageDataError(`Filter expression validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Safely stringify JSON with sanitization
 */
export function safeJsonStringify(obj: unknown): string {
  try {
    const jsonString = JSON.stringify(obj);
    return sanitizeString(jsonString);
  } catch (error) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `Failed to stringify object: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Safely parse JSON with sanitization
 */
export function safeJsonParse(jsonString: string): FilterExpression {
  if (typeof jsonString !== 'string') {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'JSON string must be a string');
  }

  const sanitized = sanitizeString(jsonString);

  try {
    const parsed: unknown = JSON.parse(sanitized);
    return validateFilterExpression(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, `Invalid JSON: ${error.message}`);
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
  if (typeof id === 'string') {
    // Allow string representation of numbers
    const parsed = parseInt(id, 10);
    if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
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