import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import { registerTasksTool } from '../../src/tools/tasks';
import { getVikunjaClient } from '../../src/client';
import type { Task } from 'node-vikunja';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';

// Mock the modules
jest.mock('../../src/client', () => ({
  getVikunjaClient: jest.fn(),
  setAuthManager: jest.fn(),
  cleanupVikunjaClient: jest.fn(),
}));
jest.mock('../../src/auth/AuthManager');
jest.mock('../../src/utils/logger');
jest.mock('../../src/storage/FilterStorage');

describe('Tasks Tool - Authentication Errors', () => {
  let mockClient: MockVikunjaClient;
  let mockAuthManager: MockAuthManager;
  let mockServer: MockServer;
  let toolHandler: (args: any) => Promise<any>;

  const mockTask: Task = {
    id: 1,
    title: 'Test Task',
    description: 'Test Description',
    done: false,
    priority: 1,
    project_id: 1,
  } as Task;

  beforeEach(() => {
    // Setup mock client
    mockClient = {
      getToken: jest.fn().mockReturnValue('test-token'),
      projects: {
        getProjects: jest.fn(),
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
        getLabels: jest.fn(),
        getLabel: jest.fn(),
        createLabel: jest.fn(),
        updateLabel: jest.fn(),
        deleteLabel: jest.fn(),
      },
      users: {
        getAll: jest.fn(),
      },
      teams: {
        getAll: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      shares: {
        getShareAuth: jest.fn(),
      },
      tasks: {
        getAllTasks: jest.fn(),
        getProjectTasks: jest.fn(),
        createTask: jest.fn(),
        getTask: jest.fn(),
        updateTask: jest.fn(),
        deleteTask: jest.fn(),
        updateTaskLabels: jest.fn(),
        bulkAssignUsersToTask: jest.fn(),
        removeUserFromTask: jest.fn(),
        getTaskComments: jest.fn(),
        createTaskComment: jest.fn(),
        bulkUpdateTasks: jest.fn(),
      },
    } as MockVikunjaClient;

    // Setup mock auth manager
    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getSession: jest.fn().mockReturnValue({
        apiUrl: 'http://test.vikunja.io',
        apiToken: 'test-token',
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

    // Mock getVikunjaClient
    (getVikunjaClient as jest.Mock).mockReturnValue(mockClient);

    // Setup mock server
    mockServer = {
      tool: jest.fn(),
    } as MockServer;

    // Register the tool
    registerTasksTool(mockServer as any, mockAuthManager);

    // Get the tool handler
    const calls = mockServer.tool.mock.calls;
    if (calls.length > 0 && calls[0] && calls[0].length > 2) {
      toolHandler = calls[0][2];
    } else {
      throw new Error('Tool handler not found');
    }
  });

  describe('Assignee Authentication Errors', () => {
    it('should handle auth error when creating task with assignees', async () => {
      mockClient.tasks.createTask.mockResolvedValue({
        id: 1,
        title: 'Test Task',
        project_id: 1,
      });

      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(
        new Error('401 Unauthorized: Token invalid'),
      );

      await expect(
        toolHandler({
          subcommand: 'create',
          projectId: 1,
          title: 'Test Task',
          assignees: [1, 2],
        }),
      ).rejects.toThrow(
        'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
          'This is a known limitation. The task was created but assignees could not be added. ' +
          'Task ID: 1',
      );
    });

    it('should handle auth error when updating task assignees', async () => {
      mockClient.tasks.getTask.mockResolvedValue({
        ...mockTask,
        assignees: [{ id: 3, username: 'old-user' }],
      });
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);
      mockClient.tasks.removeUserFromTask.mockResolvedValue({});
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(new Error('403 Forbidden'));

      await expect(
        toolHandler({
          subcommand: 'update',
          id: 1,
          assignees: [1, 2],
        }),
      ).rejects.toThrow(
        'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
          'This is a known limitation. Other task fields were updated but assignees could not be changed.',
      );
    });

    it('should handle auth error in assign subcommand', async () => {
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(
        new Error('missing, malformed, expired or otherwise invalid token provided'),
      );

      await expect(
        toolHandler({
          subcommand: 'assign',
          id: 1,
          assignees: [1, 2],
        }),
      ).rejects.toThrow(
        'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
          'This is a known limitation that prevents assigning users to tasks.',
      );
    });

    it('should handle auth error in bulk-update for assignees', async () => {
      // Make bulkUpdateTasks fail to force fallback to individual updates
      mockClient.tasks.bulkUpdateTasks.mockRejectedValue(new Error('Bulk API not available'));

      // First getTask call to get current task for update
      mockClient.tasks.getTask
        .mockResolvedValueOnce({
          ...mockTask,
          assignees: [],
        })
        // Second getTask call for assignee operation
        .mockResolvedValueOnce({
          ...mockTask,
          assignees: [{ id: 3, username: 'old-user' }],
        })
        // Third getTask call after failed update (for fetching results)
        .mockResolvedValueOnce({
          ...mockTask,
          assignees: [],
        });
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);
      mockClient.tasks.removeUserFromTask.mockResolvedValue({});
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(new Error('401 Unauthorized'));

      await expect(
        toolHandler({
          subcommand: 'bulk-update',
          taskIds: [1],
          field: 'assignees',
          value: [1, 2],
        }),
      ).rejects.toThrow(
        'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
          'This is a known limitation that prevents bulk updating assignees.',
      );
    });

    it('should handle auth error in bulk-create with assignees', async () => {
      mockClient.tasks.createTask.mockResolvedValue({
        id: 1,
        title: 'Test Task',
        project_id: 1,
      });
      mockClient.tasks.updateTaskLabels.mockResolvedValue({});
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(new Error('token expired'));

      await expect(
        toolHandler({
          subcommand: 'bulk-create',
          projectId: 1,
          tasks: [
            {
              title: 'Test Task',
              assignees: [1, 2],
            },
          ],
        }),
      ).rejects.toThrow(
        'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
          'This is a known limitation. The task was created but assignees could not be added. ' +
          'Task ID: 1',
      );
    });

    it('should handle auth error when removing assignees', async () => {
      mockClient.tasks.removeUserFromTask.mockRejectedValue(new Error('401 Unauthorized'));

      await expect(
        toolHandler({
          subcommand: 'unassign',
          id: 1,
          assignees: [1, 2],
        }),
      ).rejects.toThrow(
        'Assignee removal operations may have authentication issues with certain Vikunja API versions. ' +
          'This is a known limitation that prevents removing users from tasks.',
      );
    });

    it('should handle auth error when removing old assignees during update', async () => {
      // First call returns task with old assignee
      mockClient.tasks.getTask
        .mockResolvedValueOnce({
          ...mockTask,
          assignees: [{ id: 3, username: 'old-user' }],
        })
        // Second call (for assignee update) also returns task with old assignee
        .mockResolvedValueOnce({
          ...mockTask,
          assignees: [{ id: 3, username: 'old-user' }],
        });
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);
      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue({});
      mockClient.tasks.removeUserFromTask.mockRejectedValue(new Error('403 Forbidden'));

      await expect(
        toolHandler({
          subcommand: 'update',
          id: 1,
          assignees: [1, 2],
        }),
      ).rejects.toThrow(
        'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
          'This is a known limitation. Other task fields were updated but assignees could not be changed.',
      );
    });
  });

  describe('Label Update Authentication Errors', () => {
    it('should handle auth error when creating task with labels', async () => {
      mockClient.tasks.createTask.mockResolvedValue({
        id: 1,
        title: 'Test Task',
        project_id: 1,
      });

      mockClient.tasks.updateTaskLabels.mockRejectedValue(
        new Error('401 Unauthorized: Token invalid'),
      );

      await expect(
        toolHandler({
          subcommand: 'create',
          projectId: 1,
          title: 'Test Task',
          labels: [1, 2],
        }),
      ).rejects.toThrow(
        'Label operations may have authentication issues with certain Vikunja API versions. ' +
          'This is a known limitation. The task was created but labels could not be added. ' +
          'Task ID: 1',
      );
    });

    it('should handle auth error when updating task labels', async () => {
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('403 Forbidden'));

      await expect(
        toolHandler({
          subcommand: 'update',
          id: 1,
          labels: [1, 2],
        }),
      ).rejects.toThrow(
        'Label operations may have authentication issues with certain Vikunja API versions. ' +
          'This is a known limitation. Other task fields were updated but labels could not be changed.',
      );
    });

    it('should handle various auth error messages for labels', async () => {
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);

      const authErrors = [
        'token expired',
        'authentication failed',
        'unauthorized access',
        'AUTH_REQUIRED',
      ];

      for (const errorMsg of authErrors) {
        mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error(errorMsg));

        await expect(
          toolHandler({
            subcommand: 'update',
            id: 1,
            labels: [1, 2],
          }),
        ).rejects.toThrow('Label operations may have authentication issues');
      }
    });
  });

  describe('Bulk Operations Authentication Errors', () => {
    it('should handle auth error in bulk update', async () => {
      // Make bulkUpdateTasks fail to force fallback to individual updates
      mockClient.tasks.bulkUpdateTasks.mockRejectedValue(new Error('Bulk API not available'));

      mockClient.tasks.getTask.mockResolvedValue({ id: 1, title: 'Task 1', project_id: 1 });
      mockClient.tasks.updateTask.mockRejectedValue(new Error('401 Unauthorized: Invalid token'));

      await expect(
        toolHandler({
          subcommand: 'bulk-update',
          taskIds: [1, 2, 3],
          field: 'done',
          value: true,
        }),
      ).rejects.toThrow('Bulk update failed. Could not update any tasks');
    });

    it('should handle token errors in bulk operations', async () => {
      // Make bulkUpdateTasks fail to force fallback to individual updates
      mockClient.tasks.bulkUpdateTasks.mockRejectedValue(new Error('Bulk API not available'));

      mockClient.tasks.getTask.mockResolvedValue({ id: 1, title: 'Task 1', project_id: 1 });
      mockClient.tasks.updateTask.mockRejectedValue(new Error('Token validation failed'));

      await expect(
        toolHandler({
          subcommand: 'bulk-update',
          taskIds: [1, 2],
          field: 'priority',
          value: 3,
        }),
      ).rejects.toThrow('Bulk update failed. Could not update any tasks');
    });

    it('should handle auth errors in individual bulk update calls', async () => {
      // Make bulkUpdateTasks fail to force fallback to individual updates
      mockClient.tasks.bulkUpdateTasks.mockRejectedValue(new Error('Bulk API not available'));

      // Test auth error in individual update
      mockClient.tasks.getTask.mockResolvedValue({ id: 1, title: 'Task 1', project_id: 1 });
      mockClient.tasks.updateTask.mockRejectedValue(new Error('401 Unauthorized'));

      await expect(
        toolHandler({
          subcommand: 'bulk-update',
          taskIds: [1, 2],
          field: 'done',
          value: true,
        }),
      ).rejects.toThrow('Bulk update failed. Could not update any tasks');
    });
  });

  describe('Non-auth errors should not trigger auth error handling', () => {
    it('should not treat network errors as auth errors for assignees', async () => {
      mockClient.tasks.createTask.mockResolvedValue({
        id: 1,
        title: 'Test Task',
        project_id: 1,
      });

      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(new Error('Network timeout'));

      // This should NOT throw an auth-specific error
      await expect(
        toolHandler({
          subcommand: 'create',
          projectId: 1,
          title: 'Test Task',
          assignees: [1, 2],
        }),
      ).rejects.toThrow(/Failed to complete task creation/);
    });

    it('should not treat validation errors as auth errors for assignees', async () => {
      mockClient.tasks.getTask.mockResolvedValue({
        ...mockTask,
        assignees: [],
      });
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(new Error('Invalid user ID'));

      // This should NOT throw an auth-specific error
      await expect(
        toolHandler({
          subcommand: 'update',
          id: 1,
          assignees: [999999],
        }),
      ).rejects.toThrow('Failed to update task: Invalid user ID');
    });

    it('should not treat network errors as auth errors', async () => {
      mockClient.tasks.createTask.mockResolvedValue({
        id: 1,
        title: 'Test Task',
        project_id: 1,
      });

      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('Network timeout'));

      // This should NOT throw an auth-specific error
      await expect(
        toolHandler({
          subcommand: 'create',
          projectId: 1,
          title: 'Test Task',
          labels: [1, 2],
        }),
      ).rejects.toThrow(/Failed to complete task creation/);
    });

    it('should not treat validation errors as auth errors', async () => {
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('Invalid label ID'));

      // This should NOT throw an auth-specific error
      await expect(
        toolHandler({
          subcommand: 'update',
          id: 1,
          labels: [999999],
        }),
      ).rejects.toThrow('Failed to update task: Invalid label ID');
    });

    it('should not treat server errors as auth errors in bulk operations', async () => {
      // Make bulkUpdateTasks fail to force fallback to individual updates
      mockClient.tasks.bulkUpdateTasks.mockRejectedValue(new Error('Bulk API not available'));

      mockClient.tasks.getTask.mockResolvedValue({ id: 1, title: 'Task 1', project_id: 1 });
      mockClient.tasks.updateTask.mockRejectedValue(new Error('Internal server error'));

      // This should NOT throw an auth-specific error
      await expect(
        toolHandler({
          subcommand: 'bulk-update',
          taskIds: [1, 2],
          field: 'done',
          value: true,
        }),
      ).rejects.toThrow('Bulk update failed. Could not update any tasks');
    });
  });
});
