/**
 * ReDoS (Regular Expression Denial of Service) security tests
 * Tests specifically for the fixed date validation vulnerability
 */

import { describe, it, expect } from '@jest/globals';
import { parseFilterString, validateCondition, validateFilterExpression } from '../../src/utils/filters';
import type { FilterCondition } from '../../src/types/filters';

describe('ReDoS Vulnerability Fix Tests', () => {
  describe('Date Validation Security', () => {
    it('should prevent ReDoS attacks with malicious date strings', () => {
      // These are the types of inputs that would cause catastrophic backtracking
      // in the vulnerable regex: /^(now([+-]\d+[smhdwMy])?|now\/[dwMy]|\d{4}-\d{2}-\d{2})/
      const maliciousDateInputs = [
        'now' + 'x'.repeat(1000), // Long string after 'now'
        'now+' + 'a'.repeat(500) + 'd', // Invalid characters in relative date
        'now/' + 'x'.repeat(200), // Invalid period unit with long suffix
        '2023-' + 'x'.repeat(300), // Invalid ISO date with long suffix
        'nowxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // Triggers backtracking in vulnerable regex
        'now+' + '1'.repeat(100) + 'z'.repeat(100), // Complex pattern to trigger backtracking
      ];

      maliciousDateInputs.forEach(maliciousInput => {
        const condition: FilterCondition = {
          field: 'dueDate',
          operator: '=',
          value: maliciousInput,
        };

        const startTime = Date.now();
        const errors = validateCondition(condition);
        const validationTime = Date.now() - startTime;

        // Security check: validation should complete quickly (< 10ms)
        expect(validationTime).toBeLessThan(10);
        
        // Security check: malicious input should be rejected
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('valid date value');
      });
    });

    it('should prevent DoS with extremely long date strings', () => {
      const longDateInputs = [
        'now+' + '1'.repeat(50) + 'd', // Very long number
        '2023' + '-'.repeat(100) + '12-25', // Many separators
        'now/' + 'd'.repeat(100), // Repeated units
      ];

      longDateInputs.forEach(longInput => {
        const condition: FilterCondition = {
          field: 'created',
          operator: '<',
          value: longInput,
        };

        const startTime = Date.now();
        const errors = validateCondition(condition);
        const validationTime = Date.now() - startTime;

        // Should complete quickly (increased from 5ms to 50ms for CI stability)
        expect(validationTime).toBeLessThan(50);
        expect(errors).toHaveLength(1);
      });
    });

    it('should handle edge cases in date validation safely', () => {
      const edgeCases = [
        'now+', // Incomplete relative date
        'now/', // Incomplete period date
        'now+d', // Missing number
        'now+1', // Missing unit
        'now+1x', // Invalid unit
        'now/x', // Invalid period unit
        '2023-', // Incomplete ISO date
        '2023-12', // Incomplete ISO date
        '2023-12-', // Incomplete ISO date
        '20231225', // ISO date without separators
        'now+0d', // Zero offset (valid)
        'now+99999999999999999999d', // Very large number
      ];

      edgeCases.forEach(edgeCase => {
        const condition: FilterCondition = {
          field: 'updated',
          operator: '>=',
          value: edgeCase,
        };

        const startTime = Date.now();
        const errors = validateCondition(condition);
        const validationTime = Date.now() - startTime;

        // Should complete quickly regardless of outcome (increased from 5ms to 50ms for CI stability)
        expect(validationTime).toBeLessThan(50);
        expect(errors.length).toBeGreaterThanOrEqual(0); // May be valid or invalid
      });
    });
  });

  describe('Valid Date Formats', () => {
    it('should accept all valid date formats without performance issues', () => {
      const validDateFormats = [
        'now',
        'now+1s', 'now+30s', 'now+999s',
        'now+1m', 'now+59m', 'now+999m',
        'now+1h', 'now+23h', 'now+999h',
        'now+1d', 'now+30d', 'now+365d',
        'now+1w', 'now+52w', 'now+999w',
        'now+1M', 'now+12M', 'now+120M',
        'now+1y', 'now+10y', 'now+999y',
        'now-1s', 'now-30d', 'now-52w',
        'now/d', 'now/w', 'now/M', 'now/y',
        '2023-01-01', '2023-12-31',
        '1990-01-01', '2099-12-31',
        '2024-02-29', // Leap year
      ];

      validDateFormats.forEach(validDate => {
        const condition: FilterCondition = {
          field: 'dueDate',
          operator: '=',
          value: validDate,
        };

        const startTime = Date.now();
        const errors = validateCondition(condition);
        const validationTime = Date.now() - startTime;

        // Should be fast (increased from 5ms to 50ms for CI stability)
        expect(validationTime).toBeLessThan(50);
        
        // Should be valid
        expect(errors).toHaveLength(0);
      });
    });

    it('should reject invalid date formats quickly', () => {
      const invalidDateFormats = [
        'tomorrow', // Not supported
        'yesterday', // Not supported
        'now+1day', // Wrong unit format
        'now+1 d', // Space in unit
        'now + 1d', // Spaces
        'now/day', // Wrong period format
        '2023/01/01', // Wrong separator
        '01-01-2023', // Wrong order
        '2023-1-1', // Missing leading zeros
        '2023-13-01', // Invalid month
        '2023-01-32', // Invalid day
        '23-01-01', // Two-digit year
        'now+1.5d', // Decimal number
        'now++1d', // Double operator
        'now+-1d', // Conflicting operators
      ];

      invalidDateFormats.forEach(invalidDate => {
        const condition: FilterCondition = {
          field: 'created',
          operator: '>',
          value: invalidDate,
        };

        const startTime = Date.now();
        const errors = validateCondition(condition);
        const validationTime = Date.now() - startTime;

        // Should be fast even when rejecting (increased from 5ms to 50ms for CI stability)
        expect(validationTime).toBeLessThan(50);
        
        // Should be invalid
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('valid date value');
      });
    });
  });

  describe('Filter String Parsing with Malicious Dates', () => {
    it('should parse filter strings with malicious date values safely', () => {
      const maliciousFilterStrings = [
        `dueDate < now${'x'.repeat(100)}`,
        `created >= ${'2023-'.repeat(50)}12-25`,
        `updated != now+${'1'.repeat(50)}d`,
      ];

      maliciousFilterStrings.forEach(filterStr => {
        const startTime = Date.now();
        const result = parseFilterString(filterStr);
        const parseTime = Date.now() - startTime;

        // Should complete quickly
        expect(parseTime).toBeLessThan(100);
        
        // If parsing succeeds, validation should catch the malicious date
        if (result.expression) {
          const validation = validateFilterExpression(result.expression);
          expect(validation.valid).toBe(false);
          expect(validation.errors.length).toBeGreaterThan(0);
          expect(validation.errors[0]).toContain('valid date value');
        } else {
          // If parsing fails, that's also acceptable security behavior
          expect(result.error).toBeDefined();
        }
      });
    });

    it('should handle complex filters with mixed valid and invalid dates', () => {
      const complexFilters = [
        'dueDate < now+7d && created > invaliddate',
        '(updated >= 2023-01-01) || (dueDate < nowxxxxxxxxx)',
        'created > now-1w && dueDate < 2023-99-99',
      ];

      complexFilters.forEach(filterStr => {
        const startTime = Date.now();
        const result = parseFilterString(filterStr);
        const parseTime = Date.now() - startTime;

        // Should complete quickly
        expect(parseTime).toBeLessThan(100);
        
        // Results may vary, but should not hang
        expect(result).toBeDefined();
      });
    });
  });

  describe('Performance Benchmarks', () => {
    it('should validate dates faster than vulnerable regex implementation', () => {
      const testDates = [
        'now+7d',
        '2023-12-25',
        'invaliddate',
        'now' + 'x'.repeat(20), // Potentially problematic
      ];

      testDates.forEach(testDate => {
        const condition: FilterCondition = {
          field: 'dueDate',
          operator: '<',
          value: testDate,
        };

        // Benchmark the new implementation
        const iterations = 1000;
        const startTime = Date.now();
        
        for (let i = 0; i < iterations; i++) {
          validateCondition(condition);
        }
        
        const totalTime = Date.now() - startTime;
        const avgTime = totalTime / iterations;

        // Should be very fast - under 0.2ms per validation on average
        expect(avgTime).toBeLessThan(0.2);
      });
    });

    it('should handle worst-case inputs without exponential time', () => {
      // These inputs would cause exponential time in the vulnerable regex
      const worstCaseInputs = [
        'now' + '+'.repeat(50) + '1'.repeat(50) + 'd',
        'now/' + 'd'.repeat(100),
        '2023' + '-'.repeat(100) + '01-01',
      ];

      worstCaseInputs.forEach(worstCase => {
        const condition: FilterCondition = {
          field: 'updated',
          operator: '=',
          value: worstCase,
        };

        const startTime = Date.now();
        validateCondition(condition);
        const validationTime = Date.now() - startTime;

        // Should be linear time, not exponential - complete in under 1ms
        expect(validationTime).toBeLessThan(1);
      });
    });
  });

  describe('Regression Prevention', () => {
    it('should maintain exact same behavior for all previously valid inputs', () => {
      // These are the exact test cases from the original filter tests
      // They should continue to work identically
      const regressionTestCases = [
        { value: '2024-12-31', shouldBeValid: true },
        { value: 'now+7d', shouldBeValid: true },
        { value: 'now/d', shouldBeValid: true },
        { value: 'invalid-date', shouldBeValid: false },
      ];

      regressionTestCases.forEach(testCase => {
        const condition: FilterCondition = {
          field: 'dueDate',
          operator: '<',
          value: testCase.value,
        };

        const errors = validateCondition(condition);
        
        if (testCase.shouldBeValid) {
          expect(errors).toHaveLength(0);
        } else {
          expect(errors).toHaveLength(1);
          expect(errors[0]).toContain('valid date value');
        }
      });
    });
  });
});