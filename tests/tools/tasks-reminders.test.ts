/**
 * Task Reminders Tests
 * Tests for task reminder operations
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import { registerTasksTool } from '../../src/tools/tasks';
import { MCPError, ErrorCode } from '../../src/types';
import type { Task } from 'node-vikunja';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';

// Import the functions we're mocking
import { getClientFromContext } from '../../src/client';

// Mock the modules
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
  setGlobalClientFactory: jest.fn(),
  clearGlobalClientFactory: jest.fn(),
}));
jest.mock('../../src/auth/AuthManager');

describe('Tasks Tool - Reminders', () => {
  let mockClient: MockVikunjaClient;
  let mockAuthManager: MockAuthManager;
  let mockServer: MockServer;
  let toolHandler: (args: any) => Promise<any>;

  // Helper function to call a tool
  async function callTool(subcommand: string, args: Record<string, any> = {}) {
    return toolHandler({
      subcommand,
      ...args,
    });
  }

  const mockTask: Task = {
    id: 1,
    title: 'Test Task',
    description: 'Test Task with Reminders',
    done: false,
    doneAt: null,
    priority: 0,
    labels: [],
    assignees: [],
    dueDate: null,
    startDate: null,
    endDate: null,
    repeatAfter: 0,
    repeatFromCurrentDate: false,
    reminderDates: [],
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    bucketId: 0,
    position: 0,
    createdBy: { id: 1, username: 'test', email: '', name: '' },
    project: { id: 1, title: 'Test Project', description: '', isArchived: false },
    isFavorite: false,
    subscription: null,
    attachments: [],
    coverImageAttachmentId: null,
    percentDone: 0,
    relatedTasks: {},
    reactions: {},
    reminders: [],
  };

  const mockTaskWithReminders: Task = {
    ...mockTask,
    reminders: [
      { id: 1, reminder_date: '2024-12-25T10:00:00Z' },
      { id: 2, reminder_date: '2024-12-31T23:59:00Z' },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock Vikunja client
    mockClient = {
      tasks: {
        getTask: jest.fn(),
        updateTask: jest.fn(),
        getAllTasks: jest.fn(),
        getProjectTasks: jest.fn(),
        createTask: jest.fn(),
        deleteTask: jest.fn(),
        updateTaskLabels: jest.fn(),
        bulkAssignUsersToTask: jest.fn(),
        removeUserFromTask: jest.fn(),
        createTaskComment: jest.fn(),
        getTaskComments: jest.fn(),
      },
      projects: {
        getAllProjects: jest.fn(),
        createProject: jest.fn(),
      },
      labels: {
        getAllLabels: jest.fn(),
      },
      teams: {
        getAllTeams: jest.fn(),
      },
      users: {
        getAllUsers: jest.fn(),
      },
    } as any;

    // Create mock auth manager
    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getSession: jest.fn().mockReturnValue({
        apiUrl: 'https://api.vikunja.io',
        apiToken: 'test-token',
      }),
    } as any;

    // Setup mock server
    mockServer = {
      tool: jest.fn() as jest.MockedFunction<(name: string, description: string, schema: any, handler: any) => void>,
    } as any;

    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);
    registerTasksTool(mockServer as McpServer, mockAuthManager as AuthManager);

    // Get the tool handler
    expect(mockServer.tool).toHaveBeenCalledWith(
      'vikunja_tasks',
      'Manage tasks with comprehensive operations (create, update, delete, list, assign, attach files, comment, bulk operations)',
      expect.any(Object),
      expect.any(Function),
    );
    const calls = mockServer.tool.mock.calls;
    if (calls.length > 0 && calls[0] && calls[0].length > 3) {
      toolHandler = calls[0][3];
    } else {
      throw new Error('Tool handler not found');
    }
  });

  describe('add-reminder', () => {
    it('should add a reminder to a task', async () => {
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTask);
      mockClient.tasks.updateTask.mockResolvedValueOnce({
        ...mockTask,
        reminders: [
          { id: 1, reminder: '2024-12-25T10:00:00Z', reminder_date: '2024-12-25T10:00:00Z' },
        ],
      });
      mockClient.tasks.getTask.mockResolvedValueOnce({
        ...mockTask,
        reminders: [
          { id: 1, reminder: '2024-12-25T10:00:00Z', reminder_date: '2024-12-25T10:00:00Z' },
        ],
      });

      const result = await callTool('add-reminder', {
        id: 1,
        reminderDate: '2024-12-25T10:00:00Z',
      });

      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          reminders: [{ reminder: '2024-12-25T10:00:00Z' }],
        }),
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('add-reminder');
      expect(response.message).toContain('Reminder added successfully');
      expect(response.task.reminders).toHaveLength(1);
    });

    it('should add multiple reminders to a task', async () => {
      const taskWithOneReminder = {
        ...mockTask,
        reminders: [{ id: 1, reminder_date: '2024-12-25T10:00:00Z' }],
      };

      mockClient.tasks.getTask.mockResolvedValueOnce(taskWithOneReminder);
      mockClient.tasks.updateTask.mockResolvedValueOnce(mockTaskWithReminders);
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTaskWithReminders);

      const result = await callTool('add-reminder', {
        id: 1,
        reminderDate: '2024-12-31T23:59:00Z',
      });

      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          reminders: [
            { id: 1, reminder_date: '2024-12-25T10:00:00Z' },
            { reminder: '2024-12-31T23:59:00Z' },
          ],
        }),
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.task.reminders).toHaveLength(2);
    });

    it('should require task id', async () => {
      await expect(
        callTool('add-reminder', {
          reminderDate: '2024-12-25T10:00:00Z',
        }),
      ).rejects.toThrow(MCPError);
    });

    it('should require reminder date', async () => {
      await expect(
        callTool('add-reminder', {
          id: 1,
        }),
      ).rejects.toThrow(MCPError);
    });

    it('should validate reminder date format', async () => {
      await expect(
        callTool('add-reminder', {
          id: 1,
          reminderDate: 'invalid-date',
        }),
      ).rejects.toThrow(MCPError);
    });
  });

  describe('remove-reminder', () => {
    it('should remove a reminder from a task', async () => {
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTaskWithReminders);
      mockClient.tasks.updateTask.mockResolvedValueOnce({
        ...mockTask,
        reminders: [{ id: 2, reminder_date: '2024-12-31T23:59:00Z' }],
      });
      mockClient.tasks.getTask.mockResolvedValueOnce({
        ...mockTask,
        reminders: [{ id: 2, reminder_date: '2024-12-31T23:59:00Z' }],
      });

      const result = await callTool('remove-reminder', {
        id: 1,
        reminderId: 1,
      });

      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          reminders: [{ id: 2, reminder_date: '2024-12-31T23:59:00Z' }],
        }),
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('remove-reminder');
      expect(response.message).toContain('Reminder 1 removed successfully');
      expect(response.task.reminders).toHaveLength(1);
    });

    it('should handle removing all reminders', async () => {
      const taskWithOneReminder = {
        ...mockTask,
        reminders: [{ id: 1, reminder_date: '2024-12-25T10:00:00Z' }],
      };

      mockClient.tasks.getTask.mockResolvedValueOnce(taskWithOneReminder);
      mockClient.tasks.updateTask.mockResolvedValueOnce(mockTask);
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTask);

      const result = await callTool('remove-reminder', {
        id: 1,
        reminderId: 1,
      });

      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          reminders: [],
        }),
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.task.reminders).toHaveLength(0);
    });

    it('should require task id', async () => {
      await expect(
        callTool('remove-reminder', {
          reminderId: 1,
        }),
      ).rejects.toThrow(MCPError);
    });

    it('should require reminder id', async () => {
      await expect(
        callTool('remove-reminder', {
          id: 1,
        }),
      ).rejects.toThrow(MCPError);
    });

    it('should error if task has no reminders', async () => {
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTask);

      await expect(
        callTool('remove-reminder', {
          id: 1,
          reminderId: 1,
        }),
      ).rejects.toThrow('Task has no reminders to remove');
    });

    it('should error if reminder id not found', async () => {
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTaskWithReminders);

      await expect(
        callTool('remove-reminder', {
          id: 1,
          reminderId: 999,
        }),
      ).rejects.toThrow('Reminder with id 999 not found in task');
    });
  });

  describe('list-reminders', () => {
    it('should list all reminders for a task', async () => {
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTaskWithReminders);

      const result = await callTool('list-reminders', {
        id: 1,
      });

      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list-reminders');
      expect(response.message).toContain('Found 2 reminder(s)');
      expect(response.reminders).toHaveLength(2);
      expect(response.reminders[0]).toEqual({ id: 1, reminder_date: '2024-12-25T10:00:00Z' });
      expect(response.reminders[1]).toEqual({ id: 2, reminder_date: '2024-12-31T23:59:00Z' });
    });

    it('should handle task with no reminders', async () => {
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTask);

      const result = await callTool('list-reminders', {
        id: 1,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Found 0 reminder(s)');
      expect(response.reminders).toHaveLength(0);
    });

    it('should require task id', async () => {
      await expect(callTool('list-reminders')).rejects.toThrow(MCPError);
    });

    it('should include task info in response', async () => {
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTaskWithReminders);

      const result = await callTool('list-reminders', {
        id: 1,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.task).toEqual({
        id: 1,
        title: 'Test Task',
        assignees: [],
      });
    });
  });

  describe('Error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockClient.tasks.getTask.mockRejectedValueOnce(new Error('API Error'));

      await expect(
        callTool('add-reminder', {
          id: 1,
          reminderDate: '2024-12-25T10:00:00Z',
        }),
      ).rejects.toThrow('Failed to add reminder: API Error');
    });

    it('should require authentication', async () => {
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await expect(
        callTool('list-reminders', {
          id: 1,
        }),
      ).rejects.toThrow('Authentication required');
    });

    it('should handle add-reminder API error during task update', async () => {
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTask);
      mockClient.tasks.updateTask.mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        callTool('add-reminder', {
          id: 1,
          reminderDate: '2024-12-25T10:00:00Z',
        }),
      ).rejects.toThrow('Failed to add reminder: Update failed');
    });

    it('should handle remove-reminder API error during task update', async () => {
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTaskWithReminders);
      mockClient.tasks.updateTask.mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        callTool('remove-reminder', {
          id: 1,
          reminderId: 1,
        }),
      ).rejects.toThrow('Failed to remove reminder: Update failed');
    });

    it('should handle generic errors in list-reminders', async () => {
      // Mock a non-Error exception
      mockClient.tasks.getTask.mockImplementation(() => {
        throw 'String error';
      });

      await expect(
        callTool('list-reminders', {
          id: 1,
        }),
      ).rejects.toThrow('Failed to list reminders: String error');
    });
  });
});
