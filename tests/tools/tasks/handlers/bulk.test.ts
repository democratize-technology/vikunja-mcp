/**
 * Tests for bulk task operations handlers
 */

import {
  handleBulkCreateTasks,
  handleBulkUpdateTasks,
  handleBulkDeleteTasks
} from '../../../../src/tools/tasks/handlers/bulk';
import type {
  BulkCreateTasksRequest,
  BulkUpdateTasksRequest,
  BulkDeleteTasksRequest
} from '../../../../src/types/operations/tasks';
import type { VikunjaClient, Task } from 'node-vikunja';
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
const createMockTask = (id: number): Task => ({
  id,
  project_id: 1,
  title: `Task ${id}`,
  done: false,
  created: '2024-01-01T00:00:00Z',
  updated: '2024-01-01T00:00:00Z'
});

describe('Bulk Task Operations', () => {
  let mockClient: jest.Mocked<VikunjaClient>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock client
    mockClient = {
      tasks: {
        createTask: jest.fn().mockImplementation((projectId, data) => 
          Promise.resolve({ ...createMockTask(Date.now()), ...data, project_id: projectId })
        ),
        getTask: jest.fn().mockImplementation((id) => 
          Promise.resolve(createMockTask(id))
        ),
        updateTask: jest.fn().mockResolvedValue(createMockTask(1)),
        deleteTask: jest.fn().mockResolvedValue(undefined),
        addLabelToTask: jest.fn().mockResolvedValue(undefined),
        removeLabelsFromTask: jest.fn().mockResolvedValue(undefined),
        addLabelsToTask: jest.fn().mockResolvedValue(undefined),
        addAssigneeToTask: jest.fn().mockResolvedValue(undefined),
        removeAssigneeFromTask: jest.fn().mockResolvedValue(undefined)
      }
    } as any;
  });

  describe('handleBulkCreateTasks', () => {
    it('should create multiple tasks successfully', async () => {
      const request: BulkCreateTasksRequest = {
        operation: 'bulk-create',
        projectId: 1,
        tasks: [
          { title: 'Task 1' },
          { title: 'Task 2', priority: 3 },
          { title: 'Task 3', description: 'Description 3' }
        ]
      };

      const response = await handleBulkCreateTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('bulk-create');
      expect(response.message).toBe('Created 3 tasks');
      expect(response.tasks).toHaveLength(3);
      expect(response.metadata.count).toBe(3);
      expect(response.metadata.failedCount).toBeUndefined();
      expect(response.metadata.failures).toBeUndefined();

      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(3);
      expect(mockClient.tasks.getTask).toHaveBeenCalledTimes(3);
    });

    it('should handle tasks with labels and assignees', async () => {
      const request: BulkCreateTasksRequest = {
        operation: 'bulk-create',
        projectId: 1,
        tasks: [
          { title: 'Task with labels', labels: [10, 20] },
          { title: 'Task with assignees', assignees: [100, 200] }
        ]
      };

      const response = await handleBulkCreateTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.tasks).toHaveLength(2);

      // Verify labels were added
      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledTimes(2);
      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledWith(expect.any(Number), 10);
      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledWith(expect.any(Number), 20);

      // Verify assignees were added
      expect(mockClient.tasks.addAssigneeToTask).toHaveBeenCalledTimes(2);
      expect(mockClient.tasks.addAssigneeToTask).toHaveBeenCalledWith(expect.any(Number), 100);
      expect(mockClient.tasks.addAssigneeToTask).toHaveBeenCalledWith(expect.any(Number), 200);
    });

    it('should handle repeating tasks', async () => {
      const request: BulkCreateTasksRequest = {
        operation: 'bulk-create',
        projectId: 1,
        tasks: [
          { title: 'Daily task', repeatAfter: 86400, repeatMode: 'day' },
          { title: 'Weekly task', repeatAfter: 604800, repeatMode: 'week' }
        ]
      };

      const response = await handleBulkCreateTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, expect.objectContaining({
        title: 'Daily task',
        repeat_after: 86400 * 86400, // convertRepeatConfiguration multiplies by seconds in a day
        repeat_mode: 0
      }));
    });

    it('should handle partial failures', async () => {
      mockClient.tasks.createTask = jest.fn()
        .mockResolvedValueOnce(createMockTask(1))
        .mockRejectedValueOnce(new Error('Creation failed'))
        .mockResolvedValueOnce(createMockTask(3));

      const request: BulkCreateTasksRequest = {
        operation: 'bulk-create',
        projectId: 1,
        tasks: [
          { title: 'Task 1' },
          { title: 'Task 2' },
          { title: 'Task 3' }
        ]
      };

      const response = await handleBulkCreateTasks(request, mockClient);

      expect(response.success).toBe(false);
      expect(response.message).toBe('Created 2 tasks, 1 failed');
      expect(response.tasks).toHaveLength(2);
      expect(response.metadata.count).toBe(2);
      expect(response.metadata.failedCount).toBe(1);
      expect(response.metadata.failures).toHaveLength(1);
      expect(response.metadata.failures?.[0]).toEqual({
        index: 1,
        error: 'Creation failed',
        taskData: { title: 'Task 2' }
      });
    });

    it('should validate input', async () => {
      const request: BulkCreateTasksRequest = {
        operation: 'bulk-create',
        projectId: -1,
        tasks: [{ title: 'Task' }]
      };

      await expect(handleBulkCreateTasks(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleBulkCreateTasks(request, mockClient)).rejects.toThrow('Project ID must be positive');
    });

    it('should reject empty tasks array', async () => {
      const request: BulkCreateTasksRequest = {
        operation: 'bulk-create',
        projectId: 1,
        tasks: []
      };

      await expect(handleBulkCreateTasks(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleBulkCreateTasks(request, mockClient)).rejects.toThrow('At least one task must be provided');
    });

    it('should reject more than 100 tasks', async () => {
      const request: BulkCreateTasksRequest = {
        operation: 'bulk-create',
        projectId: 1,
        tasks: Array(101).fill({ title: 'Task' })
      };

      await expect(handleBulkCreateTasks(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleBulkCreateTasks(request, mockClient)).rejects.toThrow('Cannot create more than 100 tasks');
    });
  });

  describe('handleBulkUpdateTasks', () => {
    it('should update done status for multiple tasks', async () => {
      const request: BulkUpdateTasksRequest = {
        operation: 'bulk-update',
        taskIds: [1, 2, 3],
        field: 'done',
        value: true
      };

      const response = await handleBulkUpdateTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('bulk-update');
      expect(response.message).toBe('Updated 3 tasks');
      expect(response.tasks).toHaveLength(3);
      expect(response.metadata.affectedField).toBe('done');
      expect(response.metadata.count).toBe(3);

      expect(mockClient.tasks.updateTask).toHaveBeenCalledTimes(3);
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, { done: true });
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(2, { done: true });
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(3, { done: true });
    });

    it('should update priority for multiple tasks', async () => {
      const request: BulkUpdateTasksRequest = {
        operation: 'bulk-update',
        taskIds: [1, 2],
        field: 'priority',
        value: 4
      };

      const response = await handleBulkUpdateTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, { priority: 4 });
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(2, { priority: 4 });
    });

    it('should update assignees for multiple tasks', async () => {
      mockClient.tasks.getTask = jest.fn().mockResolvedValue({
        ...createMockTask(1),
        assignees: [{ id: 100, username: 'olduser' }]
      });

      const request: BulkUpdateTasksRequest = {
        operation: 'bulk-update',
        taskIds: [1, 2],
        field: 'assignees',
        value: [200, 300]
      };

      const response = await handleBulkUpdateTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(mockClient.tasks.removeAssigneeFromTask).toHaveBeenCalledWith(expect.any(Number), 100);
      expect(mockClient.tasks.addAssigneeToTask).toHaveBeenCalledWith(expect.any(Number), 200);
      expect(mockClient.tasks.addAssigneeToTask).toHaveBeenCalledWith(expect.any(Number), 300);
    });

    it('should update labels for multiple tasks', async () => {
      mockClient.tasks.getTask = jest.fn().mockResolvedValue({
        ...createMockTask(1),
        labels: [{ id: 10, title: 'Old Label' }]
      });

      const request: BulkUpdateTasksRequest = {
        operation: 'bulk-update',
        taskIds: [1],
        field: 'labels',
        value: [20, 30]
      };

      const response = await handleBulkUpdateTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(mockClient.tasks.removeLabelsFromTask).toHaveBeenCalledWith(expect.any(Number), [10]);
      expect(mockClient.tasks.addLabelsToTask).toHaveBeenCalledWith(expect.any(Number), [20, 30]);
    });

    it('should handle fetch errors gracefully', async () => {
      mockClient.tasks.updateTask = jest.fn().mockResolvedValue(createMockTask(1));
      mockClient.tasks.getTask = jest.fn()
        .mockResolvedValueOnce(createMockTask(1))
        .mockRejectedValueOnce(new Error('Fetch failed'))
        .mockResolvedValueOnce(createMockTask(3));

      const request: BulkUpdateTasksRequest = {
        operation: 'bulk-update',
        taskIds: [1, 2, 3],
        field: 'done',
        value: true
      };

      const response = await handleBulkUpdateTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.tasks).toHaveLength(2); // Only 2 successful fetches
      expect(response.metadata.fetchErrors).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to fetch task after update',
        expect.objectContaining({ taskId: 2 })
      );
    });

    it('should validate field and value combinations', async () => {
      const request: BulkUpdateTasksRequest = {
        operation: 'bulk-update',
        taskIds: [1],
        field: 'done',
        value: 'not-a-boolean'
      };

      await expect(handleBulkUpdateTasks(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleBulkUpdateTasks(request, mockClient)).rejects.toThrow('Invalid value for the specified field');
    });

    it('should validate priority range', async () => {
      const request: BulkUpdateTasksRequest = {
        operation: 'bulk-update',
        taskIds: [1],
        field: 'priority',
        value: 10
      };

      await expect(handleBulkUpdateTasks(request, mockClient)).rejects.toThrow(MCPError);
    });

    it('should accept null values for nullable fields', async () => {
      const request: BulkUpdateTasksRequest = {
        operation: 'bulk-update',
        taskIds: [1],
        field: 'due_date',
        value: null
      };

      const response = await handleBulkUpdateTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, { due_date: null });
    });
  });

  describe('handleBulkDeleteTasks', () => {
    it('should delete multiple tasks successfully', async () => {
      const request: BulkDeleteTasksRequest = {
        operation: 'bulk-delete',
        taskIds: [1, 2, 3, 4, 5]
      };

      const response = await handleBulkDeleteTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('bulk-delete');
      expect(response.message).toBe('Deleted 5 tasks');
      expect(response.metadata.count).toBe(5);
      expect(response.metadata.deletedTaskIds).toEqual([1, 2, 3, 4, 5]);
      expect(response.metadata.failedTaskIds).toBeUndefined();

      expect(mockClient.tasks.deleteTask).toHaveBeenCalledTimes(5);
    });

    it('should handle partial deletion failures', async () => {
      mockClient.tasks.deleteTask = jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce(undefined);

      const request: BulkDeleteTasksRequest = {
        operation: 'bulk-delete',
        taskIds: [1, 2, 3]
      };

      const response = await handleBulkDeleteTasks(request, mockClient);

      expect(response.success).toBe(false);
      expect(response.message).toBe('Deleted 2 tasks, 1 failed');
      expect(response.metadata.count).toBe(2);
      expect(response.metadata.deletedTaskIds).toEqual([1, 3]);
      expect(response.metadata.failedTaskIds).toEqual([2]);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to delete task in bulk operation',
        expect.objectContaining({ taskId: 2 })
      );
    });

    it('should validate task IDs', async () => {
      const request: BulkDeleteTasksRequest = {
        operation: 'bulk-delete',
        taskIds: []
      };

      await expect(handleBulkDeleteTasks(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleBulkDeleteTasks(request, mockClient)).rejects.toThrow('At least one task ID must be provided');
    });

    it('should reject more than 100 task IDs', async () => {
      const request: BulkDeleteTasksRequest = {
        operation: 'bulk-delete',
        taskIds: Array(101).fill(1).map((_, i) => i + 1)
      };

      await expect(handleBulkDeleteTasks(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleBulkDeleteTasks(request, mockClient)).rejects.toThrow('Cannot delete more than 100 tasks');
    });

    it('should handle individual task failures including auth errors', async () => {
      const authError = new Error('401 Unauthorized');
      mockClient.tasks.deleteTask = jest.fn().mockRejectedValue(authError);

      const request: BulkDeleteTasksRequest = {
        operation: 'bulk-delete',
        taskIds: [1]
      };

      const response = await handleBulkDeleteTasks(request, mockClient);
      
      expect(response.success).toBe(false);
      expect(response.message).toBe('Deleted 0 tasks, 1 failed');
      expect(response.metadata.deletedTaskIds).toEqual([]);
      expect(response.metadata.failedTaskIds).toEqual([1]);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to delete task in bulk operation',
        expect.objectContaining({ taskId: 1 })
      );
    });
  });
});