import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import type { VikunjaClientFactory } from '../../src/client/VikunjaClientFactory';
import { registerTasksTool } from '../../src/tools/tasks';
import { MCPError, ErrorCode } from '../../src/types';
import type { Task, User } from 'node-vikunja';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';

// Import the functions we're mocking
import { getClientFromContext, setGlobalClientFactory } from '../../src/client';

// Mock the modules
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
  setGlobalClientFactory: jest.fn(),
  clearGlobalClientFactory: jest.fn(),
}));
jest.mock('../../src/auth/AuthManager');
jest.mock('../../src/storage/FilterStorage', () => ({
  storageManager: {
    getStorage: jest.fn().mockResolvedValue({
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
    }),
  },
}));

describe('Tasks Tool - Index Routing Coverage', () => {
  let mockClient: MockVikunjaClient;
  let mockAuthManager: MockAuthManager;
  let mockServer: MockServer;
  let mockClientFactory: jest.Mocked<VikunjaClientFactory>;
  let toolHandler: (args: any) => Promise<any>;

  // Helper function to call a tool
  async function callTool(subcommand: string, args: Record<string, any> = {}) {
    return toolHandler({
      subcommand,
      ...args,
    });
  }

  // Mock data
  const mockTask: Task = {
    id: 1,
    title: 'Test Task',
    description: 'Test Description',
    done: false,
    doneAt: null,
    priority: 5,
    labels: [],
    assignees: [],
    dueDate: null,
    startDate: null,
    endDate: null,
    repeatAfter: 0,
    repeatMode: null,
    projectId: 1,
    created: new Date('2024-01-01').toISOString(),
    updated: new Date('2024-01-01').toISOString(),
    createdBy: { id: 1, username: 'test', email: 'test@example.com' },
    position: 0,
    kanbanPosition: 0,
    bucketId: 0,
    percentDone: 0,
    identifier: 'TEST-1',
    index: 1,
    reminders: [],
  };

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User',
    created: new Date('2024-01-01').toISOString(),
    updated: new Date('2024-01-01').toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mocks with correct API methods
    mockClient = {
      tasks: {
        getAllTasks: jest.fn().mockResolvedValue([mockTask]),
        getProjectTasks: jest.fn().mockResolvedValue([mockTask]),
        createTask: jest.fn().mockResolvedValue(mockTask),
        getTask: jest.fn().mockResolvedValue(mockTask),
        updateTask: jest.fn().mockResolvedValue(mockTask),
        deleteTask: jest.fn().mockResolvedValue(undefined),
        getTaskComments: jest.fn().mockResolvedValue([]),
        createTaskComment: jest.fn().mockResolvedValue({ id: 1, text: 'Test comment' }),
        updateTaskLabels: jest.fn().mockResolvedValue(mockTask),
        bulkAssignUsersToTask: jest.fn().mockResolvedValue(mockTask),
        removeUserFromTask: jest.fn().mockResolvedValue(mockTask),
        bulkUpdateTasks: jest.fn().mockResolvedValue([mockTask]),
        createTaskRelation: jest.fn().mockResolvedValue(undefined),
        deleteTaskRelation: jest.fn().mockResolvedValue(undefined),
        getTaskRelations: jest.fn().mockResolvedValue([]),
      },
      projects: {
        getProjects: jest.fn().mockResolvedValue([]),
        createProject: jest.fn(),
        getProject: jest.fn(),
        updateProject: jest.fn(),
        deleteProject: jest.fn(),
        createLinkShare: jest.fn(),
        getLinkShares: jest.fn(),
        getLinkShare: jest.fn(),
        deleteLinkShare: jest.fn(),
      },
      labels: {
        getLabels: jest.fn().mockResolvedValue([]),
        getLabel: jest.fn(),
        createLabel: jest.fn(),
        updateLabel: jest.fn(),
        deleteLabel: jest.fn(),
      },
      users: {
        getAll: jest.fn().mockResolvedValue([mockUser]),
      },
      teams: {
        getAll: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    } as MockVikunjaClient;

    // Mock auth manager
    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getSession: jest.fn().mockReturnValue({
        apiToken: 'test-token',
        apiUrl: 'https://test.example.com',
        userId: 1,
      }),
      authenticate: jest.fn(),
      logout: jest.fn(),
      getCredentials: jest.fn(),
    } as MockAuthManager;

    // Mock client factory
    mockClientFactory = {
      createClient: jest.fn().mockResolvedValue(mockClient),
    } as jest.Mocked<VikunjaClientFactory>;

    // Mock server
    mockServer = {
      tool: jest.fn().mockImplementation((name, schema, handler) => {
        toolHandler = handler;
      }),
    } as MockServer;

    // Mock the imported functions
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);
    (setGlobalClientFactory as jest.Mock).mockImplementation(() => {});

    // Register the tool
    registerTasksTool(mockServer as McpServer, mockAuthManager as AuthManager);
  });

  describe('Authentication Checks', () => {
    it('should throw MCPError when not authenticated', async () => {
      mockAuthManager.isAuthenticated = jest.fn().mockReturnValue(false);
      
      await expect(callTool('list')).rejects.toThrow(
        new MCPError(
          ErrorCode.AUTH_REQUIRED,
          'Authentication required to access task management features. Please connect first:\n' +
          'vikunja_auth.connect({\n' +
          '  apiUrl: \'https://your-vikunja.com/api/v1\',\n' +
          '  apiToken: \'your-api-token\'\n' +
          '})\n\n' +
          'Get your API token from Vikunja Settings > API Access.'
        )
      );
    });

    it('should check authentication before any operation', async () => {
      await callTool('list');
      expect(mockAuthManager.isAuthenticated).toHaveBeenCalled();
    });
  });

  describe('Client Factory Setting', () => {
    it('should set global client factory when provided', async () => {
      // Register tool with client factory
      registerTasksTool(mockServer as McpServer, mockAuthManager as AuthManager, mockClientFactory);
      
      await callTool('list');
      
      expect(setGlobalClientFactory).toHaveBeenCalledWith(mockClientFactory);
    });

    it('should not set client factory when not provided', async () => {
      // This test uses the setup from beforeEach which doesn't pass clientFactory
      await callTool('list');
      
      // setGlobalClientFactory should not be called when no factory is provided
      // Note: This tests the conditional logic on line 432-435
      const calls = (setGlobalClientFactory as jest.Mock).mock.calls;
      expect(calls.length).toBe(0);
    });
  });

  describe('Client Context Testing', () => {
    it('should test client connection before operations', async () => {
      await callTool('list');
      expect(getClientFromContext).toHaveBeenCalled();
    });

    it('should handle client connection failures', async () => {
      (getClientFromContext as jest.Mock).mockRejectedValue(new Error('Connection failed'));
      
      await expect(callTool('list')).rejects.toThrow('Task operation error: Connection failed');
    });
  });

  describe('All Subcommand Routing', () => {
    it('should route to list subcommand', async () => {
      const result = await callTool('list');
      expect(result.content[0].text).toContain('"operation": "list-tasks"');
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalled();
    });

    it('should route to create subcommand', async () => {
      const result = await callTool('create', { title: 'New Task', projectId: 1 });
      expect(result.content[0].text).toContain('"operation": "create-task"');
      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'New Task',
        project_id: 1,
      });
    });

    it('should route to get subcommand', async () => {
      const result = await callTool('get', { id: 1 });
      expect(result.content[0].text).toContain('"operation": "get-task"');
      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);
    });

    it('should route to update subcommand', async () => {
      const result = await callTool('update', { id: 1, title: 'Updated Task' });
      expect(result.content[0].text).toContain('"operation": "update-task"');
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, expect.objectContaining({
        title: 'Updated Task'
      }));
    });

    it('should route to delete subcommand', async () => {
      const result = await callTool('delete', { id: 1 });
      expect(result.content[0].text).toContain('"operation": "delete-task"');
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
    });

    it('should route to assign subcommand', async () => {
      const result = await callTool('assign', { id: 1, assignees: [1] });
      expect(result.content[0].text).toContain('"operation": "assign"');
      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(1, { user_ids: [1] });
    });

    it('should route to unassign subcommand', async () => {
      const result = await callTool('unassign', { id: 1, assignees: [1] });
      expect(result.content[0].text).toContain('"operation": "unassign"');
      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(1, 1);
    });

    it('should route to list-assignees subcommand', async () => {
      const result = await callTool('list-assignees', { id: 1 });
      expect(result.content[0].text).toContain('"operation": "get"');
      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);
    });

    it('should route to comment subcommand', async () => {
      const result = await callTool('comment', { id: 1, comment: 'Test comment' });
      expect(result.content[0].text).toContain('"operation": "comment"');
      expect(mockClient.tasks.createTaskComment).toHaveBeenCalledWith(1, {
        comment: 'Test comment',
        task_id: 1
      });
    });

    it('should route to attach subcommand and throw not implemented error', async () => {
      await expect(callTool('attach')).rejects.toThrow(
        new MCPError(
          ErrorCode.NOT_IMPLEMENTED,
          'File attachments are not supported in the current MCP context'
        )
      );
    });

    it('should route to bulk-update subcommand', async () => {
      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'priority',
        value: 3
      });
      expect(result.content[0].text).toContain('"operation": "update-task"');
    });

    it('should route to bulk-delete subcommand', async () => {
      mockClient.tasks.deleteTask = jest.fn().mockResolvedValue(undefined);
      const result = await callTool('bulk-delete', { taskIds: [1, 2] });
      expect(result.content[0].text).toContain('"operation": "delete-task"');
    });

    it('should route to bulk-create subcommand', async () => {
      const result = await callTool('bulk-create', {
        projectId: 1,
        tasks: [
          { title: 'Task 1' },
          { title: 'Task 2' }
        ]
      });
      expect(result.content[0].text).toContain('"operation": "create-tasks"');
    });

    it('should route to relate subcommand', async () => {
      const result = await callTool('relate', { 
        id: 1, 
        otherTaskId: 2, 
        relationKind: 'subtask' 
      });
      expect(result.content[0].text).toContain('"operation": "relate"');
      expect(mockClient.tasks.createTaskRelation).toHaveBeenCalled();
    });

    it('should route to unrelate subcommand', async () => {
      // Setup existing relation for deletion
      mockClient.tasks.getTaskRelations = jest.fn().mockResolvedValue([{
        id: 1,
        otherTaskId: 2,
        relationKind: 'subtask'
      }]);
      
      const result = await callTool('unrelate', { 
        id: 1, 
        otherTaskId: 2, 
        relationKind: 'subtask' 
      });
      expect(result.content[0].text).toContain('"operation": "unrelate"');
      expect(mockClient.tasks.deleteTaskRelation).toHaveBeenCalled();
    });

    it('should route to relations subcommand', async () => {
      const result = await callTool('relations', { id: 1 });
      expect(result.content[0].text).toContain('"operation": "relations"');
      // Relations subcommand was called successfully
      expect(result.content[0].text).toContain('"operation": "relations"');
    });

    it('should route to add-reminder subcommand', async () => {
      const result = await callTool('add-reminder', { 
        id: 1, 
        reminderDate: '2024-12-01T10:00:00Z' 
      });
      expect(result.content[0].text).toContain('"operation": "add-reminder"');
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, expect.objectContaining({
        reminders: expect.arrayContaining([expect.any(Object)])
      }));
    });

    it('should route to remove-reminder subcommand', async () => {
      // Setup task with reminders first
      const taskWithReminders = {
        ...mockTask,
        reminders: [{ id: 1, date: '2024-12-01T10:00:00Z' }]
      };
      mockClient.tasks.getTask = jest.fn().mockResolvedValue(taskWithReminders);
      
      const result = await callTool('remove-reminder', { 
        id: 1, 
        reminderId: 1 
      });
      expect(result.content[0].text).toContain('"operation": "remove-reminder"');
      expect(mockClient.tasks.updateTask).toHaveBeenCalled();
    });

    it('should route to list-reminders subcommand', async () => {
      const result = await callTool('list-reminders', { id: 1 });
      expect(result.content[0].text).toContain('"operation": "list-reminders"');
      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);
    });
  });

  describe('Default Case Handling', () => {
    it('should throw validation error for unknown subcommand', async () => {
      await expect(callTool('invalid-subcommand')).rejects.toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'Unknown subcommand: invalid-subcommand'
        )
      );
    });
  });

  describe('Error Handling', () => {
    it('should re-throw MCPError instances', async () => {
      const mcpError = new MCPError(ErrorCode.API_ERROR, 'Test MCP error');
      (getClientFromContext as jest.Mock).mockRejectedValue(mcpError);
      
      await expect(callTool('list')).rejects.toThrow(mcpError);
    });

    it('should wrap generic errors in MCPError', async () => {
      const genericError = new Error('Generic error');
      (getClientFromContext as jest.Mock).mockRejectedValue(genericError);
      
      await expect(callTool('list')).rejects.toThrow(
        new MCPError(
          ErrorCode.INTERNAL_ERROR,
          'Task operation error: Generic error'
        )
      );
    });

    it('should handle non-Error objects', async () => {
      (getClientFromContext as jest.Mock).mockRejectedValue('String error');
      
      await expect(callTool('list')).rejects.toThrow(
        new MCPError(
          ErrorCode.INTERNAL_ERROR,
          'Task operation error: String error'
        )
      );
    });

    it('should handle null errors', async () => {
      (getClientFromContext as jest.Mock).mockRejectedValue(null);
      
      await expect(callTool('list')).rejects.toThrow(
        new MCPError(
          ErrorCode.INTERNAL_ERROR,
          'Task operation error: null'
        )
      );
    });
  });

  describe('Session Storage Testing', () => {
    it('should create session storage for list operations', async () => {
      // Import the storage manager mock
      const { storageManager } = require('../../src/storage/FilterStorage');
      
      await callTool('list');
      
      expect(storageManager.getStorage).toHaveBeenCalledWith(
        'https://test.example.com:test-tok',
        1,
        'https://test.example.com'
      );
    });

    it('should handle anonymous session when no token', async () => {
      mockAuthManager.getSession = jest.fn().mockReturnValue({
        apiToken: null,
        apiUrl: 'https://test.example.com',
        userId: null,
      });

      const { storageManager } = require('../../src/storage/FilterStorage');
      
      await callTool('list');
      
      expect(storageManager.getStorage).toHaveBeenCalledWith(
        'anonymous',
        null,
        'https://test.example.com'
      );
    });
  });

  describe('List Function Edge Cases', () => {
    it('should handle filter ID not found', async () => {
      const { storageManager } = require('../../src/storage/FilterStorage');
      const mockStorage = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
        delete: jest.fn(),
        list: jest.fn(),
      };
      storageManager.getStorage.mockResolvedValue(mockStorage);

      await expect(callTool('list', { filterId: 'nonexistent' })).rejects.toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'Filter with id nonexistent not found'
        )
      );
    });

    it('should handle saved filter correctly', async () => {
      const { storageManager } = require('../../src/storage/FilterStorage');
      const mockStorage = {
        get: jest.fn().mockResolvedValue({ filter: 'priority > 5' }),
        set: jest.fn(),
        delete: jest.fn(),
        list: jest.fn(),
      };
      storageManager.getStorage.mockResolvedValue(mockStorage);

      const result = await callTool('list', { filterId: 'high-priority' });

      expect(mockStorage.get).toHaveBeenCalledWith('high-priority');
      expect(result.content[0].text).toContain('"operation": "list-tasks"');
    });

    it('should handle filter parsing errors', async () => {
      // Use an actually invalid filter that will fail parsing
      await expect(callTool('list', { filter: 'invalid filter' })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.VALIDATION_ERROR,
          message: expect.stringContaining('Invalid filter syntax:')
        })
      );
    });

    it('should handle server-side filtering environment variables', async () => {
      // Test production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const result = await callTool('list', { filter: 'priority > 5' });
      expect(result.content[0].text).toContain('"operation": "list-tasks"');

      // Reset environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle done status filtering', async () => {
      const result = await callTool('list', { done: true });
      expect(result.content[0].text).toContain('"operation": "list-tasks"');
    });
  });

  describe('Memory and Validation Edge Cases', () => {
    it('should apply default pagination limits', async () => {
      const result = await callTool('list');
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          per_page: 1000,
          page: 1,
        })
      );
    });

    it('should handle project-specific task listing', async () => {
      const result = await callTool('list', { projectId: 1 });
      expect(mockClient.tasks.getProjectTasks).toHaveBeenCalledWith(1, expect.any(Object));
    });

    it('should handle allProjects flag', async () => {
      const result = await callTool('list', { projectId: 1, allProjects: true });
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalled();
    });

    it('should throw error when perPage exceeds limits', async () => {
      // Test line 123 - task count validation error
      await expect(callTool('list', { perPage: 20000 })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.VALIDATION_ERROR,
          message: expect.stringContaining('Task count limit exceeded')
        })
      );
    });

    it('should handle server-side filtering with project ID in production', async () => {
      // Test lines 161-163 - server-side filtering with project ID
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const result = await callTool('list', {
        projectId: 1,
        filter: 'priority > 5'
      });

      expect(result.content[0].text).toContain('"operation": "list-tasks"');
      
      // Reset environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle server-side filtering failure and fallback', async () => {
      // Test lines 182-186 - server-side filtering error handling
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      // Mock server-side filtering to fail first, then succeed on fallback
      let callCount = 0;
      mockClient.tasks.getAllTasks = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Server-side filtering failed');
        }
        return [mockTask];
      });

      const result = await callTool('list', { filter: 'priority > 5' });
      expect(result.content[0].text).toContain('"operation": "list-tasks"');
      
      // Should have been called twice - once for server-side (failed), once for fallback
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledTimes(2);
      
      // Reset environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle memory limit warnings for large datasets', async () => {
      // Test lines 216-224 - post-load validation warnings
      // Mock a large number of tasks being returned
      const largeTasks = Array.from({ length: 8000 }, (_, i) => ({
        ...mockTask,
        id: i + 1,
      }));
      
      mockClient.tasks.getAllTasks = jest.fn().mockResolvedValue(largeTasks);
      
      const result = await callTool('list');
      expect(result.content[0].text).toContain('"operation": "list-tasks"');
      expect(result.content[0].text).toContain('"count": 8000');
    });

    it('should handle extremely large datasets with hard limits', async () => {
      // Test lines 222-236 - hard limit enforcement
      const massiveTasks = Array.from({ length: 25000 }, (_, i) => ({
        ...mockTask,
        id: i + 1,
      }));
      
      mockClient.tasks.getAllTasks = jest.fn().mockResolvedValue(massiveTasks);
      
      await expect(callTool('list')).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.INTERNAL_ERROR,
          message: expect.stringContaining('exceeding the maximum limit')
        })
      );
    });

    it('should handle server-side filtering metadata when successful', async () => {
      // Test lines 271-272 - server-side filtering metadata
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const result = await callTool('list', { filter: 'priority > 5' });
      const response = JSON.parse(result.content[0].text);
      
      expect(response.metadata).toHaveProperty('serverSideFilteringUsed');
      
      // Reset environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle error logging and re-throwing in listTasks', async () => {
      // Test lines 316-323 - error handling in listTasks catch block
      mockClient.tasks.getAllTasks = jest.fn().mockRejectedValue(new Error('API Error'));
      
      await expect(callTool('list')).rejects.toThrow(
        new MCPError(
          ErrorCode.API_ERROR,
          'Failed to list tasks: API Error'
        )
      );
    });
  });
});