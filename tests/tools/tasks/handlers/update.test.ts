/**
 * Tests for update task handler
 */

import { handleUpdateTask } from '../../../../src/tools/tasks/handlers/update';
import type { UpdateTaskRequest } from '../../../../src/types/operations/tasks';
import type { VikunjaClient, Task, Label } from 'node-vikunja';
import { MCPError, ErrorCode } from '../../../../src/types/errors';
import { logger } from '../../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../../src/utils/logger');
jest.mock('../../../../src/utils/retry', () => ({
  withRetry: jest.fn((fn) => fn()),
  RETRY_CONFIG: { maxRetries: 3 }
}));
jest.mock('../../../../src/utils/auth-error-handler', () => ({
  isAuthenticationError: jest.fn((error: Error) => 
    error.message.toLowerCase().includes('401') || 
    error.message.toLowerCase().includes('unauthorized')
  )
}));

// Mock task data
const mockTask: Task = {
  id: 1,
  project_id: 1,
  title: 'Original Task',
  description: 'Original Description',
  done: false,
  priority: 2,
  due_date: '2024-01-01T00:00:00Z',
  labels: [
    { id: 10, title: 'Label 1' } as Label,
    { id: 20, title: 'Label 2' } as Label
  ],
  assignees: [
    { id: 100, username: 'user1' },
    { id: 200, username: 'user2' }
  ],
  repeat_after: 0,
  repeat_mode: 0,
  created: '2024-01-01T00:00:00Z',
  updated: '2024-01-01T00:00:00Z'
};

const updatedTask: Task = {
  ...mockTask,
  title: 'Updated Task',
  done: true,
  updated: '2024-01-02T00:00:00Z'
};

describe('handleUpdateTask', () => {
  let mockClient: jest.Mocked<VikunjaClient>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock client
    mockClient = {
      tasks: {
        getTask: jest.fn()
          .mockResolvedValueOnce(mockTask) // First call returns original
          .mockResolvedValueOnce(updatedTask), // Second call returns updated
        updateTask: jest.fn().mockResolvedValue(updatedTask),
        addLabelsToTask: jest.fn().mockResolvedValue(undefined),
        removeLabelsFromTask: jest.fn().mockResolvedValue(undefined),
        addAssigneeToTask: jest.fn().mockResolvedValue(undefined),
        removeAssigneeFromTask: jest.fn().mockResolvedValue(undefined)
      }
    } as any;
  });

  describe('successful updates', () => {
    it('should update basic fields successfully', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        title: 'Updated Task',
        done: true
      };

      const response = await handleUpdateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('update');
      expect(response.message).toBe('Task updated successfully');
      expect(response.task).toEqual(updatedTask);
      expect(response.metadata.affectedFields).toContain('title');
      expect(response.metadata.affectedFields).toContain('done');
      expect(response.metadata.previousState?.title).toBe('Original Task');
      expect(response.metadata.previousState?.done).toBe(false);

      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, {
        title: 'Updated Task',
        done: true
      });
    });

    it('should update description and priority', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        description: 'New Description',
        priority: 5
      };

      const response = await handleUpdateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.affectedFields).toContain('description');
      expect(response.metadata.affectedFields).toContain('priority');
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, {
        description: 'New Description',
        priority: 5
      });
    });

    it('should update due date', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        dueDate: '2024-12-31T00:00:00Z'
      };

      const response = await handleUpdateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.affectedFields).toContain('dueDate');
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, {
        due_date: '2024-12-31T00:00:00Z'
      });
    });

    it('should handle repeat configuration update', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        repeatAfter: 86400,
        repeatMode: 'day'
      };

      const response = await handleUpdateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.affectedFields).toContain('repeatAfter');
      expect(response.metadata.affectedFields).toContain('repeatMode');
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, {
        repeat_after: 86400,
        repeat_mode: 0
      });
    });

    it('should clear repeat configuration when setting to undefined', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        repeatAfter: 0
      };

      const response = await handleUpdateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, {
        repeat_after: 0,
        repeat_mode: 0
      });
    });

    it('should update labels by replacing them', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        labels: [30, 40] // Replace [10, 20] with [30, 40]
      };

      const response = await handleUpdateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.affectedFields).toContain('labels');
      
      // Should remove old labels
      expect(mockClient.tasks.removeLabelsFromTask).toHaveBeenCalledTimes(1);
      expect(mockClient.tasks.removeLabelsFromTask).toHaveBeenCalledWith(1, [10, 20]);
      
      // Should add new labels
      expect(mockClient.tasks.addLabelsToTask).toHaveBeenCalledTimes(1);
      expect(mockClient.tasks.addLabelsToTask).toHaveBeenCalledWith(1, [30, 40]);
    });

    it('should clear all labels when setting empty array', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        labels: []
      };

      const response = await handleUpdateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(mockClient.tasks.removeLabelsFromTask).toHaveBeenCalledTimes(1);
      expect(mockClient.tasks.removeLabelsFromTask).toHaveBeenCalledWith(1, [10, 20]);
      expect(mockClient.tasks.addLabelsToTask).not.toHaveBeenCalled();
    });

    it('should update assignees by replacing them', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        assignees: [300] // Replace [100, 200] with [300]
      };

      const response = await handleUpdateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.affectedFields).toContain('assignees');
      
      // Should remove old assignees
      expect(mockClient.tasks.removeAssigneeFromTask).toHaveBeenCalledTimes(2);
      expect(mockClient.tasks.removeAssigneeFromTask).toHaveBeenCalledWith(1, 100);
      expect(mockClient.tasks.removeAssigneeFromTask).toHaveBeenCalledWith(1, 200);
      
      // Should add new assignee
      expect(mockClient.tasks.addAssigneeToTask).toHaveBeenCalledTimes(1);
      expect(mockClient.tasks.addAssigneeToTask).toHaveBeenCalledWith(1, 300);
    });

    it('should skip update if no fields changed', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        title: 'Original Task' // Same as current
      };

      const response = await handleUpdateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.affectedFields).toEqual([]);
      expect(mockClient.tasks.updateTask).not.toHaveBeenCalled();
    });
  });

  describe('validation errors', () => {
    it('should reject invalid task ID', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: -1,
        title: 'Updated'
      };

      await expect(handleUpdateTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleUpdateTask(request, mockClient)).rejects.toThrow('Task ID must be positive');
    });

    it('should reject update without any fields', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1
      };

      await expect(handleUpdateTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleUpdateTask(request, mockClient)).rejects.toThrow('At least one field must be provided');
    });

    it('should reject invalid priority', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        priority: 10
      };

      await expect(handleUpdateTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleUpdateTask(request, mockClient)).rejects.toThrow('Priority cannot be greater than 5');
    });

    it('should reject invalid date format', async () => {
      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        dueDate: 'not-a-date'
      };

      await expect(handleUpdateTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleUpdateTask(request, mockClient)).rejects.toThrow('Invalid');
    });
  });

  describe('error handling', () => {
    it('should handle API errors during update', async () => {
      const apiError = new Error('API Error');
      mockClient.tasks.updateTask = jest.fn().mockRejectedValue(apiError);

      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        title: 'Updated'
      };

      const response = await handleUpdateTask(request, mockClient);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(ErrorCode.API_ERROR);
      expect(response.error?.message).toBe('API Error');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('401 Unauthorized');
      mockClient.tasks.getTask = jest.fn().mockRejectedValue(authError);

      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        title: 'Updated'
      };

      await expect(handleUpdateTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleUpdateTask(request, mockClient)).rejects.toThrow('Authentication required');
    });

    it('should handle errors when fetching current task', async () => {
      const fetchError = new Error('Not found');
      mockClient.tasks.getTask = jest.fn().mockRejectedValue(fetchError);

      const request: UpdateTaskRequest = {
        operation: 'update',
        id: 1,
        title: 'Updated'
      };

      const response = await handleUpdateTask(request, mockClient);

      expect(response.success).toBe(false);
      expect(response.error?.message).toBe('Not found');
    });
  });
});