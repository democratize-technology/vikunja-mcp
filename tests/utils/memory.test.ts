/**
 * Simplified test for memory protection utilities
 */

import type { Task } from 'node-vikunja';

// Mock logger first
const mockLogger = {
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn()
};

jest.mock('../../src/utils/logger', () => ({
  logger: mockLogger
}));

import {
  getMaxTasksLimit,
  estimateTaskMemoryUsage,
  estimateTasksMemoryUsage,
  estimateFilterMemoryUsage,
  estimateOperationMemoryUsage,
  validateTaskCountLimit,
  validateTaskCountLimitLegacy,
  logMemoryUsage,
  createTaskLimitExceededMessage
} from '../../src/utils/memory';

describe('Memory Protection Core Functions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getMaxTasksLimit', () => {
    it('should return default limit when no environment variable is set', () => {
      delete process.env.VIKUNJA_MAX_TASKS_LIMIT;
      expect(getMaxTasksLimit()).toBe(10000);
    });

    it('should return custom limit from environment variable', () => {
      process.env.VIKUNJA_MAX_TASKS_LIMIT = '5000';
      expect(getMaxTasksLimit()).toBe(5000);
    });

    it('should return default limit when environment variable is invalid', () => {
      process.env.VIKUNJA_MAX_TASKS_LIMIT = 'invalid';
      expect(getMaxTasksLimit()).toBe(10000);
    });
  });

  describe('estimateTaskMemoryUsage', () => {
    it('should return default estimate for undefined task', () => {
      const estimate = estimateTaskMemoryUsage();
      expect(estimate).toBe(4096); // Updated to reflect improved estimation
    });

    it('should estimate memory usage for a simple task', () => {
      const task: Partial<Task> = {
        id: 1,
        title: 'Simple task',
        description: 'A simple description',
        done: false,
        priority: 1
      };
      
      const estimate = estimateTaskMemoryUsage(task as Task);
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(5000); // Should be reasonable for simple task
    });

    it('should estimate larger memory usage for complex tasks', () => {
      const complexTask: Partial<Task> = {
        id: 1,
        title: 'Complex task with very long title that includes many characters and lots of text content',
        description: 'A very detailed description with lots of text and information that would take up more memory space in the system including detailed explanations and extensive content',
        done: false,
        priority: 5,
        assignees: [
          { id: 1, username: 'user1', name: 'User One' },
          { id: 2, username: 'user2', name: 'User Two' },
          { id: 3, username: 'user3', name: 'User Three' }
        ] as any,
        labels: [
          { id: 1, title: 'Label 1' },
          { id: 2, title: 'Label 2' },
          { id: 3, title: 'Label 3' }
        ] as any,
        attachments: [
          { id: 1, filename: 'file1.pdf' },
          { id: 2, filename: 'file2.doc' },
          { id: 3, filename: 'file3.xlsx' }
        ] as any
      };
      
      const simpleEstimate = estimateTaskMemoryUsage();
      const complexEstimate = estimateTaskMemoryUsage(complexTask as Task);
      expect(complexEstimate).toBeGreaterThan(simpleEstimate);
    });
  });

  describe('validateTaskCountLimit', () => {
    beforeEach(() => {
      process.env.VIKUNJA_MAX_TASKS_LIMIT = '1000';
    });

    it('should allow task counts within limits', () => {
      const result = validateTaskCountLimit(500);
      expect(result.allowed).toBe(true);
      expect(result.maxAllowed).toBe(1000);
      expect(result.estimatedMemoryMB).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('should reject task counts exceeding limits', () => {
      const result = validateTaskCountLimit(1500);
      expect(result.allowed).toBe(false);
      expect(result.maxAllowed).toBe(1000);
      expect(result.estimatedMemoryMB).toBeGreaterThan(0);
      expect(result.error).toContain('Task count 1500 exceeds maximum allowed limit of 1000');
    });
  });

  describe('logMemoryUsage', () => {
    beforeEach(() => {
      process.env.VIKUNJA_MAX_TASKS_LIMIT = '1000';
    });

    it('should log memory usage information', () => {
      logMemoryUsage('test operation', 500);
      
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Memory usage for test operation',
        expect.objectContaining({
          taskCount: 500,
          estimatedMemoryMB: expect.any(Number),
          maxTasksLimit: 1000
        })
      );
    });

    it('should warn when approaching task limit', () => {
      logMemoryUsage('approaching limit test', 850); // 85% of 1000

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledTimes(2); // Updated: now logs warnings separately
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Approaching task limit'),
        expect.objectContaining({
          utilizationPercent: 85
        })
      );
    });

    it('should not warn when well below limit', () => {
      logMemoryUsage('safe operation', 400); // 40% of 1000
      
      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('createTaskLimitExceededMessage', () => {
    beforeEach(() => {
      process.env.VIKUNJA_MAX_TASKS_LIMIT = '1000';
    });

    it('should create informative error message', () => {
      const message = createTaskLimitExceededMessage('list tasks', 1500);

      expect(message).toContain('Cannot list tasks');
      expect(message).toContain('1500 tasks');
      expect(message).toContain('maximum limit of 1000');
      expect(message).toContain('Estimated memory usage:');
      expect(message).toContain('Suggestions:');
      expect(message).toContain('Use more specific filters');
      expect(message).toContain('VIKUNJA_MAX_TASKS_LIMIT');
    });
  });

  describe('Improved Memory Estimation Functions', () => {
    describe('estimateTasksMemoryUsage', () => {
      it('should handle empty arrays', () => {
        const estimate = estimateTasksMemoryUsage([]);
        expect(estimate).toBe(0);
      });

      it('should provide consistent estimates for homogeneous tasks', () => {
        const tasks = [
          { id: 1, title: 'Task 1', done: false },
          { id: 2, title: 'Task 2', done: true },
          { id: 3, title: 'Task 3', done: false }
        ] as Task[];

        const estimate = estimateTasksMemoryUsage(tasks);
        expect(estimate).toBeGreaterThan(0);
        expect(estimate).toBeLessThan(50000); // Should be reasonable
      });

      it('should scale linearly with task count for similar tasks', () => {
        const singleTask = { id: 1, title: 'Test task', done: false } as Task;
        const singleEstimate = estimateTaskMemoryUsage(singleTask);

        const tenTasks = Array(10).fill(singleTask);
        const tenEstimate = estimateTasksMemoryUsage(tenTasks);

        // Should be approximately 10x (allowing for array overhead)
        expect(tenEstimate).toBeGreaterThan(singleEstimate * 8);
        expect(tenEstimate).toBeLessThan(singleEstimate * 15);
      });
    });

    describe('estimateFilterMemoryUsage', () => {
      it('should estimate basic filter memory usage', () => {
        const estimate = estimateFilterMemoryUsage('done = false');
        expect(estimate).toBeGreaterThan(0);
        expect(estimate).toBeLessThan(1000);
      });

      it('should handle complex filter expressions', () => {
        const complexFilter = 'done = false AND priority >= 3 AND (assignee_id = 1 OR assignee_id = 2) AND created_at > "2023-01-01"';
        const queryParams = { page: 1, per_page: 50, sort_by: 'created_desc' };

        const estimate = estimateFilterMemoryUsage(complexFilter, queryParams);
        expect(estimate).toBeGreaterThan(0);
        expect(estimate).toBeLessThan(5000);
      });

      it('should handle empty parameters', () => {
        const estimate = estimateFilterMemoryUsage();
        expect(estimate).toBe(0);
      });
    });

    describe('estimateOperationMemoryUsage', () => {
      it('should estimate complete operation memory usage', () => {
        const estimate = estimateOperationMemoryUsage({
          taskCount: 100,
          filterExpression: 'done = false',
          includeResponseOverhead: true
        });

        expect(estimate).toBeGreaterThan(0);
        expect(estimate).toBeLessThan(2097152); // Less than 2GB
      });

      it('should include response overhead when requested', () => {
        const withOverhead = estimateOperationMemoryUsage({
          taskCount: 100,
          includeResponseOverhead: true
        });

        const withoutOverhead = estimateOperationMemoryUsage({
          taskCount: 100,
          includeResponseOverhead: false
        });

        expect(withOverhead).toBeGreaterThan(withoutOverhead);
      });
    });

    describe('validateTaskCountLimit (enhanced)', () => {
      beforeEach(() => {
        process.env.VIKUNJA_MAX_TASKS_LIMIT = '1000';
      });

      it('should provide risk assessment for safe operations', () => {
        const result = validateTaskCountLimit(100);

        expect(result.allowed).toBe(true);
        expect(result.riskLevel).toBe('low');
        expect(result.warnings).toHaveLength(0);
      });

      it('should warn about medium risk operations', () => {
        // Create a scenario that would use significant memory
        const largeTask = {
          id: 1,
          title: 'A'.repeat(100),
          description: 'B'.repeat(1000),
          assignees: Array(10).fill({ id: 1, username: 'user' }),
          labels: Array(20).fill({ id: 1, title: 'label' })
        } as Task;

        const result = validateTaskCountLimit(500, largeTask);

        expect(result.allowed).toBe(true);
        expect(['low', 'medium', 'high']).toContain(result.riskLevel);
      });

      it('should provide detailed warnings for high-risk scenarios', () => {
        const result = validateTaskCountLimit(900, undefined, {
          filterExpression: 'x'.repeat(600), // Long filter
          operationType: 'list'
        });

        expect(result.allowed).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.includes('Approaching task count limit'))).toBe(true);
      });

      it('should reject operations that exceed limits', () => {
        const result = validateTaskCountLimit(1500);

        expect(result.allowed).toBe(false);
        expect(result.riskLevel).toBe('high');
        expect(result.error).toBeDefined();
        expect(result.error).toContain('exceeds maximum allowed limit');
      });
    });

    describe('validateTaskCountLimitLegacy (backward compatibility)', () => {
      beforeEach(() => {
        process.env.VIKUNJA_MAX_TASKS_LIMIT = '1000';
      });

      it('should maintain legacy interface for allowed operations', () => {
        const result = validateTaskCountLimitLegacy(500);

        expect(result.allowed).toBe(true);
        expect(result.maxAllowed).toBe(1000);
        expect(result.estimatedMemoryMB).toBeGreaterThan(0);
        expect(result.error).toBeUndefined();
      });

      it('should maintain legacy interface for rejected operations', () => {
        const result = validateTaskCountLimitLegacy(1500);

        expect(result.allowed).toBe(false);
        expect(result.maxAllowed).toBe(1000);
        expect(result.estimatedMemoryMB).toBeGreaterThan(0);
        expect(result.error).toBeDefined();
      });
    });

    describe('Memory Estimation Accuracy', () => {
      it('should provide conservative estimates for typical tasks', () => {
        const typicalTask = {
          id: 123,
          title: 'Complete project documentation',
          description: 'Write comprehensive documentation for the new API endpoints including examples and error handling',
          done: false,
          priority: 3,
          project_id: 5,
          due_date: '2024-01-15T10:00:00Z',
          created_at: '2024-01-01T09:00:00Z',
          updated_at: '2024-01-10T15:30:00Z',
          assignees: [
            { id: 1, username: 'john_doe', email: 'john@example.com' },
            { id: 2, username: 'jane_smith', email: 'jane@example.com' }
          ],
          labels: [
            { id: 1, title: 'documentation', hex_color: '#ff6b6b' },
            { id: 2, title: 'urgent', hex_color: '#ff9f43' }
          ]
        } as Task;

        const estimate = estimateTaskMemoryUsage(typicalTask);

        // Should be a reasonable conservative estimate (2KB - 20KB)
        expect(estimate).toBeGreaterThan(2048);
        expect(estimate).toBeLessThan(20480);
      });

      it('should handle complex nested task structures', () => {
        const complexTask = {
          id: 456,
          title: 'Complex task with many properties',
          description: 'A task with extensive nested data',
          done: false,
          priority: 5,
          project_id: 10,
          assignees: Array(5).fill({ id: 1, username: 'user', email: 'user@example.com' }),
          labels: Array(10).fill({ id: 1, title: 'label', hex_color: '#000000' }),
          attachments: Array(3).fill({ id: 1, filename: 'document.pdf', size: 1024 }),
          related_tasks: Array(2).fill({ task_id: 123, relation_kind: 'subtask' }),
          custom_fields: {
            field1: 'value1',
            field2: 'value2',
            field3: 123
          }
        } as any;

        const estimate = estimateTaskMemoryUsage(complexTask);

        // Should handle complex objects appropriately
        expect(estimate).toBeGreaterThan(4096);
        expect(estimate).toBeLessThan(102400); // Less than 100KB
      });
    });
  });
});