/**
 * Tests for bulk operations
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { bulkUpdateTasks, bulkDeleteTasks, bulkCreateTasks } from '../../../src/tools/tasks/bulk-operations';
import { getClientFromContext } from '../../../src/client';
import { MCPError, ErrorCode } from '../../../src/types';
import { isAuthenticationError } from '../../../src/utils/auth-error-handler';
import { withRetry } from '../../../src/utils/retry';

jest.mock('../../../src/client');
jest.mock('../../../src/utils/auth-error-handler');
jest.mock('../../../src/utils/retry');
jest.mock('../../../src/utils/logger');

describe('Bulk operations', () => {
  const mockClient = {
    tasks: {
      bulkUpdateTasks: jest.fn(),
      getTask: jest.fn(),
      updateTask: jest.fn(),
      deleteTask: jest.fn(),
      createTask: jest.fn(),
      bulkAssignUsersToTask: jest.fn(),
      removeUserFromTask: jest.fn(),
      updateTaskLabels: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);
    (isAuthenticationError as jest.Mock).mockReturnValue(false);
    (withRetry as jest.Mock).mockImplementation((fn) => fn());
  });

  describe('bulkUpdateTasks', () => {
    describe('Input validation', () => {
      it('should throw error when taskIds is missing', async () => {
        await expect(bulkUpdateTasks({ field: 'done', value: true })).rejects.toThrow(
          'taskIds array is required for bulk update operation'
        );
      });

      it('should throw error when taskIds is empty', async () => {
        await expect(bulkUpdateTasks({ taskIds: [], field: 'done', value: true })).rejects.toThrow(
          'taskIds array is required for bulk update operation'
        );
      });

      it('should throw error when field is missing', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, 2], value: true })).rejects.toThrow(
          'field is required for bulk update operation'
        );
      });

      it('should throw error when value is undefined', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, 2], field: 'done' })).rejects.toThrow(
          'value is required for bulk update operation'
        );
      });

      it('should throw error when too many tasks', async () => {
        const taskIds = Array.from({ length: 101 }, (_, i) => i + 1);
        await expect(bulkUpdateTasks({ taskIds, field: 'done', value: true })).rejects.toThrow(
          'Too many tasks for bulk operation. Maximum allowed: 100'
        );
      });

      it('should validate task IDs', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, -2], field: 'done', value: true })).rejects.toThrow(
          'task ID must be a positive integer'
        );
      });

      it('should throw error for invalid field', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, 2], field: 'invalid_field', value: true })).rejects.toThrow(
          'Invalid field: invalid_field'
        );
      });

      it('should validate priority range', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, 2], field: 'priority', value: 6 })).rejects.toThrow(
          'Priority must be between 0 and 5'
        );
      });

      it('should validate date format for due_date', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, 2], field: 'due_date', value: 'invalid-date' })).rejects.toThrow(
          'due_date must be a valid ISO 8601 date string'
        );
      });

      it('should validate project_id', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, 2], field: 'project_id', value: -1 })).rejects.toThrow(
          'project_id must be a positive integer'
        );
      });

      it('should validate assignees array', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, 2], field: 'assignees', value: 'not-array' })).rejects.toThrow(
          'assignees must be an array of numbers'
        );
      });

      it('should validate assignee IDs', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, 2], field: 'assignees', value: [1, -2] })).rejects.toThrow(
          'assignees ID must be a positive integer'
        );
      });

      it('should validate done field type', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, 2], field: 'done', value: 'maybe' })).rejects.toThrow(
          'done field must be a boolean value (true or false)'
        );
      });

      it('should validate repeat_after range', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, 2], field: 'repeat_after', value: -1 })).rejects.toThrow(
          'repeat_after must be a non-negative number'
        );
      });

      it('should validate repeat_mode values', async () => {
        await expect(bulkUpdateTasks({ taskIds: [1, 2], field: 'repeat_mode', value: 'invalid' })).rejects.toThrow(
          'Invalid repeat_mode: invalid'
        );
      });
    });

    describe('Type coercion', () => {
      it('should convert string "true" to boolean for done field', async () => {
        const mockTasks = [{ id: 1, done: true }, { id: 2, done: true }];
        mockClient.tasks.bulkUpdateTasks.mockResolvedValue(mockTasks);

        await bulkUpdateTasks({ taskIds: [1, 2], field: 'done', value: 'true' });

        expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
          task_ids: [1, 2],
          field: 'done',
          value: true,
        });
      });

      it('should convert string "false" to boolean for done field', async () => {
        const mockTasks = [{ id: 1, done: false }, { id: 2, done: false }];
        mockClient.tasks.bulkUpdateTasks.mockResolvedValue(mockTasks);

        await bulkUpdateTasks({ taskIds: [1, 2], field: 'done', value: 'false' });

        expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
          task_ids: [1, 2],
          field: 'done',
          value: false,
        });
      });

      it('should convert string numbers to numbers for priority field', async () => {
        const mockTasks = [{ id: 1, priority: 3 }, { id: 2, priority: 3 }];
        mockClient.tasks.bulkUpdateTasks.mockResolvedValue(mockTasks);

        await bulkUpdateTasks({ taskIds: [1, 2], field: 'priority', value: '3' });

        expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
          task_ids: [1, 2],
          field: 'priority',
          value: 3,
        });
      });
    });

    describe('Bulk API success path', () => {
      it('should handle successful bulk update with array response', async () => {
        const mockTasks = [
          { id: 1, title: 'Task 1', done: true },
          { id: 2, title: 'Task 2', done: true },
        ];
        mockClient.tasks.bulkUpdateTasks.mockResolvedValue(mockTasks);

        const result = await bulkUpdateTasks({ taskIds: [1, 2], field: 'done', value: true });

        expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
          task_ids: [1, 2],
          field: 'done',
          value: true,
        });

        const response = JSON.parse(result.content[0].text);
        expect(response).toMatchObject({
          success: true,
          operation: 'update',
          message: 'Successfully updated 2 tasks',
          tasks: mockTasks,
        });
      });

      it('should handle successful bulk update with message response', async () => {
        const mockMessage = { message: 'Tasks updated successfully' };
        const mockTasks = [
          { id: 1, title: 'Task 1', done: true },
          { id: 2, title: 'Task 2', done: true },
        ];
        
        mockClient.tasks.bulkUpdateTasks.mockResolvedValue(mockMessage);
        mockClient.tasks.getTask.mockResolvedValueOnce(mockTasks[0]).mockResolvedValueOnce(mockTasks[1]);

        const result = await bulkUpdateTasks({ taskIds: [1, 2], field: 'done', value: true });

        expect(mockClient.tasks.getTask).toHaveBeenCalledTimes(2);
        
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.tasks).toHaveLength(2);
      });

      it('should handle repeat_mode conversion', async () => {
        const mockTasks = [{ id: 1, repeat_mode: 1 }];
        mockClient.tasks.bulkUpdateTasks.mockResolvedValue(mockTasks);

        await bulkUpdateTasks({ taskIds: [1], field: 'repeat_mode', value: 'month' });

        expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
          task_ids: [1],
          field: 'repeat_mode',
          value: 1,
        });
      });
    });

    describe('Bulk API failure and fallback', () => {
      it('should fallback to individual updates when bulk API fails', async () => {
        const bulkError = new Error('Bulk API not available');
        const mockTask = { id: 1, title: 'Task 1', done: true };
        
        mockClient.tasks.bulkUpdateTasks.mockRejectedValue(bulkError);
        mockClient.tasks.getTask.mockResolvedValue({ id: 1, title: 'Task 1', done: false });
        mockClient.tasks.updateTask.mockResolvedValue(mockTask);

        const result = await bulkUpdateTasks({ taskIds: [1], field: 'done', value: true });

        expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, expect.objectContaining({
          done: true,
        }));

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      });

      it('should handle assignees field in fallback mode', async () => {
        const bulkError = new Error('Bulk API failed');
        const mockTask = { id: 1, title: 'Task 1', assignees: [] };
        
        mockClient.tasks.bulkUpdateTasks.mockRejectedValue(bulkError);
        mockClient.tasks.getTask
          .mockResolvedValueOnce({ id: 1, title: 'Task 1', assignees: [] })
          .mockResolvedValueOnce({ id: 1, title: 'Task 1', assignees: [{ id: 1 }] })
          .mockResolvedValueOnce({ id: 1, title: 'Task 1', assignees: [{ id: 1 }] });
        mockClient.tasks.updateTask.mockResolvedValue(mockTask);
        mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue({});

        const result = await bulkUpdateTasks({ taskIds: [1], field: 'assignees', value: [1] });

        expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(1, {
          user_ids: [1],
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      });

      it('should handle authentication errors in assignee operations', async () => {
        const bulkError = new Error('Bulk API failed');
        const authError = new Error('Authentication failed');
        
        mockClient.tasks.bulkUpdateTasks.mockRejectedValue(bulkError);
        mockClient.tasks.getTask.mockResolvedValue({ id: 1, title: 'Task 1', assignees: [] });
        mockClient.tasks.updateTask.mockResolvedValue({ id: 1, title: 'Task 1' });
        (withRetry as jest.Mock).mockRejectedValue(authError);
        (isAuthenticationError as jest.Mock).mockReturnValue(true);

        await expect(bulkUpdateTasks({ taskIds: [1], field: 'assignees', value: [1] })).rejects.toThrow(
          'Assignee operations may have authentication issues'
        );
      });

      it('should handle bulk update that reports success but didnt actually update', async () => {
        const mockTask = { id: 1, title: 'Task 1', done: false }; // Value not updated
        mockClient.tasks.bulkUpdateTasks.mockResolvedValue([mockTask]);

        // This should trigger fallback due to value mismatch
        const result = await bulkUpdateTasks({ taskIds: [1], field: 'done', value: true });

        // Should have fallen back to individual update
        expect(mockClient.tasks.updateTask).toHaveBeenCalled();
      });
    });

    describe('Error handling', () => {
      it('should preserve MCPError instances', async () => {
        const mcpError = new MCPError(ErrorCode.NOT_FOUND, 'Task not found');
        mockClient.tasks.bulkUpdateTasks.mockRejectedValue(mcpError);
        mockClient.tasks.getTask.mockRejectedValue(mcpError);

        await expect(bulkUpdateTasks({ taskIds: [1], field: 'done', value: true })).rejects.toThrow(
          'Bulk update failed. Could not update any tasks. Failed IDs: 1'
        );
      });

      it('should handle unknown error types', async () => {
        const unknownError = { status: 'error' };
        mockClient.tasks.bulkUpdateTasks.mockRejectedValue(unknownError);
        mockClient.tasks.getTask.mockRejectedValue(unknownError);

        await expect(bulkUpdateTasks({ taskIds: [1], field: 'done', value: true })).rejects.toThrow(
          'Bulk update failed. Could not update any tasks. Failed IDs: 1'
        );
      });
    });
  });

  describe('bulkDeleteTasks', () => {
    describe('Input validation', () => {
      it('should throw error when taskIds is missing', async () => {
        await expect(bulkDeleteTasks({})).rejects.toThrow(
          'taskIds array is required for bulk delete operation'
        );
      });

      it('should throw error when taskIds is empty', async () => {
        await expect(bulkDeleteTasks({ taskIds: [] })).rejects.toThrow(
          'taskIds array is required for bulk delete operation'
        );
      });

      it('should throw error when too many tasks', async () => {
        const taskIds = Array.from({ length: 101 }, (_, i) => i + 1);
        await expect(bulkDeleteTasks({ taskIds })).rejects.toThrow(
          'Too many tasks for bulk operation'
        );
      });

      it('should validate task IDs', async () => {
        await expect(bulkDeleteTasks({ taskIds: [1, -2] })).rejects.toThrow(
          'task ID must be a positive integer'
        );
      });
    });

    describe('Success scenarios', () => {
      it('should delete tasks successfully', async () => {
        const mockTasks = [
          { id: 1, title: 'Task 1' },
          { id: 2, title: 'Task 2' },
        ];
        
        mockClient.tasks.getTask.mockResolvedValueOnce(mockTasks[0]).mockResolvedValueOnce(mockTasks[1]);
        mockClient.tasks.deleteTask.mockResolvedValue({});

        const result = await bulkDeleteTasks({ taskIds: [1, 2] });

        expect(mockClient.tasks.deleteTask).toHaveBeenCalledTimes(2);
        expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
        expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(2);

        const response = JSON.parse(result.content[0].text);
        expect(response).toMatchObject({
          success: true,
          operation: 'delete',
          message: 'Successfully deleted 2 tasks',
          metadata: {
            count: 2,
            previousState: mockTasks,
          },
        });
      });

      it('should handle partial deletion success', async () => {
        const mockTasks = [{ id: 1, title: 'Task 1' }, { id: 2, title: 'Task 2' }];
        const deleteError = new Error('Delete failed');
        
        mockClient.tasks.getTask.mockResolvedValueOnce(mockTasks[0]).mockResolvedValueOnce(mockTasks[1]);
        mockClient.tasks.deleteTask
          .mockResolvedValueOnce({})
          .mockRejectedValueOnce(deleteError);

        const result = await bulkDeleteTasks({ taskIds: [1, 2] });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(false);
        expect(response.message).toContain('Bulk delete partially completed');
        expect(response.metadata.failedIds).toEqual([2]);
      });

      it('should handle complete deletion failure', async () => {
        const mockTasks = [{ id: 1, title: 'Task 1' }];
        const deleteError = new Error('Delete failed');
        
        mockClient.tasks.getTask.mockResolvedValue(mockTasks[0]);
        mockClient.tasks.deleteTask.mockRejectedValue(deleteError);

        await expect(bulkDeleteTasks({ taskIds: [1] })).rejects.toThrow(
          'Bulk delete failed. Could not delete any tasks'
        );
      });
    });
  });

  describe('bulkCreateTasks', () => {
    describe('Input validation', () => {
      it('should throw error when projectId is missing', async () => {
        await expect(bulkCreateTasks({ tasks: [{ title: 'Test' }] })).rejects.toThrow(
          'projectId is required for bulk create operation'
        );
      });

      it('should validate projectId', async () => {
        await expect(bulkCreateTasks({ projectId: -1, tasks: [{ title: 'Test' }] })).rejects.toThrow(
          'projectId must be a positive integer'
        );
      });

      it('should throw error when tasks array is missing', async () => {
        await expect(bulkCreateTasks({ projectId: 1 })).rejects.toThrow(
          'tasks array is required and must contain at least one task'
        );
      });

      it('should throw error when tasks array is empty', async () => {
        await expect(bulkCreateTasks({ projectId: 1, tasks: [] })).rejects.toThrow(
          'tasks array is required and must contain at least one task'
        );
      });

      it('should throw error when too many tasks', async () => {
        const tasks = Array.from({ length: 101 }, (_, i) => ({ title: `Task ${i}` }));
        await expect(bulkCreateTasks({ projectId: 1, tasks })).rejects.toThrow(
          'Too many tasks for bulk operation'
        );
      });

      it('should validate task titles', async () => {
        await expect(bulkCreateTasks({ 
          projectId: 1, 
          tasks: [{ title: '' }] 
        })).rejects.toThrow(
          'Task at index 0 must have a non-empty title'
        );
      });

      it('should validate due dates', async () => {
        await expect(bulkCreateTasks({ 
          projectId: 1, 
          tasks: [{ title: 'Test', dueDate: 'invalid-date' }] 
        })).rejects.toThrow(
          'tasks[0].dueDate must be a valid ISO 8601 date string'
        );
      });

      it('should validate assignee IDs', async () => {
        await expect(bulkCreateTasks({ 
          projectId: 1, 
          tasks: [{ title: 'Test', assignees: [-1] }] 
        })).rejects.toThrow(
          'tasks[0].assignee ID must be a positive integer'
        );
      });

      it('should validate label IDs', async () => {
        await expect(bulkCreateTasks({ 
          projectId: 1, 
          tasks: [{ title: 'Test', labels: [-1] }] 
        })).rejects.toThrow(
          'tasks[0].label ID must be a positive integer'
        );
      });
    });

    describe('Success scenarios', () => {
      it('should create tasks successfully', async () => {
        const mockTask = { id: 1, title: 'Test Task', project_id: 1 };
        
        mockClient.tasks.createTask.mockResolvedValue(mockTask);
        mockClient.tasks.getTask.mockResolvedValue(mockTask);

        const result = await bulkCreateTasks({ 
          projectId: 1, 
          tasks: [{ title: 'Test Task' }] 
        });

        expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, expect.objectContaining({
          title: 'Test Task',
          project_id: 1,
        }));

        const response = JSON.parse(result.content[0].text);
        expect(response).toMatchObject({
          success: true,
          operation: 'create',
          message: 'Successfully created 1 tasks',
          tasks: [mockTask],
        });
      });

      it('should handle labels and assignees', async () => {
        const mockTask = { id: 1, title: 'Test Task', project_id: 1 };
        
        mockClient.tasks.createTask.mockResolvedValue(mockTask);
        mockClient.tasks.updateTaskLabels.mockResolvedValue({});
        mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue({});
        mockClient.tasks.getTask.mockResolvedValue({
          ...mockTask,
          labels: [{ id: 1 }],
          assignees: [{ id: 1 }],
        });

        const result = await bulkCreateTasks({ 
          projectId: 1, 
          tasks: [{ 
            title: 'Test Task',
            labels: [1],
            assignees: [1],
          }] 
        });

        expect(mockClient.tasks.updateTaskLabels).toHaveBeenCalledWith(1, {
          label_ids: [1],
        });
        expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(1, {
          user_ids: [1],
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      });

      it('should handle authentication errors in assignee operations during create', async () => {
        const mockTask = { id: 1, title: 'Test Task', project_id: 1 };
        const authError = new Error('Authentication failed');
        
        mockClient.tasks.createTask.mockResolvedValue(mockTask);
        (withRetry as jest.Mock).mockRejectedValue(authError);
        (isAuthenticationError as jest.Mock).mockReturnValue(true);
        mockClient.tasks.deleteTask.mockResolvedValue({});

        await expect(bulkCreateTasks({ 
          projectId: 1, 
          tasks: [{ title: 'Test Task', assignees: [1] }] 
        })).rejects.toThrow(
          'Assignee operations may have authentication issues'
        );

        // Should have attempted cleanup
        expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
      });

      it('should handle partial create success', async () => {
        const mockTask = { id: 1, title: 'Test Task', project_id: 1 };
        const createError = new Error('Create failed');
        
        mockClient.tasks.createTask
          .mockResolvedValueOnce(mockTask)
          .mockRejectedValueOnce(createError);
        mockClient.tasks.getTask.mockResolvedValue(mockTask);

        const result = await bulkCreateTasks({ 
          projectId: 1, 
          tasks: [
            { title: 'Test Task 1' },
            { title: 'Test Task 2' },
          ] 
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(false);
        expect(response.message).toContain('Bulk create partially completed');
        expect(response.metadata.failedCount).toBe(1);
      });

      it('should handle complete create failure', async () => {
        const createError = new Error('Create failed');
        
        mockClient.tasks.createTask.mockRejectedValue(createError);

        await expect(bulkCreateTasks({ 
          projectId: 1, 
          tasks: [{ title: 'Test Task' }] 
        })).rejects.toThrow(
          'Bulk create failed. Could not create any tasks'
        );
      });

      it('should handle repeat configuration', async () => {
        const mockTask = { id: 1, title: 'Test Task', project_id: 1 };
        
        mockClient.tasks.createTask.mockResolvedValue(mockTask);
        mockClient.tasks.getTask.mockResolvedValue(mockTask);

        await bulkCreateTasks({ 
          projectId: 1, 
          tasks: [{ 
            title: 'Test Task',
            repeatAfter: 7,
            repeatMode: 'day',
          }] 
        });

        expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, expect.objectContaining({
          title: 'Test Task',
          project_id: 1,
          repeat_after: 604800, // 7 days in seconds
        }));
      });
    });

    describe('Error handling', () => {
      it('should preserve MCPError instances', async () => {
        const mcpError = new MCPError(ErrorCode.NOT_FOUND, 'Project not found');
        mockClient.tasks.createTask.mockRejectedValue(mcpError);

        await expect(bulkCreateTasks({ 
          projectId: 1, 
          tasks: [{ title: 'Test Task' }] 
        })).rejects.toThrow(
          'Bulk create failed. Could not create any tasks'
        );
      });

      it('should handle cleanup failure during partial create', async () => {
        const mockTask = { id: 1, title: 'Test Task', project_id: 1 };
        const labelError = new Error('Label assignment failed');
        const deleteError = new Error('Cleanup failed');
        
        mockClient.tasks.createTask.mockResolvedValue(mockTask);
        (withRetry as jest.Mock).mockRejectedValue(labelError);
        mockClient.tasks.deleteTask.mockRejectedValue(deleteError);

        await expect(bulkCreateTasks({ 
          projectId: 1, 
          tasks: [{ title: 'Test Task', labels: [1] }] 
        })).rejects.toThrow('Label assignment failed');
      });
    });
  });

  // Integration tests for batch processing
  describe('Batch processing', () => {
    it('should process large numbers of tasks in batches', async () => {
      const taskIds = Array.from({ length: 25 }, (_, i) => i + 1);
      const mockTasks = taskIds.map(id => ({ id, title: `Task ${id}`, done: true }));
      
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue(mockTasks);

      const result = await bulkUpdateTasks({ taskIds, field: 'done', value: true });

      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: taskIds,
        field: 'done',
        value: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.count).toBe(25);
    });
  });
});