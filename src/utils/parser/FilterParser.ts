/**
 * Simplified filter parser using extracted components
 */

import type { Token, TokenType } from '../tokenizer/TokenTypes';
import type {
  FilterExpression,
  FilterGroup,
  FilterCondition,
  FilterField,
  FilterOperator,
  LogicalOperator,
  ParseResult,
} from '../../types/filters';

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
 * Simplified parser class for filter strings
 */
export class FilterParser {
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
      
      if (this.hasUnconsumedTokens()) {
        return this.createUnconsumedTokenError();
      }
      
      return { expression };
    } catch (error) {
      return this.createParsingError(error);
    }
  }

  /**
   * Parse the complete filter expression
   */
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

  /**
   * Parse a filter group
   */
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

  /**
   * Parse a single condition
   */
  private parseCondition(): FilterCondition | null {
    if (this.peek().type !== 'FIELD') {
      return null;
    }

    const field = this.consume('FIELD').value as FilterField;
    const operator = this.consumeOperator();
    const value = this.parseValue(field, operator);

    return { field, operator, value };
  }

  /**
   * Consume operator token
   */
  private consumeOperator(): FilterOperator {
    if (this.peek().type !== 'OPERATOR') {
      throw new Error('Expected operator');
    }
    return this.consume('OPERATOR').value as FilterOperator;
  }

  /**
   * Parse value(s) based on operator and field type
   */
  private parseValue(field: FilterField, operator: FilterOperator): string | number | boolean | string[] | number[] {
    if (this.peek().type !== 'VALUE') {
      throw new Error('Expected value');
    }

    // Handle IN and NOT IN operators (comma-separated values)
    if (operator === 'in' || operator === 'not in') {
      return this.parseArrayValue();
    }

    return this.parseSingleValue(field);
  }

  /**
   * Parse array value for IN/NOT IN operators
   */
  private parseArrayValue(): string[] {
    const values: string[] = [];
    values.push(this.consume('VALUE').value);

    while (this.peek().type === 'COMMA') {
      this.consume('COMMA');
      if (this.peek().type !== 'VALUE') {
        throw new Error('Expected value after comma');
      }
      values.push(this.consume('VALUE').value);
    }

    return values;
  }

  /**
   * Parse single value and convert based on field type
   */
  private parseSingleValue(field: FilterField): string | number | boolean {
    const rawValue = this.consume('VALUE').value;
    const fieldType = FIELD_TYPES[field];

    if (fieldType === 'boolean') {
      return rawValue === 'true';
    } else if (fieldType === 'number') {
      const numValue = Number(rawValue);
      if (isNaN(numValue)) {
        throw new Error('Invalid number');
      }
      return numValue;
    }

    return rawValue;
  }

  /**
   * Peek at token with optional offset
   */
  private peek(offset = 0): Token {
    return this.tokens[this.current + offset] || { type: 'EOF', value: '', position: -1 };
  }

  /**
   * Consume expected token type
   */
  private consume(expectedType: TokenType): Token {
    const token = this.tokens[this.current];
    if (!token || token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but got ${token?.type ?? 'EOF'}`);
    }
    this.current++;
    return token;
  }

  /**
   * Check for unconsumed tokens
   */
  private hasUnconsumedTokens(): boolean {
    return this.current < this.tokens.length - 1;
  }

  /**
   * Create error for unconsumed tokens
   */
  private createUnconsumedTokenError(): ParseResult {
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
    return {
      expression: null,
      error: {
        message: 'Parsing completed but tokens remain',
        position: this.input.length,
      },
    };
  }

  /**
   * Create error for parsing exceptions
   */
  private createParsingError(error: unknown): ParseResult {
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

  /**
   * Generate context string for error reporting
   */
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
}