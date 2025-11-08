/**
 * Security validation utilities for filter expressions and JSON data
 *
 * This module provides comprehensive validation to prevent XSS attacks,
 * prototype pollution, and other security vulnerabilities in filter expressions.
 */

import type { FilterExpression, FilterField, FilterOperator, LogicalOperator } from '../types/filters';
import { StorageDataError } from '../storage/interfaces';

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
 * Valid field names for filtering (allowlist approach)
 */
const VALID_FIELDS: readonly FilterField[] = [
  'done',
  'priority',
  'percentDone',
  'dueDate',
  'assignees',
  'labels',
  'created',
  'updated',
  'title',
  'description'
] as const;

/**
 * Valid operators for filtering (allowlist approach)
 */
const VALID_OPERATORS: readonly FilterOperator[] = [
  '=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'not in'
] as const;

/**
 * Valid logical operators (allowlist approach)
 */
const VALID_LOGICAL_OPERATORS: readonly LogicalOperator[] = ['&&', '||'] as const;

/**
 * XSS detection patterns
 */
const XSS_PATTERNS = [
  // Script tags (case insensitive)
  /<script[^>]*>/gi,
  // Event handlers (but not just the word "on")
  /\bon\w+\s*=/gi,
  // JavaScript protocols
  /javascript\s*:/gi,
  // HTML tags with potential script content
  /<(?:iframe|object|embed|link|meta|style)[^>]*>/gi,
  // Data URLs with script content
  /data:(?:text\/html|application\/javascript)/gi,
  // SVG with script content
  /<svg[^>]*>/gi,
  // HTML comments that might hide scripts
  /<!--.*?-->/gs,
  // Expression and eval functions (standalone, not in quotes)
  /(?:expression|eval|Function)\s*\(/gi,
];

/**
 * Prototype pollution detection patterns
 */
const PROTOTYPE_POLLUTION_PATTERNS = [
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
];

/**
 * Validate and sanitize a string value to prevent XSS
 */
export function sanitizeString(value: string): string {
  if (typeof value !== 'string') {
    throw new StorageDataError('Value must be a string');
  }

  if (value.length > MAX_STRING_LENGTH) {
    throw new StorageDataError(`String value exceeds maximum length of ${MAX_STRING_LENGTH}`);
  }

  // Check for XSS patterns in the original value (before encoding)
  for (const pattern of XSS_PATTERNS) {
    const testResult = pattern.test(value);
    // Reset regex lastIndex for global patterns
    if (pattern.global) {
      pattern.lastIndex = 0;
    }
    if (testResult) {
      throw new StorageDataError('String contains potentially dangerous content');
    }
  }

  // Also check for HTML-encoded dangerous content
  const decodedValue = value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');

  for (const pattern of XSS_PATTERNS) {
    const testResult = pattern.test(decodedValue);
    // Reset regex lastIndex for global patterns
    if (pattern.global) {
      pattern.lastIndex = 0;
    }
    if (testResult) {
      throw new StorageDataError('String contains potentially dangerous content');
    }
  }

  // Additional escaping for HTML special characters
  return value
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate a field name against allowlist and prototype pollution
 */
export function validateField(field: string): FilterField {
  if (typeof field !== 'string') {
    throw new StorageDataError('Field must be a string');
  }

  // Check for prototype pollution attempts
  if (PROTOTYPE_POLLUTION_PATTERNS.includes(field)) {
    throw new StorageDataError('Invalid field name: potential prototype pollution');
  }

  if (!VALID_FIELDS.includes(field as FilterField)) {
    throw new StorageDataError(`Invalid field: ${field}. Allowed fields: ${VALID_FIELDS.join(', ')}`);
  }

  return field as FilterField;
}

/**
 * Validate an operator against allowlist
 */
export function validateOperator(operator: string): FilterOperator {
  if (typeof operator !== 'string') {
    throw new StorageDataError('Operator must be a string');
  }

  if (!VALID_OPERATORS.includes(operator as FilterOperator)) {
    throw new StorageDataError(`Invalid operator: ${operator}. Allowed operators: ${VALID_OPERATORS.join(', ')}`);
  }

  return operator as FilterOperator;
}

/**
 * Validate a logical operator against allowlist
 */
export function validateLogicalOperator(operator: string): LogicalOperator {
  if (typeof operator !== 'string') {
    throw new StorageDataError('Logical operator must be a string');
  }

  if (!VALID_LOGICAL_OPERATORS.includes(operator as LogicalOperator)) {
    throw new StorageDataError(`Invalid logical operator: ${operator}. Allowed operators: ${VALID_LOGICAL_OPERATORS.join(', ')}`);
  }

  return operator as LogicalOperator;
}

/**
 * Validate a filter value for type safety and security
 */
export function validateValue(value: unknown): string | number | boolean | string[] | number[] {
  // Primitive types are allowed
  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (typeof value === 'number') {
    if (!isFinite(value)) {
      throw new StorageDataError('Number values must be finite');
    }
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  // Arrays are allowed for 'in' and 'not in' operators
  if (Array.isArray(value)) {
    if (value.length > 100) { // Prevent array bloat
      throw new StorageDataError('Array values cannot exceed 100 elements');
    }

    if (value.length === 0) {
      return [] as string[];
    }

    // Check if all elements are strings
    if (value.every(item => typeof item === 'string')) {
      return value.map(item => sanitizeString(item));
    }

    // Check if all elements are numbers
    if (value.every(item => typeof item === 'number' && isFinite(item))) {
      return value as number[];
    }

    throw new StorageDataError('Array elements must be all strings or all finite numbers, not mixed');
  }

  throw new StorageDataError('Value must be a string, number, boolean, or array of strings/numbers');
}

/**
 * Validate a filter condition comprehensively
 */
export function validateCondition(condition: unknown): {
  field: FilterField;
  operator: FilterOperator;
  value: string | number | boolean | string[] | number[];
} {
  if (!condition || typeof condition !== 'object') {
    throw new StorageDataError('Filter condition must be an object');
  }

  const { field, operator, value } = condition as Record<string, unknown>;

  if (field === undefined || operator === undefined || value === undefined) {
    throw new StorageDataError('Filter condition must have field, operator, and value properties');
  }

  const validatedField = validateField(typeof field === 'string' ? field : `${field}`);
  const validatedOperator = validateOperator(typeof operator === 'string' ? operator : `${operator}`);
  const validatedValue = validateValue(value);

  return {
    field: validatedField,
    operator: validatedOperator,
    value: validatedValue,
  };
}

/**
 * Validate a filter group with depth tracking
 */
function validateFilterGroup(group: unknown, depth: number = 0): {
  conditions: Array<{
    field: FilterField;
    operator: FilterOperator;
    value: string | number | boolean | string[] | number[];
  }>;
  operator: LogicalOperator;
} {
  if (depth >= MAX_NESTING_DEPTH) {
    throw new StorageDataError(`Filter expression exceeds maximum nesting depth of ${MAX_NESTING_DEPTH}`);
  }

  if (!group || typeof group !== 'object') {
    throw new StorageDataError('Filter group must be an object');
  }

  const { conditions, operator } = group as Record<string, unknown>;

  if (!Array.isArray(conditions)) {
    throw new StorageDataError('Filter group conditions must be an array');
  }

  if (conditions.length === 0) {
    throw new StorageDataError('Filter group must have at least one condition');
  }

  if (conditions.length > MAX_CONDITIONS) {
    throw new StorageDataError(`Filter group cannot exceed ${MAX_CONDITIONS} conditions`);
  }

  const validatedConditions = conditions.map((condition, index) => {
    try {
      return validateCondition(condition);
    } catch (error) {
      throw new StorageDataError(`Invalid condition at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  const validatedOperator = validateLogicalOperator(`${operator}`);

  return {
    conditions: validatedConditions,
    operator: validatedOperator,
  };
}

/**
 * Calculate expression depth recursively
 */
function calculateExpressionDepth(expression: Record<string, unknown>, currentDepth: number = 0): number {
  if (!expression || typeof expression !== 'object') {
    return currentDepth;
  }

  if (Array.isArray(expression.groups)) {
    let maxDepth = currentDepth;
    for (const group of expression.groups) {
      const groupDepth = calculateExpressionDepth(group as Record<string, unknown>, currentDepth + 1);
      maxDepth = Math.max(maxDepth, groupDepth);
    }
    return maxDepth;
  }

  return currentDepth;
}

/**
 * Comprehensive validation of a filter expression
 */
export function validateFilterExpression(expression: unknown): FilterExpression {
  if (!expression || typeof expression !== 'object') {
    throw new StorageDataError('Filter expression must be an object');
  }

  const { groups, operator } = expression as Record<string, unknown>;

  if (!Array.isArray(groups)) {
    throw new StorageDataError('Filter expression groups must be an array');
  }

  if (groups.length === 0) {
    throw new StorageDataError('Filter expression must have at least one group');
  }

  // Check total depth
  const totalDepth = calculateExpressionDepth(expression as Record<string, unknown>);
  if (totalDepth > MAX_NESTING_DEPTH) {
    throw new StorageDataError(`Filter expression exceeds maximum nesting depth of ${MAX_NESTING_DEPTH}`);
  }

  // Check total number of conditions across all groups
  let totalConditions = 0;
  const validatedGroups = groups.map((group, index) => {
    try {
      const validatedGroup = validateFilterGroup(group, 0);
      totalConditions += validatedGroup.conditions.length;
      return validatedGroup;
    } catch (error) {
      throw new StorageDataError(`Invalid group at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  if (totalConditions > MAX_CONDITIONS) {
    throw new StorageDataError(`Filter expression cannot exceed ${MAX_CONDITIONS} total conditions`);
  }

  const result: FilterExpression = {
    groups: validatedGroups,
  };

  if (operator !== undefined) {
    result.operator = validateLogicalOperator(typeof operator === 'string' ? operator : `${operator}`);
  }

  return result;
}

/**
 * Safe JSON stringify with validation
 */
export function safeJsonStringify(obj: unknown): string {
  try {
    // First validate the object structure
    const validated = validateFilterExpression(obj);

    // Additional security: prevent circular references
    const seen = new WeakSet();
    const jsonString = JSON.stringify(validated, (key, value: unknown) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          throw new StorageDataError('Circular reference detected in filter expression');
        }
        seen.add(value);
      }
      return value;
    });

    if (!jsonString) {
      throw new StorageDataError('Failed to serialize filter expression');
    }

    return jsonString;
  } catch (error) {
    if (error instanceof StorageDataError) {
      throw error;
    }
    throw new StorageDataError(`JSON serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Safe JSON parse with validation
 */
export function safeJsonParse(jsonString: string): FilterExpression {
  if (typeof jsonString !== 'string') {
    throw new StorageDataError('JSON string must be a string');
  }

  if (jsonString.length > 50000) { // Prevent parsing huge strings
    throw new StorageDataError('JSON string exceeds maximum length');
  }

  try {
    const parsed: unknown = JSON.parse(jsonString);
    return validateFilterExpression(parsed);
  } catch (error) {
    if (error instanceof StorageDataError) {
      throw error;
    }
    throw new StorageDataError(`JSON parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}