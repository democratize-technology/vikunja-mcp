/**
 * Security validation tests for XSS protection
 *
 * This test suite validates the security validation utilities without requiring
 * database connectivity.
 */

import {
  sanitizeString,
  validateField,
  validateOperator,
  validateLogicalOperator,
  validateValue,
  validateCondition,
  validateFilterExpression,
  safeJsonStringify,
  safeJsonParse,
} from '../../src/utils/validation';
import { StorageDataError } from '../../src/storage/interfaces';
import type { FilterExpression } from '../../src/types/filters';

describe('Security Validation Utilities', () => {
  describe('sanitizeString', () => {
    it('should allow safe strings', () => {
      const safeString = 'This is a safe string';
      expect(sanitizeString(safeString)).toBe(safeString);
    });

    it('should escape HTML special characters', () => {
      const testString = '<b>alert("test")</b>';
      const expected = '&lt;b&gt;alert(&quot;test&quot;)&lt;&#x2F;b&gt;';
      expect(sanitizeString(testString)).toBe(expected);
    });

    it('should reject XSS patterns', () => {
      const maliciousStrings = [
        '<script>alert("XSS")',
        '<img src=x onerror=alert("XSS")>',
        'javascript:alert("XSS")',
        '<iframe src="javascript:alert(`XSS`)">',
        'data:text/html,<script>alert("XSS")',
        '<svg onload=alert("XSS")>',
        '<!-- <script>alert("XSS") -->',
        'expression(alert("XSS"))',
        'eval(alert("XSS"))',
        'Function(alert("XSS"))',
      ];

      maliciousStrings.forEach(maliciousString => {
        expect(() => sanitizeString(maliciousString)).toThrow(StorageDataError);
      });
    });

    it('should reject strings that are too long', () => {
      const longString = 'a'.repeat(1001);
      expect(() => sanitizeString(longString)).toThrow(StorageDataError);
    });

    it('should reject non-string values', () => {
      expect(() => sanitizeString(123)).toThrow(StorageDataError);
      expect(() => sanitizeString(null)).toThrow(StorageDataError);
      expect(() => sanitizeString(undefined)).toThrow(StorageDataError);
    });
  });

  describe('validateField', () => {
    it('should allow valid fields', () => {
      const validFields = ['done', 'priority', 'title', 'description'];
      validFields.forEach(field => {
        expect(validateField(field)).toBe(field);
      });
    });

    it('should reject prototype pollution attempts', () => {
      const maliciousFields = ['__proto__', 'constructor', 'prototype'];
      maliciousFields.forEach(field => {
        expect(() => validateField(field)).toThrow(StorageDataError);
      });
    });

    it('should reject invalid fields', () => {
      const invalidFields = ['invalidField', 'admin', 'role', 'password'];
      invalidFields.forEach(field => {
        expect(() => validateField(field)).toThrow(StorageDataError);
      });
    });
  });

  describe('validateOperator', () => {
    it('should allow valid operators', () => {
      const validOperators = ['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'not in'];
      validOperators.forEach(operator => {
        expect(validateOperator(operator)).toBe(operator);
      });
    });

    it('should reject malicious operators', () => {
      const maliciousOperators = ['$where', '$ne', '$gt', '$regex', '$eval'];
      maliciousOperators.forEach(operator => {
        expect(() => validateOperator(operator)).toThrow(StorageDataError);
      });
    });
  });

  describe('validateLogicalOperator', () => {
    it('should allow valid logical operators', () => {
      expect(validateLogicalOperator('&&')).toBe('&&');
      expect(validateLogicalOperator('||')).toBe('||');
    });

    it('should reject invalid logical operators', () => {
      const invalidOperators = ['AND', 'OR', 'xor', 'nand'];
      invalidOperators.forEach(operator => {
        expect(() => validateLogicalOperator(operator)).toThrow(StorageDataError);
      });
    });
  });

  describe('validateValue', () => {
    it('should allow safe strings', () => {
      expect(validateValue('safe string')).toBe('safe string');
    });

    it('should escape safe HTML', () => {
      const safeValue = '<b>important</b>';
      const expected = '&lt;b&gt;important&lt;&#x2F;b&gt;';
      expect(validateValue(safeValue)).toBe(expected);
    });

    it('should allow finite numbers', () => {
      expect(validateValue(42)).toBe(42);
      expect(validateValue(3.14)).toBe(3.14);
      expect(validateValue(-1)).toBe(-1);
    });

    it('should reject infinite numbers', () => {
      expect(() => validateValue(Infinity)).toThrow(StorageDataError);
      expect(() => validateValue(-Infinity)).toThrow(StorageDataError);
      expect(() => validateValue(NaN)).toThrow(StorageDataError);
    });

    it('should allow booleans', () => {
      expect(validateValue(true)).toBe(true);
      expect(validateValue(false)).toBe(false);
    });

    it('should allow safe string arrays', () => {
      const safeArray = ['item1', 'item2', 'item3'];
      const expected = ['item1', 'item2', 'item3'];
      expect(validateValue(safeArray)).toEqual(expected);
    });

    it('should allow safe number arrays', () => {
      const safeArray = [1, 2, 42];
      const expected = [1, 2, 42];
      expect(validateValue(safeArray)).toEqual(expected);
    });

    it('should escape strings in arrays', () => {
      const safeArray = ['<b>item</b>', 'safe'];
      const expected = ['&lt;b&gt;item&lt;&#x2F;b&gt;', 'safe'];
      expect(validateValue(safeArray)).toEqual(expected);
    });

    it('should reject arrays that are too large', () => {
      const largeArray = Array(101).fill('item');
      expect(() => validateValue(largeArray)).toThrow(StorageDataError);
    });

    it('should reject invalid array elements', () => {
      const invalidArray = ['valid', { invalid: 'object' }];
      expect(() => validateValue(invalidArray)).toThrow(StorageDataError);
    });

    it('should reject mixed type arrays', () => {
      const mixedArray = ['string', 42, 'another'];
      expect(() => validateValue(mixedArray)).toThrow(StorageDataError);
    });
  });

  describe('validateCondition', () => {
    it('should allow valid conditions', () => {
      const validCondition = {
        field: 'title',
        operator: 'like',
        value: 'test'
      };
      const result = validateCondition(validCondition);
      expect(result).toEqual(validCondition);
    });

    it('should reject conditions with XSS in values', () => {
      const maliciousCondition = {
        field: 'title',
        operator: 'like',
        value: '<script>alert("XSS")</script>'
      };
      expect(() => validateCondition(maliciousCondition)).toThrow(StorageDataError);
    });

    it('should reject conditions with prototype pollution', () => {
      const maliciousCondition = {
        field: '__proto__',
        operator: '=',
        value: 'malicious'
      };
      expect(() => validateCondition(maliciousCondition)).toThrow(StorageDataError);
    });

    it('should reject incomplete conditions', () => {
      const incompleteConditions = [
        { field: 'title', operator: 'like' }, // missing value
        { field: 'title', value: 'test' }, // missing operator
        { operator: 'like', value: 'test' }, // missing field
        null,
        undefined,
        'string'
      ];
      incompleteConditions.forEach(condition => {
        expect(() => validateCondition(condition)).toThrow(StorageDataError);
      });
    });
  });

  describe('validateFilterExpression', () => {
    const createSafeExpression = (): FilterExpression => ({
      groups: [{
        conditions: [{
          field: 'title',
          operator: 'like',
          value: 'test'
        }],
        operator: '&&'
      }]
    });

    it('should allow valid expressions', () => {
      const validExpression = createSafeExpression();
      const result = validateFilterExpression(validExpression);
      expect(result).toEqual(validExpression);
    });

    it('should reject expressions with XSS in values', () => {
      const maliciousExpression: FilterExpression = {
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: '<script>alert("XSS")</script>'
          }],
          operator: '&&'
        }]
      };
      expect(() => validateFilterExpression(maliciousExpression)).toThrow(StorageDataError);
    });

    it('should reject expressions with prototype pollution', () => {
      const maliciousExpression: FilterExpression = {
        groups: [{
          conditions: [{
            field: '__proto__',
            operator: '=',
            value: 'malicious'
          }],
          operator: '&&'
        }]
      };
      expect(() => validateFilterExpression(maliciousExpression)).toThrow(StorageDataError);
    });

    it('should reject expressions with too many conditions', () => {
      const manyConditions = [];
      for (let i = 0; i < 60; i++) { // Exceed MAX_CONDITIONS
        manyConditions.push({
          field: 'title',
          operator: 'like',
          value: `condition${i}`
        });
      }
      const maliciousExpression: FilterExpression = {
        groups: [{
          conditions: manyConditions,
          operator: '&&'
        }]
      };
      expect(() => validateFilterExpression(maliciousExpression)).toThrow(StorageDataError);
    });

    it('should reject empty expressions', () => {
      expect(() => validateFilterExpression(null)).toThrow(StorageDataError);
      expect(() => validateFilterExpression(undefined)).toThrow(StorageDataError);
      expect(() => validateFilterExpression({})).toThrow(StorageDataError);
      expect(() => validateFilterExpression({ groups: [] })).toThrow(StorageDataError);
    });
  });

  describe('safeJsonStringify', () => {
    it('should stringify valid expressions', () => {
      const validExpression = {
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: 'test'
          }],
          operator: '&&'
        }]
      };
      const result = safeJsonStringify(validExpression);
      expect(JSON.parse(result)).toEqual(validExpression);
    });

    it('should reject malicious expressions', () => {
      const maliciousExpression = {
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: '<script>alert("XSS")</script>'
          }],
          operator: '&&'
        }]
      };
      expect(() => safeJsonStringify(maliciousExpression)).toThrow(StorageDataError);
    });

    it('should detect circular references', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      expect(() => safeJsonStringify(circular)).toThrow(StorageDataError);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON expressions', () => {
      const validJson = '{"groups":[{"conditions":[{"field":"title","operator":"like","value":"test"}],"operator":"&&"}]}';
      const result = safeJsonParse(validJson);
      expect(result).toHaveProperty('groups');
      expect(result.groups).toHaveLength(1);
    });

    it('should reject malicious JSON', () => {
      const maliciousJson = '{"groups":[{"conditions":[{"field":"title","operator":"like","value":"<script>alert(\\"XSS\\")</script>"}],"operator":"&&"}]}';
      expect(() => safeJsonParse(maliciousJson)).toThrow(StorageDataError);
    });

    it('should reject JSON with prototype pollution', () => {
      const maliciousJson = '{"groups":[{"conditions":[{"field":"__proto__","operator":"=","value":"malicious"}],"operator":"&&"}]}';
      expect(() => safeJsonParse(maliciousJson)).toThrow(StorageDataError);
    });

    it('should reject strings that are too long', () => {
      const longJson = 'a'.repeat(50001);
      expect(() => safeJsonParse(longJson)).toThrow(StorageDataError);
    });

    it('should reject invalid JSON', () => {
      expect(() => safeJsonParse('invalid json')).toThrow(StorageDataError);
      expect(() => safeJsonParse('')).toThrow(StorageDataError);
      expect(() => safeJsonParse(123)).toThrow(StorageDataError);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex valid expressions', () => {
      const complexExpression: FilterExpression = {
        groups: [
          {
            conditions: [
              { field: 'title', operator: 'like', value: 'important' },
              { field: 'priority', operator: '>', value: 5 }
            ],
            operator: '&&'
          },
          {
            conditions: [
              { field: 'done', operator: '=', value: false }
            ],
            operator: '||'
          }
        ],
        operator: '&&'
      };

      const jsonString = safeJsonStringify(complexExpression);
      const parsedExpression = safeJsonParse(jsonString);
      expect(parsedExpression).toEqual(complexExpression);
    });

    it('should prevent multiple attack vectors simultaneously', () => {
      const sophisticatedAttack: FilterExpression = {
        groups: [{
          conditions: [
            { field: '__proto__', operator: '=', value: 'pollution' },
            { field: 'title', operator: 'like', value: '<script>alert("XSS")</script>' },
            { field: 'description', operator: '=', value: 'javascript:alert("XSS")' }
          ],
          operator: '&&'
        }]
      };

      expect(() => safeJsonStringify(sophisticatedAttack)).toThrow(StorageDataError);
    });
  });
});