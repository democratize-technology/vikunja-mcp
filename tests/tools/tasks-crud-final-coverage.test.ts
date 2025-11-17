/**
 * Final coverage tests for remaining uncovered lines in tasks/crud.ts
 * Targeting lines: 209-219, 279, 281, 363
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createTask, getTask, updateTask, deleteTask } from '../../src/tools/tasks/crud';
import { MCPError, ErrorCode } from '../../src/types';
import type { MockVikunjaClient } from '../types/mocks';

// Mock the client module
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
}));

// Mock logger to suppress output during tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Tasks CRUD - Final Coverage', () => {
  let mockClient: MockVikunjaClient;
  const { getClientFromContext } = require('../../src/client');

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock client with all required methods
    mockClient = {
      tasks: {
        createTask: jest.fn(),
        getTask: jest.fn(),
        updateTask: jest.fn(),
        deleteTask: jest.fn(),
        updateTaskLabels: jest.fn(),
        bulkAssignUsersToTask: jest.fn(),
        removeUserFromTask: jest.fn(),
      },
    } as any;

    getClientFromContext.mockResolvedValue(mockClient);
  });

  describe('getTask success path (lines 209-219)', () => {
    it('should return successful response with task details', async () => {
      const mockTask = {
        id: 1,
        title: 'Test Task Title',
        description: 'Test Description',
        done: false,
        priority: 1,
      };

      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await getTask({ id: 1 });

      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('get-task');
      expect(response.message).toBe('Retrieved task "Test Task Title"');
      expect(response.data.task).toEqual(mockTask);
      expect(response.metadata.timestamp).toBeDefined();
      
      expect(result.content[0].type).toBe('text');
    });

    it('should handle task with undefined title gracefully', async () => {
      const mockTask = {
        id: 1,
        title: undefined, // Undefined title
        description: 'Test Description',
        done: false,
        priority: 1,
      };

      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await getTask({ id: 1 });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Retrieved task "undefined"');
      expect(response.data.task).toEqual(mockTask);
    });

    it('should handle task with null title gracefully', async () => {
      const mockTask = {
        id: 1,
        title: null, // Null title
        description: 'Test Description',
        done: false,
        priority: 1,
      };

      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await getTask({ id: 1 });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Retrieved task "null"');
      expect(response.data.task).toEqual(mockTask);
    });
  });

  describe('updateTask field tracking (lines 279, 281)', () => {
    it('should track due date and priority changes correctly', async () => {
      const mockTask = {
        id: 1,
        title: 'Test Task',
        description: 'Test Description',
        due_date: '2024-01-01T00:00:00Z',
        priority: 1,
        done: false,
        repeat_after: 0,
        repeat_mode: 0,
        assignees: [],
      };

      const updatedTask = {
        ...mockTask,
        due_date: '2024-12-31T23:59:59Z', // Changed due date
        priority: 5, // Changed priority
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(mockTask) // Initial fetch
        .mockResolvedValueOnce(updatedTask); // Final fetch
      mockClient.tasks.updateTask.mockResolvedValue(updatedTask);

      const result = await updateTask({
        id: 1,
        dueDate: '2024-12-31T23:59:59Z',
        priority: 5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.affectedFields).toContain('dueDate');
      expect(response.metadata.affectedFields).toContain('priority');
      expect(response.success).toBe(true);
    });

    it('should not track unchanged fields', async () => {
      const mockTask = {
        id: 1,
        title: 'Test Task',
        description: 'Test Description',
        due_date: '2024-01-01T00:00:00Z',
        priority: 1,
        done: false,
        repeat_after: 0,
        repeat_mode: 0,
        assignees: [],
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(mockTask) // Initial fetch
        .mockResolvedValueOnce(mockTask); // Final fetch
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);

      const result = await updateTask({
        id: 1,
        dueDate: '2024-01-01T00:00:00Z', // Same due date
        priority: 1, // Same priority
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.affectedFields).not.toContain('dueDate');
      expect(response.metadata.affectedFields).not.toContain('priority');
      expect(response.success).toBe(true);
    });
  });

  describe('assignee error propagation (line 363)', () => {
    it('should propagate non-authentication errors during assignee removal', async () => {
      const taskWithAssignees = {
        id: 1,
        title: 'Test Task',
        description: 'Test Description',
        due_date: null,
        priority: 1,
        done: false,
        repeat_after: 0,
        repeat_mode: 0,
        assignees: [{ id: 1 }, { id: 2 }],
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(taskWithAssignees) // Initial fetch
        .mockResolvedValueOnce(taskWithAssignees); // For assignee diff calculation
      mockClient.tasks.updateTask.mockResolvedValue(taskWithAssignees);

      // Mock successful addition but failed removal with non-auth error
      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue(undefined);
      const nonAuthError = new Error('Network timeout during remove operation');
      mockClient.tasks.removeUserFromTask.mockRejectedValue(nonAuthError);

      await expect(
        updateTask({
          id: 1,
          assignees: [1, 3], // Remove 2, add 3
        })
      ).rejects.toThrow('Network timeout during remove operation');
    });

    it('should propagate non-Error objects during assignee removal', async () => {
      const taskWithAssignees = {
        id: 1,
        title: 'Test Task',
        description: 'Test Description',
        due_date: null,
        priority: 1,
        done: false,
        repeat_after: 0,
        repeat_mode: 0,
        assignees: [{ id: 1 }, { id: 2 }],
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(taskWithAssignees) // Initial fetch
        .mockResolvedValueOnce(taskWithAssignees); // For assignee diff calculation
      mockClient.tasks.updateTask.mockResolvedValue(taskWithAssignees);

      // Mock successful addition but failed removal with non-Error object
      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue(undefined);
      const nonErrorObject = { status: 500, error: 'Database connection lost' };
      mockClient.tasks.removeUserFromTask.mockRejectedValue(nonErrorObject);

      await expect(
        updateTask({
          id: 1,
          assignees: [1, 3], // Remove 2, add 3
        })
      ).rejects.toThrow('Failed to update task: Unknown error');
    });
  });

  describe('comprehensive field change tracking', () => {
    it('should track all possible field changes including repeat configuration', async () => {
      const mockTask = {
        id: 1,
        title: 'Original Title',
        description: 'Original Description',
        due_date: '2024-01-01T00:00:00Z',
        priority: 1,
        done: false,
        repeat_after: 0,
        repeat_mode: 0,
        assignees: [{ id: 1 }],
      };

      const updatedTask = {
        ...mockTask,
        title: 'New Title',
        description: 'New Description',
        due_date: '2024-12-31T23:59:59Z',
        priority: 5,
        done: true,
        repeat_after: 86400, // 1 day
        repeat_mode: 0,
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(mockTask) // Initial fetch
        .mockResolvedValueOnce(updatedTask); // Final fetch
      mockClient.tasks.updateTask.mockResolvedValue(updatedTask);
      mockClient.tasks.updateTaskLabels.mockResolvedValue(undefined);
      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue(undefined);

      const result = await updateTask({
        id: 1,
        title: 'New Title',
        description: 'New Description',
        dueDate: '2024-12-31T23:59:59Z',
        priority: 5,
        done: true,
        repeatAfter: 1,
        repeatMode: 'day',
        labels: [1, 2],
        assignees: [1, 2],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.affectedFields).toEqual(
        expect.arrayContaining([
          'title',
          'description',
          'dueDate',
          'priority',
          'done',
          'repeatAfter',
          'repeatMode',
          'labels',
          'assignees',
        ])
      );
      expect(response.success).toBe(true);
    });
  });
});