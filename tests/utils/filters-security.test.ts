/**
 * Security tests for filter utilities
 * Tests various injection attack vectors and malicious inputs
 */

import { describe, it, expect } from '@jest/globals';
import { parseFilterString } from '../../src/utils/filters';

describe('Filter Security Tests', () => {
  describe('Input Length Validation', () => {
    it('should reject extremely long filter strings', () => {
      const longString = 'done = false'.repeat(100); // > 1000 chars
      const result = parseFilterString(longString);
      
      expect(result.expression).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Filter string too long');
      expect(result.error?.message).toContain('1000 characters');
    });

    it('should accept filter strings at the length limit', () => {
      // Create a string exactly at the limit
      const conditions = [];
      let totalLength = 0;
      let i = 0;
      
      while (totalLength < 950) { // Leave room for the final condition
        const condition = `priority = ${i}`;
        if (totalLength + condition.length + 4 > 950) break; // +4 for " || "
        conditions.push(condition);
        totalLength += condition.length + 4;
        i++;
      }
      
      const filterStr = conditions.join(' || ');
      expect(filterStr.length).toBeLessThanOrEqual(1000);
      
      const result = parseFilterString(filterStr);
      expect(result.error).toBeUndefined();
      expect(result.expression).not.toBeNull();
    });

    it('should reject filter strings just over the limit', () => {
      // Create a string just over 1000 characters
      const baseCondition = 'done = false && priority >= 3 && ';
      const longString = baseCondition.repeat(35); // Should be over 1000 chars
      
      expect(longString.length).toBeGreaterThan(1000);
      
      const result = parseFilterString(longString);
      expect(result.expression).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Filter string too long');
    });
  });

  describe('Character Sanitization', () => {
    it('should reject filter strings with script injection attempts', () => {
      const maliciousInputs = [
        'done = false#{injection}',
        'priority = 3${injection}',
        'title like "%test%"`injection`',
        'done = false{}injection',
        'priority >= 3[injection]',
      ];

      maliciousInputs.forEach(input => {
        const result = parseFilterString(input);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
        // Security is working - dangerous inputs are rejected at different validation stages
        expect(result.error?.message).toMatch(/invalid characters|Invalid filter syntax/);
      });
    });

    it('should reject filter strings with SQL injection attempts', () => {
      const sqlInjectionInputs = [
        'done = false; DROP TABLE tasks;',
        'title = "test"; DELETE FROM users;',
        'done = false UNION SELECT * FROM passwords',
        "assignees in (SELECT * FROM secrets)",
        'priority = 3; --comment',
      ];

      sqlInjectionInputs.forEach(input => {
        const result = parseFilterString(input);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
        // Security is working - dangerous inputs are rejected at different validation stages
        expect(result.error?.message).toMatch(/invalid characters|Invalid filter syntax/);
      });
    });

    it('should reject filter strings with command injection attempts', () => {
      const commandInjectionInputs = [
        'done = false && $$(rm)',
        'priority = 3 || `cat`',
        'done = false; wget~malware',
        'priority >= 3 && echo[pwned]',
        'title = test`command`',
      ];

      commandInjectionInputs.forEach(input => {
        const result = parseFilterString(input);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
        // May fail at different validation stages
        expect(result.error?.message).toMatch(/invalid characters|Invalid filter syntax/);
      });
    });

    it('should reject filter strings with template injection attempts', () => {
      const templateInjectionInputs = [
        'done = {{constructor.constructor}}',
        'priority = ${7*7}',
        'title = #{injection}',
        'done = false && {%raw%}injection',
        'priority = <%=injection%>',
      ];

      templateInjectionInputs.forEach(input => {
        const result = parseFilterString(input);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
        // May fail at different validation stages
        expect(result.error?.message).toMatch(/invalid characters|Expected value|Invalid filter syntax/);
      });
    });

    it('should reject control characters and unusual Unicode', () => {
      const controlCharInputs = [
        'done = false' + String.fromCharCode(0x007F), // DEL character
        'priority = 3' + String.fromCharCode(0x202E), // Unicode direction override
        'title = "test' + String.fromCharCode(0x200B) + '"', // Zero-width space
        'done = false' + String.fromCharCode(0xFEFF), // Byte order mark 
        'priority = 3' + String.fromCharCode(0x001F), // Unit separator
      ];

      controlCharInputs.forEach(input => {
        const result = parseFilterString(input);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('invalid characters');
      });
    });

    it('should accept valid international characters', () => {
      const validInternationalInputs = [
        'title = "café"', // French
        'description like "%müller%"', // German
        'title = "naïve"', // Accented characters
        'assignees in "josé", "françois"', // Multiple accented names
        'title = "测试"', // Chinese characters
      ];

      validInternationalInputs.forEach(input => {
        const result = parseFilterString(input);
        // These should parse successfully without security errors
        // (though they may have other parsing errors depending on syntax)
        if (result.error) {
          expect(result.error.message).not.toContain('invalid characters');
        }
      });
    });
  });

  describe('Value Length Validation', () => {
    it('should reject extremely long individual values', () => {
      // Create a very long value that exceeds the safety threshold
      const longValue = 'a'.repeat(300);
      const filterStr = `title = "${longValue}"`;
      
      const result = parseFilterString(filterStr);
      // The value length validation is enforced during tokenization
      // Very long quoted values should be rejected
      expect(result.expression).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/Invalid filter syntax|invalid characters/);
    });

    it('should accept reasonably long values', () => {
      // Create a long but acceptable value
      const longValue = 'a'.repeat(100);
      const filterStr = `title = "${longValue}"`;
      
      const result = parseFilterString(filterStr);
      expect(result.error).toBeUndefined();
      expect(result.expression).not.toBeNull();
      expect(result.expression?.groups[0].conditions[0].value).toBe(longValue);
    });

    it('should reject values with mixed safe and unsafe characters', () => {
      const mixedInputs = [
        'title = "safe_text{script}alert"',
        'description like "%normal%[injection]"',
        'assignees in "user1", "user2{evil}"',
      ];

      mixedInputs.forEach(input => {
        const result = parseFilterString(input);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
        // Security is working - dangerous inputs are rejected at different validation stages
        expect(result.error?.message).toMatch(/invalid characters|Invalid filter syntax/);
      });
    });
  });

  describe('Boundary Testing', () => {
    it('should handle edge cases in sanitization', () => {
      const edgeCases = [
        '', // Empty string
        ' ', // Single space
        '\t\n\r', // Various whitespace
        '()', // Just parentheses
        '=', // Just operator
        '"', // Just quote
      ];

      edgeCases.forEach(input => {
        const result = parseFilterString(input);
        // These should either parse successfully or fail for syntax reasons,
        // but not for character validation reasons
        if (result.error) {
          expect(result.error.message).not.toContain('invalid characters');
        }
      });
    });

    it('should handle null and undefined inputs safely', () => {
      expect(() => parseFilterString(null as any)).not.toThrow();
      expect(() => parseFilterString(undefined as any)).not.toThrow();
      
      const nullResult = parseFilterString(null as any);
      expect(nullResult.expression).toBeNull();
      expect(nullResult.error).toBeDefined();
      
      const undefinedResult = parseFilterString(undefined as any);
      expect(undefinedResult.expression).toBeNull();
      expect(undefinedResult.error).toBeDefined();
    });

    it('should handle non-string inputs gracefully', () => {
      const nonStringInputs = [
        123,
        {},
        [],
        true,
        false,
      ];

      nonStringInputs.forEach(input => {
        expect(() => parseFilterString(input as any)).not.toThrow();
        const result = parseFilterString(input as any);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('Bypass Attempts', () => {
    it('should prevent Unicode normalization bypasses', () => {
      const unicodeBypassInputs = [
        'done = falseᾉ', // Greek characters that might normalize
        'priority = 3‼', // Double exclamation that might be normalized
        'title = "test＜script＞"', // Fullwidth characters
      ];

      unicodeBypassInputs.forEach(input => {
        const result = parseFilterString(input);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('invalid characters');
      });
    });

    it('should prevent encoding bypasses', () => {
      const encodingBypassInputs = [
        'done = false~injection',  // Tilde character
        'done = false^injection',  // Caret character  
        'title = test[injection]', // Square brackets
        'priority = 3{injection}', // Curly braces
        'done = false`injection`', // Backticks
      ];

      encodingBypassInputs.forEach(input => {
        const result = parseFilterString(input);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
        // Security is working - dangerous characters are blocked
        expect(result.error?.message).toMatch(/invalid characters|Invalid filter syntax/);
      });
    });

    it('should prevent comment-based bypasses', () => {
      const commentBypassInputs = [
        'done = false/* comment */{script}',
        'priority = 3// comment \\n[script]',
        'title = "test"<!-- comment -->{script}',
      ];

      commentBypassInputs.forEach(input => {
        const result = parseFilterString(input);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
        // Security is working - dangerous characters are blocked
        expect(result.error?.message).toMatch(/invalid characters|Invalid filter syntax/);
      });
    });
  });

  describe('Performance and DoS Prevention', () => {
    it('should handle deeply nested parentheses without performance issues', () => {
      // Create a filter with many nested parentheses
      const openParens = '('.repeat(50);
      const closeParens = ')'.repeat(50);
      const filterStr = `${openParens}done = false${closeParens}`;
      
      const startTime = Date.now();
      const result = parseFilterString(filterStr);
      const parseTime = Date.now() - startTime;
      
      // Should complete quickly even if it fails parsing
      expect(parseTime).toBeLessThan(100);
      
      // May succeed or fail, but shouldn't hang
      expect(result).toBeDefined();
    });

    it('should handle many repeated patterns efficiently', () => {
      // Create a filter with many repeated conditions
      const pattern = 'done = false || ';
      const repeatedPattern = pattern.repeat(50);
      const filterStr = repeatedPattern + 'priority = 3';
      
      const startTime = Date.now();
      const result = parseFilterString(filterStr);
      const parseTime = Date.now() - startTime;
      
      // Should complete quickly
      expect(parseTime).toBeLessThan(100);
      expect(result).toBeDefined();
    });

    it('should prevent regex DoS attacks', () => {
      // Create inputs that might cause catastrophic backtracking
      const regexDoSInputs = [
        'a'.repeat(100) + '!'.repeat(100),
        'done = ' + 'a'.repeat(200) + 'b',
        'priority' + '='.repeat(100) + '3',
      ];

      regexDoSInputs.forEach(input => {
        const startTime = Date.now();
        const result = parseFilterString(input);
        const parseTime = Date.now() - startTime;
        
        // Should complete quickly even if rejected
        expect(parseTime).toBeLessThan(100);
        expect(result).toBeDefined();
      });
    });
  });
});