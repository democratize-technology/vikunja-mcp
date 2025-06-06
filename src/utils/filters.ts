/**
 * Filter utilities for validation and query building
 */

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
 * Valid field types for validation
 */
const FIELD_TYPES: Record<FilterField, 'boolean' | 'number' | 'date' | 'string' | 'array'> = {
  done: 'boolean',
  priority: 'number',
  percentDone: 'number',
  dueDate: 'date',
  assignees: 'array',
  labels: 'array',
  created: 'date',
  updated: 'date',
  title: 'string',
  description: 'string',
};

/**
 * Valid operators for each field type
 */
const VALID_OPERATORS: Record<string, FilterOperator[]> = {
  boolean: ['=', '!='],
  number: ['=', '!=', '>', '>=', '<', '<='],
  date: ['=', '!=', '>', '>=', '<', '<='],
  string: ['=', '!=', 'like'],
  array: ['in', 'not in'],
};

/**
 * Validates a single filter condition
 */
export function validateCondition(condition: FilterCondition): string[] {
  const errors: string[] = [];

  // Check if field is valid
  if (!FIELD_TYPES[condition.field]) {
    errors.push(`Invalid field: ${condition.field}`);
    return errors;
  }

  const fieldType = FIELD_TYPES[condition.field];
  const validOperators = VALID_OPERATORS[fieldType];

  // Check if operator is valid for field type
  if (!validOperators || !validOperators.includes(condition.operator)) {
    errors.push(
      `Invalid operator "${condition.operator}" for field "${condition.field}" of type "${fieldType}"`,
    );
  }

  // Validate value type
  switch (fieldType) {
    case 'boolean':
      if (
        typeof condition.value !== 'boolean' &&
        condition.value !== 'true' &&
        condition.value !== 'false'
      ) {
        errors.push(`Field "${condition.field}" requires a boolean value`);
      }
      break;
    case 'number':
      if (typeof condition.value !== 'number' && isNaN(Number(condition.value))) {
        errors.push(`Field "${condition.field}" requires a numeric value`);
      }
      break;
    case 'date':
      // Allow special date values and ISO date strings
      if (typeof condition.value === 'string') {
        const validDatePattern = /^(now([+-]\d+[smhdwMy])?|now\/[dwMy]|\d{4}-\d{2}-\d{2})/;
        if (!validDatePattern.test(condition.value)) {
          errors.push(
            `Field "${condition.field}" requires a valid date value (ISO date or relative date like "now+1d")`,
          );
        }
      }
      break;
    case 'array':
      if (!Array.isArray(condition.value) && typeof condition.value !== 'string') {
        errors.push(`Field "${condition.field}" requires an array or comma-separated string value`);
      }
      break;
  }

  return errors;
}

/**
 * Validates a filter expression
 */
export function validateFilterExpression(
  expression: FilterExpression,
  config: FilterValidationConfig = {},
): FilterValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const performanceThreshold = config.performanceWarningThreshold ?? 10;

  if (!expression.groups || expression.groups.length === 0) {
    errors.push('Filter expression must contain at least one group');
  }

  expression.groups.forEach((group, groupIndex) => {
    if (!group.conditions || group.conditions.length === 0) {
      errors.push(`Group ${groupIndex + 1} must contain at least one condition`);
    }

    group.conditions.forEach((condition, conditionIndex) => {
      const conditionErrors = validateCondition(condition);
      conditionErrors.forEach((error) => {
        errors.push(`Group ${groupIndex + 1}, Condition ${conditionIndex + 1}: ${error}`);
      });
    });
  });

  // Add warnings for complex filters
  const totalConditions = expression.groups.reduce(
    (sum, group) => sum + group.conditions.length,
    0,
  );
  if (totalConditions > performanceThreshold) {
    warnings.push(
      `Complex filters with many conditions (${totalConditions}) may impact performance`,
    );
  }

  const result: FilterValidationResult = {
    valid: errors.length === 0,
    errors,
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
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
 * Token types for the parser
 */
type TokenType = 'FIELD' | 'OPERATOR' | 'VALUE' | 'LOGICAL' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Tokenizes a filter string
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;

  // Valid fields and operators
  const fields = Object.keys(FIELD_TYPES);
  const operators = ['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'not in'];
  const logical = ['&&', '||'];

  while (position < input.length) {
    // Skip whitespace
    const char = input[position];
    if (char !== undefined && /\s/.test(char)) {
      position++;
      continue;
    }

    // Parentheses
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position });
      position++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position });
      position++;
      continue;
    }

    // Comma
    if (char === ',') {
      tokens.push({ type: 'COMMA', value: ',', position });
      position++;
      continue;
    }

    // Quoted string
    if (char === '"') {
      const start = position;
      position++;
      let value = '';
      while (position < input.length && input[position] !== '"') {
        const currentChar = input[position];
        const nextChar = input[position + 1];
        if (currentChar === '\\' && position + 1 < input.length && nextChar === '"') {
          value += '"';
          position += 2;
        } else if (currentChar !== undefined) {
          value += currentChar;
          position++;
        } else {
          break;
        }
      }
      if (position >= input.length) {
        return []; // Unclosed quote
      }
      position++; // Skip closing quote
      tokens.push({ type: 'VALUE', value, position: start });
      continue;
    }

    // Try to match logical operators
    let matched = false;
    for (const op of logical) {
      if (input.substring(position, position + op.length) === op) {
        tokens.push({ type: 'LOGICAL', value: op, position });
        position += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Try to match operators (check 'not in' before 'in')
    const sortedOps = operators.sort((a, b) => b.length - a.length);
    for (const op of sortedOps) {
      // Match operators case-insensitively for consistency
      const substr = input.substring(position, position + op.length);
      if (substr.toLowerCase() === op.toLowerCase()) {
        // Preserve the original case for multi-word operators like 'not in'
        const actualOp = op.includes(' ') ? op : substr;
        tokens.push({ type: 'OPERATOR', value: actualOp, position });
        position += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Try to match fields
    for (const field of fields) {
      if (
        input.substring(position, position + field.length) === field &&
        (position + field.length >= input.length ||
          /[\s=!<>]/.test(input[position + field.length] ?? ''))
      ) {
        tokens.push({ type: 'FIELD', value: field, position });
        position += field.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Match unquoted value (word, number, or date)
    const remaining = input.substring(position);
    const valueMatch = remaining.match(/^[^\s(),=!<>&|]+/);
    if (valueMatch) {
      tokens.push({ type: 'VALUE', value: valueMatch[0], position });
      position += valueMatch[0].length;
      continue;
    }

    // Unknown character
    return [];
  }

  tokens.push({ type: 'EOF', value: '', position });
  return tokens;
}

/**
 * Parser class for filter strings
 */
class FilterParser {
  private tokens: Token[];
  private current = 0;
  private input: string;

  constructor(tokens: Token[], input: string) {
    this.tokens = tokens;
    this.input = input;
  }

  parse(): ParseResult {
    try {
      const expression = this.parseExpression();
      if (this.current < this.tokens.length - 1) {
        // Didn't consume all tokens
        const remainingToken = this.tokens[this.current];
        if (remainingToken) {
          return {
            expression: null,
            error: {
              message: `Unexpected token: ${remainingToken.value}`,
              position: remainingToken.position,
              context: this.getContext(remainingToken.position),
            },
          };
        }
      }
      return { expression };
    } catch (error) {
      if (error instanceof Error) {
        const currentToken = this.tokens[this.current];
        const position =
          this.current < this.tokens.length && currentToken
            ? currentToken.position
            : this.input.length;
        return {
          expression: null,
          error: {
            message: error.message,
            position,
            context: this.getContext(position),
          },
        };
      }
      return {
        expression: null,
        error: {
          message: 'Unknown parsing error',
          position: 0,
        },
      };
    }
  }

  private getContext(position: number): string {
    const start = Math.max(0, position - 20);
    const end = Math.min(this.input.length, position + 20);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < this.input.length ? '...' : '';
    const context = this.input.substring(start, end);
    const markerPosition = position - start + prefix.length;
    const marker = ' '.repeat(markerPosition) + '^';
    return `${prefix}${context}${suffix}\n${marker}`;
  }

  private parseExpression(): FilterExpression {
    const groups: FilterGroup[] = [];
    let groupOperator: LogicalOperator | undefined;

    // Parse first group
    const firstGroup = this.parseGroup();
    if (!firstGroup) {
      throw new Error('Expected group');
    }
    groups.push(firstGroup);

    // Parse additional groups separated by logical operators
    while (this.peek().type === 'LOGICAL') {
      const op = this.consume('LOGICAL').value as LogicalOperator;
      if (!groupOperator) {
        groupOperator = op;
      }

      const nextGroup = this.parseGroup();
      if (!nextGroup) {
        throw new Error('Expected group after logical operator');
      }
      groups.push(nextGroup);
    }

    const result: FilterExpression = { groups };
    if (groupOperator) {
      result.operator = groupOperator;
    }
    return result;
  }

  private parseGroup(): FilterGroup | null {
    const conditions: FilterCondition[] = [];
    let operator: LogicalOperator | undefined;

    // Check for opening parenthesis
    const hasParens = this.peek().type === 'LPAREN';
    if (hasParens) {
      this.consume('LPAREN');
    }

    // Parse first condition
    const firstCondition = this.parseCondition();
    if (!firstCondition) {
      return null;
    }
    conditions.push(firstCondition);

    // Parse additional conditions within the group
    while (this.peek().type === 'LOGICAL') {
      // If we're not in parentheses and the next-next token is LPAREN,
      // this logical operator starts a new group at the expression level
      if (!hasParens && this.peek(1).type === 'LPAREN') {
        break;
      }

      const op = this.consume('LOGICAL').value as LogicalOperator;
      if (!operator) {
        operator = op;
      }

      const nextCondition = this.parseCondition();
      if (!nextCondition) {
        throw new Error('Expected condition after logical operator');
      }
      conditions.push(nextCondition);
    }

    // Check for closing parenthesis
    if (hasParens) {
      if (this.peek().type !== 'RPAREN') {
        throw new Error('Expected closing parenthesis');
      }
      this.consume('RPAREN');
    }

    return {
      conditions,
      operator: operator ?? '&&',
    };
  }

  private parseCondition(): FilterCondition | null {
    if (this.peek().type !== 'FIELD') {
      return null;
    }

    const field = this.consume('FIELD').value as FilterField;

    if (this.peek().type !== 'OPERATOR') {
      throw new Error('Expected operator');
    }
    const operator = this.consume('OPERATOR').value as FilterOperator;

    // Parse value(s)
    if (this.peek().type !== 'VALUE') {
      throw new Error('Expected value');
    }

    let value: string | number | boolean | string[] | number[];

    // Handle IN and NOT IN operators (comma-separated values)
    if (operator === 'in' || operator === 'not in') {
      const values: string[] = [];
      values.push(this.consume('VALUE').value);

      while (this.peek().type === 'COMMA') {
        this.consume('COMMA');
        if (this.peek().type !== 'VALUE') {
          throw new Error('Expected value after comma');
        }
        values.push(this.consume('VALUE').value);
      }

      value = values;
    } else {
      const rawValue = this.consume('VALUE').value;

      // Convert value based on field type
      const fieldType = FIELD_TYPES[field];
      if (fieldType === 'boolean') {
        value = rawValue === 'true';
      } else if (fieldType === 'number') {
        value = Number(rawValue);
        if (isNaN(value)) {
          throw new Error('Invalid number');
        }
      } else {
        value = rawValue;
      }
    }

    return { field, operator, value };
  }

  private peek(offset = 0): Token {
    return this.tokens[this.current + offset] || { type: 'EOF', value: '', position: -1 };
  }

  private consume(expectedType: TokenType): Token {
    const token = this.tokens[this.current];
    if (!token || token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but got ${token?.type ?? 'EOF'}`);
    }
    this.current++;
    return token;
  }
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
  if (!filterStr || filterStr.trim().length === 0) {
    return {
      expression: null,
      error: {
        message: 'Filter string cannot be empty',
        position: 0,
      },
    };
  }

  const trimmed = filterStr.trim();
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return {
      expression: null,
      error: {
        message: 'Invalid filter syntax',
        position: 0,
        context: trimmed.substring(0, 40) + (trimmed.length > 40 ? '...' : ''),
      },
    };
  }

  const parser = new FilterParser(tokens, trimmed);
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
