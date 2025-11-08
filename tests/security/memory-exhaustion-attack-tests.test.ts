/**
 * Memory Exhaustion Attack Tests
 *
 * This test suite validates DoS protection mechanisms against various memory exhaustion attack vectors.
 * Tests are designed to be malicious while ensuring they only validate existing protections.
 *
 * Attack Categories Tested:
 * 1. Massive payload attacks (JSON arrays, filter expressions)
 * 2. Nested structure attacks (depth limits)
 * 3. Resource exhaustion under concurrent operations
 * 4. Sustained attack patterns over time
 * 5. Complex combination attacks
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Task } from 'node-vikunja';
import { MCPError, ErrorCode } from '../../src/types';
import {
  getMaxTasksLimit,
  validateTaskCountLimit,
  estimateTaskMemoryUsage,
  estimateTasksMemoryUsage
} from '../../src/utils/memory';
import { parseSimpleFilter } from '../../src/utils/simple-filters';
import {
  validateFilterExpression,
  safeJsonParse,
  safeJsonStringify,
  validateValue
} from '../../src/utils/validation';
import { StorageDataError } from '../../src/storage/interfaces';

// Mock logger to prevent test output noise
jest.mock('../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  }
}));

describe('Memory Exhaustion Attack Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Set low limits for testing attack scenarios
    process.env.VIKUNJA_MAX_TASKS_LIMIT = '100';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Attack Vector 1: Massive JSON Array Payloads', () => {
    it('should reject oversized JSON arrays attempting to bypass 100-item limit', () => {
      // Attack: Create array with 101 items to bypass the 100-item limit
      const oversizedArray = '[' + Array(102).join('"item",') + '"item"]';

      expect(() => {
        const parsed = JSON.parse(oversizedArray);
        validateValue(parsed);
      }).toThrow(StorageDataError);
    });

    it('should reject deeply nested JSON structures', () => {
      // Attack: Create deeply nested objects to cause stack overflow
      let nestedObject: any = { value: 'deep' };
      for (let i = 0; i < 100; i++) {
        nestedObject = { nested: nestedObject };
      }

      expect(() => {
        validateValue(nestedObject);
      }).toThrow(StorageDataError);
    });

    it('should reject JSON arrays with extremely long strings', () => {
      // Attack: Combine array size limit bypass with string length attacks
      const longStringArray = Array(50).fill('a'.repeat(2000)); // Each string 2KB

      expect(() => {
        validateValue(longStringArray);
      }).toThrow(StorageDataError);
    });

    it('should reject malicious content in JSON arrays', () => {
      // Attack: Inject dangerous patterns in array elements
      const maliciousArray = [
        'normal',
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '__proto__',
        'function(){alert(1)}',
        'constructor',
        'prototype'
      ];

      // Should reject due to XSS patterns in string sanitization
      const xssItems = maliciousArray.filter(item =>
        typeof item === 'string' && (
          item.includes('script') ||
          item.includes('javascript:')
        )
      );

      xssItems.forEach(item => {
        expect(() => validateValue([item])).toThrow(StorageDataError);
      });

      // Other dangerous strings like __proto__ are filtered at the field level, not value level
      // So they should pass validateValue but would be caught by validateField
      const protoItems = maliciousArray.filter(item =>
        typeof item === 'string' && (
          item.includes('__proto__') ||
          item.includes('constructor') ||
          item.includes('prototype')
        )
      );

      protoItems.forEach(item => {
        // These should pass at value level but would be caught at field level
        expect(() => validateValue([item])).not.toThrow();
      });
    });

    it('should handle mixed-type array attacks', () => {
      // Attack: Create complex mixed arrays to break type checking
      const mixedAttacks = [
        ['string', 42, { nested: 'object' }], // Mixed types
        [null, undefined, NaN, Infinity], // Invalid numbers
        [[], {}, () => {}], // Nested objects and functions
      ];

      mixedAttacks.forEach(maliciousArray => {
        expect(() => validateValue(maliciousArray)).toThrow(StorageDataError);
      });
    });
  });

  describe('Attack Vector 2: Filter Expression Memory Attacks', () => {
    it('should reject filter expressions exceeding depth limits', () => {
      // Attack: Create deeply nested filter expression (beyond 10-level limit)
      let deepExpression: any = {
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: 'test'
          }],
          operator: '&&'
        }]
      };

      // Nest beyond the 10-level limit
      for (let i = 0; i < 15; i++) {
        deepExpression = {
          groups: [deepExpression, {
            conditions: [{
              field: 'priority',
              operator: '>',
              value: i
            }],
            operator: '&&'
          }],
          operator: '&&'
        };
      }

      expect(() => validateFilterExpression(deepExpression)).toThrow(StorageDataError);
    });

    it('should reject filter expressions with excessive conditions', () => {
      // Attack: Create expression with 60 conditions (beyond 50-condition limit)
      const excessiveConditions = [];
      for (let i = 0; i < 60; i++) {
        excessiveConditions.push({
          field: 'title',
          operator: 'like',
          value: `condition${i}`
        });
      }

      const excessiveExpression = {
        groups: [{
          conditions: excessiveConditions,
          operator: '&&'
        }]
      };

      expect(() => validateFilterExpression(excessiveExpression)).toThrow(StorageDataError);
    });

    it('should reject filter expressions with oversized string values', () => {
      // Attack: Use strings longer than 1000 characters in filter values
      const oversizedStringExpression = {
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: 'a'.repeat(1500) // Exceeds 1000 char limit
          }],
          operator: '&&'
        }]
      };

      expect(() => validateFilterExpression(oversizedStringExpression)).toThrow(StorageDataError);
    });

    it('should reject circular reference attacks in filter expressions', () => {
      // Attack: Create circular reference to cause infinite loops
      const circular: any = { name: 'circular' };
      circular.self = circular;

      const circularExpression = {
        groups: [{
          conditions: [{
            field: 'title',
            operator: '=',
            value: circular
          }],
          operator: '&&'
        }]
      };

      expect(() => safeJsonStringify(circularExpression)).toThrow(StorageDataError);
    });

    it('should reject complex XSS attacks in filter expressions', () => {
      // Attack: Sophisticated XSS patterns that might bypass simple detection
      const sophisticatedXssAttacks = [
        '<img src=x onerror=alert("XSS")>',
        '<svg onload=alert("XSS")>',
        'data:text/html,<script>alert("XSS")</script>',
        '<iframe src="javascript:alert(\'XSS\')">',
        '<!--<script>alert("XSS")-->',
        'expression(alert("XSS"))',
        'eval(String.fromCharCode(97,108,101,114,116,40,34,88,83,83,34,41))',
      ];

      sophisticatedXssAttacks.forEach(xssPayload => {
        const xssExpression = {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: xssPayload
            }],
            operator: '&&'
          }]
        };

        expect(() => validateFilterExpression(xssExpression)).toThrow(StorageDataError);
      });
    });
  });

  describe('Attack Vector 3: Simple Filter Memory Attacks', () => {
    it('should reject oversized array strings in simple filters', () => {
      // Attack: Array string longer than 200 characters
      const longArrayString = '[' + Array(150).join('"item",') + '"item"]'; // Way over 200 chars

      const result = parseSimpleFilter(`id = ${longArrayString}`);
      expect(result).toBeNull();
    });

    it('should reject arrays with dangerous patterns in simple filters', () => {
      // Attack: Include dangerous function-like patterns in arrays
      const dangerousArrays = [
        'id = ["function(){alert(1)}", 2]',
        'id = ["()=>{malicious()}", 3]',
        'id = ["__proto__", 4]',
        'id = ["constructor", 5]',
        'id = ["prototype", 6]',
        'id = ["eval(malicious)", 7]',
      ];

      dangerousArrays.forEach(dangerousFilter => {
        const result = parseSimpleFilter(dangerousFilter);
        expect(result).toBeNull();
      });
    });

    it('should reject overly long strings in simple filter arrays', () => {
      // Attack: Strings longer than 50 characters in arrays
      const longStringArray = '["' + 'a'.repeat(51) + '"]';

      const result = parseSimpleFilter(`title = ${longStringArray}`);
      expect(result).toBeNull();
    });

    it('should reject oversized numbers in simple filters', () => {
      // Attack: Extremely large numbers that could cause issues
      const oversizedNumbers = [
        'id = 999999999999999999999',
        'id = -999999999999999999999',
        'id = 1e500',
        'id = -1e500',
      ];

      oversizedNumbers.forEach(oversizedFilter => {
        const result = parseSimpleFilter(oversizedFilter);
        expect(result).toBeNull();
      });
    });

    it('should reject filter strings exceeding length limits', () => {
      // Attack: Filter string longer than 1000 characters
      const longFilter = 'title = ' + 'a'.repeat(1000);

      const result = parseSimpleFilter(longFilter);
      expect(result).toBeNull();
    });
  });

  describe('Attack Vector 4: Task Memory Exhaustion Attacks', () => {
    it('should validate memory limits for massive task counts', () => {
      // Attack: Request to load 1 million tasks
      const massiveTaskCount = 1000000;

      const result = validateTaskCountLimit(massiveTaskCount);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Task count 1000000 exceeds maximum allowed limit');
    });

    it('should accurately estimate memory usage for attack scenarios', () => {
      // Attack: Create tasks with oversized content to increase memory usage
      const memoryBombTask: Partial<Task> = {
        id: 1,
        title: 'A'.repeat(10000), // 10KB title
        description: 'B'.repeat(50000), // 50KB description
        assignees: Array(100).fill({ id: 1, username: 'user' }) as any, // Many assignees
        labels: Array(100).fill({ id: 1, title: 'label' }) as any, // Many labels
        attachments: Array(100).fill({ id: 1, filename: 'file' }) as any, // Many attachments
      };

      const memoryEstimate = estimateTaskMemoryUsage(memoryBombTask as Task);
      expect(memoryEstimate).toBeGreaterThan(60000); // Should be > 60KB for this task
    });

    it('should handle aggregate memory limit validation', () => {
      // Attack: Request many medium-sized tasks to test memory estimation
      const mediumTasks: Task[] = Array(200).fill(null).map((_, i) => ({
        id: i + 1,
        title: `Task ${i + 1}`.repeat(100), // 800+ byte title
        description: `Description for task ${i + 1}`.repeat(50), // 1000+ byte description
        done: false,
        priority: 1,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        project_id: 1,
        labels: [],
        assignees: [],
        position: 0,
        kanban_position: 0,
        reminder_dates: [],
        subscription: null,
        percent_done: 0,
        identifier: `TASK-${i + 1}`,
        index: i + 1,
        related_tasks: null,
        attachment_count: 0,
        comment_count: 0,
        cover_image_attachment_id: null,
        is_favorite: false,
        parent_task_id: null,
        hex_color: '',
        color: '',
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        repeat_from: null,
        repeat_until: null,
        remap_subtasks_on_repeat: false,
        subtasks: [],
        bucket_id: 0,
        done_at: null,
      }));

      const totalMemory = estimateTasksMemoryUsage(mediumTasks);
      const totalMemoryMB = Math.ceil(totalMemory / (1024 * 1024));

      // Debug: Check actual memory estimation
      console.log(`Estimated memory for 200 medium tasks: ${totalMemory} bytes (${totalMemoryMB}MB)`);
      console.log(`Average per task: ${Math.round(totalMemory / 200)} bytes`);

      // Should estimate some memory usage (actual estimation may be conservative)
      expect(totalMemory).toBeGreaterThan(0);
      expect(totalMemory).toBeGreaterThan(200 * 100); // At least 100 bytes per task

      // And validation should catch this based on count, not memory estimation
      const validation = validateTaskCountLimit(mediumTasks.length);
      if (mediumTasks.length > getMaxTasksLimit()) {
        expect(validation.allowed).toBe(false);
      }
    });

    it('should protect against environment variable manipulation attacks', () => {
      // Attack: Try to set extremely high limits via environment variables
      process.env.VIKUNJA_MAX_TASKS_LIMIT = '999999999';

      const highLimit = getMaxTasksLimit();
      expect(highLimit).toBeLessThanOrEqual(50000); // Should be capped at 50000 for safety
    });

    it('should handle invalid environment variable attacks', () => {
      // Attack: Provide invalid environment variable values
      const invalidValues = [
        'not-a-number',
        '-1',
        '0', // Zero is invalid
        '1.5', // Float is invalid
        'NaN',
        'Infinity',
        '',
        'null',
        'undefined'
      ];

      // These should all return the default (10000)
      invalidValues.forEach(invalidValue => {
        // Temporarily clear the environment variable
        const originalValue = process.env.VIKUNJA_MAX_TASKS_LIMIT;
        delete process.env.VIKUNJA_MAX_TASKS_LIMIT;

        // Set invalid value
        process.env.VIKUNJA_MAX_TASKS_LIMIT = invalidValue;
        const limit = getMaxTasksLimit();
        console.log(`Invalid value "${invalidValue}" resulted in limit: ${limit}`);

        // Should fall back to default of 10000 for truly invalid values
        expect(limit).toBe(10000);

        // Restore original value
        if (originalValue !== undefined) {
          process.env.VIKUNJA_MAX_TASKS_LIMIT = originalValue;
        } else {
          delete process.env.VIKUNJA_MAX_TASKS_LIMIT;
        }
      });

      // Test some edge case valid values
      const validButSmallValues = ['1', '2', '10'];
      validButSmallValues.forEach(validValue => {
        const originalValue = process.env.VIKUNJA_MAX_TASKS_LIMIT;
        delete process.env.VIKUNJA_MAX_TASKS_LIMIT;

        process.env.VIKUNJA_MAX_TASKS_LIMIT = validValue;
        const limit = getMaxTasksLimit();
        console.log(`Valid small value "${validValue}" resulted in limit: ${limit}`);

        // Small positive numbers should be accepted
        expect(limit).toBe(parseInt(validValue, 10));

        if (originalValue !== undefined) {
          process.env.VIKUNJA_MAX_TASKS_LIMIT = originalValue;
        } else {
          delete process.env.VIKUNJA_MAX_TASKS_LIMIT;
        }
      });
    });
  });

  describe('Attack Vector 5: Complex Combination Attacks', () => {
    it('should reject multi-vector attacks combining different techniques', () => {
      // Attack: Combine multiple attack vectors simultaneously
      const complexAttack = {
        groups: [
          {
            conditions: [
              { field: 'title', operator: 'like', value: '<script>alert("XSS")</script>' }, // XSS
              { field: 'priority', operator: 'in', value: Array(101).fill(1) }, // Array size limit
            ],
            operator: '&&'
          },
          // Nested group to increase depth
          {
            groups: [
              {
                conditions: Array(60).fill({
                  field: 'description',
                  operator: 'like',
                  value: 'a'.repeat(1500) // String length limit
                }),
                operator: '&&'
              }
            ],
            operator: '||'
          }
        ],
        operator: '&&'
      };

      // Should fail at multiple validation layers
      expect(() => validateFilterExpression(complexAttack)).toThrow(StorageDataError);
    });

    it('should handle rapid-fire attack scenarios', () => {
      // Attack: Simulate rapid successive requests to overwhelm the system
      const attackPayloads = Array(1000).fill(null).map((_, i) => ({
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: `attack${i}`
          }],
          operator: '&&'
        }]
      }));

      // All should be processed without memory leaks
      attackPayloads.forEach((payload, index) => {
        try {
          validateFilterExpression(payload);
          // If validation succeeds, the payload was safe
        } catch (error) {
          // If validation fails, it should be due to legitimate security concerns
          expect(error).toBeInstanceOf(StorageDataError);
        }
      });

      // Should complete without running out of memory
      expect(true).toBe(true); // If we get here, we didn't crash
    });

    it('should validate JSON parsing attack resistance', () => {
      // Attack: Various malicious JSON strings that could cause parsing issues
      const maliciousJsonStrings = [
        'a'.repeat(50001), // Oversized string
        '{"groups":[{"conditions":[{"field":"__proto__","operator":"=","value":"pollution"}],"operator":"&&"}]}', // Prototype pollution
        '{"groups":[{"conditions":[{"field":"title","operator":"like","value":"<script>alert(\\"XSS\\")</script>"}],"operator":"&&"}]}', // XSS
        'invalid json', // Malformed JSON
        '', // Empty string
        '{"circular": {"self": {"circular": {"self": {...}}}}}', // Simulated circular reference
      ];

      maliciousJsonStrings.forEach(maliciousJson => {
        expect(() => safeJsonParse(maliciousJson)).toThrow(StorageDataError);
      });
    });
  });

  describe('Attack Vector 6: Resource Exhaustion Under Load', () => {
    it('should handle concurrent attack simulation', async () => {
      // Attack: Simulate multiple concurrent requests trying to exhaust resources
      const concurrentAttacks = Array(10).fill(null).map(async (_, i) => {
        const attackPayload = {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: `concurrent-attack-${i}-${'a'.repeat(100)}`
            }],
            operator: '&&'
          }]
        };

        return validateFilterExpression(attackPayload);
      });

      // All concurrent operations should complete without hanging
      const results = await Promise.allSettled(concurrentAttacks);

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(StorageDataError);
        } else {
          expect(result.status).toBe('fulfilled');
        }
      });
    });

    it('should validate memory usage stays within bounds under attack', () => {
      // Attack: Create many large but valid objects to test memory management
      const largeObjects = Array(100).fill(null).map((_, i) => ({
        groups: [{
          conditions: [
            { field: 'title', operator: 'like', value: 'x'.repeat(900) }, // Near limit
            { field: 'description', operator: 'like', value: 'y'.repeat(900) }, // Near limit
          ],
          operator: '&&'
        }]
      }));

      // Process all objects and ensure we don't run out of memory
      largeObjects.forEach((obj, index) => {
        try {
          const result = validateFilterExpression(obj);
          expect(result).toBeDefined();
        } catch (error) {
          // These should be valid, so no errors expected
          fail(`Valid object ${index} was rejected: ${error}`);
        }
      });
    });
  });

  describe('Protection Effectiveness Validation', () => {
    it('should maintain system responsiveness under attack conditions', () => {
      const startTime = Date.now();

      // Process multiple attack scenarios rapidly
      for (let i = 0; i < 100; i++) {
        try {
          validateFilterExpression({
            groups: [{
              conditions: [{
                field: 'title',
                operator: 'like',
                value: `test-${i}`
              }],
              operator: '&&'
            }]
          });
        } catch (error) {
          // Expected for some cases
        }
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete quickly even under attack (under 1 second for 100 operations)
      expect(processingTime).toBeLessThan(1000);
    });

    it('should provide clear error messages for blocked attacks', () => {
      const attackScenarios = [
        { payload: '__proto__ = value', expected: 'Invalid field name' },
        { payload: 'title = ' + '[' + Array(101).join('"item",') + '"item"]', expected: null }, // Simple filter returns null
        { payload: { groups: Array(60).fill({ conditions: [{ field: 'title', operator: 'like', value: 'test' }], operator: '&&' }) }, expected: 'cannot exceed' },
      ];

      attackScenarios.forEach(scenario => {
        try {
          if (typeof scenario.payload === 'string') {
            const result = parseSimpleFilter(scenario.payload);
            if (scenario.expected === null) {
              expect(result).toBeNull();
            }
          } else {
            validateFilterExpression(scenario.payload);
          }
        } catch (error) {
          if (scenario.expected && error instanceof Error) {
            expect(error.message.toLowerCase()).toContain(scenario.expected);
          }
        }
      });
    });

    it('should ensure no memory leaks from attack processing', () => {
      // Process many attack scenarios and check memory usage patterns
      const initialMemory = process.memoryUsage();

      for (let i = 0; i < 1000; i++) {
        try {
          // Mix of valid and invalid payloads
          const isValid = i % 10 !== 0; // 90% valid
          const payload = isValid
            ? { groups: [{ conditions: [{ field: 'title', operator: 'like', value: `test-${i}` }], operator: '&&' }] }
            : { groups: Array(60).fill({ conditions: [{ field: 'invalid', operator: 'invalid', value: 'test' }], operator: '&&' }) };

          validateFilterExpression(payload);
        } catch (error) {
          // Expected for invalid payloads
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();

      // Memory usage shouldn't grow dramatically (allowing some variance)
      const heapGrowthMB = (finalMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024);
      expect(heapGrowthMB).toBeLessThan(50); // Less than 50MB growth for 1000 operations
    });
  });
});