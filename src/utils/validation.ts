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

    // Check array type consistency
    const firstElementType = typeof value[0];
    if (firstElementType !== 'string' && firstElementType !== 'number') {
      throw new StorageDataError('Array elements must be all strings or all finite numbers, not mixed');
    }

    // Validate all elements are of the same type and valid
    for (let i = 0; i < value.length; i++) {
      const element = value[i];
      const elementType = typeof element;

      if (elementType !== firstElementType) {
        throw new StorageDataError('Array elements must be all strings or all finite numbers, not mixed');
      }

      if (firstElementType === 'number' && !Number.isFinite(element as number)) {
        throw new StorageDataError('Array numeric values must be finite, not infinite or NaN');
      }

      if (firstElementType === 'string') {
        // Check for XSS in string arrays - this should be handled by the caller
        if (typeof element === 'string' && element.toLowerCase().includes('<script')) {
          throw new StorageDataError('Array contains potentially dangerous content');
        }
      }
    }

    return value as string[] | number[];
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
 * Schema for filter expressions
 */

/**
 * Validate a filter expression using custom logic
 */
export function validateFilterExpression(expression: unknown): FilterExpression {
  // Basic type validation
  if (typeof expression !== 'object' || expression === null) {
    throw new StorageDataError('Filter expression must be an object');
  }

  const expr = expression as { groups?: unknown; [key: string]: unknown };

  // Check for groups property
  if (!('groups' in expr)) {
    throw new StorageDataError('Filter expression must have groups property');
  }

  if (!Array.isArray(expr.groups)) {
    throw new StorageDataError('Filter expression groups must be an array');
  }

  // Check for empty groups array
  if (expr.groups.length === 0) {
    throw new StorageDataError('Filter expression must have at least one group');
  }

  // Check nesting depth
  if (expr.groups.length > MAX_NESTING_DEPTH) {
    throw new StorageDataError(`Filter expression exceeds maximum nesting depth of ${MAX_NESTING_DEPTH}`);
  }

  // Validate each group and count total conditions
  let totalConditions = 0;
  for (let i = 0; i < expr.groups.length; i++) {
    const group = expr.groups[i];

    // Validate group structure
    if (typeof group !== 'object' || group === null) {
      throw new StorageDataError(`Group ${i} must be an object`);
    }

    if (!('operator' in group)) {
      throw new StorageDataError(`Group ${i} missing operator property`);
    }

    if (!('conditions' in group)) {
      throw new StorageDataError(`Group ${i} missing conditions property`);
    }

    // Validate operator
    try {
      validateLogicalOperator(group.operator);
    } catch (error) {
      throw new StorageDataError(`Group ${i} has invalid operator: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate conditions array
    if (!Array.isArray(group.conditions)) {
      throw new StorageDataError(`Group ${i} conditions must be an array`);
    }

    if (group.conditions.length > MAX_CONDITIONS) {
      throw new StorageDataError(`Group ${i} exceeds maximum conditions: ${group.conditions.length} > ${MAX_CONDITIONS}`);
    }

    // Validate each condition
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

  // Check total conditions limit
  if (totalConditions > MAX_CONDITIONS) {
    throw new StorageDataError(`Filter expression cannot exceed ${MAX_CONDITIONS} total conditions`);
  }

  // If we got here, the expression is valid
  return expr as FilterExpression;
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
    const parsed = JSON.parse(sanitized);
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