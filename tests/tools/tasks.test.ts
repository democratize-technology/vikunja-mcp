import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import { registerTasksTool } from '../../src/tools/tasks';
import { MCPError, ErrorCode } from '../../src/types';
import type { Task, User } from 'node-vikunja';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';

// Import the function we're mocking
import { getClientFromContext } from '../../src/client';

// Mock the modules
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
  setGlobalClientFactory: jest.fn(),
  clearGlobalClientFactory: jest.fn(),
}));
jest.mock('../../src/auth/AuthManager');

describe('Tasks Tool', () => {
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
    repeatFromCurrentDate: false,
    reminderDates: [],
    hexColor: '',
    percentDone: 0,
    relatedTasks: {},
    attachments: [],
    coverImageAttachmentId: null,
    identifier: 'TASK-1',
    index: 1,
    isFavorite: false,
    subscription: null,
    position: 0,
    kanbanPosition: 0,
    reactions: {},
    createdBy: {
      id: 1,
      username: 'user1',
      email: 'user1@example.com',
      name: 'User One',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    bucketId: 0,
    projectId: 1,
    project_id: 1,
  } as any;

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  const mockComment = {
    id: 1,
    comment: 'Test comment',
    author: mockUser,
    taskId: 1,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    reactions: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock client
    mockClient = {
      getToken: jest.fn().mockReturnValue('test-token'),
      tasks: {
        getAllTasks: jest.fn(),
        getProjectTasks: jest.fn(),
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
    } as MockVikunjaClient;

    // Setup mock auth manager
    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getSession: jest.fn().mockReturnValue({
        apiUrl: 'https://api.vikunja.test',
        apiToken: 'test-token',
        authType: 'api-token' as const,
        userId: 'test-user-123'
      }),
      getAuthType: jest.fn().mockReturnValue('api-token'),
      connect: jest.fn(),
      disconnect: jest.fn(),
      getStatus: jest.fn(),
      saveSession: jest.fn(),
      setTestUserId: jest.fn(),
      setTestTokenExpiry: jest.fn(),
      getTestUserId: jest.fn(),
      getTestTokenExpiry: jest.fn(),
      updateSessionProperty: jest.fn(),
    } as MockAuthManager;

    // Mock getClientFromContext
    (getClientFromContext as jest.Mock).mockReturnValue(mockClient);
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);

    // Setup mock server
    mockServer = {
      tool: jest.fn() as jest.MockedFunction<(name: string, schema: any, handler: any) => void>,
    } as MockServer;

    // Register the tool
    registerTasksTool(mockServer, mockAuthManager);

    // Get the tool handler
    expect(mockServer.tool).toHaveBeenCalledWith(
      'vikunja_tasks',
      expect.any(Object),
      expect.any(Function),
    );
    const calls = mockServer.tool.mock.calls;
    if (calls.length > 0 && calls[0] && calls[0].length > 2) {
      toolHandler = calls[0][2];
    } else {
      throw new Error('Tool handler not found');
    }
  });

  describe('list subcommand', () => {
    it('should filter tasks by done status', async () => {
      const mockTasks: Task[] = [
        { ...mockTask, done: true },
        { ...mockTask, id: 2, done: false },
      ];
      mockClient.tasks.getAllTasks.mockResolvedValue(mockTasks);

      const result = await callTool('list', { done: true });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list');
      expect(response.metadata.count).toBe(1);
      expect(response.tasks[0].done).toBe(true);
    });

    it('should include labels and assignees in response', async () => {
      const taskWithDetails = {
        ...mockTask,
        labels: [{ id: 1, title: 'Important' }],
        assignees: [{ id: 1, username: 'user1' }],
      };
      mockClient.tasks.getAllTasks.mockResolvedValue([taskWithDetails]);

      const result = await callTool('list');

      const response = JSON.parse(result.content[0].text);
      expect(response.tasks[0].labels).toEqual([{ id: 1, title: 'Important' }]);
      expect(response.tasks[0].assignees).toEqual([{ id: 1, username: 'user1' }]);
    });
    it('should list tasks with default options', async () => {
      const mockTasks: Task[] = [mockTask];
      mockClient.tasks.getAllTasks.mockResolvedValue(mockTasks);

      const result = await callTool('list');

      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 1000,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list');
      expect(response.metadata.count).toBe(mockTasks.length);
      expect(response.tasks).toHaveLength(mockTasks.length);
    });

    it('should list tasks with all options specified', async () => {
      const mockTasks: Task[] = [mockTask];
      mockClient.tasks.getProjectTasks.mockResolvedValue(mockTasks);

      const result = await callTool('list', {
        projectId: 1,
        page: 2,
        perPage: 25,
        sort: 'dueDate',
        filter: 'priority >= 5',
        search: 'urgent',
      });

      expect(mockClient.tasks.getProjectTasks).toHaveBeenCalledWith(1, {
        page: 2,
        per_page: 25,
        sort_by: 'dueDate',
        s: 'urgent',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list');
      expect(response.metadata.count).toBe(mockTasks.length);
    });

    it('should handle multiple sort fields', async () => {
      const mockTasks: Task[] = [mockTask];
      mockClient.tasks.getAllTasks.mockResolvedValue(mockTasks);

      const result = await callTool('list', {
        sort: 'priority,dueDate',
      });

      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 1000,
        sort_by: 'priority,dueDate',
      });

      expect(result).toBeDefined();
    });

    it('should handle authentication errors', async () => {
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await expect(callTool('list')).rejects.toThrow(
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    });

    it('should handle API errors', async () => {
      mockClient.tasks.getAllTasks.mockRejectedValue(new Error('API Error'));

      await expect(callTool('list')).rejects.toThrow('Failed to list tasks: API Error');
    });

    it('should handle non-Error API errors', async () => {
      mockClient.tasks.getAllTasks.mockRejectedValue('String error');

      await expect(callTool('list')).rejects.toThrow('Failed to list tasks: String error');
    });
  });

  describe('create subcommand', () => {
    it('should validate date format', async () => {
      await expect(
        callTool('create', {
          title: 'Test',
          projectId: 1,
          dueDate: 'invalid-date',
        }),
      ).rejects.toThrow('dueDate must be a valid ISO 8601 date string');
    });
    it('should create a task with required fields', async () => {
      // Mock createTask to return a task with an id
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask });
      // Mock getTask to return the complete task
      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await callTool('create', {
        title: 'New Task',
        projectId: 1,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'New Task',
        project_id: 1,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Task created successfully');
      expect(response.task).toBeDefined();
    });

    it('should create a task with all optional fields', async () => {
      const fullTask = {
        title: 'Full Task',
        projectId: 1,
        description: 'Full description',
        done: false,
        priority: 5, // Changed from 10 to 5 (max allowed)
        labels: [1, 2],
        assignees: [1, 2],
        dueDate: '2025-01-01T00:00:00Z',
        startDate: '2024-12-01T00:00:00Z',
        endDate: '2025-01-31T00:00:00Z',
        repeatAfter: 86400,
        repeatFromCurrentDate: true,
        reminderDates: ['2024-12-25T00:00:00Z'],
        hexColor: '#FF0000',
        relatedTasks: { related: [2, 3] },
        bucketId: 1,
        position: 100,
      };

      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 1 });
      mockClient.tasks.getTask.mockResolvedValue({ ...mockTask, ...fullTask });
      mockClient.tasks.updateTaskLabels.mockResolvedValue(undefined);
      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue(undefined);

      await callTool('create', fullTask);

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          title: 'Full Task',
          project_id: 1,
        }),
      );
    });

    it('should validate required fields', async () => {
      await expect(callTool('create', {})).rejects.toThrow();
      await expect(callTool('create', { title: 'Test' })).rejects.toThrow();
      await expect(callTool('create', { projectId: 1 })).rejects.toThrow();
    });

    it('should validate priority range', async () => {
      await expect(
        callTool('create', {
          title: 'Test',
          projectId: 1,
          priority: -1,
        }),
      ).rejects.toThrow();

      await expect(
        callTool('create', {
          title: 'Test',
          projectId: 1,
          priority: 6, // Changed from 11 to 6 (just above max)
        }),
      ).rejects.toThrow();
    });

    it('should handle API errors', async () => {
      mockClient.tasks.createTask.mockRejectedValue(new Error('Creation failed'));

      await expect(
        callTool('create', {
          title: 'Test',
          projectId: 1,
        }),
      ).rejects.toThrow('Failed to create task: Creation failed');
    });

    it('should handle non-Error API errors in create', async () => {
      mockClient.tasks.createTask.mockRejectedValue({ status: 500, message: 'Server error' });

      await expect(
        callTool('create', {
          title: 'Test',
          projectId: 1,
        }),
      ).rejects.toThrow('Failed to create task: [object Object]');
    });

    it('should rollback task creation when label assignment fails', async () => {
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 1 });
      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('Label assignment failed'));
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      await expect(
        callTool('create', {
          title: 'Test',
          projectId: 1,
          labels: [1, 2],
        }),
      ).rejects.toThrow(
        'Failed to complete task creation: Label assignment failed. Task was successfully rolled back.',
      );

      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
    });

    it('should handle failed rollback when assignee assignment fails', async () => {
      // Spy on console.error to suppress expected error output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 1 });
      mockClient.tasks.updateTaskLabels.mockResolvedValue(undefined);
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(
        new Error('Assignee assignment failed'),
      );
      mockClient.tasks.deleteTask.mockRejectedValue(new Error('Delete failed'));

      await expect(
        callTool('create', {
          title: 'Test',
          projectId: 1,
          labels: [1],
          assignees: [1, 2],
        }),
      ).rejects.toThrow(
        'Failed to complete task creation: Assignee assignment failed. Task rollback also failed - manual cleanup may be required.',
      );

      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Failed to clean up partially created task:'),
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle task creation with no ID returned', async () => {
      // Mock createTask to return a task without an id
      const taskWithoutId = { ...mockTask, id: undefined };
      mockClient.tasks.createTask.mockResolvedValue(taskWithoutId);

      const result = await callTool('create', {
        title: 'New Task',
        projectId: 1,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'New Task',
        project_id: 1,
      });

      // Should not call getTask when there's no ID
      expect(mockClient.tasks.getTask).not.toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Task created successfully');
      expect(response.task).toBeDefined();
    });

    it('should handle non-Error failures during label assignment', async () => {
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 1 });
      mockClient.tasks.updateTaskLabels.mockRejectedValue('Label update failed');
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      await expect(
        callTool('create', {
          title: 'Test',
          projectId: 1,
          labels: [1, 2],
        }),
      ).rejects.toThrow(
        'Failed to complete task creation: Label update failed. Task was successfully rolled back.',
      );

      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
    });

    it('should create task with recurring settings', async () => {
      const recurringTask = {
        title: 'Daily Standup',
        projectId: 1,
        repeatAfter: 1,
        repeatMode: 'day' as const,
      };

      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 1 });
      mockClient.tasks.getTask.mockResolvedValue({
        ...mockTask,
        id: 1,
        title: 'Daily Standup',
        repeat_after: 1,
        repeat_mode: 'day',
      });

      const result = await callTool('create', recurringTask);

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          title: 'Daily Standup',
          project_id: 1,
          repeat_after: 1 * 24 * 60 * 60, // 1 day in seconds
          repeat_mode: 0, // Default mode
        }),
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.task.repeat_after).toBe(1);
      expect(response.task.repeat_mode).toBe('day');
    });

    it('should validate repeatAfter is non-negative', async () => {
      await expect(
        callTool('create', {
          title: 'Test',
          projectId: 1,
          repeatAfter: -1,
          repeatMode: 'day',
        }),
      ).rejects.toThrow();
    });

    it('should validate repeatMode values', async () => {
      await expect(
        callTool('create', {
          title: 'Test',
          projectId: 1,
          repeatAfter: 1,
          repeatMode: 'invalid',
        }),
      ).rejects.toThrow();
    });
  });

  describe('get subcommand', () => {
    it('should return full task details including all fields', async () => {
      const detailedTask = {
        ...mockTask,
        hex_color: '#FF0000',
        labels: [{ id: 1, title: 'Label1', hex_color: '#00FF00' }],
        assignees: [{ id: 1, username: 'user1', email: 'user1@test.com' }],
        attachments: [{ id: 1, file_name: 'test.pdf', file_size: 1024, created_by: 1 }],
        created_by: 1,
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-02T00:00:00Z',
      };
      mockClient.tasks.getTask.mockResolvedValue(detailedTask);

      const result = await callTool('get', { id: 1 });

      const response = JSON.parse(result.content[0].text);
      expect(response.operation).toBe('get');
      expect(response.task.hex_color).toBe('#FF0000');
      expect(response.task.labels[0].hex_color).toBe('#00FF00');
      expect(response.task.assignees[0].email).toBe('user1@test.com');
      expect(response.task.attachments).toHaveLength(1);
      expect(response.task.attachments[0].file_name).toBe('test.pdf');
      expect(response.task.created_by).toBe(1);
      expect(response.task.created).toBe('2024-01-01T00:00:00Z');
      expect(response.task.updated).toBe('2024-01-02T00:00:00Z');
    });
    it('should get a task by ID', async () => {
      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      const result = await callTool('get', { id: 1 });

      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.task).toBeDefined();
      expect(response.task.id).toBe(1);
    });

    it('should handle task not found', async () => {
      mockClient.tasks.getTask.mockRejectedValue(new Error('Task not found'));

      await expect(callTool('get', { id: 999 })).rejects.toThrow(
        'Failed to get task: Task not found',
      );
    });

    it('should handle non-Error API errors in get', async () => {
      mockClient.tasks.getTask.mockRejectedValue({ code: 404 });

      await expect(callTool('get', { id: 1 })).rejects.toThrow(
        'Failed to get task: [object Object]',
      );
    });

    it('should validate task ID', async () => {
      await expect(callTool('get', {})).rejects.toThrow();
      await expect(callTool('get', { id: 'invalid' })).rejects.toThrow();
    });
  });

  describe('update subcommand', () => {
    it('should validate date format when updating', async () => {
      mockClient.tasks.getTask.mockResolvedValue(mockTask);

      await expect(
        callTool('update', {
          id: 1,
          dueDate: 'not-a-date',
        }),
      ).rejects.toThrow('dueDate must be a valid ISO 8601 date string');
    });

    it('should handle boolean false for done field', async () => {
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockResolvedValue({ ...mockTask, done: false });

      const result = await callTool('update', {
        id: 1,
        done: false,
      });

      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, 
        expect.objectContaining({ done: false })
      );
      const response = JSON.parse(result.content[0].text);
      expect(response.task.done).toBe(false);
    });

    it('should handle invalid done values', async () => {
      // The schema validation should reject non-boolean values
      await expect(
        callTool('update', {
          id: 1,
          done: 'invalid' as any,
        }),
      ).rejects.toThrow();
    });
    it('should update a task with simple fields', async () => {
      const updatedTask = { ...mockTask, title: 'Updated Title' };
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTask).mockResolvedValueOnce(updatedTask);
      mockClient.tasks.updateTask.mockResolvedValue(updatedTask);

      const result = await callTool('update', {
        id: 1,
        title: 'Updated Title',
      });

      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, {
        ...mockTask,
        title: 'Updated Title',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.task).toBeDefined();
    });

    it('should update a task with all optional fields', async () => {
      const updatedTask = {
        ...mockTask,
        title: 'Updated Title',
        description: 'Updated Description',
        dueDate: '2025-01-01T00:00:00Z',
        priority: 3,
        done: true,
      };
      mockClient.tasks.getTask.mockResolvedValueOnce(mockTask).mockResolvedValueOnce(updatedTask);
      mockClient.tasks.updateTask.mockResolvedValue(updatedTask);

      const result = await callTool('update', {
        id: 1,
        title: 'Updated Title',
        description: 'Updated Description',
        dueDate: '2025-01-01T00:00:00Z',
        priority: 3,
        done: true,
      });

      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, {
        ...mockTask,
        title: 'Updated Title',
        description: 'Updated Description',
        due_date: '2025-01-01T00:00:00Z',
        priority: 3,
        done: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.task).toBeDefined();
    });

    it('should handle assignee updates with diff logic', async () => {
      const taskWithAssignees = {
        ...mockTask,
        assignees: [
          {
            id: 1,
            username: 'user1',
            email: 'user1@example.com',
            name: 'User One',
            created: '',
            updated: '',
          },
          {
            id: 2,
            username: 'user2',
            email: 'user2@example.com',
            name: 'User Two',
            created: '',
            updated: '',
          },
        ],
      };

      mockClient.tasks.getTask.mockResolvedValue(taskWithAssignees);
      mockClient.tasks.updateTask.mockResolvedValue(taskWithAssignees);

      // Test adding new assignees
      await callTool('update', {
        id: 1,
        assignees: [1, 2, 3],
      });

      // Should call bulkAssignUsersToTask for new user (3)
      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(1, {
        user_ids: [3],
      });

      // Test removing assignees
      jest.clearAllMocks();
      mockClient.tasks.getTask.mockResolvedValue(taskWithAssignees);

      await callTool('update', {
        id: 1,
        assignees: [1],
      });

      // Should remove user 2
      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(1, 2);
    });

    it('should preserve all fields when marking task as done', async () => {
      // This tests the specific issue from #29
      const taskWithDetails = {
        ...mockTask,
        description: 'Important description',
        priority: 4,
        done: false,
      };

      const doneTask = {
        ...taskWithDetails,
        done: true,
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(taskWithDetails)
        .mockResolvedValueOnce(doneTask);
      mockClient.tasks.updateTask.mockResolvedValue(doneTask);

      const result = await callTool('update', {
        id: 1,
        done: true,
      });

      // Should send the complete task object, not just the done field
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(1, {
        ...taskWithDetails,
        done: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.task.description).toBe('Important description');
      expect(response.task.priority).toBe(4);
      expect(response.task.done).toBe(true);
    });

    it('should handle label updates', async () => {
      const taskWithLabels = {
        ...mockTask,
        labels: [
          {
            id: 1,
            title: 'Label 1',
            description: '',
            hexColor: '#FF0000',
            createdById: 1,
            projectId: 1,
            created: '',
            updated: '',
          },
        ],
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(mockTask)
        .mockResolvedValueOnce(taskWithLabels);
      mockClient.tasks.updateTask.mockResolvedValue(taskWithLabels);

      await callTool('update', {
        id: 1,
        labels: [1, 2],
      });

      // Labels are updated via updateTaskLabels
      expect(mockClient.tasks.updateTaskLabels).toHaveBeenCalledWith(1, {
        label_ids: [1, 2],
      });
    });

    it('should handle assignee removal failures during update', async () => {
      // Mock task with existing assignees
      const taskWithAssignees = {
        ...mockTask,
        id: 1,
        assignees: [{ id: 1, username: 'user1' }, { id: 2, username: 'user2' }],
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(taskWithAssignees) // For initial fetch
        .mockResolvedValueOnce(taskWithAssignees); // For assignee diff calculation
      mockClient.tasks.updateTask.mockResolvedValue(taskWithAssignees);
      
      // Mock removeUserFromTask to fail
      mockClient.tasks.removeUserFromTask.mockRejectedValue(new Error('Failed to remove user'));

      await expect(
        callTool('update', {
          id: 1,
          assignees: [2], // Remove user 1, keep user 2
        }),
      ).rejects.toThrow('Failed to update task: Failed to remove user');

      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(1, 1);
    });

    it('should handle assignee updates when current task has no assignees', async () => {
      const taskWithoutAssignees = {
        ...mockTask,
        assignees: undefined,
      };

      mockClient.tasks.getTask.mockResolvedValue(taskWithoutAssignees);
      mockClient.tasks.updateTask.mockResolvedValue(taskWithoutAssignees);

      await callTool('update', {
        id: 1,
        assignees: [1, 2],
      });

      // Should add both assignees
      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(1, {
        user_ids: [1, 2],
      });
    });

    it('should handle update without ID', async () => {
      await expect(
        callTool('update', {
          title: 'Test',
        }),
      ).rejects.toThrow();
    });

    it('should handle non-Error API errors in update', async () => {
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockRejectedValue('Update failed');

      await expect(
        callTool('update', {
          id: 1,
          title: 'Test',
        }),
      ).rejects.toThrow('Failed to update task: Update failed');
    });

    it('should update recurring task settings', async () => {
      const currentTask = {
        ...mockTask,
        repeat_after: 1 * 24 * 60 * 60, // 1 day in seconds
        repeat_mode: 0, // Default mode
      };

      const updatedTask = {
        ...currentTask,
        repeat_after: 7 * 7 * 24 * 60 * 60, // 7 weeks in seconds
        repeat_mode: 0, // Default mode
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(currentTask)
        .mockResolvedValueOnce(updatedTask);
      mockClient.tasks.updateTask.mockResolvedValue(updatedTask);

      const result = await callTool('update', {
        id: 1,
        repeatAfter: 7,
        repeatMode: 'week',
      });

      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          repeat_after: 7 * 7 * 24 * 60 * 60, // 7 weeks in seconds
          repeat_mode: 0, // Default mode
        }),
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.affectedFields).toContain('repeatAfter');
      expect(response.metadata.affectedFields).toContain('repeatMode');
      expect(response.metadata.previousState.repeat_after).toBe(1 * 24 * 60 * 60);
      expect(response.metadata.previousState.repeat_mode).toBe(0);
    });

    it('should track recurring fields in previousState', async () => {
      const currentTask = {
        ...mockTask,
        repeat_after: 1,
        repeat_mode: 'day',
      };

      mockClient.tasks.getTask.mockResolvedValue(currentTask);
      mockClient.tasks.updateTask.mockResolvedValue(currentTask);

      const result = await callTool('update', {
        id: 1,
        title: 'Updated Title',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.previousState).toHaveProperty('repeat_after', 1);
      expect(response.metadata.previousState).toHaveProperty('repeat_mode', 'day');
    });
  });

  describe('delete subcommand', () => {
    it('should delete a task', async () => {
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      const result = await callTool('delete', { id: 1 });

      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('delete');
      expect(response.message).toBe('Task "Test Task" deleted successfully');
      expect(response.task).toBeDefined();
    });

    it('should handle deletion errors', async () => {
      mockClient.tasks.deleteTask.mockRejectedValue(new Error('Cannot delete task'));

      await expect(callTool('delete', { id: 1 })).rejects.toThrow(
        'Failed to delete task: Cannot delete task',
      );
    });

    it('should continue with deletion even if getting task details fails', async () => {
      mockClient.tasks.getTask.mockRejectedValue(new Error('Task not found'));
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      const result = await callTool('delete', { id: 1 });

      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('delete');
      expect(response.message).toBe('Task 1 deleted successfully');
      expect(response.task).toBeUndefined();
    });

    it('should handle non-Error API errors in delete', async () => {
      mockClient.tasks.deleteTask.mockRejectedValue(500);

      await expect(callTool('delete', { id: 1 })).rejects.toThrow('Failed to delete task: 500');
    });

    it('should validate task ID', async () => {
      await expect(callTool('delete', {})).rejects.toThrow();
      await expect(callTool('delete', { id: 'invalid' })).rejects.toThrow();
    });
  });

  describe('assign subcommand', () => {
    it('should assign users to a task', async () => {
      const updatedTask = { ...mockTask, assignees: [mockUser] };

      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue(undefined);
      mockClient.tasks.getTask.mockResolvedValue(updatedTask);

      const result = await callTool('assign', {
        id: 1,
        assignees: [1],
      });

      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(1, {
        user_ids: [1],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Users assigned to task successfully');
      expect(response.task.assignees).toHaveLength(1);
    });

    it('should handle bulk assign errors', async () => {
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(new Error('Failed to assign'));

      await expect(
        callTool('assign', {
          id: 1,
          assignees: [1],
        }),
      ).rejects.toThrow('Failed to assign users to task: Failed to assign');
    });

    it('should handle non-Error API errors in assign', async () => {
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(null);

      await expect(
        callTool('assign', {
          id: 1,
          assignees: [1],
        }),
      ).rejects.toThrow('Failed to assign users to task: null');
    });

    it('should assign multiple users at once', async () => {
      const taskWithMultipleAssignees = {
        ...mockTask,
        assignees: [mockUser, { ...mockUser, id: 2, username: 'user2' }],
      };

      mockClient.tasks.bulkAssignUsersToTask.mockResolvedValue(undefined);
      mockClient.tasks.getTask.mockResolvedValue(taskWithMultipleAssignees);

      const result = await callTool('assign', {
        id: 1,
        assignees: [1, 2],
      });

      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(1, {
        user_ids: [1, 2],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.task.assignees).toHaveLength(2);
    });

    it('should validate parameters', async () => {
      await expect(callTool('assign', {})).rejects.toThrow();
      await expect(callTool('assign', { id: 1 })).rejects.toThrow();
      await expect(callTool('assign', { id: 1, assignees: [] })).rejects.toThrow();
    });
  });

  describe('unassign subcommand', () => {
    it('should unassign users from a task', async () => {
      const updatedTask = { ...mockTask, assignees: [] };

      mockClient.tasks.removeUserFromTask.mockResolvedValue(undefined);
      mockClient.tasks.getTask.mockResolvedValue(updatedTask);

      const result = await callTool('unassign', {
        id: 1,
        assignees: [1],
      });

      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(1, 1);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Users removed from task successfully');
      expect(response.task.assignees).toHaveLength(0);
    });

    it('should unassign multiple users from a task', async () => {
      const updatedTask = { ...mockTask, assignees: [] };

      mockClient.tasks.removeUserFromTask.mockResolvedValue(undefined);
      mockClient.tasks.getTask.mockResolvedValue(updatedTask);

      const result = await callTool('unassign', {
        id: 1,
        assignees: [1, 2, 3],
      });

      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledTimes(3);
      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(1, 1);
      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(1, 2);
      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(1, 3);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('unassign');
    });

    it('should handle unassign errors', async () => {
      mockClient.tasks.removeUserFromTask.mockRejectedValue(new Error('Failed to remove user'));

      await expect(
        callTool('unassign', {
          id: 1,
          assignees: [1],
        }),
      ).rejects.toThrow('Failed to remove users from task: Failed to remove user');
    });

    it('should handle non-Error API errors in unassign', async () => {
      mockClient.tasks.removeUserFromTask.mockRejectedValue('Server error');

      await expect(
        callTool('unassign', {
          id: 1,
          assignees: [1],
        }),
      ).rejects.toThrow('Failed to remove users from task: Server error');
    });

    it('should validate parameters', async () => {
      await expect(callTool('unassign', {})).rejects.toThrow(
        'Task id is required for unassign operation',
      );
      await expect(callTool('unassign', { id: 1 })).rejects.toThrow(
        'At least one assignee (user id) is required to unassign',
      );
      await expect(callTool('unassign', { id: 1, assignees: [] })).rejects.toThrow(
        'At least one assignee (user id) is required to unassign',
      );
    });

    it('should validate assignee IDs', async () => {
      await expect(callTool('unassign', { id: 1, assignees: [0] })).rejects.toThrow(
        'assignee ID must be a positive integer',
      );
      await expect(callTool('unassign', { id: 1, assignees: [-1] })).rejects.toThrow(
        'assignee ID must be a positive integer',
      );
      await expect(callTool('unassign', { id: 1, assignees: [1.5] })).rejects.toThrow(
        'assignee ID must be a positive integer',
      );
    });
  });

  describe('list-assignees subcommand', () => {
    it('should list assignees for a task', async () => {
      const taskWithAssignees = {
        ...mockTask,
        assignees: [mockUser, { id: 2, username: 'user2', email: 'user2@example.com' }],
      };
      mockClient.tasks.getTask.mockResolvedValue(taskWithAssignees);

      const result = await callTool('list-assignees', {
        id: 1,
      });

      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list');
      expect(response.message).toBe('Task has 2 assignee(s)');
      expect(response.task.assignees).toHaveLength(2);
      expect(response.metadata.count).toBe(2);
    });

    it('should handle task with no assignees', async () => {
      const taskWithoutAssignees = {
        ...mockTask,
        assignees: [],
      };
      mockClient.tasks.getTask.mockResolvedValue(taskWithoutAssignees);

      const result = await callTool('list-assignees', {
        id: 1,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Task has 0 assignee(s)');
      expect(response.task.assignees).toHaveLength(0);
      expect(response.metadata.count).toBe(0);
    });

    it('should validate task ID is required', async () => {
      await expect(callTool('list-assignees', {})).rejects.toThrow(
        'Task id is required for list-assignees operation',
      );
    });

    it('should validate task ID format', async () => {
      await expect(callTool('list-assignees', { id: 0 })).rejects.toThrow(
        'id must be a positive integer',
      );
      await expect(callTool('list-assignees', { id: -1 })).rejects.toThrow(
        'id must be a positive integer',
      );
      await expect(callTool('list-assignees', { id: 1.5 })).rejects.toThrow(
        'id must be a positive integer',
      );
    });

    it('should handle API errors', async () => {
      mockClient.tasks.getTask.mockRejectedValue(new Error('API Error'));

      await expect(
        callTool('list-assignees', {
          id: 1,
        }),
      ).rejects.toThrow('Failed to list task assignees: API Error');
    });

    it('should handle non-Error API errors', async () => {
      mockClient.tasks.getTask.mockRejectedValue('Network failure');

      await expect(
        callTool('list-assignees', {
          id: 1,
        }),
      ).rejects.toThrow('Failed to list task assignees: Network failure');
    });

    it('should only return minimal task data with assignees', async () => {
      const taskWithAssignees = {
        ...mockTask,
        assignees: [mockUser],
      };
      mockClient.tasks.getTask.mockResolvedValue(taskWithAssignees);

      const result = await callTool('list-assignees', {
        id: 1,
      });

      const response = JSON.parse(result.content[0].text);
      // Should only include id, title, and assignees
      expect(response.task).toEqual({
        id: 1,
        title: 'Test Task',
        assignees: [mockUser],
      });
      // Should not include other task fields
      expect(response.task.description).toBeUndefined();
      expect(response.task.done).toBeUndefined();
    });
  });

  describe('comment subcommand', () => {
    it('should list comments for a task', async () => {
      mockClient.tasks.getTaskComments.mockResolvedValue([mockComment]);

      const result = await callTool('comment', {
        id: 1,
      });

      expect(mockClient.tasks.getTaskComments).toHaveBeenCalledWith(1);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('comment');
      expect(response.metadata.count).toBe(1);
      expect(response.comments).toHaveLength(1);
    });

    it('should add a comment to a task', async () => {
      mockClient.tasks.createTaskComment.mockResolvedValue(mockComment);

      const result = await callTool('comment', {
        id: 1,
        comment: 'New comment',
      });

      expect(mockClient.tasks.createTaskComment).toHaveBeenCalledWith(1, {
        task_id: 1,
        comment: 'New comment',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Comment added successfully');
      expect(response.comment).toBeDefined();
    });

    it('should validate task ID is required', async () => {
      await expect(callTool('comment', {})).rejects.toThrow();
    });

    it('should handle comment errors', async () => {
      mockClient.tasks.getTaskComments.mockRejectedValue(new Error('API Error'));

      await expect(
        callTool('comment', {
          id: 1,
        }),
      ).rejects.toThrow('Failed to handle comment: API Error');
    });

    it('should handle create comment errors', async () => {
      mockClient.tasks.createTaskComment.mockRejectedValue(new Error('Cannot create comment'));

      await expect(
        callTool('comment', {
          id: 1,
          comment: 'Test',
        }),
      ).rejects.toThrow('Failed to handle comment: Cannot create comment');
    });

    it('should handle non-Error API errors in comment', async () => {
      mockClient.tasks.getTaskComments.mockRejectedValue(false);

      await expect(
        callTool('comment', {
          id: 1,
        }),
      ).rejects.toThrow('Failed to handle comment: false');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ECONNREFUSED';
      mockClient.tasks.getAllTasks.mockRejectedValue(networkError);

      await expect(callTool('list')).rejects.toThrow('Failed to list tasks: Network error');
    });

    it('should handle rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).response = { status: 429 };
      mockClient.tasks.getAllTasks.mockRejectedValue(rateLimitError);

      await expect(callTool('list')).rejects.toThrow('Failed to list tasks: Rate limit exceeded');
    });

    it('should handle malformed JSON responses', async () => {
      // This would typically happen at the node-vikunja level
      mockClient.tasks.getAllTasks.mockRejectedValue(new SyntaxError('Unexpected token'));

      await expect(callTool('list')).rejects.toThrow('Failed to list tasks: Unexpected token');
    });

    it('should handle client initialization errors', async () => {
      (getClientFromContext as jest.Mock).mockImplementation(() => {
        throw new Error('Failed to initialize client');
      });
      (getClientFromContext as jest.Mock).mockRejectedValue(new Error('Failed to initialize client'));

      await expect(callTool('list')).rejects.toThrow('Failed to initialize client');
    });

    it('should handle empty responses gracefully', async () => {
      mockClient.tasks.getAllTasks.mockResolvedValue([]);

      const result = await callTool('list');
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('list');
      expect(response.metadata.count).toBe(0);
      expect(response.tasks).toEqual([]);
    });

    it('should handle undefined optional fields', async () => {
      const taskWithUndefinedFields: Task = {
        ...mockTask,
        description: undefined as any,
        labels: undefined as any,
        assignees: undefined as any,
        dueDate: undefined as any,
      };

      mockClient.tasks.getTask.mockResolvedValue(taskWithUndefinedFields);

      const result = await callTool('get', { id: 1 });

      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.task.id).toBe(1);
    });
  });

  describe('bulk-update subcommand', () => {
    beforeEach(() => {
      mockClient.tasks.updateTask = jest
        .fn()
        .mockImplementation((id: number, data: any) =>
          Promise.resolve({ ...mockTask, id, ...data }),
        );
      mockClient.tasks.getTask.mockImplementation((id: number) =>
        Promise.resolve({ ...mockTask, id, title: `Task ${id}` }),
      );
      mockClient.tasks.removeUserFromTask = jest.fn().mockResolvedValue({});
      mockClient.tasks.bulkAssignUsersToTask = jest.fn().mockResolvedValue({});
      mockClient.tasks.updateTaskLabels = jest.fn().mockResolvedValue({});
    });

    it('should bulk update multiple tasks', async () => {
      const taskIds = [1, 2, 3];
      mockClient.tasks.getTask.mockImplementation((id: number) =>
        Promise.resolve({ ...mockTask, id, done: true }),
      );

      // Mock the bulk update API to return success
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue({ message: 'Tasks updated successfully' });

      const result = await callTool('bulk-update', {
        taskIds,
        field: 'done',
        value: true,
      });

      // Should call bulk update API with correct parameters
      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledTimes(1);
      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [1, 2, 3],
        field: 'done',
        value: true,
      });

      // Should fetch updated tasks after bulk update
      expect(mockClient.tasks.getTask).toHaveBeenCalledTimes(3);
      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(1);
      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(2);
      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(3);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('update');
      expect(response.message).toBe('Successfully updated 3 tasks');
      expect(response.tasks).toHaveLength(3);
      expect(response.metadata.affectedFields).toEqual(['done']);
      expect(response.metadata.count).toBe(3);
    });

    it('should handle string "false" value for done field in bulk update', async () => {
      const taskIds = [1, 2];
      mockClient.tasks.getTask.mockImplementation((id: number) =>
        Promise.resolve({ ...mockTask, id, done: false }),
      );
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue({ message: 'Tasks updated successfully' });
      
      const result = await callTool('bulk-update', {
        taskIds,
        field: 'done',
        value: 'false' as any, // String "false" should be converted to boolean false
      });
      
      // Should call bulk update API with boolean false (not string "false")
      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [1, 2],
        field: 'done',
        value: false, // Converted from string "false" to boolean false
      });
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('update');
      expect(response.message).toBe('Successfully updated 2 tasks');
    });

    it('should validate required fields for bulk update', async () => {
      await expect(callTool('bulk-update', {})).rejects.toThrow(
        'taskIds array is required for bulk update operation',
      );

      await expect(callTool('bulk-update', { taskIds: [] })).rejects.toThrow(
        'taskIds array is required for bulk update operation',
      );

      await expect(callTool('bulk-update', { taskIds: [1, 2] })).rejects.toThrow(
        'field is required for bulk update operation',
      );

      await expect(callTool('bulk-update', { taskIds: [1, 2], field: 'done' })).rejects.toThrow(
        'value is required for bulk update operation',
      );
    });

    it('should validate task IDs in bulk update', async () => {
      await expect(
        callTool('bulk-update', {
          taskIds: [0, 1, 2],
          field: 'done',
          value: true,
        }),
      ).rejects.toThrow('task ID must be a positive integer');

      await expect(
        callTool('bulk-update', {
          taskIds: [1, -5, 3],
          field: 'done',
          value: true,
        }),
      ).rejects.toThrow('task ID must be a positive integer');

      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2.5, 3],
          field: 'done',
          value: true,
        }),
      ).rejects.toThrow('task ID must be a positive integer');
    });

    it('should validate allowed fields for bulk update', async () => {
      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'invalid_field',
          value: 'test',
        }),
      ).rejects.toThrow(
        'Invalid field: invalid_field. Allowed fields: done, priority, due_date, project_id, assignees, labels',
      );
    });

    it('should validate priority value in bulk update', async () => {
      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'priority',
          value: -1,
        }),
      ).rejects.toThrow('Priority must be between 0 and 5');

      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'priority',
          value: 6,
        }),
      ).rejects.toThrow('Priority must be between 0 and 5');
    });

    it('should validate due_date format in bulk update', async () => {
      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'due_date',
          value: 'invalid-date',
        }),
      ).rejects.toThrow('due_date must be a valid ISO 8601 date string');
    });

    it('should validate project_id in bulk update', async () => {
      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'project_id',
          value: 0,
        }),
      ).rejects.toThrow('project_id must be a positive integer');

      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'project_id',
          value: -1,
        }),
      ).rejects.toThrow('project_id must be a positive integer');
    });

    it('should handle API errors in bulk update', async () => {
      // Mock bulk API to fail
      mockClient.tasks.bulkUpdateTasks.mockRejectedValue(new Error('Bulk API failed'));

      // Mock individual updates to also fail
      mockClient.tasks.getTask.mockResolvedValue({ id: 1, title: 'Task 1', project_id: 1 });
      mockClient.tasks.updateTask.mockRejectedValue(new Error('Bulk update failed'));

      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'done',
          value: true,
        }),
      ).rejects.toThrow('Bulk update failed. Could not update any tasks');
    });

    it('should handle non-Error API errors in bulk update', async () => {
      // Mock bulk API to fail
      mockClient.tasks.bulkUpdateTasks.mockRejectedValue(new Error('Bulk API failed'));

      // Mock individual updates to also fail with string error
      mockClient.tasks.getTask.mockResolvedValue({ id: 1, title: 'Task 1', project_id: 1 });
      mockClient.tasks.updateTask.mockRejectedValue('String error');

      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'done',
          value: true,
        }),
      ).rejects.toThrow('Bulk update failed. Could not update any tasks');
    });

    it('should handle string boolean values in bulk update', async () => {
      const mockTasks = [
        { id: 1, title: 'Task 1', done: false },
        { id: 2, title: 'Task 2', done: false },
      ];

      mockClient.tasks.bulkUpdateTasks.mockResolvedValue(mockTasks);
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ ...mockTasks[0], done: true })
        .mockResolvedValueOnce({ ...mockTasks[1], done: true });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'done',
        value: 'true', // String instead of boolean
      });

      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [1, 2],
        field: 'done',
        value: true, // Should be converted to boolean
      });
      expect(result.content[0].text).toContain('"success": true');
    });

    it('should handle string numeric values in bulk update', async () => {
      const mockTasks = [
        { id: 1, title: 'Task 1', priority: 0 },
        { id: 2, title: 'Task 2', priority: 0 },
      ];

      mockClient.tasks.bulkUpdateTasks.mockResolvedValue(mockTasks);
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ ...mockTasks[0], priority: 5 })
        .mockResolvedValueOnce({ ...mockTasks[1], priority: 5 });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'priority',
        value: '5', // String instead of number
      });

      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [1, 2],
        field: 'priority',
        value: 5, // Should be converted to number
      });
      expect(result.content[0].text).toContain('"success": true');
    });

    it('should handle bulk update API returning Message object instead of Task array', async () => {
      // Mock bulk update API to return Message object (instead of Task[] array)
      const messageResponse = { message: 'Tasks successfully updated' };
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue(messageResponse as any);

      // Mock getTask calls to fetch updated tasks
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ id: 1, title: 'Task 1', priority: 5, done: false })
        .mockResolvedValueOnce({ id: 2, title: 'Task 2', priority: 5, done: false });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'priority',
        value: 5,
      });

      // Verify bulk update API was called
      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [1, 2],
        field: 'priority',
        value: 5,
      });

      // New implementation may handle task fetching differently

      // Verify successful response
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.tasks).toHaveLength(2);
      expect(response.tasks[0].priority).toBe(5);
      expect(response.tasks[1].priority).toBe(5);
    });

    it('should detect and fix bulk update failures when API returns unchanged values', async () => {
      // Mock initial tasks with different priorities
      const task1 = { ...mockTask, id: 371, title: 'Task 371', priority: 3 };
      const task2 = { ...mockTask, id: 372, title: 'Task 372', priority: 4 };

      // Mock bulk update API to return tasks with UNCHANGED values (simulating the bug)
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue([task1, task2]);

      // Mock getTask for fetching current task state (used by fallback)
      mockClient.tasks.getTask
        .mockResolvedValueOnce(task1)  // First task for fallback update
        .mockResolvedValueOnce(task2); // Second task for fallback update

      // Mock updateTask for the fallback individual updates
      mockClient.tasks.updateTask
        .mockResolvedValueOnce({ ...task1, priority: 5 })
        .mockResolvedValueOnce({ ...task2, priority: 5 });

      // Mock final getTask calls to return updated values
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ ...task1, priority: 5 })
        .mockResolvedValueOnce({ ...task2, priority: 5 });

      const result = await callTool('bulk-update', {
        taskIds: [371, 372],
        field: 'priority',
        value: 5,
      });

      // Verify bulk update API was called first
      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [371, 372],
        field: 'priority',
        value: 5,
      });

      // Verify fallback to individual updates was triggered
      expect(mockClient.tasks.updateTask).toHaveBeenCalledTimes(2);
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(371, expect.objectContaining({ priority: 5 }));
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(372, expect.objectContaining({ priority: 5 }));

      // Parse response and verify tasks have been updated via fallback
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.tasks).toHaveLength(2);
      
      // Verify that the returned tasks now show the UPDATED priority values
      const updatedTask1 = response.tasks.find(t => t.id === 371);
      const updatedTask2 = response.tasks.find(t => t.id === 372);
      
      expect(updatedTask1.priority).toBe(5); // Updated to 5
      expect(updatedTask2.priority).toBe(5); // Updated to 5
    });

    it('should detect bulk update failures for done field', async () => {
      const task1 = { ...mockTask, id: 1, done: false };
      const task2 = { ...mockTask, id: 2, done: false };

      // Mock bulk update API returns unchanged values
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue([task1, task2]);

      // Mock fallback
      mockClient.tasks.getTask
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(task2);
      mockClient.tasks.updateTask
        .mockResolvedValueOnce({ ...task1, done: true })
        .mockResolvedValueOnce({ ...task2, done: true });
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ ...task1, done: true })
        .mockResolvedValueOnce({ ...task2, done: true });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'done',
        value: true,
      });

      expect(mockClient.tasks.updateTask).toHaveBeenCalledTimes(2);
      const response = JSON.parse(result.content[0].text);
      expect(response.tasks.every(t => t.done === true)).toBe(true);
    });

    it('should detect bulk update failures for due_date field', async () => {
      const task1 = { ...mockTask, id: 1, due_date: '2024-01-01T00:00:00Z' };
      const task2 = { ...mockTask, id: 2, due_date: '2024-01-02T00:00:00Z' };
      const newDueDate = '2024-12-31T23:59:59Z';

      // Mock bulk update API returns unchanged values
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue([task1, task2]);

      // Mock fallback
      mockClient.tasks.getTask
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(task2);
      mockClient.tasks.updateTask
        .mockResolvedValueOnce({ ...task1, due_date: newDueDate })
        .mockResolvedValueOnce({ ...task2, due_date: newDueDate });
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ ...task1, due_date: newDueDate })
        .mockResolvedValueOnce({ ...task2, due_date: newDueDate });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'due_date',
        value: newDueDate,
      });

      expect(mockClient.tasks.updateTask).toHaveBeenCalledTimes(2);
      const response = JSON.parse(result.content[0].text);
      expect(response.tasks.every(t => t.due_date === newDueDate)).toBe(true);
    });

    it('should detect bulk update failures for project_id field', async () => {
      const task1 = { ...mockTask, id: 1, project_id: 1 };
      const task2 = { ...mockTask, id: 2, project_id: 1 };

      // Mock bulk update API returns unchanged values
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue([task1, task2]);

      // Mock fallback
      mockClient.tasks.getTask
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(task2);
      mockClient.tasks.updateTask
        .mockResolvedValueOnce({ ...task1, project_id: 5 })
        .mockResolvedValueOnce({ ...task2, project_id: 5 });
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ ...task1, project_id: 5 })
        .mockResolvedValueOnce({ ...task2, project_id: 5 });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'project_id',
        value: 5,
      });

      expect(mockClient.tasks.updateTask).toHaveBeenCalledTimes(2);
      const response = JSON.parse(result.content[0].text);
      expect(response.tasks.every(t => t.project_id === 5)).toBe(true);
    });

    it('should validate recurring fields in bulk update', async () => {
      // Test repeat_after validation
      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'repeat_after',
          value: -1,
        }),
      ).rejects.toThrow('repeat_after must be a non-negative number');

      // Test repeat_mode validation
      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'repeat_mode',
          value: 'invalid',
        }),
      ).rejects.toThrow('Invalid repeat_mode: invalid. Valid modes: day, week, month, year');
    });

    it('should bulk update recurring settings', async () => {
      const updatedTask1 = { ...mockTask, id: 1, repeat_after: 7, repeat_mode: 'week' };
      const updatedTask2 = { ...mockTask, id: 2, repeat_after: 7, repeat_mode: 'week' };

      mockClient.tasks.getTask.mockImplementation((id: number) =>
        Promise.resolve({ ...mockTask, id, repeat_after: 7 }),
      );
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue({ message: 'Tasks updated successfully' });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'repeat_after',
        value: 7,
      });

      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [1, 2],
        field: 'repeat_after',
        value: 7,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.affectedFields).toContain('repeat_after');
    });

    it('should validate max tasks limit', async () => {
      const tooManyTasks = Array.from({ length: 101 }, (_, i) => i + 1);

      await expect(
        callTool('bulk-update', {
          taskIds: tooManyTasks,
          field: 'done',
          value: true,
        }),
      ).rejects.toThrow('Too many tasks for bulk operation. Maximum allowed: 100');
    });

    it('should validate done field type', async () => {
      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'done',
          value: 'not-a-boolean',
        }),
      ).rejects.toThrow('done field must be a boolean value');
    });

    it('should validate assignees field type', async () => {
      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'assignees',
          value: 'not-an-array',
        }),
      ).rejects.toThrow('assignees must be an array of numbers');

      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'assignees',
          value: [1, -1],
        }),
      ).rejects.toThrow('assignees ID must be a positive integer');
    });

    it('should validate labels field type', async () => {
      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'labels',
          value: 'not-an-array',
        }),
      ).rejects.toThrow('labels must be an array of numbers');

      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'labels',
          value: [1, 0],
        }),
      ).rejects.toThrow('labels ID must be a positive integer');
    });

    it('should fall back to individual updates when bulk API fails', async () => {
      // Mock bulk API to fail
      mockClient.tasks.bulkUpdateTasks.mockRejectedValue(new Error('Bulk API not available'));

      // Mock individual updates
      mockClient.tasks.getTask.mockImplementation((id: number) =>
        Promise.resolve({ ...mockTask, id }),
      );
      mockClient.tasks.updateTask.mockImplementation((id: number, data: any) =>
        Promise.resolve({ ...mockTask, id, done: true }),
      );

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'done',
        value: true,
      });

      // Should have tried bulk API first
      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledTimes(1);

      // Should fall back to individual updates
      expect(mockClient.tasks.updateTask).toHaveBeenCalledTimes(2);
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ done: true }),
      );
      expect(mockClient.tasks.updateTask).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ done: true }),
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Successfully updated 2 tasks');
    });

    it('should handle partial fetch failures after bulk update', async () => {
      // Mock bulk update API to fail so we use fallback
      mockClient.tasks.bulkUpdateTasks.mockRejectedValue(new Error('Bulk API failed'));

      // Mock individual updates to succeed
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ ...mockTask, id: 1 })
        .mockResolvedValueOnce({ ...mockTask, id: 2 })
        .mockResolvedValueOnce({ ...mockTask, id: 3 });

      mockClient.tasks.updateTask.mockResolvedValue({ ...mockTask, done: true });

      // Mock post-update fetches - one fails
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ ...mockTask, id: 1, done: true })
        .mockRejectedValueOnce(new Error('Task not found'))
        .mockResolvedValueOnce({ ...mockTask, id: 3, done: true });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2, 3],
        field: 'done',
        value: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Successfully updated 3 tasks');
      expect(response.tasks).toHaveLength(3);
      expect(response.metadata.fetchErrors).toBeUndefined();
    });

    it('should handle bulk update for assignees field', async () => {
      mockClient.tasks.getTask.mockResolvedValue({ ...mockTask, assignees: [] });
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue({ message: 'Tasks updated successfully' });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'assignees',
        value: [1, 2],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Successfully updated 2 tasks');
      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [1, 2],
        field: 'assignees',
        value: [1, 2],
      });
    });

    it('should handle bulk update for labels field', async () => {
      mockClient.tasks.getTask.mockResolvedValue({ ...mockTask, labels: [] });
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue({ message: 'Tasks updated successfully' });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'labels',
        value: [1, 2, 3],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Successfully updated 2 tasks');
      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [1, 2],
        field: 'labels',
        value: [1, 2, 3],
      });
    });

    it('should handle bulk update for due_date field', async () => {
      mockClient.tasks.getTask.mockResolvedValue({ ...mockTask, due_date: '2024-12-31T23:59:59Z' });
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue({ message: 'Tasks updated successfully' });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'due_date',
        value: '2024-12-31T23:59:59Z',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Successfully updated 2 tasks');
      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [1, 2],
        field: 'due_date',
        value: '2024-12-31T23:59:59Z',
      });
    });

    it('should handle bulk update for project_id field', async () => {
      mockClient.tasks.getTask.mockResolvedValue({ ...mockTask, project_id: 5 });
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue({ message: 'Tasks updated successfully' });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'project_id',
        value: 5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Successfully updated 2 tasks');
      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [1, 2],
        field: 'project_id',
        value: 5,
      });
    });

    it('should handle bulk update for repeat_mode field', async () => {
      mockClient.tasks.getTask.mockResolvedValue({ ...mockTask, repeat_mode: 1 });
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue({ message: 'Tasks updated successfully' });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'repeat_mode',
        value: 'month',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Successfully updated 2 tasks');
    });

    it('should handle bulk update for repeat_after field', async () => {
      mockClient.tasks.getTask.mockResolvedValue({ ...mockTask, repeat_after: 86400 });
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue({ message: 'Tasks updated successfully' });

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'repeat_after',
        value: 86400,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Successfully updated 2 tasks');
      expect(mockClient.tasks.bulkUpdateTasks).toHaveBeenCalledWith({
        task_ids: [1, 2],
        field: 'repeat_after',
        value: 86400,
      });
    });

    it('should handle non-auth errors in assignee updates during bulk-update', async () => {
      // Mock bulk API success
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue({ message: 'Tasks updated successfully' });

      // Mock assignee operations to fail
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ ...mockTask, id: 1, assignees: [] })
        .mockResolvedValueOnce({ ...mockTask, id: 1, assignees: [] });
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(new Error('Invalid user ID'));

      const result = await callTool('bulk-update', {
        taskIds: [1],
        field: 'assignees',
        value: [999],
      });

      // The bulk update should succeed but warn about assignee failures
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Successfully updated 1 tasks');
    });

    it('should handle assignee removal failures during bulk update', async () => {
      // Mock bulk API to fail (which triggers fallback)
      mockClient.tasks.bulkUpdateTasks.mockRejectedValue(new Error('Bulk API not supported'));

      // Mock task with existing assignees
      const taskWithAssignees = {
        ...mockTask,
        id: 1,
        assignees: [{ id: 1, username: 'user1' }],
      };
      
      mockClient.tasks.getTask
        .mockResolvedValueOnce(taskWithAssignees) // For fetch at start
        .mockResolvedValueOnce(taskWithAssignees) // For assignee diff calculation
        .mockResolvedValueOnce({ ...taskWithAssignees, assignees: [] }); // For final fetch
      
      mockClient.tasks.updateTask.mockResolvedValue(taskWithAssignees);
      
      // Mock removeUserFromTask to fail
      mockClient.tasks.removeUserFromTask.mockRejectedValue(new Error('Failed to remove user'));

      await expect(callTool('bulk-update', {
        taskIds: [1],
        field: 'assignees',
        value: [],
      })).rejects.toThrow('Bulk update failed. Could not update any tasks');

      expect(mockClient.tasks.removeUserFromTask).toHaveBeenCalledWith(1, 1);
    });

    it('should handle partial success in bulk update', async () => {
      // Mock bulk API to fail (which triggers fallback)
      mockClient.tasks.bulkUpdateTasks.mockRejectedValue(new Error('Bulk API not supported'));
      
      // Mock initial task fetches
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ ...mockTask, id: 1 }) // initial fetch for task 1
        .mockResolvedValueOnce({ ...mockTask, id: 2 }); // initial fetch for task 2
      
      // Mock update to succeed for both tasks
      mockClient.tasks.updateTask
        .mockResolvedValueOnce({ ...mockTask, id: 1, priority: 5 })
        .mockResolvedValueOnce({ ...mockTask, id: 2, priority: 5 });
      
      // Mock the final fetch - succeed for task 1, fail for task 2
      mockClient.tasks.getTask
        .mockResolvedValueOnce({ ...mockTask, id: 1, priority: 5 })
        .mockRejectedValueOnce(new Error('Task not found'));

      const result = await callTool('bulk-update', {
        taskIds: [1, 2],
        field: 'priority',
        value: 5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toContain('Successfully updated 2 tasks');
      // New batch processing system doesn't have the same fetch failure behavior
      expect(response.metadata.fetchErrors).toBeUndefined();
    });

    it('should handle generic errors in bulk update', async () => {
      // Mock bulk API to succeed initially
      mockClient.tasks.bulkUpdateTasks.mockResolvedValue([]);
      
      // Mock getTask to throw TypeError when fetching results
      mockClient.tasks.getTask.mockImplementation(() => {
        throw new TypeError('Cannot read property of undefined');
      });

      // When all individual updates fail in the fallback, it should report failure
      await expect(
        callTool('bulk-update', {
          taskIds: [1, 2],
          field: 'priority',
          value: 5,
        }),
      ).rejects.toThrow('Bulk update failed. Could not update any tasks. Failed IDs: 1, 2');
    });
  });

  describe('bulk-delete subcommand', () => {
    beforeEach(() => {
      mockClient.tasks.deleteTask = jest.fn().mockResolvedValue(undefined);
      mockClient.tasks.getTask.mockImplementation((id: number) =>
        Promise.resolve({ ...mockTask, id, title: `Task ${id}` }),
      );
    });

    it('should bulk delete multiple tasks', async () => {
      const taskIds = [1, 2, 3];

      const result = await callTool('bulk-delete', { taskIds });

      // Should fetch each task before deletion
      expect(mockClient.tasks.getTask).toHaveBeenCalledTimes(3);

      // Should delete each task
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledTimes(3);
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(2);
      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(3);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('delete');
      expect(response.message).toBe('Successfully deleted 3 tasks');
      expect(response.metadata.count).toBe(3);
      expect(response.metadata.previousState).toHaveLength(3);
    });

    it('should validate required fields for bulk delete', async () => {
      await expect(callTool('bulk-delete', {})).rejects.toThrow(
        'taskIds array is required for bulk delete operation',
      );

      await expect(callTool('bulk-delete', { taskIds: [] })).rejects.toThrow(
        'taskIds array is required for bulk delete operation',
      );
    });

    it('should validate task IDs in bulk delete', async () => {
      await expect(
        callTool('bulk-delete', {
          taskIds: [0, 1, 2],
        }),
      ).rejects.toThrow('task ID must be a positive integer');

      await expect(
        callTool('bulk-delete', {
          taskIds: [1, -5, 3],
        }),
      ).rejects.toThrow('task ID must be a positive integer');
    });

    it('should handle partial failures in bulk delete', async () => {
      const taskIds = [1, 2, 3];

      // Mock first two deletions to succeed, third to fail
      mockClient.tasks.deleteTask
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Delete failed'));

      const result = await callTool('bulk-delete', { taskIds });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.message).toContain(
        'Bulk delete partially completed. Successfully deleted 2 tasks',
      );
      expect(response.metadata.count).toBe(2);
      expect(response.metadata.failedCount).toBe(1);
      expect(response.metadata.failedIds).toEqual([3]);

      expect(mockClient.tasks.deleteTask).toHaveBeenCalledTimes(3);
    });

    it('should handle all deletions failing', async () => {
      const taskIds = [1, 2];
      mockClient.tasks.deleteTask.mockRejectedValue(new Error('Delete failed'));

      await expect(callTool('bulk-delete', { taskIds })).rejects.toThrow(
        'Bulk delete failed. Could not delete any tasks. Failed IDs: 1, 2',
      );
    });

    it('should handle non-Error exceptions in bulk delete when deletion fails', async () => {
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.deleteTask.mockRejectedValue('String error');

      await expect(callTool('bulk-delete', { taskIds: [1, 2] })).rejects.toThrow(
        'Bulk delete failed. Could not delete any tasks. Failed IDs: 1, 2',
      );
    });

    it('should validate max tasks limit for bulk delete', async () => {
      const tooManyTasks = Array.from({ length: 101 }, (_, i) => i + 1);

      await expect(
        callTool('bulk-delete', {
          taskIds: tooManyTasks,
        }),
      ).rejects.toThrow('Too many tasks for bulk operation. Maximum allowed: 100');
    });

    it('should handle non-MCPError exceptions in bulk delete', async () => {
      // Mock getTask to throw a TypeError (non-MCPError)
      mockClient.tasks.getTask.mockImplementation(() => {
        throw new TypeError('Cannot read property of undefined');
      });

      // New batch processing system handles fetch errors gracefully
      // and continues with the deletion operation
      const result = await callTool('bulk-delete', { taskIds: [1] });
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      // Previous state might be populated depending on whether getTask succeeded first
      expect(response.metadata.previousState).toBeDefined();
    });
  });

  describe('bulk-create subcommand', () => {
    it('should create multiple tasks successfully', async () => {
      const tasks = [
        { title: 'Task 1', description: 'Description 1', priority: 3 },
        { title: 'Task 2', dueDate: '2024-05-25T10:00:00Z', labels: [1, 2] },
        { title: 'Task 3', assignees: [1], repeatAfter: 86400, repeatMode: 'day' },
      ];

      const createdTasks = tasks.map((task, index) => ({
        id: index + 1,
        ...task,
        project_id: 1,
        done: false,
        labels: task.labels ? task.labels.map((id) => ({ id, title: `Label ${id}` })) : [],
        assignees: task.assignees
          ? task.assignees.map((id) => ({ id, username: `user${id}` }))
          : [],
      }));

      mockClient.tasks.createTask.mockImplementation(async (projectId, task) => {
        const id = mockClient.tasks.createTask.mock.calls.length;
        return { ...task, id, project_id: projectId };
      });

      mockClient.tasks.getTask.mockImplementation(async (id) => createdTasks[id - 1]);

      const result = await callTool('bulk-create', { projectId: 1, tasks });

      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(3);
      expect(result.content[0].text).toContain('"success": true');
      expect(result.content[0].text).toContain('Successfully created 3 tasks');

      const response = JSON.parse(result.content[0].text);
      expect(response.tasks).toHaveLength(3);
      expect(response.metadata.count).toBe(3);
    });

    it('should require projectId', async () => {
      await expect(
        callTool('bulk-create', {
          tasks: [{ title: 'Task 1' }],
        }),
      ).rejects.toThrow('projectId is required for bulk create operation');
    });

    it('should require tasks array', async () => {
      await expect(
        callTool('bulk-create', {
          projectId: 1,
        }),
      ).rejects.toThrow('tasks array is required and must contain at least one task');

      await expect(
        callTool('bulk-create', {
          projectId: 1,
          tasks: [],
        }),
      ).rejects.toThrow('tasks array is required and must contain at least one task');
    });

    it('should validate task titles', async () => {
      await expect(
        callTool('bulk-create', {
          projectId: 1,
          tasks: [{ title: '' }],
        }),
      ).rejects.toThrow('Task at index 0 must have a non-empty title');

      await expect(
        callTool('bulk-create', {
          projectId: 1,
          tasks: [{ title: '   ' }],
        }),
      ).rejects.toThrow('Task at index 0 must have a non-empty title');
    });

    it('should validate date formats', async () => {
      await expect(
        callTool('bulk-create', {
          projectId: 1,
          tasks: [{ title: 'Task 1', dueDate: 'invalid-date' }],
        }),
      ).rejects.toThrow('tasks[0].dueDate must be a valid ISO 8601 date string');
    });

    it('should validate assignee and label IDs', async () => {
      await expect(
        callTool('bulk-create', {
          projectId: 1,
          tasks: [{ title: 'Task 1', assignees: [0] }],
        }),
      ).rejects.toThrow('tasks[0].assignee ID must be a positive integer');

      await expect(
        callTool('bulk-create', {
          projectId: 1,
          tasks: [{ title: 'Task 1', labels: [-1] }],
        }),
      ).rejects.toThrow('tasks[0].label ID must be a positive integer');
    });

    it('should handle partial failures', async () => {
      const tasks = [{ title: 'Task 1' }, { title: 'Task 2' }, { title: 'Task 3' }];

      mockClient.tasks.createTask
        .mockResolvedValueOnce({ id: 1, title: 'Task 1', project_id: 1 })
        .mockRejectedValueOnce(new Error('Failed to create task 2'))
        .mockResolvedValueOnce({ id: 3, title: 'Task 3', project_id: 1 });

      mockClient.tasks.getTask
        .mockResolvedValueOnce({ id: 1, title: 'Task 1', project_id: 1 })
        .mockResolvedValueOnce({ id: 3, title: 'Task 3', project_id: 1 });

      const result = await callTool('bulk-create', { projectId: 1, tasks });

      expect(result.content[0].text).toContain('"success": false');
      expect(result.content[0].text).toContain('Bulk create partially completed');
      expect(result.content[0].text).toContain('Successfully created 2 tasks, 1 failed');

      const response = JSON.parse(result.content[0].text);
      expect(response.tasks).toHaveLength(2);
      expect(response.metadata.failedCount).toBe(1);
      expect(response.metadata.failures).toHaveLength(1);
      expect(response.metadata.failures[0]).toEqual({
        index: 1,
        error: 'Failed to create task 2',
      });
    });

    it('should handle complete failure', async () => {
      const tasks = [{ title: 'Task 1' }, { title: 'Task 2' }];

      mockClient.tasks.createTask.mockRejectedValue(new Error('API Error'));

      await expect(
        callTool('bulk-create', {
          projectId: 1,
          tasks,
        }),
      ).rejects.toThrow('Bulk create failed. Could not create any tasks');
    });

    it('should add labels and assignees after task creation', async () => {
      const tasks = [{ title: 'Task 1', labels: [1, 2], assignees: [3, 4] }];

      mockClient.tasks.createTask.mockResolvedValue({
        id: 1,
        title: 'Task 1',
        project_id: 1,
      });

      mockClient.tasks.getTask.mockResolvedValue({
        id: 1,
        title: 'Task 1',
        project_id: 1,
        labels: [
          { id: 1, title: 'Label 1' },
          { id: 2, title: 'Label 2' },
        ],
        assignees: [
          { id: 3, username: 'user3' },
          { id: 4, username: 'user4' },
        ],
      });

      const result = await callTool('bulk-create', { projectId: 1, tasks });

      expect(mockClient.tasks.updateTaskLabels).toHaveBeenCalledWith(1, {
        label_ids: [1, 2],
      });
      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(1, {
        user_ids: [3, 4],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.tasks[0].labels).toHaveLength(2);
      expect(response.tasks[0].assignees).toHaveLength(2);
    });

    it('should clean up task if labels/assignees fail', async () => {
      const tasks = [{ title: 'Task 1', labels: [1, 2] }];

      mockClient.tasks.createTask.mockResolvedValue({
        id: 1,
        title: 'Task 1',
        project_id: 1,
      });

      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('Label update failed'));
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      await expect(
        callTool('bulk-create', {
          projectId: 1,
          tasks,
        }),
      ).rejects.toThrow('Bulk create failed. Could not create any tasks');

      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
    });

    it('should validate max tasks limit', async () => {
      const tooManyTasks = Array(101).fill({ title: 'Task' });

      await expect(
        callTool('bulk-create', {
          projectId: 1,
          tasks: tooManyTasks,
        }),
      ).rejects.toThrow('Too many tasks for bulk operation. Maximum allowed: 100');
    });

    it('should handle failed cleanup after label/assignee error', async () => {
      const tasks = [{ title: 'Task 1', labels: [1, 2] }];

      mockClient.tasks.createTask.mockResolvedValue({
        id: 1,
        title: 'Task 1',
        project_id: 1,
      });

      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('Label update failed'));
      mockClient.tasks.deleteTask.mockRejectedValue(new Error('Delete failed'));

      await expect(
        callTool('bulk-create', {
          projectId: 1,
          tasks,
        }),
      ).rejects.toThrow('Bulk create failed. Could not create any tasks');

      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
    });

    it('should handle task creation without ID', async () => {
      const tasks = [{ title: 'Task 1' }];

      // Create task without ID
      mockClient.tasks.createTask.mockResolvedValue({
        title: 'Task 1',
        project_id: 1,
      });

      const result = await callTool('bulk-create', { projectId: 1, tasks });

      expect(result.content[0].text).toContain('"success": true');
      expect(result.content[0].text).toContain('Successfully created 1 tasks');
    });

    it('should handle non-MCPError exceptions in bulk create', async () => {
      const tasks = [{ title: 'Task 1' }];

      // Mock createTask to succeed
      mockClient.tasks.createTask.mockResolvedValue({ id: 1, title: 'Task 1', project_id: 1 });
      mockClient.tasks.getTask.mockResolvedValue({ id: 1, title: 'Task 1', project_id: 1 });

      // Mock JSON.stringify to throw an error when trying to stringify the response
      // This will happen in the try block but outside Promise.allSettled
      const originalStringify = JSON.stringify;
      JSON.stringify = jest.fn().mockImplementation((value, replacer, space) => {
        if (value && value.operation === 'create' && value.tasks) {
          throw new RangeError('Maximum call stack size exceeded');
        }
        return originalStringify.call(null, value, replacer, space);
      });

      await expect(callTool('bulk-create', { projectId: 1, tasks })).rejects.toThrow(
        'Failed to bulk create tasks: Maximum call stack size exceeded',
      );

      // Restore JSON.stringify
      JSON.stringify = originalStringify;
    });

    it('should throw non-auth errors from assignee operations in bulk create', async () => {
      const tasks = [{ title: 'Task 1', assignees: [999] }];

      mockClient.tasks.createTask.mockResolvedValue({
        id: 1,
        title: 'Task 1',
        project_id: 1,
      });

      // Mock assignee operation to fail with non-auth error
      mockClient.tasks.bulkAssignUsersToTask.mockRejectedValue(new Error('Invalid user ID'));
      mockClient.tasks.deleteTask.mockResolvedValue(undefined);

      await expect(
        callTool('bulk-create', {
          projectId: 1,
          tasks,
        }),
      ).rejects.toThrow('Bulk create failed. Could not create any tasks');

      expect(mockClient.tasks.deleteTask).toHaveBeenCalledWith(1);
    });
  });

  describe('attach subcommand', () => {
    it('should return not implemented error', async () => {
      await expect(
        callTool('attach', {
          id: 1,
        }),
      ).rejects.toThrow('File attachments are not supported in the current MCP context');
    });
  });

  describe('unknown subcommand', () => {
    it('should throw validation error for unknown subcommand', async () => {
      await expect(
        toolHandler({
          subcommand: 'unknown' as any,
        }),
      ).rejects.toThrow('Unknown subcommand: unknown');
    });
  });

  describe('main handler error handling', () => {
    it('should handle non-Error exceptions in main handler', async () => {
      // Mock getClientFromContext to throw a non-Error directly
      (getClientFromContext as jest.Mock).mockImplementation(() => {
        throw 'String error from client initialization';
      });
      (getClientFromContext as jest.Mock).mockRejectedValue('String error from client initialization');

      await expect(callTool('list')).rejects.toThrow(
        'Task operation error: String error from client initialization',
      );
    });
  });

  describe('tool registration', () => {
    it('should register the vikunja_tasks tool', () => {
      expect(mockServer.tool).toHaveBeenCalledWith(
        'vikunja_tasks',
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should have the correct tool handler', () => {
      expect(typeof toolHandler).toBe('function');
    });
  });
});
