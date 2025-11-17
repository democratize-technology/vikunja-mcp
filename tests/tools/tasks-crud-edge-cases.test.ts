/**
 * Edge case tests for tasks/crud.ts to ensure comprehensive coverage
 * Targets defensive programming patterns and boundary conditions
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

describe('Tasks CRUD - Edge Cases and Defensive Programming', () => {
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

  describe('createTask edge cases', () => {
    it('should handle empty description field correctly', async () => {
      const createdTask = { id: 1, title: 'Test Task', project_id: 1 };
      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      mockClient.tasks.getTask.mockResolvedValue(createdTask);

      const result = await createTask({
        projectId: 1,
        title: 'Test Task',
        description: '', // Empty string
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Test Task',
        project_id: 1,
        description: '',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle undefined optional fields correctly', async () => {
      const createdTask = { id: 1, title: 'Test Task', project_id: 1 };
      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      mockClient.tasks.getTask.mockResolvedValue(createdTask);

      const result = await createTask({
        projectId: 1,
        title: 'Test Task',
        description: undefined,
        dueDate: undefined,
        priority: undefined,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Test Task',
        project_id: 1,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle zero values correctly', async () => {
      const createdTask = { id: 1, title: 'Test Task', project_id: 1, priority: 0 };
      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      mockClient.tasks.getTask.mockResolvedValue(createdTask);

      const result = await createTask({
        projectId: 1,
        title: 'Test Task',
        priority: 0, // Zero is valid
        repeatAfter: 0, // Zero is valid
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Test Task',
        project_id: 1,
        priority: 0,
        repeat_after: 0, // Should include repeat fields when provided
        repeat_mode: 0,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle empty arrays correctly', async () => {
      const createdTask = { id: 1, title: 'Test Task', project_id: 1 };
      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      mockClient.tasks.getTask.mockResolvedValue(createdTask);

      const result = await createTask({
        projectId: 1,
        title: 'Test Task',
        labels: [], // Empty array
        assignees: [], // Empty array
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Test Task',
        project_id: 1,
      });

      // Empty arrays should not trigger label/assignee operations
      expect(mockClient.tasks.updateTaskLabels).not.toHaveBeenCalled();
      expect(mockClient.tasks.bulkAssignUsersToTask).not.toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle task creation without ID for label operations', async () => {
      const createdTaskNoId = { title: 'Test Task', project_id: 1 }; // No ID
      mockClient.tasks.createTask.mockResolvedValue(createdTaskNoId);

      const result = await createTask({
        projectId: 1,
        title: 'Test Task',
        labels: [1, 2], // Labels provided but task has no ID
      });

      // Should not attempt label operations without task ID
      expect(mockClient.tasks.updateTaskLabels).not.toHaveBeenCalled();
      expect(mockClient.tasks.getTask).not.toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle task creation without ID for assignee operations', async () => {
      const createdTaskNoId = { title: 'Test Task', project_id: 1 }; // No ID
      mockClient.tasks.createTask.mockResolvedValue(createdTaskNoId);

      const result = await createTask({
        projectId: 1,
        title: 'Test Task',
        assignees: [1, 2], // Assignees provided but task has no ID
      });

      // Should not attempt assignee operations without task ID
      expect(mockClient.tasks.bulkAssignUsersToTask).not.toHaveBeenCalled();
      expect(mockClient.tasks.getTask).not.toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('updateTask edge cases', () => {
    const mockTask = {
      id: 1,
      title: 'Original Title',
      description: 'Original Description',
      due_date: '2024-01-01T00:00:00Z',
      priority: 1,
      done: false,
      repeat_after: 0,
      repeat_mode: 0,
      assignees: [],
    };

    it('should handle updating with same values (no changes)', async () => {
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);

      const result = await updateTask({
        id: 1,
        title: 'Original Title', // Same value
        description: 'Original Description', // Same value
        priority: 1, // Same value
        done: false, // Same value
      });

      // Should still call updateTask but with no affected fields
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, {
        ...mockTask,
        title: 'Original Title',
        description: 'Original Description',
        priority: 1,
        done: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.metadata.affectedFields).toEqual([]);
    });

    it('should handle undefined repeat configuration correctly', async () => {
      const currentTask = {
        ...mockTask,
        repeat_after: 86400, // 1 day
        repeat_mode: 1,
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(currentTask)
        .mockResolvedValueOnce(currentTask);
      mockClient.tasks.updateTask.mockResolvedValue(currentTask);

      const result = await updateTask({
        id: 1,
        repeatMode: 'week', // Should convert to number
      });

      // Should call updateTask with expected repeat configuration
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, expect.objectContaining({
        repeat_mode: 0, // Week mode converts to 0
      }));

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle partial repeat configuration updates', async () => {
      const currentTask = {
        ...mockTask,
        repeat_after: 0,
        repeat_mode: 0,
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(currentTask)
        .mockResolvedValueOnce(currentTask);
      mockClient.tasks.updateTask.mockResolvedValue(currentTask);

      const result = await updateTask({
        id: 1,
        repeatAfter: 5, // Only update repeat after
      });

      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          repeat_after: 5, // Without repeatMode, value is used as-is (seconds)
        })
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle empty assignee list updates', async () => {
      const taskWithAssignees = {
        ...mockTask,
        assignees: [{ id: 1 }, { id: 2 }],
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(taskWithAssignees)
        .mockResolvedValueOnce(taskWithAssignees);
      mockClient.tasks.updateTask.mockResolvedValue(taskWithAssignees);
      mockClient.tasks.removeUserFromTask.mockResolvedValue(undefined);

      const result = await updateTask({
        id: 1,
        assignees: [], // Remove all assignees
      });

      // Should remove all existing assignees
      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(1, 1);
      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(1, 2);
      // Should not add any assignees
      expect(mockClient.tasks.bulkAssignUsersToTask).not.toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle assignee updates with null/undefined assignees on current task', async () => {
      const taskWithNullAssignees = {
        ...mockTask,
        assignees: null, // Null assignees
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(taskWithNullAssignees)
        .mockResolvedValueOnce(taskWithNullAssignees);
      mockClient.tasks.updateTask.mockResolvedValue(taskWithNullAssignees);
      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue(undefined);

      const result = await updateTask({
        id: 1,
        assignees: [1, 2], // Add assignees to task with null assignees
      });

      // Should add all assignees (since current is empty due to null)
      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(1, {
        user_ids: [1, 2],
      });
      // Should not remove any assignees
      expect(mockClient.tasks.removeUserFromTask).not.toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('deleteTask edge cases', () => {
    it('should handle task not found during pre-delete fetch gracefully', async () => {
      // Mock getTask to fail (task not found)
      mockClient.tasks.getTask.mockRejectedValue(new Error('Task not found'));
      // Mock successful deletion
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      const result = await deleteTask({ id: 1 });

      // Should still proceed with deletion
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Task 1 deleted successfully');
      expect(response.task).toBeUndefined(); // No task details available
    });

    it('should handle various error types during deletion', async () => {
      // Mock successful getTask
      const mockTask = { id: 1, title: 'Test Task' };
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      
      // Mock deleteTask to fail with non-Error object
      mockClient.tasks.deleteTask.mockRejectedValue({ status: 500, message: 'Server error' });

      await expect(deleteTask({ id: 1 })).rejects.toThrow(
        'Failed to delete task: Unknown error'
      );
    });

    it('should handle string errors during deletion', async () => {
      // Mock successful getTask
      const mockTask = { id: 1, title: 'Test Task' };
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      
      // Mock deleteTask to fail with string
      mockClient.tasks.deleteTask.mockRejectedValue('String error message');

      await expect(deleteTask({ id: 1 })).rejects.toThrow(
        'Failed to delete task: Unknown error'
      );
    });
  });

  describe('getTask edge cases', () => {
    it('should handle various error types in getTask', async () => {
      // Mock getTask to fail with non-Error object
      mockClient.tasks.getTask.mockRejectedValue({ code: 404, message: 'Not found' });

      await expect(getTask({ id: 1 })).rejects.toThrow(
        'Failed to get task: Unknown error'
      );
    });

    it('should handle string errors in getTask', async () => {
      // Mock getTask to fail with string
      mockClient.tasks.getTask.mockRejectedValue('Database connection lost');

      await expect(getTask({ id: 1 })).rejects.toThrow(
        'Failed to get task: Unknown error'
      );
    });

    it('should handle undefined error in getTask', async () => {
      // Mock getTask to fail with undefined
      mockClient.tasks.getTask.mockRejectedValue(undefined);

      await expect(getTask({ id: 1 })).rejects.toThrow(
        'Failed to get task: Unknown error'
      );
    });
  });

  describe('validation edge cases', () => {
    it('should handle validation errors for zero and negative IDs', async () => {
      // Zero projectId triggers the "required" check first
      await expect(createTask({ projectId: 0, title: 'Test' })).rejects.toThrow(
        'projectId is required to create a task'
      );

      await expect(createTask({ projectId: -1, title: 'Test' })).rejects.toThrow(
        'projectId must be a positive integer'
      );

      await expect(getTask({ id: 0 })).rejects.toThrow(
        'Task id is required for get operation'
      );

      await expect(updateTask({ id: -1, title: 'Test' })).rejects.toThrow(
        'id must be a positive integer'
      );

      await expect(deleteTask({ id: 0 })).rejects.toThrow(
        'Task id is required for delete operation'
      );
    });

    it('should handle validation errors for invalid dates', async () => {
      await expect(
        createTask({
          projectId: 1,
          title: 'Test',
          dueDate: 'invalid-date',
        })
      ).rejects.toThrow('dueDate must be a valid ISO 8601 date string');

      await expect(
        updateTask({
          id: 1,
          dueDate: '2024-13-45', // Invalid date
        })
      ).rejects.toThrow('dueDate must be a valid ISO 8601 date string');
    });

    it('should handle validation errors for invalid assignee IDs in createTask', async () => {
      await expect(
        createTask({
          projectId: 1,
          title: 'Test',
          assignees: [1, 0, 2], // 0 is invalid
        })
      ).rejects.toThrow('assignee ID must be a positive integer');

      await expect(
        createTask({
          projectId: 1,
          title: 'Test',
          assignees: [1, -5, 2], // -5 is invalid
        })
      ).rejects.toThrow('assignee ID must be a positive integer');
    });
  });

  describe('simple error context tests', () => {
    it('should handle assignee failure during createTask', async () => {
      const createdTask = { id: 1, title: 'Test Task', project_id: 1 };
      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      
      // Mock assignee assignment failure
      const assigneeError = new Error('Assignee assignment failed');
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(assigneeError);
      
      // Mock successful rollback
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      await expect(
        createTask({
          projectId: 1,
          title: 'Test Task',
          assignees: [1, 2],
        })
      ).rejects.toThrow('Failed to complete task creation: Assignee assignment failed');
    });

    it('should handle rollback failure during createTask', async () => {
      const createdTask = { id: 1, title: 'Test Task', project_id: 1 };
      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      
      // Mock label assignment failure
      const labelError = new Error('Label assignment failed');
      mockClient.tasks.updateTaskLabels.mockRejectedValue(labelError);
      
      // Mock failed rollback
      const deleteError = new Error('Delete failed');
      mockClient.tasks.deleteTask.mockRejectedValue(deleteError);

      await expect(
        createTask({
          projectId: 1,
          title: 'Test Task',
          labels: [1, 2],
        })
      ).rejects.toThrow('Task rollback also failed');
    });
  });
});