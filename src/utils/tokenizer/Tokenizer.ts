/**
 * Tokenizer for filter string parsing
 */

import { SecurityValidator } from '../validators/SecurityValidator';
import type { Token, TokenType } from './TokenTypes';
import { TokenConstants } from './TokenTypes';
import { FIELD_TYPES } from '../../types/filters';

/**
 * Tokenizer class for converting filter strings into tokens
 */
export class Tokenizer {
  private input: string;
  private position: number;
  private fields: string[];

  constructor(input: string) {
    this.input = input;
    this.position = 0;
    this.fields = Object.keys(FIELD_TYPES);
  }

  /**
   * Tokenizes the input string
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.position < this.input.length) {
      // Skip whitespace
      if (this.skipWhitespace()) {
        continue;
      }

      const char = this.currentChar();
      
      // Handle punctuation
      const punctuationToken = this.tryParsePunctuation(char);
      if (punctuationToken) {
        tokens.push(punctuationToken);
        continue;
      }

      // Handle quoted strings
      const quotedToken = this.tryParseQuotedString();
      if (quotedToken) {
        if (quotedToken.type === 'VALUE') {
          tokens.push(quotedToken);
        } else {
          // Return empty array on error (invalid quoted string)
          return [];
        }
        continue;
      }

      // Handle logical operators
      const logicalToken = this.tryParseLogicalOperator();
      if (logicalToken) {
        tokens.push(logicalToken);
        continue;
      }

      // Handle operators
      const operatorToken = this.tryParseOperator();
      if (operatorToken) {
        tokens.push(operatorToken);
        continue;
      }

      // Handle fields
      const fieldToken = this.tryParseField();
      if (fieldToken) {
        tokens.push(fieldToken);
        continue;
      }

      // Handle unquoted values
      const valueToken = this.tryParseUnquotedValue();
      if (valueToken) {
        if (valueToken.type === 'VALUE') {
          tokens.push(valueToken);
        } else {
          // Return empty array on error (invalid value)
          return [];
        }
        continue;
      }

      // Unknown character - return empty array to indicate error
      return [];
    }

    tokens.push({ type: 'EOF', value: '', position: this.position });
    return tokens;
  }

  /**
   * Skip whitespace and return true if position changed
   */
  private skipWhitespace(): boolean {
    const startPosition = this.position;
    while (this.position < this.input.length && TokenConstants.isWhitespace(this.currentChar())) {
      this.position++;
    }
    return this.position > startPosition;
  }

  /**
   * Get current character
   */
  private currentChar(): string {
    return this.input[this.position] || '';
  }

  /**
   * Try to parse punctuation (parentheses, comma)
   */
  private tryParsePunctuation(char: string): Token | null {
    const position = this.position;

    switch (char) {
      case TokenConstants.PUNCTUATION.LPAREN:
        this.position++;
        return { type: 'LPAREN', value: '(', position };
      case TokenConstants.PUNCTUATION.RPAREN:
        this.position++;
        return { type: 'RPAREN', value: ')', position };
      case TokenConstants.PUNCTUATION.COMMA:
        this.position++;
        return { type: 'COMMA', value: ',', position };
      default:
        return null;
    }
  }

  /**
   * Try to parse quoted string
   */
  private tryParseQuotedString(): Token | null {
    if (this.currentChar() !== TokenConstants.PUNCTUATION.QUOTE) {
      return null;
    }

    const start = this.position;
    this.position++; // Skip opening quote
    let value = '';

    while (this.position < this.input.length && this.currentChar() !== TokenConstants.PUNCTUATION.QUOTE) {
      const currentChar = this.currentChar();
      const nextChar = this.input[this.position + 1];
      
      if (currentChar === '\\' && this.position + 1 < this.input.length && nextChar === '"') {
        value += '"';
        this.position += 2;
      } else if (currentChar !== undefined) {
        value += currentChar;
        this.position++;
      } else {
        break;
      }
      
      // Security check: prevent extremely long quoted values
      if (value.length > 200) {
        return { type: 'EOF', value: 'ERROR', position: start }; // Signal error
      }
    }

    if (this.position >= this.input.length) {
      return { type: 'EOF', value: 'ERROR', position: start }; // Unclosed quote
    }

    this.position++; // Skip closing quote
    
    // Security check: validate the quoted value is safe
    if (!SecurityValidator.validateQuotedValue(value)) {
      return { type: 'EOF', value: 'ERROR', position: start }; // Signal error
    }
    
    return { type: 'VALUE', value, position: start };
  }

  /**
   * Try to parse logical operator
   */
  private tryParseLogicalOperator(): Token | null {
    for (const op of TokenConstants.LOGICAL_OPERATORS) {
      if (this.input.substring(this.position, this.position + op.length) === op) {
        const token = { type: 'LOGICAL' as TokenType, value: op, position: this.position };
        this.position += op.length;
        return token;
      }
    }
    return null;
  }

  /**
   * Try to parse operator
   */
  private tryParseOperator(): Token | null {
    const sortedOps = TokenConstants.getSortedOperators();
    
    for (const op of sortedOps) {
      const substr = this.input.substring(this.position, this.position + op.length);
      if (substr.toLowerCase() === op.toLowerCase()) {
        // Preserve the original case for multi-word operators like 'not in'
        const actualOp = op.includes(' ') ? op : substr;
        const token = { type: 'OPERATOR' as TokenType, value: actualOp, position: this.position };
        this.position += op.length;
        return token;
      }
    }
    return null;
  }

  /**
   * Try to parse field name
   */
  private tryParseField(): Token | null {
    for (const field of this.fields) {
      if (
        this.input.substring(this.position, this.position + field.length) === field &&
        (this.position + field.length >= this.input.length ||
          /[\s=!<>]/.test(this.input[this.position + field.length] || ''))
      ) {
        const token = { type: 'FIELD' as TokenType, value: field, position: this.position };
        this.position += field.length;
        return token;
      }
    }
    return null;
  }

  /**
   * Try to parse unquoted value
   */
  private tryParseUnquotedValue(): Token | null {
    const remaining = this.input.substring(this.position);
    const valueMatch = remaining.match(/^[^\s(),=!<>&|]+/);
    
    if (valueMatch) {
      const value = valueMatch[0];
      
      // Security check: validate the value is safe
      if (!SecurityValidator.isSafeValue(value)) {
        return { type: 'EOF', value: 'ERROR', position: this.position }; // Signal error
      }
      
      const token = { type: 'VALUE' as TokenType, value, position: this.position };
      this.position += value.length;
      return token;
    }
    
    return null;
  }
}