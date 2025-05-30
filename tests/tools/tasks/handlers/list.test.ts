/**
 * Tests for list tasks handler
 */

import { handleListTasks } from '../../../../src/tools/tasks/handlers/list';
import type { ListTasksRequest } from '../../../../src/types/operations/tasks';
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
jest.mock('../../../../src/tools/tasks/filters', () => ({
  applyFilter: jest.fn((tasks: Task[], filter: any) => {
    // Simple mock implementation
    if (filter === 'invalid') throw new Error('Invalid filter');
    return tasks.filter(t => t.done === true);
  })
}));

// Mock task data
const mockTasks: Task[] = [
  {
    id: 1,
    project_id: 1,
    title: 'Task 1',
    done: false,
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z'
  },
  {
    id: 2,
    project_id: 1,
    title: 'Task 2',
    done: true,
    created: '2024-01-02T00:00:00Z',
    updated: '2024-01-02T00:00:00Z'
  },
  {
    id: 3,
    project_id: 2,
    title: 'Task 3',
    done: false,
    created: '2024-01-03T00:00:00Z',
    updated: '2024-01-03T00:00:00Z'
  }
];

describe('handleListTasks', () => {
  let mockClient: jest.Mocked<VikunjaClient>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock client
    mockClient = {
      tasks: {
        getTasksForProject: jest.fn().mockResolvedValue(mockTasks),
        getAll: jest.fn().mockResolvedValue(mockTasks),
        getTask: jest.fn()
      },
      filters: {
        getAll: jest.fn().mockResolvedValue([])
      }
    } as any;
  });

  describe('successful listing', () => {
    it('should list all tasks without filters', async () => {
      const request: ListTasksRequest = {
        operation: 'list'
      };

      const response = await handleListTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('list');
      expect(response.message).toBe('Retrieved 3 tasks');
      expect(response.tasks).toEqual(mockTasks);
      expect(response.metadata.count).toBe(3);
      expect(response.metadata.clientSideFiltering).toBeUndefined();
      expect(mockClient.tasks.getAll).toHaveBeenCalledWith({
        page: 1,
        per_page: 50
      });
    });

    it('should list tasks for a specific project', async () => {
      const request: ListTasksRequest = {
        operation: 'list',
        projectId: 1
      };

      const response = await handleListTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.tasks).toEqual(mockTasks);
      expect(mockClient.tasks.getTasksForProject).toHaveBeenCalledWith(1, {
        page: 1,
        per_page: 50
      });
    });

    it('should handle pagination parameters', async () => {
      const request: ListTasksRequest = {
        operation: 'list',
        page: 2,
        perPage: 25
      };

      const response = await handleListTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.page).toBe(2);
      expect(response.metadata.perPage).toBe(25);
      expect(response.metadata.hasNext).toBe(false);
      expect(response.metadata.hasPrevious).toBe(true);
      expect(mockClient.tasks.getAll).toHaveBeenCalledWith({
        page: 2,
        per_page: 25
      });
    });

    it('should handle sort parameters', async () => {
      const request: ListTasksRequest = {
        operation: 'list',
        sort: 'created,desc'
      };

      const response = await handleListTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(mockClient.tasks.getAll).toHaveBeenCalledWith({
        page: 1,
        per_page: 50,
        sort_by: ['created', 'desc'],
        order_by: ['desc']
      });
    });

    it('should handle search parameter', async () => {
      const request: ListTasksRequest = {
        operation: 'list',
        search: 'important'
      };

      const response = await handleListTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(mockClient.tasks.getAll).toHaveBeenCalledWith({
        page: 1,
        per_page: 50,
        s: 'important'
      });
    });

    it('should apply client-side filter', async () => {
      const request: ListTasksRequest = {
        operation: 'list',
        filter: JSON.stringify({ field: 'done', operator: '=', value: true })
      };

      const response = await handleListTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.tasks).toHaveLength(1); // Only Task 2 is done
      expect(response.metadata.clientSideFiltering).toBe(true);
      expect(response.metadata.filter).toBeDefined();
    });

    it('should filter by done status', async () => {
      const request: ListTasksRequest = {
        operation: 'list',
        done: true
      };

      const response = await handleListTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.tasks).toHaveLength(1);
      expect(response.tasks[0].done).toBe(true);
      expect(response.metadata.clientSideFiltering).toBe(true);
    });

    it('should use saved filter when filterId is provided', async () => {
      const mockFilter = {
        id: 123,
        title: 'My Filter',
        filters: {
          filter_query: JSON.stringify({ field: 'done', operator: '=', value: true })
        }
      };
      mockClient.filters.getAll = jest.fn().mockResolvedValue([mockFilter]);

      const request: ListTasksRequest = {
        operation: 'list',
        filterId: '123'
      };

      const response = await handleListTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.clientSideFiltering).toBe(true);
      expect(mockClient.filters.getAll).toHaveBeenCalled();
    });
  });

  describe('validation errors', () => {
    it('should reject invalid projectId', async () => {
      const request: ListTasksRequest = {
        operation: 'list',
        projectId: -1
      };

      await expect(handleListTasks(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleListTasks(request, mockClient)).rejects.toThrow('Number must be greater than 0');
    });

    it('should reject perPage exceeding limit', async () => {
      const request: ListTasksRequest = {
        operation: 'list',
        perPage: 101
      };

      await expect(handleListTasks(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleListTasks(request, mockClient)).rejects.toThrow('Per page cannot exceed 100');
    });

    it('should handle non-existent filterId', async () => {
      mockClient.filters.getAll = jest.fn().mockResolvedValue([]);

      const request: ListTasksRequest = {
        operation: 'list',
        filterId: '999'
      };

      await expect(handleListTasks(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleListTasks(request, mockClient)).rejects.toThrow('Filter with ID 999 not found');
    });
  });

  describe('error handling', () => {
    it('should handle API errors', async () => {
      const apiError = new Error('API Error');
      mockClient.tasks.getAll = jest.fn().mockRejectedValue(apiError);

      const request: ListTasksRequest = {
        operation: 'list'
      };

      const response = await handleListTasks(request, mockClient);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(ErrorCode.API_ERROR);
      expect(response.error?.message).toBe('API Error');
      expect(response.tasks).toEqual([]);
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('401 Unauthorized');
      mockClient.tasks.getAll = jest.fn().mockRejectedValue(authError);

      const request: ListTasksRequest = {
        operation: 'list'
      };

      await expect(handleListTasks(request, mockClient)).rejects.toThrow(MCPError);
      await expect(handleListTasks(request, mockClient)).rejects.toThrow('Authentication required');
    });

    it('should handle invalid filter gracefully', async () => {
      const request: ListTasksRequest = {
        operation: 'list',
        filter: 'not-valid-json'
      };

      const response = await handleListTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.filteringNote).toBe('Invalid filter format');
      expect(response.metadata.clientSideFiltering).toBeUndefined();
    });

    it('should calculate correct pagination metadata', async () => {
      // Mock 100 tasks
      const manyTasks = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        project_id: 1,
        title: `Task ${i + 1}`,
        done: false,
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z'
      }));
      mockClient.tasks.getAll = jest.fn().mockResolvedValue(manyTasks);

      const request: ListTasksRequest = {
        operation: 'list',
        page: 2,
        perPage: 25
      };

      const response = await handleListTasks(request, mockClient);

      expect(response.success).toBe(true);
      expect(response.metadata.totalItems).toBe(100);
      expect(response.metadata.totalPages).toBe(4);
      expect(response.metadata.hasNext).toBe(true);
      expect(response.metadata.hasPrevious).toBe(true);
    });
  });
});