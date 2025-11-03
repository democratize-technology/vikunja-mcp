/**
 * Tests for simple response creation utilities
 * Ensures comprehensive coverage of response creation functionality
 */

import { createStandardResponse, createOptimizedResponse, createTaskResponse, createMinimalResponse } from '../../src/utils/response-factory';
import { Verbosity } from '../../src/transforms/base';
import type { Task } from '../../src/transforms/task';

describe('Response Factory Utilities', () => {
  let sampleData: any;
  let sampleTask: Task;

  beforeEach(() => {
    sampleData = {
      id: 1,
      name: 'Test Item',
      description: 'This is a test item',
      status: 'active',
      created_at: '2024-01-01T00:00:00Z'
    };

    sampleTask = {
      id: 1,
      title: 'Test Task',
      done: false,
      priority: 3,
      description: 'Test description',
      created_at: '2024-01-01T08:00:00Z',
      project_id: 5
    } as Task;
  });

  describe('createStandardResponse', () => {
    it('should create optimized response when optimization is enabled', () => {
      const response = createStandardResponse(
        'test_operation',
        'Test message',
        sampleData
      );

      expect(response.success).toBe(true);
      expect(response.operation).toBe('test_operation');
      expect(response.message).toBe('Test message');
      expect(response.metadata).toBeDefined();
      expect(response.metadata.optimization).toBeDefined();
    });

    it('should create standard response when optimization is disabled', () => {
      const response = createStandardResponse(
        'test_operation',
        'Test message',
        sampleData,
        {},
        { useOptimization: false }
      );

      expect(response.success).toBe(true);
      expect(response.operation).toBe('test_operation');
      expect(response.message).toBe('Test message');
      expect(response.metadata).toBeDefined();
      expect(response.metadata.optimization).toBeUndefined();
    });

    it('should use custom verbosity', () => {
      const response = createStandardResponse(
        'test_operation',
        'Test message',
        sampleTask,
        {},
        { verbosity: Verbosity.MINIMAL }
      );

      expect(response.metadata.optimization?.verbosity).toBe(Verbosity.MINIMAL);
      expect(response.data).toMatchObject({
        id: 1,
        title: 'Test Task',
        done: false
      });
    });

    it('should apply field transforms when specified', () => {
      const response = createStandardResponse(
        'test_operation',
        'Test message',
        sampleTask,
        {},
        { transformFields: ['id', 'title', 'description'] }
      );

      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('title');
      expect(response.data).toHaveProperty('description');
    });

    it('should include custom metadata', () => {
      const customMetadata = {
        count: 5,
        userId: 123,
        additional: 'info'
      };

      const response = createStandardResponse(
        'test_operation',
        'Test message',
        sampleData,
        customMetadata
      );

      expect(response.metadata.count).toBe(5);
      expect(response.metadata.userId).toBe(123);
      expect(response.metadata.additional).toBe('info');
      expect(response.metadata.optimization).toBeDefined(); // Should preserve optimization metadata
    });

    it('should handle array data correctly', () => {
      const arrayData = [sampleData, { ...sampleData, id: 2 }];
      const response = createStandardResponse(
        'list_operation',
        'Items retrieved',
        arrayData
      );

      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data).toHaveLength(2);
      expect(response.metadata.count).toBe(2);
    });

    it('should handle null/undefined data', () => {
      const response = createStandardResponse(
        'test_operation',
        'Test message',
        null
      );

      expect(response.data).toBeNull();
      expect(response.metadata.count).toBe(1); // Count is always set to 1 for non-array data
    });
  });

  describe('createTaskResponse', () => {
    it('should create optimized task response', () => {
      const response = createTaskResponse(
        'get_task',
        'Task retrieved',
        sampleTask
      );

      expect(response.success).toBe(true);
      expect(response.operation).toBe('get_task');
      expect(response.message).toBe('Task retrieved');
      expect(response.metadata.optimization).toBeDefined();
      expect(response.metadata.optimization?.verbosity).toBe(Verbosity.STANDARD);
    });

    it('should handle single task', () => {
      const response = createTaskResponse(
        'get_task',
        'Task retrieved',
        sampleTask,
        {},
        Verbosity.DETAILED
      );

      expect(response.data).toMatchObject({
        id: 1,
        title: 'Test Task',
        done: false,
        priority: 3,
        description: 'Test description'
      });
      expect(response.data).toHaveProperty('created_at');
    });

    it('should handle task array', () => {
      const tasks = [sampleTask, { ...sampleTask, id: 2, title: 'Task 2' }];
      const response = createTaskResponse(
        'list_tasks',
        'Tasks retrieved',
        tasks,
        {},
        Verbosity.MINIMAL
      );

      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data).toHaveLength(2);
      response.data.forEach((task: any) => {
        expect(task).toHaveProperty('id');
        expect(task).toHaveProperty('title');
        expect(task).toHaveProperty('done');
      });
    });

    it('should use custom verbosity for tasks', () => {
      const response = createTaskResponse(
        'get_task',
        'Task retrieved',
        sampleTask,
        {},
        Verbosity.MINIMAL
      );

      expect(response.metadata.optimization?.verbosity).toBe(Verbosity.MINIMAL);
      expect(Object.keys(response.data)).toHaveLength(3); // id, title, done
    });

    it('should include task-specific metadata', () => {
      const response = createTaskResponse(
        'get_task',
        'Task retrieved',
        sampleTask,
        { projectId: 5 }
      );

      expect(response.metadata.projectId).toBe(5);
      expect(response.metadata.optimization).toBeDefined();
    });

    it('should calculate correct size metrics for tasks', () => {
      const response = createTaskResponse(
        'get_task',
        'Task retrieved',
        sampleTask
      );

      const optimization = response.metadata.optimization;
      expect(optimization?.sizeMetrics.originalSize).toBeGreaterThan(0);
      expect(optimization?.sizeMetrics.optimizedSize).toBeGreaterThan(0);
      expect(optimization?.sizeMetrics.reductionPercentage).toBeGreaterThanOrEqual(0);
    });

    it('should track task transformation performance', () => {
      const response = createTaskResponse(
        'get_task',
        'Task retrieved',
        sampleTask
      );

      const optimization = response.metadata.optimization;
      expect(optimization?.performance.transformationTimeMs).toBeGreaterThanOrEqual(0);
      expect(optimization?.performance.totalTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Optimization Metadata', () => {
    it('should include comprehensive optimization metadata', () => {
      const response = createStandardResponse(
        'test_operation',
        'Test message',
        sampleTask,
        {},
        { verbosity: Verbosity.STANDARD }
      );

      const optimization = response.metadata.optimization;
      expect(optimization).toBeDefined();

      // Check size metrics
      expect(optimization?.sizeMetrics.originalSize).toBeGreaterThan(0);
      expect(optimization?.sizeMetrics.optimizedSize).toBeGreaterThan(0);
      expect(optimization?.sizeMetrics.reductionPercentage).toBeGreaterThanOrEqual(0);

      // Check field metrics
      expect(optimization?.fieldMetrics.fieldsIncluded).toBeGreaterThan(0);
      expect(optimization?.fieldMetrics.totalFields).toBeGreaterThan(0);
      expect(optimization?.fieldMetrics.inclusionPercentage).toBeGreaterThan(0);

      // Check performance metrics
      expect(optimization?.performance.transformationTimeMs).toBeGreaterThanOrEqual(0);
      expect(optimization?.performance.totalTimeMs).toBeGreaterThanOrEqual(0);

      // Check categories
      expect(Array.isArray(optimization?.categoriesIncluded)).toBe(true);
    });

    it('should handle non-task data correctly', () => {
      const response = createStandardResponse(
        'test_operation',
        'Test message',
        sampleData
      );

      const optimization = response.metadata.optimization;
      expect(optimization).toBeDefined();

      // For non-task data, should have basic metrics
      expect(optimization?.sizeMetrics.originalSize).toBeGreaterThan(0);
      expect(optimization?.fieldMetrics.fieldsIncluded).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string data', () => {
      const response = createStandardResponse(
        'test_operation',
        'Test message',
        ''
      );

      expect(response.data).toBe('');
      expect(response.metadata.optimization).toBeDefined();
    });

    it('should handle number data', () => {
      const response = createStandardResponse(
        'test_operation',
        'Test message',
        42
      );

      expect(response.data).toBe(42);
      expect(response.metadata.optimization).toBeDefined();
    });

    it('should handle boolean data', () => {
      const response = createStandardResponse(
        'test_operation',
        'Test message',
        true
      );

      expect(response.data).toBe(true);
      expect(response.metadata.optimization).toBeDefined();
    });

    it('should handle very large data sets', () => {
      const largeData = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        description: `Description for item ${i}`,
        active: i % 2 === 0
      }));

      const startTime = Date.now();
      const response = createStandardResponse(
        'large_operation',
        'Large data retrieved',
        largeData
      );
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data).toHaveLength(10000);
    });
  });
});

describe('Utility Functions', () => {
  let sampleData: any;

  beforeEach(() => {
    sampleData = {
      id: 1,
      title: 'Test Item',
      description: 'Test description'
    };
  });

  describe('createOptimizedResponse', () => {
    it('should create optimized response with default verbosity', () => {
      const response = createOptimizedResponse('test_op', 'Test message', sampleData);

      expect(response.success).toBe(true);
      expect(response.metadata.optimization?.verbosity).toBe(Verbosity.STANDARD);
    });

    it('should accept custom verbosity', () => {
      const response = createOptimizedResponse(
        'test_op',
        'Test message',
        sampleData,
        {},
        Verbosity.MINIMAL
      );

      expect(response.metadata.optimization?.verbosity).toBe(Verbosity.MINIMAL);
    });
  });

  describe('createTaskResponse', () => {
    it('should create task-specific optimized response', () => {
      const task = {
        id: 1,
        title: 'Test Task',
        done: false,
        priority: 3
      } as Task;

      const response = createTaskResponse('get_task', 'Task retrieved', task);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('get_task');
      expect(response.metadata.optimization?.verbosity).toBe(Verbosity.STANDARD);
    });

    it('should handle task arrays', () => {
      const tasks = [
        { id: 1, title: 'Task 1', done: false } as Task,
        { id: 2, title: 'Task 2', done: true } as Task
      ];

      const response = createTaskResponse('list_tasks', 'Tasks retrieved', tasks);

      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data).toHaveLength(2);
    });
  });

  describe('createMinimalResponse', () => {
    it('should create response without optimization', () => {
      const response = createMinimalResponse('test_op', 'Test message', sampleData);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('test_op');
      expect(response.message).toBe('Test message');
      expect(response.data).toEqual(sampleData);
      expect(response.metadata.optimization).toBeUndefined();
    });

    it('should include custom metadata', () => {
      const customMetadata = { userId: 123 };
      const response = createMinimalResponse('test_op', 'Test message', sampleData, customMetadata);

      expect(response.metadata.userId).toBe(123);
      expect(response.metadata.optimization).toBeUndefined();
    });
  });
});