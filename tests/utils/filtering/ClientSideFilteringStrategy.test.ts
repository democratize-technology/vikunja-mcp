/**
 * Tests for ClientSideFilteringStrategy
 * Ensures client-side filtering behavior is properly tested
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ClientSideFilteringStrategy } from '../../../src/utils/filtering/ClientSideFilteringStrategy';
import type { FilteringParams } from '../../../src/utils/filtering/types';
import type { FilterExpression } from '../../../src/types/filters';
import type { MockVikunjaClient } from '../../types/mocks';
import type { Task } from 'node-vikunja';

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

// Mock filter application
jest.mock('../../../src/tools/tasks/filters', () => ({
  applyFilter: jest.fn(),
}));

import { getClientFromContext } from '../../../src/client';
import { validateId } from '../../../src/tools/tasks/validation';
import { applyFilter } from '../../../src/tools/tasks/filters';

describe('ClientSideFilteringStrategy', () => {
  let strategy: ClientSideFilteringStrategy;
  let mockClient: MockVikunjaClient;
  
  const mockTask1: Task = {
    id: 1,
    title: 'High Priority Task',
    description: 'Important task',
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

  const mockTask2: Task = {
    id: 2,
    title: 'Low Priority Task',
    description: 'Not urgent',
    done: true,
    priority: 1,
    percent_done: 100,
    due_date: '2025-02-15T00:00:00Z',
    created: '2025-01-02T00:00:00Z',
    updated: '2025-01-02T00:00:00Z',
    project_id: 1,
    assignees: [],
    labels: [],
  } as Task;

  beforeEach(() => {
    jest.clearAllMocks();
    
    strategy = new ClientSideFilteringStrategy();
    
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
    it('should load all tasks when no project specified', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask1, mockTask2]);

      const result = await strategy.execute(params);

      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 10
      });
      expect(mockClient.tasks.getProjectTasks).not.toHaveBeenCalled();
      expect(result.tasks).toEqual([mockTask1, mockTask2]);
      expect(result.metadata.clientSideFiltering).toBe(false);
      expect(result.metadata.serverSideFilteringUsed).toBe(false);
    });

    it('should load project tasks when projectId specified and allProjects is false', async () => {
      const projectId = 42;
      const params: FilteringParams = {
        args: { projectId, allProjects: false },
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getProjectTasks.mockResolvedValue([mockTask1]);

      const result = await strategy.execute(params);

      expect(validateId).toHaveBeenCalledWith(projectId, 'projectId');
      expect(mockClient.tasks.getProjectTasks).toHaveBeenCalledWith(projectId, {
        page: 1,
        per_page: 10
      });
      expect(mockClient.tasks.getAllTasks).not.toHaveBeenCalled();
      expect(result.tasks).toEqual([mockTask1]);
    });

    it('should use getAllTasks when projectId specified but allProjects is true', async () => {
      const params: FilteringParams = {
        args: { projectId: 42, allProjects: true },
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask1, mockTask2]);

      const result = await strategy.execute(params);

      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 10
      });
      expect(mockClient.tasks.getProjectTasks).not.toHaveBeenCalled();
    });

    it('should apply client-side filtering when filter expression provided', async () => {
      const mockFilterExpression: FilterExpression = {
        type: 'condition',
        field: 'priority',
        operator: '>=',
        value: 3
      };

      const params: FilteringParams = {
        args: {},
        filterExpression: mockFilterExpression,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask1, mockTask2]);
      (applyFilter as jest.MockedFunction<typeof applyFilter>).mockReturnValue([mockTask1]);

      const result = await strategy.execute(params);

      expect(applyFilter).toHaveBeenCalledWith([mockTask1, mockTask2], mockFilterExpression);
      expect(result.tasks).toEqual([mockTask1]);
      expect(result.metadata.clientSideFiltering).toBe(true);
      expect(result.metadata.serverSideFilteringUsed).toBe(false);
      expect(result.metadata.serverSideFilteringAttempted).toBe(false);
    });

    it('should not apply filtering when no filter expression provided', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask1, mockTask2]);

      const result = await strategy.execute(params);

      expect(applyFilter).not.toHaveBeenCalled();
      expect(result.tasks).toEqual([mockTask1, mockTask2]);
      expect(result.metadata.clientSideFiltering).toBe(false);
    });

    it('should return correct metadata when filtering is applied', async () => {
      const mockFilterExpression: FilterExpression = {
        type: 'condition',
        field: 'done',
        operator: '=',
        value: false
      };

      const params: FilteringParams = {
        args: {},
        filterExpression: mockFilterExpression,
        filterString: 'done = false',
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask1, mockTask2]);
      (applyFilter as jest.MockedFunction<typeof applyFilter>).mockReturnValue([mockTask1]);

      const result = await strategy.execute(params);

      expect(result.metadata).toEqual({
        serverSideFilteringUsed: false,
        serverSideFilteringAttempted: false,
        clientSideFiltering: true,
        filteringNote: 'Client-side filtering applied (server-side disabled in development)'
      });
    });

    it('should return correct metadata when no filtering is applied', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask1, mockTask2]);

      const result = await strategy.execute(params);

      expect(result.metadata).toEqual({
        serverSideFilteringUsed: false,
        serverSideFilteringAttempted: false,
        clientSideFiltering: false,
        filteringNote: 'Client-side filtering applied (server-side disabled in development)'
      });
    });
  });

  describe('error handling', () => {
    it('should propagate API errors when loading all tasks', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      const apiError = new Error('API connection failed');
      mockClient.tasks.getAllTasks.mockRejectedValue(apiError);

      await expect(strategy.execute(params)).rejects.toThrow(apiError);
    });

    it('should propagate API errors when loading project tasks', async () => {
      const params: FilteringParams = {
        args: { projectId: 42, allProjects: false },
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      const apiError = new Error('Project not found');
      mockClient.tasks.getProjectTasks.mockRejectedValue(apiError);

      await expect(strategy.execute(params)).rejects.toThrow(apiError);
    });

    it('should propagate validation errors', async () => {
      const params: FilteringParams = {
        args: { projectId: -1, allProjects: false },
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      const validationError = new Error('Invalid project ID');
      (validateId as jest.MockedFunction<typeof validateId>).mockImplementation(() => {
        throw validationError;
      });

      await expect(strategy.execute(params)).rejects.toThrow(validationError);
      expect(mockClient.tasks.getProjectTasks).not.toHaveBeenCalled();
    });

    it('should propagate filter application errors', async () => {
      const mockFilterExpression: FilterExpression = {
        type: 'condition',
        field: 'priority',
        operator: '>=',
        value: 3
      };

      const params: FilteringParams = {
        args: {},
        filterExpression: mockFilterExpression,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask1, mockTask2]);
      
      const filterError = new Error('Filter application failed');
      (applyFilter as jest.MockedFunction<typeof applyFilter>).mockImplementation(() => {
        throw filterError;
      });

      await expect(strategy.execute(params)).rejects.toThrow(filterError);
    });
  });

  describe('edge cases', () => {
    it('should handle empty task arrays', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([]);

      const result = await strategy.execute(params);

      expect(result.tasks).toEqual([]);
      expect(result.metadata.clientSideFiltering).toBe(false);
    });

    it('should handle empty task arrays with filtering', async () => {
      const mockFilterExpression: FilterExpression = {
        type: 'condition',
        field: 'priority',
        operator: '>=',
        value: 3
      };

      const params: FilteringParams = {
        args: {},
        filterExpression: mockFilterExpression,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([]);
      (applyFilter as jest.MockedFunction<typeof applyFilter>).mockReturnValue([]);

      const result = await strategy.execute(params);

      expect(applyFilter).toHaveBeenCalledWith([], mockFilterExpression);
      expect(result.tasks).toEqual([]);
    });

    it('should handle projectId = 0', async () => {
      const params: FilteringParams = {
        args: { projectId: 0, allProjects: false },
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      const emptyTaskArray: Task[] = [];
      mockClient.tasks.getProjectTasks.mockResolvedValue(emptyTaskArray);

      const result = await strategy.execute(params);

      expect(validateId).toHaveBeenCalledWith(0, 'projectId');
      expect(mockClient.tasks.getProjectTasks).toHaveBeenCalledWith(0, {
        page: 1,
        per_page: 10
      });
      expect(result.tasks).toEqual([]);
    });

    it('should handle API returning undefined (defensive programming)', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: undefined,
        params: { page: 1, per_page: 10 }
      };

      // Mock API returning undefined (edge case)
      mockClient.tasks.getAllTasks.mockResolvedValue(undefined as any);

      const result = await strategy.execute(params);

      expect(result.tasks).toEqual([]);
      expect(result.metadata.clientSideFiltering).toBe(false);
    });

    it('should handle API returning undefined with filter expression', async () => {
      const mockFilterExpression: FilterExpression = {
        type: 'condition',
        field: 'priority',
        operator: '>=',
        value: 3
      };

      const params: FilteringParams = {
        args: {},
        filterExpression: mockFilterExpression,
        filterString: 'priority >= 3',
        params: { page: 1, per_page: 10 }
      };

      // Mock API returning undefined and applyFilter returning empty array
      mockClient.tasks.getAllTasks.mockResolvedValue(undefined as any);
      (applyFilter as jest.MockedFunction<typeof applyFilter>).mockReturnValue([]);

      const result = await strategy.execute(params);

      expect(applyFilter).toHaveBeenCalledWith([], mockFilterExpression);
      expect(result.tasks).toEqual([]);
      expect(result.metadata.clientSideFiltering).toBe(true);
    });

    it('should preserve all API parameters when no filtering applied', async () => {
      const params: FilteringParams = {
        args: {},
        filterExpression: null,
        filterString: undefined,
        params: { 
          page: 3, 
          per_page: 25, 
          sort_by: 'created',
          s: 'search term'
        }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask1]);

      await strategy.execute(params);

      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 3,
        per_page: 25,
        sort_by: 'created',
        s: 'search term'
      });
    });

    it('should handle complex filter expressions', async () => {
      const mockFilterExpression: FilterExpression = {
        type: 'group',
        operator: '&&',
        conditions: [
          {
            type: 'condition',
            field: 'priority',
            operator: '>=',
            value: 3
          },
          {
            type: 'condition',
            field: 'done',
            operator: '=',
            value: false
          }
        ]
      };

      const params: FilteringParams = {
        args: {},
        filterExpression: mockFilterExpression,
        filterString: 'priority >= 3 && done = false',
        params: { page: 1, per_page: 10 }
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask1, mockTask2]);
      (applyFilter as jest.MockedFunction<typeof applyFilter>).mockReturnValue([mockTask1]);

      const result = await strategy.execute(params);

      expect(applyFilter).toHaveBeenCalledWith([mockTask1, mockTask2], mockFilterExpression);
      expect(result.tasks).toEqual([mockTask1]);
    });
  });
});