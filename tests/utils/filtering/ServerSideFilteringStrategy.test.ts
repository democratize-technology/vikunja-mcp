/**
 * Tests for ServerSideFilteringStrategy
 * Ensures server-side filtering behavior is properly tested
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ServerSideFilteringStrategy } from '../../../src/utils/filtering/ServerSideFilteringStrategy';
import type { FilteringParams } from '../../../src/utils/filtering/types';
import type { MockVikunjaClient } from '../../types/mocks';
import type { Task } from 'node-vikunja';
import { MCPError, ErrorCode } from '../../../src/types';

// Mock the client
jest.mock('../../../src/client', () => ({
  getClientFromContext: jest.fn(),
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock validation
jest.mock('../../../src/tools/tasks/validation', () => ({
  validateId: jest.fn(),
}));

import { getClientFromContext } from '../../../src/client';
import { validateId } from '../../../src/tools/tasks/validation';

describe('ServerSideFilteringStrategy', () => {
  let strategy: ServerSideFilteringStrategy;
  let mockClient: MockVikunjaClient;
  
  const mockTask: Task = {
    id: 1,
    title: 'Test Task',
    description: 'Test Description',
    done: false,
    priority: 5,
    percent_done: 0,
    due_date: '2025-01-15T00:00:00Z',
    created: '2025-01-01T00:00:00Z',
    updated: '2025-01-01T00:00:00Z',
    project_id: 1,
    assignees: [],
    labels: [],
  } as Task;

  beforeEach(() => {
    jest.clearAllMocks();
    
    strategy = new ServerSideFilteringStrategy();
    
    mockClient = {
      tasks: {
        getAllTasks: jest.fn(),
        getProjectTasks: jest.fn(),
        // Add other required methods
        createTask: jest.fn(),
        getTask: jest.fn(),
        updateTask: jest.fn(),
        deleteTask: jest.fn(),
        getTaskComments: jest.fn(),
        createTaskComment: jest.fn(),
        updateTaskLabels: jest.fn(),
        bulkAssignUsersToTask: jest.fn(),
        removeUserFromTask: jest.fn(),
        bulkUpdateTasks: jest.fn(),
      },
    } as MockVikunjaClient;
    
    (getClientFromContext as jest.MockedFunction<typeof getClientFromContext>).mockResolvedValue(mockClient);
    (validateId as jest.MockedFunction<typeof validateId>).mockImplementation(() => {});
  });

  describe('execute', () => {
    it('should throw error when no filter string is provided', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      await expect(strategy.execute(params)).rejects.toThrow(MCPError);
      await expect(strategy.execute(params)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Server-side filtering requires a filter string'
      });
    });

    it('should use getAllTasks for all projects filtering', async () => {
      const params: FilteringParams = {
        args: { allProjects: true },
        filterExpression: null,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask]);

      const result = await strategy.execute(params);

      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 10,
        filter: 'priority >= 3'
      });
      expect(mockClient.tasks.getProjectTasks).not.toHaveBeenCalled();
      expect(result.tasks).toEqual([mockTask]);
      expect(result.metadata.serverSideFilteringUsed).toBe(true);
      expect(result.metadata.serverSideFilteringAttempted).toBe(true);
      expect(result.metadata.clientSideFiltering).toBe(false);
    });

    it('should use getAllTasks when no projectId is specified', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: 'done = false',
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask]);

      const result = await strategy.execute(params);

      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 10,
        filter: 'done = false'
      });
      expect(result.metadata.filteringNote).toBe('Server-side filtering used (modern Vikunja)');
    });

    it('should use getProjectTasks for specific project filtering', async () => {
      const projectId = 42;
      const params: FilteringParams = {
        args: { projectId, allProjects: false },
        filterExpression: null,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getProjectTasks.mockResolvedValue([mockTask]);

      const result = await strategy.execute(params);

      expect(validateId).toHaveBeenCalledWith(projectId, 'projectId');
      expect(mockClient.tasks.getProjectTasks).toHaveBeenCalledWith(projectId, {
        page: 1,
        per_page: 10,
        filter: 'priority >= 3'
      });
      expect(mockClient.tasks.getAllTasks).not.toHaveBeenCalled();
      expect(result.tasks).toEqual([mockTask]);
    });

    it('should re-throw API errors without modification', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      const apiError = new Error('Server-side filtering not supported');
      mockClient.tasks.getAllTasks.mockRejectedValue(apiError);

      await expect(strategy.execute(params)).rejects.toThrow(apiError);
    });

    it('should handle validation errors for invalid project IDs', async () => {
      const params: FilteringParams = {
        args: { projectId: -1 },
        filterExpression: null,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      const validationError = new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid project ID');
      (validateId as jest.MockedFunction<typeof validateId>).mockImplementation(() => {
        throw validationError;
      });

      await expect(strategy.execute(params)).rejects.toThrow(validationError);
      expect(mockClient.tasks.getProjectTasks).not.toHaveBeenCalled();
    });

    it('should include filter string in API parameters', async () => {
      const filterString = 'created > now-7d && priority >= 3';
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString,
        params: { page: 2, per_page: 50, sort_by: 'priority' }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask]);

      await strategy.execute(params);

      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 2,
        per_page: 50,
        sort_by: 'priority',
        filter: filterString
      });
    });

    it('should return correct metadata structure', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask]);

      const result = await strategy.execute(params);

      expect(result.metadata).toEqual({
        serverSideFilteringUsed: true,
        serverSideFilteringAttempted: true,
        clientSideFiltering: false,
        filteringNote: 'Server-side filtering used (modern Vikunja)'
      });
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      const networkError = new Error('Network connection failed');
      mockClient.tasks.getAllTasks.mockRejectedValue(networkError);

      await expect(strategy.execute(params)).rejects.toThrow(networkError);
    });

    it('should handle API authentication errors', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      const authError = new Error('Unauthorized');
      mockClient.tasks.getAllTasks.mockRejectedValue(authError);

      await expect(strategy.execute(params)).rejects.toThrow(authError);
    });

    it('should handle malformed filter syntax errors', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: 'invalid filter syntax',
        params: { page: 1, per_page: 10 }
      };

      const syntaxError = new Error('Invalid filter syntax');
      mockClient.tasks.getAllTasks.mockRejectedValue(syntaxError);

      await expect(strategy.execute(params)).rejects.toThrow(syntaxError);
    });
  });

  describe('edge cases', () => {
    it('should handle empty filter string', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: '',
        params: { page: 1, per_page: 10 }
      };

      await expect(strategy.execute(params)).rejects.toThrow(MCPError);
    });

    it('should handle whitespace-only filter string', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: '   ',
        params: { page: 1, per_page: 10 }
      };

      // Whitespace filter should be passed through to API (may cause server error)
      mockClient.tasks.getAllTasks.mockRejectedValue(new Error('Invalid filter'));

      await expect(strategy.execute(params)).rejects.toThrow();
    });

    it('should handle projectId = 0', async () => {
      const params: FilteringParams = {
        args: { projectId: 0, allProjects: false },
        filterExpression: null,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      const emptyTaskArray: Task[] = [];
      mockClient.tasks.getProjectTasks.mockResolvedValue(emptyTaskArray);

      const result = await strategy.execute(params);

      expect(validateId).toHaveBeenCalledWith(0, 'projectId');
      expect(mockClient.tasks.getProjectTasks).toHaveBeenCalledWith(0, {
        page: 1,
        per_page: 10,
        filter: 'priority >= 3'
      });
      expect(result.tasks).toEqual([]);
    });

    it('should handle API returning undefined (defensive programming)', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      // Mock API returning undefined (edge case)
      mockClient.tasks.getAllTasks.mockResolvedValue(undefined as any);

      const result = await strategy.execute(params);

      expect(result.tasks).toEqual([]);
      expect(result.metadata.serverSideFilteringUsed).toBe(true);
    });
  });
});