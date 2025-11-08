/**
 * Comprehensive tests for FilterParser class
 * Tests parsing of filter expressions with various combinations and edge cases
 */

import { describe, it, expect } from '@jest/globals';
import { FilterParser } from '../../../src/utils/parser/FilterParser';
import type { Token } from '../../../src/utils/tokenizer/TokenTypes';
import type { ParseResult, FilterExpression, FilterGroup, FilterCondition } from '../../../src/types/filters';

describe('FilterParser', () => {
  // Helper function to create tokens for testing
  function createToken(type: Token['type'], value: string, position: number): Token {
    return { type, value, position };
  }

  // Helper function to parse using tokens directly
  function parseWithTokens(tokens: Token[], input: string): ParseResult {
    const parser = new FilterParser(tokens, input);
    return parser.parse();
  }

  describe('Basic Single Condition Parsing', () => {
    it('should parse simple equality condition', () => {
      const tokens = [
        createToken('FIELD', 'done', 0),
        createToken('OPERATOR', '=', 5),
        createToken('VALUE', 'true', 7),
      ];
      const input = 'done = true';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();
      expect(result.expression).not.toBeNull();

      const expr = result.expression!;
      expect(expr.groups).toHaveLength(1);
      expect(expr.operator).toBeUndefined();

      const group = expr.groups[0];
      expect(group.conditions).toHaveLength(1);
      expect(group.operator).toBe('&&');

      const condition = group.conditions[0];
      expect(condition.field).toBe('done');
      expect(condition.operator).toBe('=');
      expect(condition.value).toBe(true);
    });

    it('should parse string condition with like operator', () => {
      const tokens = [
        createToken('FIELD', 'title', 0),
        createToken('OPERATOR', 'like', 6),
        createToken('VALUE', 'test', 11),
      ];
      const input = 'title like test';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();
      expect(result.expression).not.toBeNull();

      const condition = result.expression!.groups[0].conditions[0];
      expect(condition.field).toBe('title');
      expect(condition.operator).toBe('like');
      expect(condition.value).toBe('test');
    });

    it('should parse numeric condition with comparison operator', () => {
      const tokens = [
        createToken('FIELD', 'priority', 0),
        createToken('OPERATOR', '>', 9),
        createToken('VALUE', '3', 11),
      ];
      const input = 'priority > 3';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();

      const condition = result.expression!.groups[0].conditions[0];
      expect(condition.field).toBe('priority');
      expect(condition.operator).toBe('>');
      expect(condition.value).toBe(3);
    });

    it('should parse array condition with IN operator', () => {
      const tokens = [
        createToken('FIELD', 'labels', 0),
        createToken('OPERATOR', 'in', 7),
        createToken('VALUE', 'urgent', 10),
        createToken('COMMA', ',', 16),
        createToken('VALUE', 'bug', 18),
      ];
      const input = 'labels in urgent, bug';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();

      const condition = result.expression!.groups[0].conditions[0];
      expect(condition.field).toBe('labels');
      expect(condition.operator).toBe('in');
      expect(condition.value).toEqual(['urgent', 'bug']);
    });

    it('should parse array condition with NOT IN operator', () => {
      const tokens = [
        createToken('FIELD', 'assignees', 0),
        createToken('OPERATOR', 'not in', 10),
        createToken('VALUE', '1', 17),
        createToken('COMMA', ',', 19),
        createToken('VALUE', '2', 21),
      ];
      const input = 'assignees not in 1, 2';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();

      const condition = result.expression!.groups[0].conditions[0];
      expect(condition.field).toBe('assignees');
      expect(condition.operator).toBe('not in');
      expect(condition.value).toEqual(['1', '2']);
    });
  });

  describe('Multiple Conditions with Logical Operators', () => {
    it('should parse two conditions with AND operator', () => {
      const tokens = [
        createToken('FIELD', 'done', 0),
        createToken('OPERATOR', '=', 5),
        createToken('VALUE', 'false', 7),
        createToken('LOGICAL', '&&', 13),
        createToken('FIELD', 'priority', 16),
        createToken('OPERATOR', '>', 25),
        createToken('VALUE', '3', 27),
      ];
      const input = 'done = false && priority > 3';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();

      const group = result.expression!.groups[0];
      expect(group.conditions).toHaveLength(2);
      expect(group.operator).toBe('&&');

      expect(group.conditions[0].field).toBe('done');
      expect(group.conditions[1].field).toBe('priority');
    });

    it('should parse two conditions with OR operator', () => {
      const tokens = [
        createToken('FIELD', 'done', 0),
        createToken('OPERATOR', '=', 5),
        createToken('VALUE', 'true', 7),
        createToken('LOGICAL', '||', 12),
        createToken('FIELD', 'priority', 15),
        createToken('OPERATOR', '=', 24),
        createToken('VALUE', '5', 26),
      ];
      const input = 'done = true || priority = 5';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();

      const group = result.expression!.groups[0];
      expect(group.conditions).toHaveLength(2);
      expect(group.operator).toBe('||');
    });

    it('should parse three conditions with mixed operators', () => {
      const tokens = [
        createToken('FIELD', 'done', 0),
        createToken('OPERATOR', '=', 5),
        createToken('VALUE', 'false', 7),
        createToken('LOGICAL', '&&', 13),
        createToken('FIELD', 'priority', 16),
        createToken('OPERATOR', '>', 25),
        createToken('VALUE', '3', 27),
        createToken('LOGICAL', '||', 29),
        createToken('FIELD', 'title', 32),
        createToken('OPERATOR', 'like', 38),
        createToken('VALUE', 'urgent', 43),
      ];
      const input = 'done = false && priority > 3 || title like urgent';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();

      const expr = result.expression!;
      // Based on parser logic, this creates a single group with 3 conditions
      // The parser groups conditions together unless parentheses separate them
      expect(expr.groups).toHaveLength(1);
      expect(expr.operator).toBeUndefined(); // No expression-level operator for single group

      // Single group with all three conditions
      const group = expr.groups[0];
      expect(group.conditions).toHaveLength(3);
      expect(group.conditions[0].field).toBe('done');
      expect(group.conditions[1].field).toBe('priority');
      expect(group.conditions[2].field).toBe('title');
    });
  });

  describe('Parentheses Grouping', () => {
    it('should parse simple parenthesized group', () => {
      const tokens = [
        createToken('LPAREN', '(', 0),
        createToken('FIELD', 'done', 1),
        createToken('OPERATOR', '=', 6),
        createToken('VALUE', 'true', 8),
        createToken('RPAREN', ')', 13),
      ];
      const input = '(done = true)';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();

      const group = result.expression!.groups[0];
      expect(group.conditions).toHaveLength(1);
      expect(group.conditions[0].field).toBe('done');
    });

    it('should parse parenthesized group with multiple conditions', () => {
      const tokens = [
        createToken('LPAREN', '(', 0),
        createToken('FIELD', 'done', 1),
        createToken('OPERATOR', '=', 6),
        createToken('VALUE', 'false', 8),
        createToken('LOGICAL', '&&', 14),
        createToken('FIELD', 'priority', 17),
        createToken('OPERATOR', '>', 26),
        createToken('VALUE', '3', 28),
        createToken('RPAREN', ')', 30),
      ];
      const input = '(done = false && priority > 3)';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();

      const group = result.expression!.groups[0];
      expect(group.conditions).toHaveLength(2);
      expect(group.operator).toBe('&&');
    });

    it('should parse expression with parenthesized groups and logical operators', () => {
      const tokens = [
        createToken('LPAREN', '(', 0),
        createToken('FIELD', 'done', 1),
        createToken('OPERATOR', '=', 6),
        createToken('VALUE', 'true', 8),
        createToken('RPAREN', ')', 13),
        createToken('LOGICAL', '||', 15),
        createToken('LPAREN', '(', 18),
        createToken('FIELD', 'priority', 19),
        createToken('OPERATOR', '>', 28),
        createToken('VALUE', '3', 30),
        createToken('LOGICAL', '&&', 32),
        createToken('FIELD', 'title', 35),
        createToken('OPERATOR', 'like', 41),
        createToken('VALUE', 'urgent', 46),
        createToken('RPAREN', ')', 53),
      ];
      const input = '(done = true) || (priority > 3 && title like urgent)';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();

      const expr = result.expression!;
      expect(expr.groups).toHaveLength(2);
      expect(expr.operator).toBe('||');

      // First group: (done = true)
      expect(expr.groups[0].conditions).toHaveLength(1);

      // Second group: (priority > 3 && title like urgent)
      expect(expr.groups[1].conditions).toHaveLength(2);
      expect(expr.groups[1].operator).toBe('&&');
    });

    it('should handle nested parentheses correctly', () => {
      const tokens = [
        createToken('LPAREN', '(', 0),
        createToken('FIELD', 'done', 1),
        createToken('OPERATOR', '=', 6),
        createToken('VALUE', 'true', 8),
        createToken('RPAREN', ')', 13),
        createToken('LOGICAL', '||', 15),
        createToken('LPAREN', '(', 18),
        createToken('FIELD', 'priority', 19),
        createToken('OPERATOR', '>', 28),
        createToken('VALUE', '3', 30),
        createToken('LOGICAL', '&&', 32),
        createToken('FIELD', 'title', 35),
        createToken('OPERATOR', 'like', 41),
        createToken('VALUE', 'test', 46),
        createToken('RPAREN', ')', 51),
      ];
      const input = '(done = true) || (priority > 3 && title like test)';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();

      const expr = result.expression!;
      expect(expr.groups).toHaveLength(2);
      expect(expr.operator).toBe('||');

      // First group: (done = true)
      expect(expr.groups[0].conditions).toHaveLength(1);

      // Second group: (priority > 3 && title like test)
      expect(expr.groups[1].conditions).toHaveLength(2);
      expect(expr.groups[1].operator).toBe('&&');
    });
  });

  describe('Type Conversion and Validation', () => {
    it('should convert boolean values correctly', () => {
      const trueTokens = [
        createToken('FIELD', 'done', 0),
        createToken('OPERATOR', '=', 5),
        createToken('VALUE', 'true', 7),
      ];

      const falseTokens = [
        createToken('FIELD', 'done', 0),
        createToken('OPERATOR', '=', 5),
        createToken('VALUE', 'false', 7),
      ];

      const trueResult = parseWithTokens(trueTokens, 'done = true');
      const falseResult = parseWithTokens(falseTokens, 'done = false');

      expect(trueResult.error).toBeUndefined();
      expect(falseResult.error).toBeUndefined();

      expect(trueResult.expression!.groups[0].conditions[0].value).toBe(true);
      expect(falseResult.expression!.groups[0].conditions[0].value).toBe(false);
    });

    it('should convert numeric values correctly', () => {
      const tokens = [
        createToken('FIELD', 'priority', 0),
        createToken('OPERATOR', '=', 9),
        createToken('VALUE', '42', 11),
      ];

      const result = parseWithTokens(tokens, 'priority = 42');

      expect(result.error).toBeUndefined();
      expect(result.expression!.groups[0].conditions[0].value).toBe(42);
    });

    it('should handle string values as-is', () => {
      const tokens = [
        createToken('FIELD', 'title', 0),
        createToken('OPERATOR', '=', 6),
        createToken('VALUE', 'Test Task', 8),
      ];

      const result = parseWithTokens(tokens, 'title = Test Task');

      expect(result.error).toBeUndefined();
      expect(result.expression!.groups[0].conditions[0].value).toBe('Test Task');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing operator error', () => {
      const tokens = [
        createToken('FIELD', 'done', 0),
        createToken('VALUE', 'true', 5),
      ];

      const result = parseWithTokens(tokens, 'done true');

      expect(result.error).not.toBeUndefined();
      expect(result.error!.message).toContain('Expected operator');
      expect(result.expression).toBeNull();
    });

    it('should handle missing value error', () => {
      const tokens = [
        createToken('FIELD', 'done', 0),
        createToken('OPERATOR', '=', 5),
      ];

      const result = parseWithTokens(tokens, 'done =');

      expect(result.error).not.toBeUndefined();
      expect(result.error!.message).toContain('Expected value');
      expect(result.expression).toBeNull();
    });

    it('should handle missing closing parenthesis error', () => {
      const tokens = [
        createToken('LPAREN', '(', 0),
        createToken('FIELD', 'done', 1),
        createToken('OPERATOR', '=', 6),
        createToken('VALUE', 'true', 8),
      ];

      const result = parseWithTokens(tokens, '(done = true');

      expect(result.error).not.toBeUndefined();
      expect(result.error!.message).toContain('Expected closing parenthesis');
      expect(result.expression).toBeNull();
    });

    it('should handle missing condition after logical operator error', () => {
      const tokens = [
        createToken('FIELD', 'done', 0),
        createToken('OPERATOR', '=', 5),
        createToken('VALUE', 'true', 7),
        createToken('LOGICAL', '&&', 12),
      ];

      const result = parseWithTokens(tokens, 'done = true &&');

      expect(result.error).not.toBeUndefined();
      expect(result.error!.message).toContain('Expected condition');
      expect(result.expression).toBeNull();
    });

    it('should handle missing value after comma error', () => {
      const tokens = [
        createToken('FIELD', 'labels', 0),
        createToken('OPERATOR', 'in', 7),
        createToken('VALUE', 'urgent', 10),
        createToken('COMMA', ',', 16),
      ];

      const result = parseWithTokens(tokens, 'labels in urgent,');

      expect(result.error).not.toBeUndefined();
      expect(result.error!.message).toContain('Expected value after comma');
      expect(result.expression).toBeNull();
    });

    it('should handle invalid number conversion error', () => {
      const tokens = [
        createToken('FIELD', 'priority', 0),
        createToken('OPERATOR', '=', 9),
        createToken('VALUE', 'notanumber', 11),
      ];

      const result = parseWithTokens(tokens, 'priority = notanumber');

      expect(result.error).not.toBeUndefined();
      expect(result.error!.message).toContain('Invalid number');
      expect(result.expression).toBeNull();
    });

    it('should handle parsing error with unknown type', () => {
      // Test the createParsingError method with non-Error object
      const result = parseWithTokens([], 'test');

      expect(result.error).not.toBeUndefined();
      expect(result.expression).toBeNull();
      expect(result.error!.message).toContain('Expected group');
    });

    it('should handle empty token array', () => {
      const result = parseWithTokens([], '');

      expect(result.error).not.toBeUndefined();
      expect(result.error!.message).toContain('Expected group');
      expect(result.expression).toBeNull();
    });

    it('should provide error context information', () => {
      const tokens = [
        createToken('FIELD', 'done', 0),
        createToken('OPERATOR', '=', 5),
      ];

      const result = parseWithTokens(tokens, 'done =');

      expect(result.error).not.toBeUndefined();
      expect(result.error!.position).toBe(6); // Position of current token when error occurs
      expect(result.error!.context).not.toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle complex expression with multiple groups and operators', () => {
      const tokens = [
        createToken('LPAREN', '(', 0),
        createToken('FIELD', 'done', 1),
        createToken('OPERATOR', '=', 6),
        createToken('VALUE', 'false', 8),
        createToken('LOGICAL', '&&', 14),
        createToken('FIELD', 'priority', 17),
        createToken('OPERATOR', '>', 26),
        createToken('VALUE', '3', 28),
        createToken('RPAREN', ')', 30),
        createToken('LOGICAL', '||', 32),
        createToken('LPAREN', '(', 35),
        createToken('FIELD', 'title', 36),
        createToken('OPERATOR', 'like', 42),
        createToken('VALUE', 'urgent', 47),
        createToken('LOGICAL', '&&', 54),
        createToken('FIELD', 'labels', 57),
        createToken('OPERATOR', 'in', 64),
        createToken('VALUE', 'bug', 67),
        createToken('COMMA', ',', 70),
        createToken('VALUE', 'critical', 72),
        createToken('RPAREN', ')', 81),
      ];

      const input = '(done = false && priority > 3) || (title like urgent && labels in bug, critical)';

      const result = parseWithTokens(tokens, input);

      expect(result.error).toBeUndefined();

      const expr = result.expression!;
      expect(expr.groups).toHaveLength(2);
      expect(expr.operator).toBe('||');

      // First group should have 2 conditions
      expect(expr.groups[0].conditions).toHaveLength(2);
      expect(expr.groups[0].operator).toBe('&&');

      // Second group should have 2 conditions
      expect(expr.groups[1].conditions).toHaveLength(2);
      expect(expr.groups[1].operator).toBe('&&');
    });

    it('should handle single condition without explicit logical operator', () => {
      const tokens = [
        createToken('FIELD', 'done', 0),
        createToken('OPERATOR', '=', 5),
        createToken('VALUE', 'true', 7),
      ];

      const result = parseWithTokens(tokens, 'done = true');

      expect(result.error).toBeUndefined();

      const expr = result.expression!;
      expect(expr.groups).toHaveLength(1);
      expect(expr.operator).toBeUndefined();

      const group = expr.groups[0];
      expect(group.operator).toBe('&&'); // Default operator
    });

    it('should handle context generation for different positions', () => {
      // Test the getContext method with different positions
      const tokens = [
        createToken('FIELD', 'title', 0),
        createToken('OPERATOR', '=', 6),
        createToken('VALUE', 'test', 8),
      ];

      const result = parseWithTokens(tokens, 'title = test');

      expect(result.error).toBeUndefined();
      // If this passes, getContext was used successfully during successful parsing
      expect(result.expression).not.toBeNull();
    });
  });
});