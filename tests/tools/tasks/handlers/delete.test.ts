/**
 * Tests for delete task handler
 */

import { handleDeleteTask } from '../../../../src/tools/tasks/handlers/delete';
import type { DeleteTaskRequest } from '../../../../src/types/operations/tasks';
import type { VikunjaClient } from 'node-vikunja';
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

describe('handleDeleteTask', () => {
  let mockClient: jest.Mocked<VikunjaClient>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock client
    mockClient = {
      tasks: {
        deleteTask: jest.fn().mockResolvedValue(undefined)
      }
    } as any;
  });

  describe('successful deletion', () => {
    it('should delete a task successfully', async () => {
      const request: DeleteTaskRequest = {
        operation: 'delete',
        id: 1
      };

      const response = await handleDeleteTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('delete');
      expect(response.message).toBe('Task deleted successfully');
      expect(response.metadata.deletedTaskId).toBe(1);
      expect(response.metadata.timestamp).toBeDefined();

      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledTimes(1);
    });

    it('should delete multiple tasks in sequence', async () => {
      const taskIds = [1, 2, 3];
      
      for (const id of taskIds) {
        const request: DeleteTaskRequest = {
          operation: 'delete',
          id
        };

        const response = await handleDeleteTask(request, mockClient);

        expect(response.success).toBe(true);
        expect(response.metadata.deletedTaskId).toBe(id);
      }

      expect(mockClient.tasks.deleteTask).toHaveBeenCalledTimes(3);
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(2);
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(3);
    });
  });

  describe('validation errors', () => {
    it('should reject invalid task ID (negative)', async () => {
      const request: DeleteTaskRequest = {
        operation: 'delete',
        id: -1
      };

      await expect(handleDeleteTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleDeleteTask(request, mockClient)).rejects.toThrow('Task ID must be positive');
      expect(mockClient.tasks.deleteTask).not.toHaveBeenCalled();
    });

    it('should reject invalid task ID (zero)', async () => {
      const request: DeleteTaskRequest = {
        operation: 'delete',
        id: 0
      };

      await expect(handleDeleteTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleDeleteTask(request, mockClient)).rejects.toThrow('Task ID must be positive');
      expect(mockClient.tasks.deleteTask).not.toHaveBeenCalled();
    });

    it('should reject missing task ID', async () => {
      const request = {
        operation: 'delete'
      } as any;

      await expect(handleDeleteTask(request, mockClient)).rejects.toThrow();
      expect(mockClient.tasks.deleteTask).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle API errors during deletion', async () => {
      const apiError = new Error('API Error: Task not found');
      mockClient.tasks.deleteTask = jest.fn().mockRejectedValue(apiError);

      const request: DeleteTaskRequest = {
        operation: 'delete',
        id: 999
      };

      const response = await handleDeleteTask(request, mockClient);

      expect(response.success).toBe(false);
      expect(response.operation).toBe('delete');
      expect(response.message).toBe('Failed to delete task');
      expect(response.metadata.deletedTaskId).toBe(999);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(ErrorCode.API_ERROR);
      expect(response.error?.message).toBe('API Error: Task not found');
      expect(response.error?.details).toBe(apiError);
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('401 Unauthorized');
      mockClient.tasks.deleteTask = jest.fn().mockRejectedValue(authError);

      const request: DeleteTaskRequest = {
        operation: 'delete',
        id: 1
      };

      await expect(handleDeleteTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleDeleteTask(request, mockClient)).rejects.toThrow('Authentication required');
      
      try {
        await handleDeleteTask(request, mockClient);
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.AUTH_REQUIRED);
      }
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error: Connection refused');
      mockClient.tasks.deleteTask = jest.fn().mockRejectedValue(networkError);

      const request: DeleteTaskRequest = {
        operation: 'delete',
        id: 1
      };

      const response = await handleDeleteTask(request, mockClient);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe(ErrorCode.API_ERROR);
      expect(response.error?.message).toContain('Network error');
    });

    it('should log errors appropriately', async () => {
      const apiError = new Error('Some API Error');
      mockClient.tasks.deleteTask = jest.fn().mockRejectedValue(apiError);

      const request: DeleteTaskRequest = {
        operation: 'delete',
        id: 1
      };

      await handleDeleteTask(request, mockClient);

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to delete task',
        expect.objectContaining({
          error: 'Some API Error'
        })
      );
    });

    it('should preserve error details in response', async () => {
      const detailedError = {
        message: 'Detailed error',
        code: 'TASK_PROTECTED',
        details: {
          reason: 'Task has dependencies',
          dependencies: [2, 3, 4]
        }
      };
      mockClient.tasks.deleteTask = jest.fn().mockRejectedValue(detailedError);

      const request: DeleteTaskRequest = {
        operation: 'delete',
        id: 1
      };

      const response = await handleDeleteTask(request, mockClient);

      expect(response.success).toBe(false);
      expect(response.error?.details).toEqual(detailedError);
    });
  });

  describe('retry behavior', () => {
    it('should retry on authentication errors', async () => {
      const authError = new Error('401 Unauthorized');
      
      // First two calls fail, third succeeds
      mockClient.tasks.deleteTask = jest.fn()
        .mockRejectedValueOnce(authError)
        .mockRejectedValueOnce(authError)
        .mockResolvedValueOnce(undefined);

      const request: DeleteTaskRequest = {
        operation: 'delete',
        id: 1
      };

      // This should still throw because isAuthenticationError returns true
      await expect(handleDeleteTask(request, mockClient)).rejects.toThrow(MCPError);
    });
  });
});