/**
 * Memory Exhaustion Performance Benchmarks
 *
 * Performance tests to validate that DoS protection mechanisms maintain effectiveness
 * under various attack scenarios while preserving system responsiveness.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Task } from 'node-vikunja';
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
  safeJsonStringify
} from '../../src/utils/validation';
import { StorageDataError } from '../../src/storage/interfaces';

// Performance measurement utilities
class PerformanceTracker {
  private measurements: Array<{ operation: string; duration: number; memoryBefore: number; memoryAfter: number }> = [];

  startMeasurement(operation: string): () => void {
    const startTime = Date.now();
    const memoryBefore = process.memoryUsage().heapUsed;

    return () => {
      const endTime = Date.now();
      const memoryAfter = process.memoryUsage().heapUsed;
      const duration = endTime - startTime;

      this.measurements.push({
        operation,
        duration,
        memoryBefore,
        memoryAfter
      });
    };
  }

  getMeasurement(operation: string) {
    return this.measurements.find(m => m.operation === operation);
  }

  getAverageDuration(operations: string[]): number {
    const relevantMeasurements = this.measurements.filter(m => operations.includes(m.operation));
    if (relevantMeasurements.length === 0) return 0;

    const totalDuration = relevantMeasurements.reduce((sum, m) => sum + m.duration, 0);
    return totalDuration / relevantMeasurements.length;
  }

  getMemoryGrowth(operation: string): number {
    const measurement = this.getMeasurement(operation);
    if (!measurement) return 0;
    return measurement.memoryAfter - measurement.memoryBefore;
  }

  getTotalMemoryGrowth(): number {
    if (this.measurements.length < 2) return 0;
    const first = this.measurements[0];
    const last = this.measurements[this.measurements.length - 1];
    return last.memoryAfter - first.memoryBefore;
  }

  reset(): void {
    this.measurements = [];
  }

  getStats() {
    return {
      totalOperations: this.measurements.length,
      averageDuration: this.getAverageDuration(this.measurements.map(m => m.operation)),
      totalMemoryGrowth: this.getTotalMemoryGrowth(),
      measurements: [...this.measurements]
    };
  }
}

describe('Memory Exhaustion Performance Benchmarks', () => {
  const originalEnv = process.env;
  const performanceTracker = new PerformanceTracker();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.VIKUNJA_MAX_TASKS_LIMIT = '1000'; // Higher limit for performance tests
    performanceTracker.reset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Simple Filter Performance Under Attack', () => {
    it('should maintain sub-millisecond performance for valid filters', () => {
      const validFilters = [
        'title = "test"',
        'priority > 3',
        'done = true',
        'id in [1, 2, 3]',
        'created > 2024-01-01',
      ];

      validFilters.forEach((filter, index) => {
        const endMeasurement = performanceTracker.startMeasurement(`valid-filter-${index}`);

        const result = parseSimpleFilter(filter);

        endMeasurement();

        expect(result).not.toBeNull();
      });

      // All valid filters should process in under 1ms each
      const avgDuration = performanceTracker.getAverageDuration(
        validFilters.map((_, i) => `valid-filter-${i}`)
      );
      expect(avgDuration).toBeLessThan(1);
    });

    it('should quickly reject malicious filters', () => {
      const maliciousFilters = [
        '__proto__ = value',
        'title = ' + '[' + Array(101).join('"item",') + '"item"]', // Oversized array
        'title = ' + 'a'.repeat(1000), // Oversized string
        'title = ["function(){alert(1)}", 2]', // Dangerous content
        'id = 999999999999999999999', // Oversized number
      ];

      maliciousFilters.forEach((filter, index) => {
        const endMeasurement = performanceTracker.startMeasurement(`malicious-filter-${index}`);

        const result = parseSimpleFilter(filter);

        endMeasurement();

        expect(result).toBeNull();
      });

      // Malicious filters should be rejected even faster than valid ones
      const avgDuration = performanceTracker.getAverageDuration(
        maliciousFilters.map((_, i) => `malicious-filter-${i}`)
      );
      expect(avgDuration).toBeLessThan(1);
    });

    it('should handle high-volume filter processing without degradation', () => {
      const filterCount = 1000;
      const filters = Array(filterCount).fill(null).map((_, i) =>
        i % 2 === 0
          ? `title = "test-${i}"` // Valid filter
          : '__proto__ = value' // Invalid filter
      );

      const endMeasurement = performanceTracker.startMeasurement('high-volume-filters');

      filters.forEach(filter => {
        parseSimpleFilter(filter);
      });

      endMeasurement();

      const measurement = performanceTracker.getMeasurement('high-volume-filters');
      expect(measurement).toBeDefined();

      // Should process 1000 filters in under 100ms (0.1ms per filter)
      expect(measurement!.duration).toBeLessThan(100);

      // Memory growth should be minimal
      const memoryGrowth = performanceTracker.getMemoryGrowth('high-volume-filters');
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });
  });

  describe('Filter Expression Performance Under Attack', () => {
    it('should maintain performance for valid expressions of varying complexity', () => {
      const validExpressions = [
        // Simple expression
        {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: 'test'
            }],
            operator: '&&'
          }]
        },
        // Medium complexity
        {
          groups: [
            {
              conditions: [
                { field: 'title', operator: 'like', value: 'important' },
                { field: 'priority', operator: '>', value: 3 }
              ],
              operator: '&&'
            }
          ],
          operator: '&&'
        },
        // Complex but valid
        {
          groups: [
            {
              conditions: [
                { field: 'title', operator: 'like', value: 'urgent' },
                { field: 'done', operator: '=', value: false },
                { field: 'priority', operator: '>=', value: 4 }
              ],
              operator: '&&'
            },
            {
              conditions: [
                { field: 'created', operator: '>', value: '2024-01-01' }
              ],
              operator: '||'
            }
          ],
          operator: '&&'
        }
      ];

      validExpressions.forEach((expression, index) => {
        const endMeasurement = performanceTracker.startMeasurement(`valid-expression-${index}`);

        const result = validateFilterExpression(expression);

        endMeasurement();

        expect(result).toBeDefined();
      });

      // Even complex expressions should validate quickly
      const avgDuration = performanceTracker.getAverageDuration(
        validExpressions.map((_, i) => `valid-expression-${i}`)
      );
      expect(avgDuration).toBeLessThan(5); // 5ms max for complex expressions
    });

    it('should quickly reject expressions exceeding limits', () => {
      const oversizedExpressions = [
        // Too many conditions
        {
          groups: [{
            conditions: Array(60).fill({
              field: 'title',
              operator: 'like',
              value: 'test'
            }),
            operator: '&&'
          }]
        },
        // Oversized string values
        {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: 'a'.repeat(1500)
            }],
            operator: '&&'
          }]
        },
        // Malicious content
        {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: '<script>alert("XSS")</script>'
            }],
            operator: '&&'
          }]
        }
      ];

      oversizedExpressions.forEach((expression, index) => {
        const endMeasurement = performanceTracker.startMeasurement(`oversized-expression-${index}`);

        expect(() => validateFilterExpression(expression)).toThrow(StorageDataError);

        endMeasurement();
      });

      // Oversized expressions should be rejected quickly
      const avgDuration = performanceTracker.getAverageDuration(
        oversizedExpressions.map((_, i) => `oversized-expression-${i}`)
      );
      expect(avgDuration).toBeLessThan(2);
    });

    it('should handle deep nesting rejection efficiently', () => {
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

      // Create deeply nested expression (beyond 10-level limit)
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

      const endMeasurement = performanceTracker.startMeasurement('deep-nesting-rejection');

      expect(() => validateFilterExpression(deepExpression)).toThrow(StorageDataError);

      endMeasurement();

      const measurement = performanceTracker.getMeasurement('deep-nesting-rejection');
      expect(measurement!.duration).toBeLessThan(10); // Should reject quickly even for deep nesting
    });
  });

  describe('JSON Processing Performance Under Attack', () => {
    it('should maintain performance for valid JSON operations', () => {
      const validExpressions = Array(100).fill(null).map((_, i) => ({
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: `test-${i}`
          }],
          operator: '&&'
        }]
      }));

      // Test stringify performance
      const stringifyEnd = performanceTracker.startMeasurement('batch-stringify');

      const jsonStrings = validExpressions.map(expr => safeJsonStringify(expr));

      stringifyEnd();

      // Test parse performance
      const parseEnd = performanceTracker.startMeasurement('batch-parse');

      jsonStrings.forEach(jsonStr => {
        const parsed = safeJsonParse(jsonStr);
        expect(parsed).toBeDefined();
      });

      parseEnd();

      const stringifyMeasurement = performanceTracker.getMeasurement('batch-stringify');
      const parseMeasurement = performanceTracker.getMeasurement('batch-parse');

      // Should process 100 operations in reasonable time
      expect(stringifyMeasurement!.duration).toBeLessThan(50); // 0.5ms per stringify
      expect(parseMeasurement!.duration).toBeLessThan(100); // 1ms per parse
    });

    it('should quickly reject malicious JSON', () => {
      const maliciousJsonStrings = [
        'a'.repeat(50001), // Oversized
        '{"groups":[{"conditions":[{"field":"__proto__","operator":"=","value":"pollution"}],"operator":"&&"}]}', // Prototype pollution
        '{"invalid": "structure"}', // Invalid structure
        'completely invalid json', // Malformed
      ];

      const endMeasurement = performanceTracker.startMeasurement('malicious-json-rejection');

      maliciousJsonStrings.forEach(jsonStr => {
        expect(() => safeJsonParse(jsonStr)).toThrow(StorageDataError);
      });

      endMeasurement();

      const measurement = performanceTracker.getMeasurement('malicious-json-rejection');
      expect(measurement!.duration).toBeLessThan(10); // Should reject malicious JSON quickly
    });

    it('should handle circular reference detection efficiently', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      const endMeasurement = performanceTracker.startMeasurement('circular-reference-detection');

      expect(() => safeJsonStringify(circular)).toThrow(StorageDataError);

      endMeasurement();

      const measurement = performanceTracker.getMeasurement('circular-reference-detection');
      expect(measurement!.duration).toBeLessThan(5); // Circular reference detection should be fast
    });
  });

  describe('Memory Validation Performance Under Attack', () => {
    it('should efficiently validate task count limits', () => {
      const testCases = [
        { count: 10, expected: true },
        { count: 100, expected: true },
        { count: 500, expected: true },
        { count: 1000, expected: true },
        { count: 1500, expected: false }, // Exceeds limit
        { count: 10000, expected: false }, // Way over limit
      ];

      const endMeasurement = performanceTracker.startMeasurement('task-count-validation');

      testCases.forEach(testCase => {
        const result = validateTaskCountLimit(testCase.count);
        expect(result.allowed).toBe(testCase.expected);
      });

      endMeasurement();

      const measurement = performanceTracker.getMeasurement('task-count-validation');
      expect(measurement!.duration).toBeLessThan(5); // All validations should be very fast
    });

    it('should efficiently estimate memory usage', () => {
      const tasks: Task[] = Array(1000).fill(null).map((_, i) => ({
        id: i + 1,
        title: `Task ${i + 1}`,
        description: `Description for task ${i + 1}`,
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

      // Test individual task estimation
      const individualEnd = performanceTracker.startMeasurement('individual-memory-estimation');

      tasks.forEach(task => {
        const estimate = estimateTaskMemoryUsage(task);
        expect(estimate).toBeGreaterThan(0);
      });

      individualEnd();

      // Test batch memory estimation
      const batchEnd = performanceTracker.startMeasurement('batch-memory-estimation');

      const totalMemory = estimateTasksMemoryUsage(tasks);
      expect(totalMemory).toBeGreaterThan(0);

      batchEnd();

      const individualMeasurement = performanceTracker.getMeasurement('individual-memory-estimation');
      const batchMeasurement = performanceTracker.getMeasurement('batch-memory-estimation');

      // Memory estimation should be efficient
      expect(individualMeasurement!.duration).toBeLessThan(50); // 0.05ms per task
      expect(batchMeasurement!.duration).toBeLessThan(10); // Batch should be faster
    });
  });

  describe('Sustained Attack Performance', () => {
    it('should maintain performance under sustained attack load', () => {
      const attackCycles = 10;
      const attacksPerCycle = 100;

      for (let cycle = 0; cycle < attackCycles; cycle++) {
        const cycleEnd = performanceTracker.startMeasurement(`attack-cycle-${cycle}`);

        for (let attack = 0; attack < attacksPerCycle; attack++) {
          const attackType = attack % 4;

          switch (attackType) {
            case 0: // Simple filter attack
              parseSimpleFilter('__proto__ = value');
              break;
            case 1: // Complex expression attack
              try {
                validateFilterExpression({
                  groups: [{
                    conditions: Array(60).fill({
                      field: 'title',
                      operator: 'like',
                      value: 'attack'
                    }),
                    operator: '&&'
                  }]
                });
              } catch (error) {
                // Expected to fail
              }
              break;
            case 2: // JSON attack
              try {
                safeJsonParse('a'.repeat(50001));
              } catch (error) {
                // Expected to fail
              }
              break;
            case 3: // Memory validation attack
              validateTaskCountLimit(1000000);
              break;
          }
        }

        cycleEnd();
      }

      // Analyze performance degradation
      const cycleDurations = Array.from({ length: attackCycles }, (_, i) =>
        performanceTracker.getMeasurement(`attack-cycle-${i}`)?.duration || 0
      );

      const firstCycleDuration = cycleDurations[0];
      const lastCycleDuration = cycleDurations[cycleDurations.length - 1];

      // Performance should not degrade significantly (less than 2x slower)
      expect(lastCycleDuration).toBeLessThan(firstCycleDuration * 2);

      // Total memory growth should be reasonable
      const totalMemoryGrowth = performanceTracker.getTotalMemoryGrowth();
      expect(totalMemoryGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
    });

    it('should recover memory after attack scenarios', () => {
      // Create memory pressure with large objects
      const memoryPressureEnd = performanceTracker.startMeasurement('memory-pressure');

      for (let i = 0; i < 1000; i++) {
        const largeObject = {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: 'x'.repeat(900) // Near limit
            }],
            operator: '&&'
          }]
        };

        try {
          validateFilterExpression(largeObject);
        } catch (error) {
          // Some may fail validation
        }
      }

      memoryPressureEnd();

      const memoryAfterPressure = performanceTracker.getMemoryGrowth('memory-pressure');

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const recoveryEnd = performanceTracker.startMeasurement('recovery-phase');

      // Process normal operations to test recovery
      for (let i = 0; i < 100; i++) {
        const normalObject = {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: `normal-${i}`
            }],
            operator: '&&'
          }]
        };

        const result = validateFilterExpression(normalObject);
        expect(result).toBeDefined();
      }

      recoveryEnd();

      const recoveryMeasurement = performanceTracker.getMeasurement('recovery-phase');

      // Recovery should be fast
      expect(recoveryMeasurement!.duration).toBeLessThan(50);

      // Memory growth should stabilize
      expect(memoryAfterPressure).toBeLessThan(100 * 1024 * 1024); // Less than 100MB during pressure
    });
  });

  describe('Performance Regression Detection', () => {
    it('should establish baseline performance metrics', () => {
      const baselineTests = [
        {
          name: 'simple-filter-valid',
          operation: () => parseSimpleFilter('title = "test"'),
          maxDuration: 1
        },
        {
          name: 'simple-filter-invalid',
          operation: () => parseSimpleFilter('__proto__ = value'),
          maxDuration: 1
        },
        {
          name: 'filter-expression-valid',
          operation: () => validateFilterExpression({
            groups: [{
              conditions: [{
                field: 'title',
                operator: 'like',
                value: 'test'
              }],
              operator: '&&'
            }]
          }),
          maxDuration: 5
        },
        {
          name: 'memory-validation',
          operation: () => validateTaskCountLimit(100),
          maxDuration: 1
        }
      ];

      const baselineResults: Array<{ name: string; duration: number; passed: boolean }> = [];

      baselineTests.forEach(test => {
        const endMeasurement = performanceTracker.startMeasurement(`baseline-${test.name}`);

        test.operation();

        endMeasurement();

        const measurement = performanceTracker.getMeasurement(`baseline-${test.name}`);
        const duration = measurement?.duration || 0;
        const passed = duration <= test.maxDuration;

        baselineResults.push({ name: test.name, duration, passed });

        expect(duration).toBeLessThanOrEqual(test.maxDuration);
      });

      // Log baseline results for future comparison
      console.log('Performance Baseline Results:', baselineResults);

      // All tests should pass baseline
      expect(baselineResults.every(r => r.passed)).toBe(true);
    });
  });
});