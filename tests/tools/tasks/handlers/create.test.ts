/**
 * Tests for create task handler
 */

import { handleCreateTask } from '../../../../src/tools/tasks/handlers/create';
import type { CreateTaskRequest } from '../../../../src/types/operations/tasks';
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
const mockTask: Task = {
  id: 1,
  project_id: 1,
  title: 'Test Task',
  description: 'Test Description',
  done: false,
  created: '2024-01-01T00:00:00Z',
  updated: '2024-01-01T00:00:00Z'
};

describe('handleCreateTask', () => {
  let mockClient: jest.Mocked<VikunjaClient>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock client
    mockClient = {
      tasks: {
        createTask: jest.fn().mockResolvedValue(mockTask),
        getTask: jest.fn().mockResolvedValue(mockTask),
        addLabelToTask: jest.fn().mockResolvedValue(undefined),
        addAssigneeToTask: jest.fn().mockResolvedValue(undefined)
      }
    } as any;
  });

  describe('successful creation', () => {
    it('should create a basic task successfully', async () => {
      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Test Task'
      };

      const response = await handleCreateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('create');
      expect(response.message).toBe('Task created successfully');
      expect(response.task).toEqual(mockTask);
      expect(response.metadata.timestamp).toBeDefined();
      expect(response.metadata.labelsAdded).toBe(false);
      expect(response.metadata.assigneesAdded).toBe(false);

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Test Task',
        description: undefined,
        due_date: undefined,
        priority: undefined
      });
    });

    it('should create a task with all optional fields', async () => {
      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Test Task',
        description: 'Test Description',
        dueDate: '2024-12-31T00:00:00Z',
        priority: 3
      };

      const response = await handleCreateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Test Task',
        description: 'Test Description',
        due_date: '2024-12-31T00:00:00Z',
        priority: 3
      });
    });

    it('should handle repeating task configuration', async () => {
      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Repeating Task',
        repeatAfter: 86400,
        repeatMode: 'day'
      };

      const response = await handleCreateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Repeating Task',
        description: undefined,
        due_date: undefined,
        priority: undefined,
        repeat_after: 86400,
        repeat_mode: 0
      });
    });

    it('should add labels when provided', async () => {
      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Task with Labels',
        labels: [10, 20, 30]
      };

      const response = await handleCreateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.labelsAdded).toBe(true);
      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledTimes(3);
      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledWith(1, 10);
      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledWith(1, 20);
      expect(mockClient.tasks.addLabelToTask).toHaveBeenCalledWith(1, 30);
    });

    it('should add assignees when provided', async () => {
      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Task with Assignees',
        assignees: [100, 200]
      };

      const response = await handleCreateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.assigneesAdded).toBe(true);
      expect(mockClient.tasks.addAssigneeToTask).toHaveBeenCalledTimes(2);
      expect(mockClient.tasks.addAssigneeToTask).toHaveBeenCalledWith(1, 100);
      expect(mockClient.tasks.addAssigneeToTask).toHaveBeenCalledWith(1, 200);
    });
  });

  describe('validation errors', () => {
    it('should reject invalid projectId', async () => {
      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: -1,
        title: 'Test Task'
      };

      await expect(handleCreateTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleCreateTask(request, mockClient)).rejects.toThrow('Project ID must be positive');
    });

    it('should reject empty title', async () => {
      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: ''
      };

      await expect(handleCreateTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleCreateTask(request, mockClient)).rejects.toThrow('Title cannot be empty');
    });

    it('should reject title exceeding 250 characters', async () => {
      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'a'.repeat(251)
      };

      await expect(handleCreateTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleCreateTask(request, mockClient)).rejects.toThrow('Title cannot exceed 250 characters');
    });

    it('should reject invalid priority', async () => {
      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Test Task',
        priority: 10
      };

      await expect(handleCreateTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleCreateTask(request, mockClient)).rejects.toThrow('Priority cannot be greater than 5');
    });

    it('should reject invalid date format', async () => {
      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Test Task',
        dueDate: 'not-a-date'
      };

      await expect(handleCreateTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleCreateTask(request, mockClient)).rejects.toThrow('Invalid');
    });
  });

  describe('error handling', () => {
    it('should handle API errors during task creation', async () => {
      const apiError = new Error('API Error');
      mockClient.tasks.createTask = jest.fn().mockRejectedValue(apiError);

      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Test Task'
      };

      const response = await handleCreateTask(request, mockClient);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(ErrorCode.API_ERROR);
      expect(response.error?.message).toBe('API Error');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('401 Unauthorized');
      mockClient.tasks.createTask = jest.fn().mockRejectedValue(authError);

      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Test Task'
      };

      await expect(handleCreateTask(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleCreateTask(request, mockClient)).rejects.toThrow('Authentication required. Please authenticate with Vikunja first.');
    });

    it('should warn but continue if label addition fails', async () => {
      mockClient.tasks.addLabelToTask = jest.fn().mockRejectedValue(new Error('Label error'));

      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Task with Labels',
        labels: [10, 20]
      };

      const response = await handleCreateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.labelsAdded).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to add labels to task',
        expect.objectContaining({
          taskId: 1,
          error: 'Label error'
        })
      );
    });

    it('should warn but continue if assignee addition fails', async () => {
      mockClient.tasks.addAssigneeToTask = jest.fn().mockRejectedValue(new Error('Assignee error'));

      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Task with Assignees',
        assignees: [100, 200]
      };

      const response = await handleCreateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.assigneesAdded).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to add assignees to task',
        expect.objectContaining({
          taskId: 1,
          error: 'Assignee error'
        })
      );
    });

    it('should warn but continue if fetching complete task fails', async () => {
      mockClient.tasks.getTask = jest.fn().mockRejectedValue(new Error('Fetch error'));

      const request: CreateTaskRequest = {
        operation: 'create',
        projectId: 1,
        title: 'Test Task'
      };

      const response = await handleCreateTask(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.task).toEqual(mockTask); // Should return the original task
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to fetch complete task after creation',
        expect.objectContaining({
          taskId: 1,
          error: 'Fetch error'
        })
      );
    });
  });
});