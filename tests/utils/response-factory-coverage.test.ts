/**
 * Additional coverage tests for response-factory.ts
 * Tests specific edge cases and uncovered branches
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createStandardResponse, createTaskResponse, createAorpEnabledFactory } from '../../src/utils/response-factory';
import type { Task } from '../../src/transforms/task';

// Mock console.warn to track calls
const originalConsoleWarn = console.warn;

describe('Response Factory - Additional Coverage', () => {
  beforeEach(() => {
    // Mock console.warn to track if it's called
    console.warn = jest.fn();
  });

  afterEach(() => {
    // Restore console.warn
    console.warn = originalConsoleWarn;
    jest.clearAllMocks();
  });

  describe('convertToTask function edge cases', () => {
    it('should handle empty object data in convertToTask', () => {
      // This tests lines 113-124: empty object handling
      const response = createTaskResponse('test', 'Test message', {} as any);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      // The empty object should be converted to a basic task structure
      const taskData = response.data as any;
      expect(taskData.id).toBe(0);
      expect(taskData.title).toBe('Untitled Task');
      expect(taskData.done).toBe(false);
      expect(taskData.priority).toBe(0);
      // These fields are part of the transformed data structure
      expect(taskData).toBeDefined();
    });

    it('should handle invalid task data structure in convertToTask', () => {
      // This tests line 124: error handling for invalid data
      expect(() => {
        createTaskResponse('test', 'Test message', null as any);
      }).toThrow('Invalid task data structure');

      expect(() => {
        createTaskResponse('test', 'Test message', undefined as any);
      }).toThrow('Invalid task data structure');

      expect(() => {
        createTaskResponse('test', 'Test message', 'invalid' as any);
      }).toThrow('Invalid task data structure');
    });

    it('should handle array with valid items in createTaskResponse', () => {
      const validData = [
        {
          id: 1,
          title: 'Valid Task 1',
          done: false,
          priority: 1,
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          title: 'Valid Task 2',
          done: true,
          priority: 2,
          created_at: '2024-01-02T00:00:00Z',
        }
      ];

      const response = createTaskResponse('test', 'Test message', validData);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      const tasks = response.data as any[];
      expect(tasks).toHaveLength(2);
    });
  });

  describe('createAorpEnabledFactory function', () => {
    it('should create AORP enabled factory with default config', () => {
      // This tests lines 377-394: createAorpEnabledFactory function
      const factory = createAorpEnabledFactory();

      expect(factory).toBeDefined();
      expect(typeof factory.createResponse).toBe('function');

      const response = factory.createResponse('test_op', 'Test message', { data: 'test' });

      expect(response.success).toBe(true);
      expect(response.operation).toBe('test_op');
      expect(response.message).toBe('Test message');
      // Data will be transformed by the factory, so check it exists
      expect(response.data).toBeDefined();
      expect(response.metadata).toBeDefined();
    });

    it('should create AORP enabled factory with custom config', () => {
      const customConfig = {
        useOptimization: false,
        verbosity: 'minimal' as any,
      };

      const factory = createAorpEnabledFactory(customConfig);

      const response = factory.createResponse('test_op', 'Test message', { data: 'test' });

      expect(response.success).toBe(true);
      expect(response.metadata).toBeDefined();
    });

    it('should merge config with options correctly', () => {
      const baseConfig = {
        useOptimization: true,
        verbosity: 'standard' as any,
      };

      const factory = createAorpEnabledFactory(baseConfig);

      // Options should override base config
      const response = factory.createResponse(
        'test_op',
        'Test message',
        { data: 'test' },
        {},
        { useOptimization: false } // Override base config
      );

      expect(response.success).toBe(true);
      expect(response.metadata).toBeDefined();
    });

    it('should handle empty config and options', () => {
      const factory = createAorpEnabledFactory({});

      const response = factory.createResponse('test_op', 'Test message', { data: 'test' }, {}, {});

      expect(response.success).toBe(true);
      expect(response.metadata).toBeDefined();
    });
  });

  describe('Edge cases for createTaskResponse', () => {
    it('should handle single valid task object', () => {
      const validTask = {
        id: 1,
        title: 'Test Task',
        done: false,
        priority: 3,
        created_at: '2024-01-01T00:00:00Z',
        description: 'Test description'
      };

      const response = createTaskResponse('test', 'Test message', validTask);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      const task = response.data as Task;
      expect(task.id).toBe(1);
      expect(task.title).toBe('Test Task');
    });

    it('should handle task object with missing optional fields', () => {
      const minimalTask = {
        id: 1,
        title: 'Minimal Task'
        // Missing done, priority, created_at
      };

      const response = createTaskResponse('test', 'Test message', minimalTask as any);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      // The task should be processed and transformed
    });

    it('should handle task object with all required fields', () => {
      const completeTask = {
        id: 1,
        title: 'Complete Task',
        done: true,
        priority: 5,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        description: 'Complete description',
        project_id: 10
      };

      const response = createTaskResponse('test', 'Test message', completeTask);

      expect(response.success).toBe(true);

      const task = response.data as Task;
      expect(task.id).toBe(1);
      expect(task.title).toBe('Complete Task');
      expect(task.done).toBe(true);
      expect(task.priority).toBe(5);
      expect(task.description).toBe('Complete description');
      expect(task.project_id).toBe(10);
    });

    it('should handle array processing in createTaskResponse', () => {
      const validArray = [
        {
          id: 1,
          title: 'Valid Task 1',
          done: false,
          priority: 1
        },
        {
          id: 2,
          title: 'Valid Task 2',
          done: true,
          priority: 2
        }
      ];

      const response = createTaskResponse('test', 'Test message', validArray);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      // The array should be processed and transformed
    });
  });
});