/**
 * Type safety tests for validation utilities
 * Tests for unsafe type assignments and missing type guards
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateValue,
  validateFilterExpression,
} from '../../src/utils/validation';
import { StorageDataError } from '../../src/utils/storage-errors';
import type { FilterExpression } from '../../src/types/filters';

describe('Type Safety Validation Tests', () => {
  describe('validateValue type safety', () => {
    it('should safely handle arrays with mixed types that could bypass validation', () => {
      // This test targets the unsafe type assertion at line 260
      const mixedArray = [1, 'string', 2];

      // Before fix: this would unsafely cast to string[] | number[]
      // After fix: this should throw proper error
      expect(() => validateValue(mixedArray)).toThrow(StorageDataError);
    });

    it('should safely handle arrays with null/undefined elements', () => {
      const arrayWithNull = [1, null, 2];
      const arrayWithUndefined = [1, undefined, 2];

      expect(() => validateValue(arrayWithNull)).toThrow(StorageDataError);
      expect(() => validateValue(arrayWithUndefined)).toThrow(StorageDataError);
    });

    it('should safely handle arrays with object elements', () => {
      const arrayOfObjects = [{}, { key: 'value' }];

      expect(() => validateValue(arrayOfObjects)).toThrow(StorageDataError);
    });

    it('should safely handle arrays with nested arrays', () => {
      const arrayOfArrays = [[1, 2], [3, 4]];

      expect(() => validateValue(arrayOfArrays)).toThrow(StorageDataError);
    });
  });

  describe('validateFilterExpression type safety', () => {
    it('should safely handle objects without proper structure validation', () => {
      // This test targets the unsafe type assertion at line 315
      const maliciousObject = {
        groups: [
          {
            operator: '&&',
            conditions: [{ field: 'title', operator: '=', value: 'test' }]
          }
        ],
        __proto__: { groups: 'malicious' },
        constructor: { name: 'Array' },
        toString: () => 'malicious'
      };

      // Before fix: unsafe type assertion could bypass validation
      // After fix: proper type guard validation should catch this
      const result = validateFilterExpression(maliciousObject);
      expect(result).toBeDefined();
      expect(result.groups).toBeInstanceOf(Array);
    });

    it('should safely handle objects with prototype pollution attempts', () => {
      const pollutedObject = Object.create({});
      pollutedObject.__proto__.groups = 'polluted';
      (pollutedObject as any).groups = [{
        operator: '&&',
        conditions: [{ field: 'title', operator: '=', value: 'test' }]
      }]; // Add legitimate groups
      pollutedObject.toString = () => 'polluted';

      const result = validateFilterExpression(pollutedObject);
      expect(result).toBeDefined();
      expect(Array.isArray(result.groups)).toBe(true);
    });

    it('should safely handle objects with non-array groups but Array-like properties', () => {
      const arrayLikeObject = {
        groups: {
          0: { operator: '&&', conditions: [] },
          1: { operator: '||', conditions: [] },
          length: 2,
          toString: () => '[object Object]',
          [Symbol.iterator]: function* () {
            yield this[0];
            yield this[1];
          }
        }
      };

      // Before fix: type assertion might bypass Array.isArray check
      // After fix: should properly reject non-array groups
      expect(() => validateFilterExpression(arrayLikeObject as any)).toThrow(StorageDataError);
    });

    it('should safely handle objects where groups property is a string', () => {
      const invalidObject = {
        groups: '["not", "an", "array"]',
        toString: () => '{"groups": ["not", "an", "array"]}'
      };

      expect(() => validateFilterExpression(invalidObject as any)).toThrow(StorageDataError);
    });

    it('should safely handle objects with circular references', () => {
      const circular: any = {
        groups: [
          {
            operator: '&&',
            conditions: [{ field: 'title', operator: '=', value: 'test' }]
          }
        ]
      };
      circular.self = circular;
      circular.groups.push({
        operator: '&&',
        conditions: [{ field: 'title', operator: '=', value: 'test' }],
        circular: circular // Add circular reference in a way that doesn't break structure
      });

      // Before fix: unsafe type assertion at line 388 could return malformed object
      // After fix: should either validate safely or throw appropriate error
      const result = validateFilterExpression(circular);
      expect(result).toBeDefined();
      expect(Array.isArray(result.groups)).toBe(true);
    });
  });

  describe('Runtime type verification', () => {
    it('should verify validateValue returns proper types at runtime', () => {
      const testValues = [
        { input: 'string', expectedType: 'string' },
        { input: 42, expectedType: 'number' },
        { input: true, expectedType: 'boolean' },
        { input: ['string1', 'string2'], expectedType: 'array' },
        { input: [1, 2, 3], expectedType: 'array' }
      ];

      testValues.forEach(({ input, expectedType }) => {
        const result = validateValue(input);

        if (expectedType === 'string') {
          expect(typeof result).toBe('string');
        } else if (expectedType === 'number') {
          expect(typeof result).toBe('number');
        } else if (expectedType === 'boolean') {
          expect(typeof result).toBe('boolean');
        } else if (expectedType === 'array') {
          expect(Array.isArray(result)).toBe(true);
        }
      });
    });

    it('should verify validateFilterExpression returns proper FilterExpression structure', () => {
      const validExpression = {
        groups: [
          {
            operator: '&&' as const,
            conditions: [{ field: 'title' as const, operator: '=' as const, value: 'test' }]
          }
        ]
      };

      const result = validateFilterExpression(validExpression);

      // Runtime verification of returned structure
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
      expect(Array.isArray(result.groups)).toBe(true);
      expect(result.groups.length).toBeGreaterThan(0);

      // Verify structure of first group
      const firstGroup = result.groups[0];
      expect(typeof firstGroup).toBe('object');
      expect(firstGroup).not.toBeNull();
      expect(typeof firstGroup.operator).toBe('string');
      expect(Array.isArray(firstGroup.conditions)).toBe(true);

      // Verify structure of first condition
      const firstCondition = firstGroup.conditions[0];
      expect(typeof firstCondition).toBe('object');
      expect(firstCondition).not.toBeNull();
      expect(typeof firstCondition.field).toBe('string');
      expect(typeof firstCondition.operator).toBe('string');
    });
  });
});