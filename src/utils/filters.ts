/**
 * Filter utilities for validation and query building
 * Refactored for maintainability and separation of concerns
 */

import { SecurityValidator } from './validators/SecurityValidator';
import { ValidationOrchestrator } from './validators/ValidationOrchestrator';
import { Tokenizer } from './tokenizer/Tokenizer';
import { FilterParser } from './parser/FilterParser';
import type {
  FilterCondition,
  FilterExpression,
  FilterField,
  FilterGroup,
  FilterOperator,
  FilterValidationResult,
  FilterValidationConfig,
  LogicalOperator,
  ParseResult,
} from '../types/filters';

/**
 * Validates a single filter condition
 */
export function validateCondition(condition: FilterCondition): string[] {
  return ValidationOrchestrator.validateCondition(condition);
}

/**
 * Validates a filter expression
 */
export function validateFilterExpression(
  expression: FilterExpression,
  config: FilterValidationConfig = {},
): FilterValidationResult {
  return ValidationOrchestrator.validateFilterExpression(expression, config);
}

/**
 * Converts a filter condition to a filter string
 */
export function conditionToString(condition: FilterCondition): string {
  const { field, operator, value } = condition;

  // Handle different value types
  let valueStr: string;
  if (Array.isArray(value)) {
    valueStr = value.join(', ');
  } else if (typeof value === 'string' && operator === 'like') {
    valueStr = `"${value}"`;
  } else if (typeof value === 'boolean') {
    valueStr = value.toString();
  } else {
    valueStr = String(value);
  }

  // Special handling for array operators
  if (operator === 'in' || operator === 'not in') {
    return `${field} ${operator} ${valueStr}`;
  }

  return `${field} ${operator} ${valueStr}`;
}

/**
 * Converts a filter group to a filter string
 */
export function groupToString(group: FilterGroup): string {
  const conditions = group.conditions.map(conditionToString);
  return conditions.length > 1
    ? `(${conditions.join(` ${group.operator} `)})`
    : conditions[0] || '';
}

/**
 * Converts a filter expression to a filter string
 */
export function expressionToString(expression: FilterExpression): string {
  const groups = expression.groups.map(groupToString);
  const operator = expression.operator || '&&';
  return groups.join(` ${operator} `);
}


/**
 * Parses a filter string into a filter expression
 * Supports SQL-like syntax with proper operator precedence and parentheses
 *
 * @example
 * // Simple equality condition
 * const result = parseFilterString('done = false');
 * // Returns: { expression: { groups: [{ conditions: [{ field: 'done', operator: '=', value: false }], operator: '&&' }] } }
 *
 * @example
 * // Multiple conditions with AND
 * const result = parseFilterString('done = false && priority >= 3');
 * // Returns expression with both conditions in the same group
 *
 * @example
 * // Grouped conditions with OR
 * const result = parseFilterString('(done = false && priority > 3) || (dueDate < now+7d)');
 * // Returns expression with two groups combined with OR operator
 *
 * @example
 * // Complex nested parentheses (flattened into single group)
 * const result = parseFilterString('((done = false || done = true) && priority > 3)');
 * // Note: Nested parentheses are flattened for simplicity
 *
 * @example
 * // Error handling
 * const result = parseFilterString('done =');
 * // Returns: { expression: null, error: { message: 'Expected value', position: 6 } }
 *
 * @param filterStr - The filter string to parse
 * @returns ParseResult with either the parsed expression or error details
 */
export function parseFilterString(filterStr: string): ParseResult {
  // Handle non-string inputs gracefully
  if (typeof filterStr !== 'string') {
    return {
      expression: null,
      error: {
        message: 'Filter input must be a string',
        position: 0,
      },
    };
  }

  if (!filterStr || filterStr.trim().length === 0) {
    return {
      expression: null,
      error: {
        message: 'Filter string cannot be empty',
        position: 0,
      },
    };
  }

  // Security validation using orchestrator
  const securityValidation = ValidationOrchestrator.validateInputSecurity(filterStr);
  if (!securityValidation.isValid) {
    return {
      expression: null,
      error: {
        message: securityValidation.error || 'Invalid input',
        position: 0,
        ...(securityValidation.error === 'Filter string contains invalid characters' && {
          context: 'Only alphanumeric characters, common punctuation, and international characters are allowed'
        }),
      },
    };
  }

  // Sanitize and tokenize
  const { sanitized } = SecurityValidator.sanitizeFilterInput(filterStr);
  const tokenizer = new Tokenizer(sanitized);
  const tokens = tokenizer.tokenize();
  
  if (tokens.length === 0) {
    return {
      expression: null,
      error: {
        message: 'Invalid filter syntax',
        position: 0,
        context: sanitized.substring(0, 40) + (sanitized.length > 40 ? '...' : ''),
      },
    };
  }

  const parser = new FilterParser(tokens, sanitized);
  return parser.parse();
}

/**
 * Creates a filter builder for fluent filter construction
 */
export class FilterBuilder {
  private expression: FilterExpression;
  private currentGroup: FilterGroup;

  constructor() {
    this.currentGroup = {
      conditions: [],
      operator: '&&',
    };
    this.expression = {
      groups: [this.currentGroup],
    };
  }

  /**
   * Adds a condition to the current group
   */
  where(field: FilterField, operator: FilterOperator, value: unknown): FilterBuilder {
    this.currentGroup.conditions.push({
      field,
      operator,
      value: value as string | number | boolean | string[] | number[],
    });
    return this;
  }

  /**
   * Sets the operator for the current group
   */
  and(): FilterBuilder {
    this.currentGroup.operator = '&&';
    return this;
  }

  /**
   * Sets the operator for the current group
   */
  or(): FilterBuilder {
    this.currentGroup.operator = '||';
    return this;
  }

  /**
   * Starts a new group
   */
  group(operator: LogicalOperator = '&&'): FilterBuilder {
    this.currentGroup = {
      conditions: [],
      operator,
    };
    this.expression.groups.push(this.currentGroup);
    return this;
  }

  /**
   * Sets the operator between groups
   */
  groupOperator(operator: LogicalOperator): FilterBuilder {
    this.expression.operator = operator;
    return this;
  }

  /**
   * Builds the filter expression
   */
  build(): FilterExpression {
    // Remove empty groups
    this.expression.groups = this.expression.groups.filter((g) => g.conditions.length > 0);
    return this.expression;
  }

  /**
   * Builds and returns the filter string
   */
  toString(): string {
    return expressionToString(this.build());
  }

  /**
   * Validates the current filter
   */
  validate(config?: FilterValidationConfig): FilterValidationResult {
    return validateFilterExpression(this.build(), config);
  }
}
