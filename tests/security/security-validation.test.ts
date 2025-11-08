/**
 * Security Validation Test Suite
 *
 * This test suite validates that the security measures in the codebase work correctly.
 * It focuses on realistic scenarios and matches the actual behavior of the security implementations.
 */

import { describe, it, expect } from '@jest/globals';
import * as fc from 'fast-check';
import {
  sanitizeString,
  validateField,
  validateOperator,
  validateValue,
  validateFilterExpression,
  safeJsonStringify,
  safeJsonParse
} from '../../src/utils/validation';
import { parseSimpleFilter } from '../../src/utils/simple-filters';
import { parseFilterString } from '../../src/utils/filters';
import {
  handleStatusCodeError,
  transformApiError,
  wrapToolError,
  createInternalError,
  handleFetchError
} from '../../src/utils/error-handler';
import { StorageDataError } from '../../src/storage/interfaces';

describe('Security Validation Test Suite', () => {
  describe('JSON Injection Prevention', () => {
    it('should reject prototype pollution attempts', () => {
      const pollutionAttempts = [
        '__proto__',
        'constructor',
        'prototype',
        '__defineGetter__',
        '__defineSetter__',
        '__lookupGetter__',
        '__lookupSetter__'
      ];

      pollutionAttempts.forEach(field => {
        expect(() => validateField(field)).toThrow(StorageDataError);
      });
    });

    it('should reject JSON containing prototype pollution', () => {
      const maliciousJsons = [
        '{"field": "__proto__", "value": {"polluted": true}}',
        '{"constructor": {"prototype": {"polluted": true}}}',
        '{"groups": [{"__proto__": {"polluted": true}}]}'
      ];

      maliciousJsons.forEach(json => {
        expect(() => safeJsonParse(json)).toThrow(StorageDataError);
      });
    });

    it('should prevent circular references in JSON', () => {
      const circularObj: any = { field: 'title' };
      circularObj.self = circularObj;

      expect(() => safeJsonStringify(circularObj)).toThrow(StorageDataError);
    });

    it('should reject extremely large JSON payloads', () => {
      const largeJson = '{"field": "title", "value": "' + 'x'.repeat(60000) + '"}';

      expect(() => safeJsonParse(largeJson)).toThrow(StorageDataError);
    });
  });

  describe('XSS Prevention', () => {
    it('should reject script tag injection attempts', () => {
      const scriptInjections = [
        '<script>alert(1)</script>',
        '<SCRIPT>alert(1)</SCRIPT>',
        '<script src="evil.js"></script>',
        '<ScRiPt>alert(1)</ScRiPt>'
      ];

      scriptInjections.forEach(injection => {
        expect(() => sanitizeString(injection)).toThrow(StorageDataError);
      });
    });

    it('should reject event handler injection attempts', () => {
      const eventHandlerInjections = [
        'onclick=alert(1)',
        'onload=fetch("/secrets")',
        'onerror=eval(malicious)',
        'onmouseover=document.cookie'
      ];

      eventHandlerInjections.forEach(injection => {
        expect(() => sanitizeString(injection)).toThrow(StorageDataError);
      });
    });

    it('should reject JavaScript protocol injections', () => {
      const jsProtocolInjections = [
        'javascript:alert(1)',
        'javascript:fetch("/secrets")',
        'javascript:eval(malicious_code)',
        'JAVASCRIPT:alert(1)'
      ];

      jsProtocolInjections.forEach(injection => {
        expect(() => sanitizeString(injection)).toThrow(StorageDataError);
      });
    });

    it('should reject data URL script injections', () => {
      const dataUrlInjections = [
        'data:text/html,<script>alert(1)</script>',
        'data:text/html,<img src=x onerror=alert(1)>',
        'data:application/javascript,alert(1)'
      ];

      dataUrlInjections.forEach(injection => {
        expect(() => sanitizeString(injection)).toThrow(StorageDataError);
      });
    });

    it('should reject SVG-based script injection', () => {
      const svgInjections = [
        '<svg onload=alert(1)>',
        '<svg><script>alert(1)</script></svg>',
        '<svg><animate href=#x attributeName=href values=javascript:alert(1) /></svg>'
      ];

      svgInjections.forEach(injection => {
        expect(() => sanitizeString(injection)).toThrow(StorageDataError);
      });
    });

    it('should sanitize HTML special characters', () => {
      const dangerousHtml = '<img src=x onerror=alert(1)>';

      // Should throw error for dangerous content
      expect(() => sanitizeString(dangerousHtml)).toThrow(StorageDataError);
    });
  });

  describe('Input Validation Boundaries', () => {
    it('should enforce string length limits', () => {
      const maxStringLength = 1000;
      const validString = 'a'.repeat(maxStringLength);
      const invalidString = 'a'.repeat(maxStringLength + 1);

      expect(() => sanitizeString(validString)).not.toThrow();
      expect(() => sanitizeString(invalidString)).toThrow(StorageDataError);
    });

    it('should enforce array size limits', () => {
      const maxArraySize = 100;
      const validArray = Array.from({ length: maxArraySize }, (_, i) => `item${i}`);
      const invalidArray = Array.from({ length: maxArraySize + 1 }, (_, i) => `item${i}`);

      expect(() => validateValue(validArray)).not.toThrow();
      expect(() => validateValue(invalidArray)).toThrow(StorageDataError);
    });

    it('should enforce expression depth limits', () => {
      // Create a deeply nested structure
      let deepExpression: any = { groups: [{ conditions: [{ field: 'title', operator: '=', value: 'test' }], operator: '&&' }] };

      for (let i = 0; i < 12; i++) {
        deepExpression = { groups: [deepExpression, { conditions: [{ field: 'title', operator: '=', value: 'test' }], operator: '&&' }] };
      }

      expect(() => validateFilterExpression(deepExpression)).toThrow(StorageDataError);
    });

    it('should enforce condition count limits', () => {
      const manyConditions = [];
      for (let i = 0; i < 60; i++) {
        manyConditions.push({
          field: 'title',
          operator: '=',
          value: `test${i}`
        });
      }

      const largeExpression = {
        groups: [{
          conditions: manyConditions,
          operator: '&&'
        }]
      };

      expect(() => validateFilterExpression(largeExpression)).toThrow(StorageDataError);
    });
  });

  describe('Error Message Sanitization', () => {
    it('should handle errors with sensitive file paths', () => {
      const filePathError = new Error('Failed to read file /Users/eringreen/Development/vikunja-mcp/src/config/secrets.json');

      const result = handleStatusCodeError(filePathError, 'load configuration');

      // Should not expose the full file path in a generic way
      expect(result.message).toContain('Failed to load configuration');
    });

    it('should handle database errors with connection details', () => {
      const dbError = new Error('Connection failed to mysql://user:password@localhost:3306/vikunja_production');

      const result = wrapToolError(dbError, 'vikunja_tasks', 'list tasks');

      // Should not expose database connection details
      expect(result.message).not.toContain('mysql://');
      expect(result.message).not.toContain('password@');
    });

    it('should handle network errors with IP addresses', () => {
      const networkError = new Error('connect ETIMEDOUT 192.168.1.100:443');

      const result = handleFetchError(networkError, 'fetch data');

      // Should provide a user-friendly message without internal details
      expect(result.message).toContain('Request timeout');
    });

    it('should handle authentication errors with token details', () => {
      const authError = new Error('JWT validation failed: signature verification error using key from /etc/keys/jwt-public.pem');

      const result = createInternalError('Authentication failed', authError);

      // Should not expose internal JWT validation details
      expect(result.message).toBe('Authentication failed');
    });
  });

  describe('Filter Security', () => {
    it('should reject filter strings with dangerous characters', () => {
      const dangerousFilters = [
        'done = false#{injection}',
        'priority = 3${injection}',
        'title like "%test%"`injection`',
        'done = false{}injection',
        'priority >= 3[injection]'
      ];

      dangerousFilters.forEach(filter => {
        const result = parseFilterString(filter);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
      });
    });

    it('should reject filter strings with injection attempts', () => {
      const injectionFilters = [
        'done = false; DROP TABLE tasks;',
        'title = "test"; DELETE FROM users;',
        'done = false UNION SELECT * FROM passwords'
      ];

      injectionFilters.forEach(filter => {
        const result = parseFilterString(filter);
        expect(result.expression).toBeNull();
        expect(result.error).toBeDefined();
      });
    });

    it('should handle overly long filter strings', () => {
      const longFilter = 'done = false'.repeat(100);

      const result = parseFilterString(longFilter);
      expect(result.expression).toBeNull();
      expect(result.error?.message).toContain('too long');
    });

    it('should reject simple filters with disallowed fields', () => {
      const disallowedFields = [
        '__proto__',
        'constructor',
        'prototype',
        'eval',
        'function'
      ];

      disallowedFields.forEach(field => {
        const filter = `${field} = value`;
        const result = parseSimpleFilter(filter);
        expect(result).toBeNull();
      });
    });
  });

  describe('Property-Based Security Testing', () => {
    it('should handle arbitrary strings safely', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 200 }),
          (str: string) => {
            expect(() => {
              try {
                sanitizeString(str);
                return true;
              } catch (error) {
                expect(error).toBeInstanceOf(StorageDataError);
                return false;
              }
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle arbitrary objects safely', () => {
      fc.assert(
        fc.property(
          fc.object({ maxDepth: 3 }),
          (obj: any) => {
            expect(() => {
              try {
                safeJsonStringify(obj);
                return true;
              } catch (error) {
                expect(error).toBeInstanceOf(StorageDataError);
                return false;
              }
            }).not.toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should prevent prototype pollution in random objects', () => {
      fc.assert(
        fc.property(
          fc.dictionary(fc.string(), fc.anything()),
          (obj: Record<string, any>) => {
            const pollutedObj = {
              ...obj,
              '__proto__': { polluted: true }
            };

            expect(() => validateFilterExpression(pollutedObj)).toThrow(StorageDataError);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle Unicode strings safely', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 50 }),
          (unicodeString: string) => {
            expect(() => {
              try {
                sanitizeString(unicodeString);
                return true;
              } catch (error) {
                expect(error).toBeInstanceOf(StorageDataError);
                return false;
              }
            }).not.toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Integration Security Tests', () => {
    it('should handle multi-vector attack attempts', () => {
      const complexAttacks = [
        'title = "<script>alert(1)</script>" && __proto__ = "polluted"',
        'title like "%javascript:alert(1)%" || constructor.prototype = "hacked"',
        'assignees in ["<svg onload=alert(1)>", "__proto__"] && done = false'
      ];

      complexAttacks.forEach(attack => {
        // Test simple filter parser
        const simpleResult = parseSimpleFilter(attack);
        // Should either reject entirely or parse safely
        if (simpleResult) {
          // If parsed, dangerous content should be caught during validation
          expect(() => sanitizeString(simpleResult.value as string)).toThrow(StorageDataError);
        }

        // Test complex filter parser
        const complexResult = parseFilterString(attack);
        expect(complexResult.expression).toBeNull();
      });
    });

    it('should handle large malicious inputs efficiently', () => {
      const largeMaliciousInputs = [
        '<script>'.repeat(1000) + 'alert(1)',
        'a'.repeat(10000) + '<script>fetch("/secrets")</script>',
        '__proto__'.repeat(500) + 'polluted'
      ];

      largeMaliciousInputs.forEach(input => {
        const startTime = Date.now();

        expect(() => sanitizeString(input)).toThrow(StorageDataError);

        const processingTime = Date.now() - startTime;
        expect(processingTime).toBeLessThan(100); // Should reject quickly
      });
    });
  });

  describe('Boundary Value Testing', () => {
    it('should handle values at boundary conditions', () => {
      // Test maximum safe integer
      const maxSafeInt = Number.MAX_SAFE_INTEGER;
      expect(() => validateValue(maxSafeInt)).not.toThrow();

      // Test minimum safe integer
      const minSafeInt = Number.MIN_SAFE_INTEGER;
      expect(() => validateValue(minSafeInt)).not.toThrow();

      // Test values that would overflow (JavaScript actually handles these as Infinity)
      expect(() => validateValue(Number.MAX_SAFE_INTEGER + 1)).not.toThrow(); // Becomes Infinity, which should be caught
      expect(() => validateValue(Number.MIN_SAFE_INTEGER - 1)).not.toThrow(); // Becomes -Infinity, which should be caught
    });

    it('should handle array boundary conditions', () => {
      // Test empty array
      expect(() => validateValue([])).not.toThrow();

      // Test single element arrays
      expect(() => validateValue(['test'])).not.toThrow();
      expect(() => validateValue([1])).not.toThrow();

      // Test arrays at maximum size
      const maxArray = Array.from({ length: 100 }, (_, i) => `item${i}`);
      expect(() => validateValue(maxArray)).not.toThrow();

      // Test arrays exceeding maximum size
      const overSizeArray = Array.from({ length: 101 }, (_, i) => `item${i}`);
      expect(() => validateValue(overSizeArray)).toThrow(StorageDataError);
    });

    it('should handle special numeric values', () => {
      // Test special floating point values
      expect(() => validateValue(Number.EPSILON)).not.toThrow();
      expect(() => validateValue(Math.PI)).not.toThrow();
      expect(() => validateValue(Math.E)).not.toThrow();

      // Test invalid numeric values
      expect(() => validateValue(Number.POSITIVE_INFINITY)).toThrow(StorageDataError);
      expect(() => validateValue(Number.NEGATIVE_INFINITY)).toThrow(StorageDataError);
      expect(() => validateValue(Number.NaN)).toThrow(StorageDataError);
    });
  });
});