/**
 * Comprehensive authentication error tests for tasks/crud.ts
 * This test file specifically targets uncovered authentication error handling paths
 * to achieve 95%+ test coverage requirement
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createTask, getTask, updateTask, deleteTask } from '../../src/tools/tasks/crud';
import { MCPError, ErrorCode } from '../../src/types';
import type { MockVikunjaClient } from '../types/mocks';
import { parseMarkdown } from '../utils/markdown';

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

// Mock retry utility to speed up tests
jest.mock('../../src/utils/retry', () => ({
  withRetry: jest.fn().mockImplementation((fn) => fn()),
  RETRY_CONFIG: {
    AUTH_ERRORS: {
      maxRetries: 3,
    },
  },
}));

describe('Tasks CRUD - Authentication Error Handling', () => {
  let mockClient: MockVikunjaClient;
  const { getClientFromContext } = require('../../src/client');

  // Create authentication errors with proper structure
  const createAuthError = (status: number, message?: string) => {
    const error = new Error(message || 'Authentication failed');
    (error as any).status = status;
    return error;
  };

  const createAxiosAuthError = (status: number, message?: string) => {
    const error = new Error(message || 'Authentication failed');
    (error as any).response = { status };
    return error;
  };

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

  describe('createTask authentication errors', () => {
    it('should handle authentication error in label assignment (line 92)', async () => {
      // Mock successful task creation
      const createdTask = { id: 1, title: 'Test Task', project_id: 1 };
      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      
      // Mock label assignment failure with 401 auth error
      const authError = createAuthError(401, 'Unauthorized to assign labels');
      mockClient.tasks.updateTaskLabels.mockRejectedValue(authError);
      
      // Mock successful task deletion for rollback
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      await expect(
        createTask({
          projectId: 1,
          title: 'Test Task',
          labels: [1, 2],
        })
      ).rejects.toThrow(MCPError);

      // Verify the error message includes retry information
      try {
        await createTask({
          projectId: 1,
          title: 'Test Task',
          labels: [1, 2],
        });
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).message).toContain('(Retried');
        expect((error as MCPError).message).toContain('Task ID: 1');
      }

      // Verify rollback was attempted
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
    });

    it('should handle authentication error in label assignment with Axios-style error', async () => {
      // Mock successful task creation
      const createdTask = { id: 1, title: 'Test Task', project_id: 1 };
      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      
      // Mock label assignment failure with 403 Axios-style auth error
      const authError = createAxiosAuthError(403, 'Forbidden to assign labels');
      mockClient.tasks.updateTaskLabels.mockRejectedValue(authError);
      
      // Mock successful task deletion for rollback
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      await expect(
        createTask({
          projectId: 1,
          title: 'Test Task',
          labels: [1, 2],
        })
      ).rejects.toThrow(MCPError);

      // Verify rollback was attempted
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
    });

    it('should handle authentication error in assignee assignment (line 118)', async () => {
      // Mock successful task creation and label assignment
      const createdTask = { id: 1, title: 'Test Task', project_id: 1 };
      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      mockClient.tasks.updateTaskLabels.mockResolvedValue(undefined);
      
      // Mock assignee assignment failure with 401 auth error
      const authError = createAuthError(401, 'Unauthorized to assign users');
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(authError);
      
      // Mock successful task deletion for rollback
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      await expect(
        createTask({
          projectId: 1,
          title: 'Test Task',
          labels: [1],
          assignees: [1, 2],
        })
      ).rejects.toThrow(MCPError);

      // Verify the error message includes retry information
      try {
        await createTask({
          projectId: 1,
          title: 'Test Task',
          labels: [1],
          assignees: [1, 2],
        });
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).message).toContain('(Retried');
        expect((error as MCPError).message).toContain('Task ID: 1');
      }

      // Verify rollback was attempted
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
    });

    it('should handle authentication error in assignee assignment with 403 error', async () => {
      // Mock successful task creation
      const createdTask = { id: 1, title: 'Test Task', project_id: 1 };
      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      
      // Mock assignee assignment failure with 403 auth error
      const authError = createAxiosAuthError(403, 'Forbidden to assign users');
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(authError);
      
      // Mock successful task deletion for rollback
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      await expect(
        createTask({
          projectId: 1,
          title: 'Test Task',
          assignees: [1, 2],
        })
      ).rejects.toThrow(MCPError);

      // Verify rollback was attempted
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
    });
  });

  describe('updateTask authentication errors', () => {
    const mockTask = {
      id: 1,
      title: 'Original Title',
      description: 'Original Description',
      due_date: null,
      priority: 1,
      done: false,
      repeat_after: 0,
      repeat_mode: 0,
      assignees: [{ id: 1 }, { id: 2 }],
    };

    it('should handle authentication error in label update (lines 328-331)', async () => {
      // Mock successful task fetch and update
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);
      
      // Mock label update failure with 401 auth error
      const authError = createAuthError(401, 'Unauthorized to update labels');
      mockClient.tasks.updateTaskLabels.mockRejectedValue(authError);

      await expect(
        updateTask({
          id: 1,
          title: 'Updated Title',
          labels: [1, 2, 3],
        })
      ).rejects.toThrow(MCPError);

      // Verify the specific auth error message is thrown
      try {
        await updateTask({
          id: 1,
          title: 'Updated Title',
          labels: [1, 2, 3],
        });
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.API_ERROR);
      }
    });

    it('should handle authentication error in label update with 403 error', async () => {
      // Mock successful task fetch and update
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);
      
      // Mock label update failure with 403 Axios-style auth error
      const authError = createAxiosAuthError(403, 'Forbidden to update labels');
      mockClient.tasks.updateTaskLabels.mockRejectedValue(authError);

      await expect(
        updateTask({
          id: 1,
          title: 'Updated Title',
          labels: [1, 2, 3],
        })
      ).rejects.toThrow(MCPError);
    });

    it('should handle authentication error in assignee removal (line 361)', async () => {
      // Mock task with current assignees
      const taskWithAssignees = {
        ...mockTask,
        assignees: [{ id: 1 }, { id: 2 }, { id: 3 }],
      };
      
      // Mock successful initial operations
      mockClient.tasks.getTask
        .mockResolvedValueOnce(taskWithAssignees) // Initial fetch
        .mockResolvedValueOnce(taskWithAssignees); // For assignee diff calculation
      mockClient.tasks.updateTask.mockResolvedValue(taskWithAssignees);
      
      // Mock successful assignee addition but failed removal with auth error
      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue(undefined);
      const authError = createAuthError(401, 'Unauthorized to remove assignee');
      mockClient.tasks.removeUserFromTask.mockRejectedValue(authError);

      await expect(
        updateTask({
          id: 1,
          assignees: [1, 4], // Remove 2 and 3, add 4
        })
      ).rejects.toThrow(MCPError);

      // Verify the specific auth error message is thrown
      try {
        await updateTask({
          id: 1,
          assignees: [1, 4], // Remove 2 and 3, add 4
        });
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.API_ERROR);
      }
    });

    it('should handle authentication error in assignee removal with 403 error', async () => {
      // Mock task with current assignees
      const taskWithAssignees = {
        ...mockTask,
        assignees: [{ id: 1 }, { id: 2 }],
      };
      
      // Mock successful initial operations
      mockClient.tasks.getTask
        .mockResolvedValueOnce(taskWithAssignees) // Initial fetch
        .mockResolvedValueOnce(taskWithAssignees); // For assignee diff calculation
      mockClient.tasks.updateTask.mockResolvedValue(taskWithAssignees);
      
      // Mock failed removal with 403 auth error
      const authError = createAxiosAuthError(403, 'Forbidden to remove assignee');
      mockClient.tasks.removeUserFromTask.mockRejectedValue(authError);

      await expect(
        updateTask({
          id: 1,
          assignees: [1], // Remove assignee 2
        })
      ).rejects.toThrow(MCPError);
    });

    it('should handle authentication error in general assignee update (line 369)', async () => {
      // Mock successful initial operations
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);
      
      // Mock assignee operations failure with auth error at the top level
      const authError = createAuthError(401, 'Unauthorized assignee operation');
      
      // Make the first getTask call for assignee diff calculation fail with auth error
      mockClient.tasks.getTask
        .mockResolvedValueOnce(mockTask) // Initial fetch
        .mockRejectedValueOnce(authError); // For assignee diff calculation

      await expect(
        updateTask({
          id: 1,
          assignees: [1, 2, 3],
        })
      ).rejects.toThrow(MCPError);

      // Verify the error message includes retry information
      try {
        await updateTask({
          id: 1,
          assignees: [1, 2, 3],
        });
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).message).toContain('(Retried');
      }
    });

    it('should handle authentication error in general assignee update with 403 error', async () => {
      // Mock successful initial operations
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);
      
      // Mock assignee operations failure with 403 auth error
      const authError = createAxiosAuthError(403, 'Forbidden assignee operation');
      
      // Make the assignee addition fail with auth error
      mockClient.tasks.getTask
        .mockResolvedValueOnce(mockTask) // Initial fetch
        .mockResolvedValueOnce(mockTask); // For assignee diff calculation
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(authError);

      await expect(
        updateTask({
          id: 1,
          assignees: [1, 2, 3],
        })
      ).rejects.toThrow(MCPError);
    });
  });

  describe('error propagation and non-auth errors', () => {
    it('should properly propagate non-authentication errors in createTask', async () => {
      // Mock successful task creation
      const createdTask = { id: 1, title: 'Test Task', project_id: 1 };
      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      
      // Mock label assignment failure with non-auth error
      const nonAuthError = new Error('Network timeout');
      mockClient.tasks.updateTaskLabels.mockRejectedValue(nonAuthError);
      
      // Mock successful task deletion for rollback
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      await expect(
        createTask({
          projectId: 1,
          title: 'Test Task',
          labels: [1, 2],
        })
      ).rejects.toThrow('Failed to complete task creation: Network timeout');
    });

    it('should properly propagate non-authentication errors in updateTask', async () => {
      const mockTask = {
        id: 1,
        title: 'Original Title',
        description: 'Original Description',
        due_date: null,
        priority: 1,
        done: false,
        repeat_after: 0,
        repeat_mode: 0,
        assignees: [],
      };

      // Mock successful task fetch and update
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);
      
      // Mock label update failure with non-auth error
      const nonAuthError = new Error('Database connection failed');
      mockClient.tasks.updateTaskLabels.mockRejectedValue(nonAuthError);

      await expect(
        updateTask({
          id: 1,
          labels: [1, 2, 3],
        })
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('edge cases for complete coverage', () => {
    it('should handle createTask with undefined task ID in error context', async () => {
      // Mock task creation returning undefined/null ID
      const createdTaskNoId = { title: 'Test Task', project_id: 1, id: undefined };
      mockClient.tasks.createTask.mockResolvedValue(createdTaskNoId);

      // When task has no ID, label assignment should not be attempted
      const result = await createTask({
        projectId: 1,
        title: 'Test Task',
        labels: [1],
      });

      // Verify no label operations were attempted due to missing task ID
      expect(mockClient.tasks.updateTaskLabels).not.toHaveBeenCalled();
      // Verify no deleteTask call was made since there's no ID
      expect(mockClient.tasks.deleteTask).not.toHaveBeenCalled();

      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
    });

    it('should handle updateTask with task having no assignees field', async () => {
      const taskWithoutAssignees = {
        id: 1,
        title: 'Test Task',
        description: '',
        due_date: null,
        priority: 1,
        done: false,
        repeat_after: 0,
        repeat_mode: 0,
        // assignees field is missing
      };

      // Mock successful operations
      mockClient.tasks.getTask
        .mockResolvedValueOnce(taskWithoutAssignees)
        .mockResolvedValueOnce(taskWithoutAssignees);
      mockClient.tasks.updateTask.mockResolvedValue(taskWithoutAssignees);
      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue(undefined);

      const result = await updateTask({
        id: 1,
        assignees: [1, 2],
      });

      // Should handle undefined assignees gracefully and add new ones
      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(1, {
        user_ids: [1, 2],
      });
    });
  });
});