/**
 * Tests for task creation race condition fix
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AuthManager } from '../../src/auth/AuthManager';
import { registerTasksTool } from '../../src/tools/tasks';
import { MCPError, ErrorCode } from '../../src/types';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';

// Mock the main module and its dependencies
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
  setGlobalClientFactory: jest.fn(),
  clearGlobalClientFactory: jest.fn(),
}));

// Import the mocked functions
import { getClientFromContext } from '../../src/client';

describe('Tasks Tool - Race Condition Fix', () => {
  let mockServer: MockServer;
  let mockAuthManager: MockAuthManager;
  let mockClient: MockVikunjaClient;
  let toolHandler: (args: any) => Promise<any>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up console.error spy
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Create mock server
    mockServer = {
      tool: jest.fn(),
    } as MockServer;

    // Create mock auth manager
    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getSession: jest.fn().mockReturnValue({
        apiUrl: 'https://vikunja.example.com',
        apiToken: 'test-token',
        userId: 1,
      }),
      getAuthenticatedClient: jest.fn(),
      updateCredentials: jest.fn(),
      clearCredentials: jest.fn(),
      verifyCredentials: jest.fn(),
      getCredentials: jest.fn(),
      authenticate: jest.fn(),
      setSession: jest.fn(),
      clearSession: jest.fn(),
    } as MockAuthManager;

    // Create mock Vikunja client
    mockClient = {
      getToken: jest.fn(),
      projects: {} as any,
      labels: {} as any,
      users: {} as any,
      teams: {} as any,
      shares: {} as any,
      tasks: {
        getAllTasks: jest.fn(),
        getProjectTasks: jest.fn(),
        createTask: jest.fn(),
        updateTaskLabels: jest.fn(),
        bulkAssignUsersToTask: jest.fn(),
        getTask: jest.fn(),
        deleteTask: jest.fn(),
        updateTask: jest.fn(),
        removeUserFromTask: jest.fn(),
        getTaskComments: jest.fn(),
        createTaskComment: jest.fn(),
        bulkUpdateTasks: jest.fn(),
      },
    } as MockVikunjaClient;

    (getClientFromContext as jest.Mock).mockReturnValue(mockClient);
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);

    // Register the tool
    registerTasksTool(mockServer as any, mockAuthManager);

    // Capture the tool handler
    expect(mockServer.tool).toHaveBeenCalledWith(
      'vikunja_tasks',
      expect.any(Object),
      expect.any(Function),
    );
    toolHandler = mockServer.tool.mock.calls[0][2];
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  describe('create subcommand - race condition handling', () => {
    it('should rollback task creation if label assignment fails', async () => {
      const createdTask = {
        id: 123,
        title: 'Test Task',
        project_id: 1,
      };

      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('Label assignment failed'));

      const args = {
        subcommand: 'create',
        projectId: 1,
        title: 'Test Task',
        labels: [1, 2, 3],
      };

      // Should throw error with rollback success message
      await expect(toolHandler(args)).rejects.toThrow(MCPError);
      await expect(toolHandler(args)).rejects.toThrow(
        'Failed to complete task creation: Label assignment failed. Task was successfully rolled back.',
      );

      // Verify cleanup was attempted
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(123);
    });

    it('should rollback task creation if assignee assignment fails', async () => {
      const createdTask = {
        id: 456,
        title: 'Test Task',
        project_id: 1,
      };

      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      mockClient.tasks.updateTaskLabels.mockResolvedValue({});
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(new Error('User assignment failed'));

      const args = {
        subcommand: 'create',
        projectId: 1,
        title: 'Test Task',
        labels: [1, 2],
        assignees: [10, 20],
      };

      // Should throw error with rollback success message
      await expect(toolHandler(args)).rejects.toThrow(MCPError);
      await expect(toolHandler(args)).rejects.toThrow(
        'Failed to complete task creation: User assignment failed. Task was successfully rolled back.',
      );

      // Verify cleanup was attempted
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(456);
    });

    it('should include error details when rollback fails', async () => {
      const createdTask = {
        id: 789,
        title: 'Test Task',
        project_id: 1,
      };

      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('Label assignment failed'));
      mockClient.tasks.deleteTask.mockRejectedValue(new Error('Delete failed'));

      const args = {
        subcommand: 'create',
        projectId: 1,
        title: 'Test Task',
        labels: [1, 2, 3],
      };

      // Should still throw the original error with rollback status
      await expect(toolHandler(args)).rejects.toThrow(
        'Failed to complete task creation: Label assignment failed. Task rollback also failed - manual cleanup may be required.',
      );

      // Verify cleanup was attempted and error was logged
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(789);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Failed to clean up partially created task:'),
      );
    });

    it('should validate assignee IDs before creating task', async () => {
      const args = {
        subcommand: 'create',
        projectId: 1,
        title: 'Test Task',
        assignees: ['invalid', 'abc'],
      };

      // Should throw validation error before creating task
      await expect(toolHandler(args)).rejects.toThrow(MCPError);
      await expect(toolHandler(args)).rejects.toThrow('assignee ID must be a positive integer');

      // Verify task was NOT created
      expect(mockClient.tasks.createTask).not.toHaveBeenCalled();
    });

    it('should successfully create task with labels and assignees when all operations succeed', async () => {
      const createdTask = {
        id: 999,
        title: 'Test Task',
        project_id: 1,
      };

      const completeTask = {
        ...createdTask,
        labels: [{ id: 1, title: 'Label 1' }],
        assignees: [{ id: 10, username: 'user1' }],
      };

      mockClient.tasks.createTask.mockResolvedValue(createdTask);
      mockClient.tasks.updateTaskLabels.mockResolvedValue({});
      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue({});
      mockClient.tasks.getTask.mockResolvedValue(completeTask);

      const args = {
        subcommand: 'create',
        projectId: 1,
        title: 'Test Task',
        labels: [1],
        assignees: [10],
      };

      const result = await toolHandler(args);
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.task.id).toBe(999);
      expect(response.task.labels).toHaveLength(1);
      expect(response.task.assignees).toHaveLength(1);

      // Verify no cleanup was attempted
      expect(mockClient.tasks.deleteTask).not.toHaveBeenCalled();
    });
  });
});
