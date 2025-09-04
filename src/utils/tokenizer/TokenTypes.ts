/**
 * Token type definitions for filter parsing
 */

export type TokenType = 'FIELD' | 'OPERATOR' | 'VALUE' | 'LOGICAL' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Token constants and validators
 */
export const TokenConstants = {
  OPERATORS: ['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'not in'] as const,
  LOGICAL_OPERATORS: ['&&', '||'] as const,
  PUNCTUATION: {
    LPAREN: '(',
    RPAREN: ')',
    COMMA: ',',
    QUOTE: '"'
  } as const,

  /**
   * Get operators sorted by length (longest first) to prevent matching issues
   */
  getSortedOperators(): string[] {
    return [...this.OPERATORS].sort((a, b) => b.length - a.length);
  },

  /**
   * Check if a character represents whitespace
   */
  isWhitespace(char: string): boolean {
    return /\s/.test(char);
  },

  /**
   * Check if a character can be part of an unquoted value
   */
  isValueCharacter(char: string): boolean {
    return /[^\s(),=!<>&|]/.test(char);
  }
} as const;