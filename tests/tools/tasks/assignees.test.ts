/**
 * Tests for assignee operations
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { assignUsers, unassignUsers, listAssignees } from '../../../src/tools/tasks/assignees';
import { getClientFromContext } from '../../../src/client';
import { MCPError, ErrorCode } from '../../../src/types';
import { isAuthenticationError } from '../../../src/utils/auth-error-handler';
import { withRetry } from '../../../src/utils/retry';

jest.mock('../../../src/client');
jest.mock('../../../src/utils/auth-error-handler');
jest.mock('../../../src/utils/retry');
jest.mock('../../../src/utils/logger');

describe('Assignee operations', () => {
  const mockClient = {
    tasks: {
      bulkAssignUsersToTask: jest.fn(),
      removeUserFromTask: jest.fn(),
      getTask: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);
    (isAuthenticationError as jest.Mock).mockReturnValue(false);
    (withRetry as jest.Mock).mockImplementation((fn) => fn());
  });

  describe('assignUsers', () => {
    it('should assign users to task successfully', async () => {
      const mockTask = {
        id: 123,
        title: 'Test Task',
        assignees: [{ id: 1, name: 'User 1' }, { id: 2, name: 'User 2' }],
      };
      
      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue({});
      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await assignUsers({
        id: 123,
        assignees: [1, 2],
      });

      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(123, {
        user_ids: [1, 2],
      });
      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(123);
      
      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'assign',
        message: 'Users assigned to task successfully',
        task: mockTask,
      });
    });

    it('should throw error when task id is missing', async () => {
      await expect(assignUsers({ assignees: [1, 2] })).rejects.toThrow(
        'Task id is required for assign operation'
      );
    });

    it('should throw error when task id is zero', async () => {
      await expect(assignUsers({ id: 0, assignees: [1, 2] })).rejects.toThrow(
        'Task id is required for assign operation'
      );
    });

    it('should throw error when task id is negative', async () => {
      await expect(assignUsers({ id: -1, assignees: [1, 2] })).rejects.toThrow(
        'id must be a positive integer'
      );
    });

    it('should throw error when assignees array is missing', async () => {
      await expect(assignUsers({ id: 123 })).rejects.toThrow(
        'At least one assignee (user id) is required'
      );
    });

    it('should throw error when assignees array is empty', async () => {
      await expect(assignUsers({ id: 123, assignees: [] })).rejects.toThrow(
        'At least one assignee (user id) is required'
      );
    });

    it('should throw error when assignee id is invalid', async () => {
      await expect(assignUsers({ id: 123, assignees: [1, -2] })).rejects.toThrow(
        'assignee ID must be a positive integer'
      );
    });

    it('should handle authentication errors with retry', async () => {
      const authError = new Error('Authentication failed');
      (isAuthenticationError as jest.Mock).mockReturnValue(true);
      (withRetry as jest.Mock).mockRejectedValue(authError);

      await expect(assignUsers({ id: 123, assignees: [1, 2] })).rejects.toThrow(
        'Failed to assign users to task: Assignee operations may have authentication issues with certain Vikunja API versions. This is a known limitation that prevents assigning users to tasks. (Retried 3 times)'
      );
    });

    it('should handle non-authentication API errors', async () => {
      const apiError = new Error('API Error');
      (withRetry as jest.Mock).mockRejectedValue(apiError);

      await expect(assignUsers({ id: 123, assignees: [1, 2] })).rejects.toThrow(
        'Failed to assign users to task: API Error'
      );
    });

    it('should handle unknown error types', async () => {
      const unknownError = { message: 'Unknown error' };
      (withRetry as jest.Mock).mockRejectedValue(unknownError);

      await expect(assignUsers({ id: 123, assignees: [1, 2] })).rejects.toThrow(
        'Failed to assign users to task: [object Object]'
      );
    });

    it('should handle MCPError instances properly', async () => {
      const mcpError = new MCPError(ErrorCode.VALIDATION_ERROR, 'Validation failed');
      mockClient.tasks.getTask.mockRejectedValue(mcpError);

      await expect(assignUsers({ id: 123, assignees: [1, 2] })).rejects.toThrow(
        'Failed to assign users to task: Validation failed'
      );
    });
  });

  describe('unassignUsers', () => {
    it('should unassign users from task successfully', async () => {
      const mockTask = {
        id: 123,
        title: 'Test Task',
        assignees: [],
      };
      
      mockClient.tasks.removeUserFromTask.mockResolvedValue({});
      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await unassignUsers({
        id: 123,
        assignees: [1, 2],
      });

      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledTimes(2);
      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(123, 1);
      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(123, 2);
      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(123);
      
      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'unassign',
        message: 'Users removed from task successfully',
        task: mockTask,
      });
    });

    it('should throw error when task id is missing', async () => {
      await expect(unassignUsers({ assignees: [1, 2] })).rejects.toThrow(
        'Task id is required for unassign operation'
      );
    });

    it('should throw error when task id is zero', async () => {
      await expect(unassignUsers({ id: 0, assignees: [1, 2] })).rejects.toThrow(
        'Task id is required for unassign operation'
      );
    });

    it('should throw error when assignees array is missing', async () => {
      await expect(unassignUsers({ id: 123 })).rejects.toThrow(
        'At least one assignee (user id) is required to unassign'
      );
    });

    it('should throw error when assignees array is empty', async () => {
      await expect(unassignUsers({ id: 123, assignees: [] })).rejects.toThrow(
        'At least one assignee (user id) is required to unassign'
      );
    });

    it('should handle authentication errors during removal', async () => {
      const authError = new Error('Authentication failed');
      (isAuthenticationError as jest.Mock).mockReturnValue(true);
      (withRetry as jest.Mock).mockRejectedValue(authError);

      await expect(unassignUsers({ id: 123, assignees: [1] })).rejects.toThrow(
        'Failed to remove users from task: Assignee removal operations may have authentication issues with certain Vikunja API versions. This is a known limitation that prevents removing users from tasks. (Retried 3 times)'
      );
    });

    it('should handle non-authentication errors during removal', async () => {
      const apiError = new Error('API Error');
      (withRetry as jest.Mock).mockRejectedValue(apiError);

      await expect(unassignUsers({ id: 123, assignees: [1] })).rejects.toThrow(
        'Failed to remove users from task: API Error'
      );
    });

    it('should handle mixed success and failure during batch removal', async () => {
      const apiError = new Error('User not found');
      (withRetry as jest.Mock)
        .mockResolvedValueOnce({}) // First user succeeds
        .mockRejectedValueOnce(apiError); // Second user fails

      await expect(unassignUsers({ id: 123, assignees: [1, 2] })).rejects.toThrow(
        'Failed to remove users from task: User not found'
      );

      // Verify that at least the first removal was attempted
      expect(withRetry).toHaveBeenCalledTimes(2);
    });
  });

  describe('listAssignees', () => {
    it('should list assignees successfully', async () => {
      const mockTask = {
        id: 123,
        title: 'Test Task',
        assignees: [
          { id: 1, name: 'User 1' },
          { id: 2, name: 'User 2' },
        ],
      };
      
      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await listAssignees({ id: 123 });

      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(123);
      
      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'list',
        message: 'Task has 2 assignee(s)',
        task: {
          id: 123,
          title: 'Test Task',
          assignees: mockTask.assignees,
        },
        metadata: {
          count: 2,
        },
      });
    });

    it('should handle task with no assignees', async () => {
      const mockTask = {
        id: 123,
        title: 'Test Task',
        assignees: [],
      };
      
      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await listAssignees({ id: 123 });
      
      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Task has 0 assignee(s)');
      expect(response.metadata.count).toBe(0);
    });

    it('should handle task with undefined assignees', async () => {
      const mockTask = {
        id: 123,
        title: 'Test Task',
        // assignees is undefined
      };
      
      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await listAssignees({ id: 123 });
      
      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Task has 0 assignee(s)');
      expect(response.task.assignees).toEqual([]);
    });

    it('should throw error when task id is undefined', async () => {
      await expect(listAssignees({})).rejects.toThrow(
        'Task id is required for list-assignees operation'
      );
    });

    it('should handle zero task id', async () => {
      await expect(listAssignees({ id: 0 })).rejects.toThrow(
        'id must be a positive integer'
      );
    });

    it('should handle negative task id', async () => {
      await expect(listAssignees({ id: -1 })).rejects.toThrow(
        'id must be a positive integer'
      );
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Task not found');
      mockClient.tasks.getTask.mockRejectedValue(apiError);

      await expect(listAssignees({ id: 123 })).rejects.toThrow(
        'Failed to list task assignees: Task not found'
      );
    });

    it('should preserve MCPError instances', async () => {
      const mcpError = new MCPError(ErrorCode.NOT_FOUND, 'Task not found');
      mockClient.tasks.getTask.mockRejectedValue(mcpError);

      await expect(listAssignees({ id: 123 })).rejects.toThrow(mcpError);
    });

    it('should handle unknown error types', async () => {
      const unknownError = { status: 'error' };
      mockClient.tasks.getTask.mockRejectedValue(unknownError);

      await expect(listAssignees({ id: 123 })).rejects.toThrow(
        'Failed to list task assignees: [object Object]'
      );
    });

    it('should handle task with undefined id in response', async () => {
      const mockTask = {
        // id is undefined
        title: 'Test Task',
        assignees: [{ id: 1, name: 'User 1' }],
      };
      
      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await listAssignees({ id: 123 });
      
      const response = JSON.parse(result.content[0].text);
      expect(response.task.id).toBeUndefined();
      expect(response.task.title).toBe('Test Task');
    });
  });

  // Integration tests
  describe('Integration scenarios', () => {
    it('should handle complete assign-unassign workflow', async () => {
      const initialTask = {
        id: 123,
        title: 'Test Task',
        assignees: [],
      };
      
      const assignedTask = {
        id: 123,
        title: 'Test Task',
        assignees: [{ id: 1, name: 'User 1' }],
      };
      
      // Mock assignment
      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue({});
      mockClient.tasks.getTask.mockResolvedValue(assignedTask);
      
      const assignResult = await assignUsers({ id: 123, assignees: [1] });
      
      expect(JSON.parse(assignResult.content[0].text).message).toBe(
        'Users assigned to task successfully'
      );
      
      // Mock unassignment
      mockClient.tasks.removeUserFromTask.mockResolvedValue({});
      mockClient.tasks.getTask.mockResolvedValue(initialTask);
      
      const unassignResult = await unassignUsers({ id: 123, assignees: [1] });
      
      expect(JSON.parse(unassignResult.content[0].text).message).toBe(
        'Users removed from task successfully'
      );
    });

    it('should handle multiple assignees with mixed validation errors', async () => {
      await expect(assignUsers({ 
        id: 123, 
        assignees: [1, 0, -1] // Mix of valid and invalid IDs
      })).rejects.toThrow('assignee ID must be a positive integer');
    });
  });
});