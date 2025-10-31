/**
 * TokenTypes coverage tests for uncovered line 44
 */

import { TokenConstants } from '../../../src/utils/tokenizer/TokenTypes';

describe('TokenTypes - Coverage Tests', () => {
  describe('TokenConstants', () => {
    describe('getSortedOperators', () => {
      it('should return operators sorted by length (longest first)', () => {
        const sorted = TokenConstants.getSortedOperators();
        
        expect(sorted).toContain('!=');
        expect(sorted).toContain('>=');
        expect(sorted).toContain('<=');
        expect(sorted).toContain('not in');
        expect(sorted).toContain('=');
        expect(sorted).toContain('>');
        expect(sorted).toContain('<');
        expect(sorted).toContain('like');
        expect(sorted).toContain('in');
        // Note: && and || are logical operators, not in OPERATORS array
        
        expect(sorted.indexOf('not in')).toBeLessThan(sorted.indexOf('!='));
        expect(sorted.indexOf('!=')).toBeLessThan(sorted.indexOf('='));
        expect(sorted.indexOf('>=')).toBeLessThan(sorted.indexOf('>'));
        expect(sorted.indexOf('<=')).toBeLessThan(sorted.indexOf('<'));
      });

      it('should return a copy of the operators array', () => {
        const sorted1 = TokenConstants.getSortedOperators();
        const sorted2 = TokenConstants.getSortedOperators();
        
        expect(sorted1).not.toBe(sorted2);
        expect(sorted1).toEqual(sorted2);
      });
    });

    describe('isWhitespace', () => {
      it('should identify whitespace characters', () => {
        expect(TokenConstants.isWhitespace(' ')).toBe(true);
        expect(TokenConstants.isWhitespace('\t')).toBe(true);
        expect(TokenConstants.isWhitespace('\n')).toBe(true);
        expect(TokenConstants.isWhitespace('\r')).toBe(true);
        expect(TokenConstants.isWhitespace('\v')).toBe(true);
        expect(TokenConstants.isWhitespace('\f')).toBe(true);
      });

      it('should reject non-whitespace characters', () => {
        expect(TokenConstants.isWhitespace('a')).toBe(false);
        expect(TokenConstants.isWhitespace('1')).toBe(false);
        expect(TokenConstants.isWhitespace('=')).toBe(false);
        expect(TokenConstants.isWhitespace('"')).toBe(false);
        expect(TokenConstants.isWhitespace('(')).toBe(false);
        expect(TokenConstants.isWhitespace(')')).toBe(false);
      });
    });

    describe('isValueCharacter', () => {
      it('should allow valid value characters', () => {
        const validChars = ['a', 'Z', '0', '9', '_', '-', '.', '+', ':', '/', '%', '@'];
        validChars.forEach(char => {
          expect(TokenConstants.isValueCharacter(char)).toBe(true);
        });
      });

      it('should reject whitespace characters', () => {
        const whitespaceChars = [' ', '\t', '\n', '\r'];
        whitespaceChars.forEach(char => {
          expect(TokenConstants.isValueCharacter(char)).toBe(false);
        });
      });

      it('should reject punctuation characters', () => {
        const punctuationChars = ['(', ')', ',', '=', '!', '<', '>', '&', '|'];
        punctuationChars.forEach(char => {
          expect(TokenConstants.isValueCharacter(char)).toBe(false);
        });
      });

      it('should handle special characters', () => {
        expect(TokenConstants.isValueCharacter('"')).toBe(true); // Quotes are value characters
        expect(TokenConstants.isValueCharacter("'")).toBe(true);
        expect(TokenConstants.isValueCharacter('*')).toBe(true);
        expect(TokenConstants.isValueCharacter('?')).toBe(true);
      });
    });
  });
});
