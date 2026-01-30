/**
 * Verification tests for type safety fixes
 * Tests that the unsafe type assertions have been properly fixed
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateValue,
  validateFilterExpression,
} from '../../src/utils/validation';
import { MCPError } from '../../src/types/errors';
import type { FilterExpression } from '../../src/types/filters';

describe('Type Safety Verification Tests', () => {
  describe('validateValue type safety verification', () => {
    it('should handle mixed-type arrays safely (was line 260 unsafe assertion)', () => {
      const mixedArray = [1, 'string', 2];

      expect(() => validateValue(mixedArray)).toThrow(MCPError);
      expect(() => validateValue(mixedArray)).toThrow('Array elements must be all strings or all finite numbers, not mixed');
    });

    it('should handle arrays with null/undefined elements safely', () => {
      const arrayWithNull = [1, null, 2];
      const arrayWithUndefined = [1, undefined, 2];

      expect(() => validateValue(arrayWithNull)).toThrow(MCPError);
      expect(() => validateValue(arrayWithUndefined)).toThrow(MCPError);
    });

    it('should handle arrays with object elements safely', () => {
      const arrayOfObjects = [{}, { key: 'value' }];

      expect(() => validateValue(arrayOfObjects)).toThrow(MCPError);
      expect(() => validateValue(arrayOfObjects)).toThrow('Array elements must be all strings or all finite numbers, not mixed');
    });

    it('should still accept valid string arrays', () => {
      const validStringArray = ['item1', 'item2', 'item3'];
      const result = validateValue(validStringArray);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
      expect(typeof result[0]).toBe('string');
      expect(typeof result[1]).toBe('string');
      expect(typeof result[2]).toBe('string');
    });

    it('should still accept valid number arrays', () => {
      const validNumberArray = [1, 2, 3, 4.5];
      const result = validateValue(validNumberArray);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(4);
      expect(typeof result[0]).toBe('number');
      expect(typeof result[1]).toBe('number');
      expect(typeof result[2]).toBe('number');
      expect(typeof result[3]).toBe('number');
    });

    it('should reject infinite numbers in arrays', () => {
      const arrayWithInfinity = [1, 2, Infinity];
      const arrayWithNaN = [1, 2, NaN];

      expect(() => validateValue(arrayWithInfinity)).toThrow(MCPError);
      expect(() => validateValue(arrayWithNaN)).toThrow(MCPError);
    });
  });

  describe('validateFilterExpression type safety verification', () => {
    it('should handle non-array groups safely (was line 315 unsafe assertion)', () => {
      const invalidObject = {
        groups: 'not an array'
      };

      expect(() => validateFilterExpression(invalidObject)).toThrow(MCPError);
      expect(() => validateFilterExpression(invalidObject)).toThrow('Invalid filter expression');
    });

    it('should handle array-like objects safely', () => {
      const arrayLikeObject = {
        groups: {
          0: { operator: '&&', conditions: [{ field: 'title', operator: '=', value: 'test' }] },
          length: 1,
          toString: () => '[object Object]'
        }
      };

      expect(() => validateFilterExpression(arrayLikeObject as any)).toThrow(MCPError);
    });

    it('should handle objects with missing groups property safely', () => {
      const noGroupsObject = {
        operator: '&&'
      };

      expect(() => validateFilterExpression(noGroupsObject as any)).toThrow(MCPError);
    });

    it('should handle null expression safely', () => {
      expect(() => validateFilterExpression(null)).toThrow(MCPError);
      expect(() => validateFilterExpression(undefined)).toThrow(MCPError);
    });

    it('should still accept valid filter expressions', () => {
      const validExpression = {
        groups: [
          {
            operator: '&&',
            conditions: [{ field: 'title', operator: '=', value: 'test' }]
          }
        ]
      };

      const result = validateFilterExpression(validExpression);

      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
      expect(Array.isArray(result.groups)).toBe(true);
      expect(result.groups.length).toBe(1);

      const group = result.groups[0];
      expect(typeof group.operator).toBe('string');
      expect(Array.isArray(group.conditions)).toBe(true);
      expect(group.conditions.length).toBe(1);

      const condition = group.conditions[0];
      expect(typeof condition.field).toBe('string');
      expect(typeof condition.operator).toBe('string');
    });

    it('should handle complex valid expressions safely', () => {
      const complexExpression = {
        groups: [
          {
            operator: '&&',
            conditions: [
              { field: 'title', operator: '=', value: 'test' },
              { field: 'priority', operator: '>', value: 5 }
            ]
          },
          {
            operator: '||',
            conditions: [
              { field: 'done', operator: '=', value: true }
            ]
          }
        ],
        operator: '&&'
      };

      expect(() => validateFilterExpression(complexExpression)).not.toThrow();
    });

    it('should verify runtime type safety of returned FilterExpression', () => {
      const expression = {
        groups: [
          {
            operator: '&&',
            conditions: [
              { field: 'title', operator: '=', value: 'Test Title' },
              { field: 'assignees', operator: 'in', value: ['user1', 'user2'] }
            ]
          }
        ]
      };

      const result = validateFilterExpression(expression) as FilterExpression;

      // Runtime verification that the returned object matches the expected interface
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(Array.isArray(result.groups)).toBe(true);

      // Verify group structure
      const group = result.groups[0];
      expect(typeof group.operator).toBe('string');
      expect(Array.isArray(group.conditions)).toBe(true);

      // Verify condition structure
      const condition1 = group.conditions[0];
      expect(typeof condition1.field).toBe('string');
      expect(typeof condition1.operator).toBe('string');
      expect(typeof condition1.value).toBe('string');

      const condition2 = group.conditions[1];
      expect(typeof condition2.field).toBe('string');
      expect(typeof condition2.operator).toBe('string');
      expect(Array.isArray(condition2.value)).toBe(true);
      expect(typeof (condition2.value as string[])[0]).toBe('string');
    });
  });

  describe('Edge cases and security', () => {
    it('should handle objects with prototype pollution attempts', () => {
      const pollutedObject = Object.create({});
      pollutedObject.__proto__.groups = 'polluted';
      (pollutedObject as any).groups = [{
        operator: '&&',
        conditions: [{ field: 'title', operator: '=', value: 'test' }]
      }];

      // Should still work with legitimate groups
      expect(() => validateFilterExpression(pollutedObject)).not.toThrow();
    });

    it('should handle very deep nesting safely', () => {
      // Test that depth limit is enforced
      const deepExpression = {
        groups: Array.from({ length: 15 }, (_, i) => ({
          operator: '&&',
          conditions: [{ field: 'title', operator: '=', value: `test${i}` }]
        }))
      };

      expect(() => validateFilterExpression(deepExpression)).toThrow(MCPError);
    });

    it('should handle expressions with many conditions safely', () => {
      // Test that condition limit is enforced
      const largeExpression = {
        groups: [{
          operator: '&&',
          conditions: Array.from({ length: 60 }, (_, i) => ({
            field: 'title',
            operator: '=',
            value: `test${i}`
          }))
        }]
      };

      expect(() => validateFilterExpression(largeExpression)).toThrow(MCPError);
    });
  });
});