import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import { registerTasksTool } from '../../src/tools/tasks';
import { MCPError, ErrorCode } from '../../src/types';
import type { Task, User, Label, Project } from 'node-vikunja';
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

describe('Tasks Tool - Edge Cases', () => {
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
  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User',
    created: new Date('2024-01-01').toISOString(),
    updated: new Date('2024-01-01').toISOString(),
  };

  const mockProject: Project = {
    id: 1,
    title: 'Test Project',
    description: 'Test Description',
    identifier: 'TEST',
    hex_color: '#ffffff',
    owner: mockUser,
    isArchived: false,
    created: new Date('2024-01-01').toISOString(),
    updated: new Date('2024-01-01').toISOString(),
    namespaceId: 0,
    parentProjectId: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mocks with correct API methods
    mockClient = {
      tasks: {
        getAllTasks: jest.fn().mockResolvedValue([]),
        getProjectTasks: jest.fn().mockResolvedValue([]),
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
        getProjects: jest.fn().mockResolvedValue([mockProject]),
        createProject: jest.fn(),
        getProject: jest.fn().mockResolvedValue(mockProject),
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
      shares: {
        getShareAuth: jest.fn(),
      },
    } as MockVikunjaClient;

    // Setup mock auth manager
    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getSession: jest.fn().mockReturnValue({
        apiUrl: 'https://vikunja.example.com',
        apiToken: 'tk_test-token-123',
        authType: 'api-token',
      }),
      setSession: jest.fn(),
      clearSession: jest.fn(),
      getStatus: jest.fn().mockReturnValue({
        authenticated: true,
        apiUrl: 'https://vikunja.example.com',
      }),
      connect: jest.fn(),
      disconnect: jest.fn(),
      getAuthType: jest.fn().mockReturnValue('api-token'),
    } as MockAuthManager;

    mockServer = {
      notification: jest.fn(),
    } as unknown as MockServer;

    // Setup handler
    (mockServer as any).tool = jest.fn((_, __, handler) => {
      toolHandler = handler;
    });

    // Setup mocks
    (getClientFromContext as jest.MockedFunction<typeof getClientFromContext>).mockResolvedValue(
      mockClient,
    );
    (getClientFromContext as jest.MockedFunction<typeof getClientFromContext>).mockResolvedValue(
      mockClient,
    );

    // Register tool
    registerTasksTool(
      mockServer as unknown as McpServer,
      mockAuthManager as unknown as AuthManager,
    );
  });

  describe('Special Characters Handling', () => {
    it('should handle Unicode characters in task title and description', async () => {
      const unicodeTask: Task = {
        id: 1,
        title: '🚀 Deploy app с кириллицей 中文字符 العربية',
        description: 'Task with emojis 😊🎉 and special chars: <>&"\'',
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      mockClient.tasks.createTask.mockResolvedValue(unicodeTask);
      mockClient.tasks.getTask.mockResolvedValue(unicodeTask);

      const result = await callTool('create', {
        title: unicodeTask.title,
        description: unicodeTask.description,
        projectId: 1,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.task).toMatchObject({
        id: 1,
        title: '🚀 Deploy app с кириллицей 中文字符 العربية',
        description: 'Task with emojis 😊🎉 and special chars: <>&"\'',
      });
    });

    it('should handle very long strings in task fields', async () => {
      const longTitle = 'A'.repeat(250); // 250 character title
      const longDescription = 'B'.repeat(5000); // 5000 character description

      const longTask: Task = {
        id: 1,
        title: longTitle,
        description: longDescription,
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      mockClient.tasks.createTask.mockResolvedValue(longTask);
      mockClient.tasks.getTask.mockResolvedValue(longTask);

      const result = await callTool('create', {
        title: longTitle,
        description: longDescription,
        projectId: 1,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.task).toMatchObject({
        title: longTitle,
        description: longDescription,
      });
    });

    it('should handle empty strings vs null vs undefined', async () => {
      const taskWithEmpty: Task = {
        id: 1,
        title: 'Task with empty description',
        description: '', // Empty string
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      mockClient.tasks.createTask.mockResolvedValue(taskWithEmpty);
      mockClient.tasks.getTask.mockResolvedValue(taskWithEmpty);

      // Test with empty description
      const result1 = await callTool('create', {
        title: 'Task with empty description',
        description: '',
        projectId: 1,
      });

      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.data.task.description).toBe('');

      // Test with undefined description (should not be included)
      const result2 = await callTool('create', {
        title: 'Task without description',
        projectId: 1,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          title: 'Task without description',
          project_id: 1,
        }),
      );
      // Verify that description is not included when undefined
      const callArgs = mockClient.tasks.createTask.mock.calls[1][1];
      expect(callArgs).not.toHaveProperty('description');
    });

    it('should handle special characters that might need escaping', async () => {
      const specialCharsTask: Task = {
        id: 1,
        title: 'Task with "quotes" and \\backslashes\\ and /slashes/',
        description: 'Contains\nnewlines\tand\ttabs and "nested \"quotes\""',
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      mockClient.tasks.createTask.mockResolvedValue(specialCharsTask);
      mockClient.tasks.getTask.mockResolvedValue(specialCharsTask);

      const result = await callTool('create', {
        title: specialCharsTask.title,
        description: specialCharsTask.description,
        projectId: 1,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.task.title).toBe('Task with "quotes" and \\backslashes\\ and /slashes/');
      expect(response.data.task.description).toBe(
        'Contains\nnewlines\tand\ttabs and "nested \"quotes\""',
      );
    });
  });

  describe('Timezone Handling', () => {
    it('should handle dates with different timezone formats', async () => {
      const taskWithDates: Task = {
        id: 1,
        title: 'Task with various date formats',
        description: '',
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: '2024-12-31T23:59:59Z', // UTC
        start_date: '2024-01-01T00:00:00+05:00', // UTC+5
        end_date: '2024-06-30T12:00:00-08:00', // UTC-8
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: ['2024-03-15T10:00:00Z', '2024-09-15T15:30:00+02:00'],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      mockClient.tasks.createTask.mockResolvedValue(taskWithDates);
      mockClient.tasks.getTask.mockResolvedValue(taskWithDates);

      const result = await callTool('create', {
        title: 'Task with various date formats',
        projectId: 1,
        due_date: '2024-12-31T23:59:59Z',
        start_date: '2024-01-01T00:00:00+05:00',
        end_date: '2024-06-30T12:00:00-08:00',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.task.due_date).toBe('2024-12-31T23:59:59Z');
      expect(response.data.task.start_date).toBe('2024-01-01T00:00:00+05:00');
      expect(response.data.task.end_date).toBe('2024-06-30T12:00:00-08:00');
    });

    it('should preserve timezone information in round-trip operations', async () => {
      const originalTask: Task = {
        id: 1,
        title: 'Timezone preservation test',
        description: '',
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: '2024-07-15T14:30:00+03:00',
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      mockClient.tasks.getTask.mockResolvedValue(originalTask);
      mockClient.tasks.updateTask.mockResolvedValue({
        ...originalTask,
        title: 'Updated title',
      });

      // Get task
      const getResult = await callTool('get', { id: 1 });
      const getResponse = JSON.parse(getResult.content[0].text);
      expect(getResponse.data.task.due_date).toBe('2024-07-15T14:30:00+03:00');

      // Update task
      const updateResult = await callTool('update', {
        id: 1,
        title: 'Updated title',
      });
      const updateResponse = JSON.parse(updateResult.content[0].text);
      expect(updateResponse.data.task.due_date).toBe('2024-07-15T14:30:00+03:00');
    });

    it('should handle daylight saving time edge cases', async () => {
      // Test a date that falls during DST transition
      const dstTask: Task = {
        id: 1,
        title: 'DST edge case',
        description: '',
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        // March 10, 2024 2:30 AM EST - during spring forward in US Eastern Time
        due_date: '2024-03-10T02:30:00-05:00',
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      mockClient.tasks.createTask.mockResolvedValue(dstTask);
      mockClient.tasks.getTask.mockResolvedValue(dstTask);

      const result = await callTool('create', {
        title: 'DST edge case',
        projectId: 1,
        due_date: '2024-03-10T02:30:00-05:00',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.task.due_date).toBe('2024-03-10T02:30:00-05:00');
    });

    it('should handle dates at timezone boundaries', async () => {
      const boundaryTask: Task = {
        id: 1,
        title: 'Timezone boundary test',
        description: '',
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        // Midnight UTC
        due_date: '2024-01-01T00:00:00Z',
        // Just before midnight in UTC+12
        start_date: '2024-01-01T23:59:59+12:00',
        // Just after midnight in UTC-12
        end_date: '2024-01-01T00:00:01-12:00',
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      mockClient.tasks.createTask.mockResolvedValue(boundaryTask);
      mockClient.tasks.getTask.mockResolvedValue(boundaryTask);

      const result = await callTool('create', {
        title: 'Timezone boundary test',
        projectId: 1,
        due_date: '2024-01-01T00:00:00Z',
        start_date: '2024-01-01T23:59:59+12:00',
        end_date: '2024-01-01T00:00:01-12:00',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.task.due_date).toBe('2024-01-01T00:00:00Z');
      expect(response.data.task.start_date).toBe('2024-01-01T23:59:59+12:00');
      expect(response.data.task.end_date).toBe('2024-01-01T00:00:01-12:00');
    });
  });

  describe('Large Dataset Tests', () => {
    it.skip('should handle pagination with large result sets', async () => {
      // Create 150 mock tasks (more than typical page size)
      const largeTasks: Task[] = Array.from({ length: 150 }, (_, i) => ({
        id: i + 1,
        title: `Task ${i + 1}`,
        description: `Description for task ${i + 1}`,
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: i + 1,
        is_favorite: false,
      }));

      mockClient.tasks.getProjectTasks.mockResolvedValue(largeTasks);

      const result = await callTool('list', {
        projectId: 1,
        page: 1,
        perPage: 50,
      });

      const response = JSON.parse(result.content[0].text);
      console.log('Pagination response structure:', JSON.stringify(response, null, 2));
      // Check what structure we actually get
      if (response.success !== undefined) {
        expect(response.success).toBe(true);
        expect(response.data).toEqual({ tasks: largeTasks });
        expect(response.metadata.count).toBe(150);
      } else {
        // Alternative structure - maybe data is at root level
        expect(response.tasks).toEqual(largeTasks);
        expect(response.count).toBe(150);
      }

      // Verify API was called with pagination params
      expect(mockClient.tasks.getProjectTasks).toHaveBeenCalledWith(1, {
        page: 1,
        per_page: 50,
      });
    });

    it.skip('should handle sorting with many items', async () => {
      const sortedTasks: Task[] = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        title: `Task ${String.fromCharCode(65 + (i % 26))}`, // A-Z repeating
        description: '',
        done: i % 2 === 0,
        done_at: i % 2 === 0 ? new Date('2024-01-01').toISOString() : null,
        priority: (i % 10) + 1, // Priority 1-10
        labels: [],
        assignees: [],
        due_date: new Date(2024, 0, (i % 30) + 1).toISOString(),
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: i + 1,
        is_favorite: false,
      }));

      mockClient.tasks.getAllTasks.mockResolvedValue(sortedTasks);

      const result = await callTool('list', {
        sort: 'priority desc, title asc',
      });

      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 1000,
        sort_by: 'priority desc, title asc',
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(100);
    });

    it('should handle complex filter queries efficiently', async () => {
      const filteredTasks: Task[] = [
        {
          id: 1,
          title: 'High priority urgent task',
          description: 'Important',
          done: false,
          done_at: null,
          priority: 10,
          labels: [],
          assignees: [],
          due_date: new Date('2024-02-01').toISOString(),
          start_date: null,
          end_date: null,
          repeat_after: 0,
          repeat_mode: 0,
          reminder_dates: [],
          hex_color: '',
          percent_done: 0,
          created: new Date('2024-01-01').toISOString(),
          updated: new Date('2024-01-01').toISOString(),
          created_by: mockUser,
          project: mockProject,
          relation_kind: '',
          index: 1,
          is_favorite: false,
        },
      ];

      mockClient.tasks.getAllTasks.mockResolvedValue(filteredTasks);

      const complexFilter =
        'priority >= 8 && done = false && dueDate < 2024-03-01 && (title like "urgent" || description like "important")';

      const result = await callTool('list', {
        filter: complexFilter,
      });

      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 1000,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it.skip('should handle page boundaries correctly', async () => {
      // Test edge case: exactly divisible by page size
      const tasks60: Task[] = Array.from({ length: 60 }, (_, i) => ({
        id: i + 1,
        title: `Task ${i + 1}`,
        description: '',
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: i + 1,
        is_favorite: false,
      }));

      // First page
      mockClient.tasks.getProjectTasks.mockResolvedValueOnce(tasks60.slice(0, 20));
      const page1 = await callTool('list', { projectId: 1, page: 1, perPage: 20 });
      const page1Response = JSON.parse(page1.content[0].text);
      expect(page1Response.data.tasks).toHaveLength(20);
      expect(page1Response.metadata.count).toBe(20);

      // Last page (exactly full)
      mockClient.tasks.getProjectTasks.mockResolvedValueOnce(tasks60.slice(40, 60));
      const page3 = await callTool('list', { projectId: 1, page: 3, perPage: 20 });
      const page3Response = JSON.parse(page3.content[0].text);
      expect(page3Response.data.tasks).toHaveLength(20);

      // Beyond last page (empty)
      mockClient.tasks.getProjectTasks.mockResolvedValueOnce([]);
      const page4 = await callTool('list', { projectId: 1, page: 4, perPage: 20 });
      const page4Response = JSON.parse(page4.content[0].text);
      expect(page4Response.data.tasks).toHaveLength(0);
    });
  });

  describe('Concurrent Operation Considerations', () => {
    it('should document expected behavior for update-then-delete scenario', async () => {
      const task: Task = {
        id: 1,
        title: 'Task to be updated then deleted',
        description: 'Original description',
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      // Mock getTask for the update operation
      mockClient.tasks.getTask.mockResolvedValueOnce(task);

      // Simulate update succeeding
      mockClient.tasks.updateTask.mockResolvedValueOnce({
        ...task,
        title: 'Updated title',
        updated: new Date('2024-01-02').toISOString(),
      });

      // Simulate delete failing because task was already deleted
      mockClient.tasks.deleteTask.mockRejectedValueOnce(new Error('Task not found'));

      // Update task
      const updateResult = await callTool('update', {
        id: 1,
        title: 'Updated title',
      });
      const updateResponse = JSON.parse(updateResult.content[0].text);
      expect(updateResponse.success).toBe(true);

      // Try to delete - should handle error gracefully
      await expect(callTool('delete', { id: 1 })).rejects.toThrow();
    });

    it('should handle stale data scenarios', async () => {
      const originalTask: Task = {
        id: 1,
        title: 'Original title',
        description: 'Original description',
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01T10:00:00Z').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      // Simulate another process updating the task
      const updatedByOther: Task = {
        ...originalTask,
        title: 'Updated by another process',
        updated: new Date('2024-01-01T11:00:00Z').toISOString(),
      };

      // Mock for get operation
      mockClient.tasks.getTask.mockResolvedValueOnce(originalTask);

      // Mock for update operation - getTask called before update
      mockClient.tasks.getTask.mockResolvedValueOnce(originalTask);

      // Our update attempt should work (API handles versioning)
      const updatedTask = {
        ...updatedByOther,
        description: 'Our update',
        updated: new Date('2024-01-01T11:01:00Z').toISOString(),
      };
      mockClient.tasks.updateTask.mockResolvedValueOnce(updatedTask);

      // Mock getTask after update to return the updated task
      mockClient.tasks.getTask.mockResolvedValueOnce(updatedTask);

      // Get task
      const getResult = await callTool('get', { id: 1 });
      const getResponse = JSON.parse(getResult.content[0].text);
      expect(getResponse.data.task.title).toBe('Original title');

      // Update task (will succeed despite stale data)
      const updateResult = await callTool('update', {
        id: 1,
        description: 'Our update',
      });
      const updateResponse = JSON.parse(updateResult.content[0].text);
      expect(updateResponse.success).toBe(true);
      expect(updateResponse.data.task.description).toBe('Our update');
    });

    it('should handle rapid sequential operations', async () => {
      let taskState: Task = {
        id: 1,
        title: 'Rapid operations test',
        description: '',
        done: false,
        done_at: null,
        priority: 1,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      // Mock getTask calls - each update calls getTask before and after
      // For 4 updates, we need 8 getTask mocks
      mockClient.tasks.getTask
        .mockResolvedValueOnce(taskState) // Before update 1
        .mockResolvedValueOnce({ ...taskState, priority: 2 }) // After update 1
        .mockResolvedValueOnce({ ...taskState, priority: 2 }) // Before update 2
        .mockResolvedValueOnce({ ...taskState, priority: 3 }) // After update 2
        .mockResolvedValueOnce({ ...taskState, priority: 3 }) // Before update 3
        .mockResolvedValueOnce({ ...taskState, priority: 4 }) // After update 3
        .mockResolvedValueOnce({ ...taskState, priority: 4 }) // Before update 4
        .mockResolvedValueOnce({ ...taskState, priority: 5 }); // After update 4

      // Mock sequential updates
      mockClient.tasks.updateTask
        .mockResolvedValueOnce({ ...taskState, priority: 2 })
        .mockResolvedValueOnce({ ...taskState, priority: 3 })
        .mockResolvedValueOnce({ ...taskState, priority: 4 })
        .mockResolvedValueOnce({ ...taskState, priority: 5 });

      // Perform rapid updates
      const results = [];
      for (let i = 2; i <= 5; i++) {
        results.push(await callTool('update', { id: 1, priority: i }));
      }

      // All updates should succeed
      expect(results).toHaveLength(4);
      results.forEach((result, index) => {
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.data.task.priority).toBe(index + 2);
      });
    });
  });

  describe('Boundary Value Tests', () => {
    it('should handle numeric fields at min/max values', async () => {
      // Test minimum values
      const minTask: Task = {
        id: 1,
        title: 'Min values test',
        description: '',
        done: false,
        done_at: null,
        priority: 0, // Minimum priority
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0, // No repeat
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0, // 0%
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 0,
        is_favorite: false,
      };

      mockClient.tasks.createTask.mockResolvedValueOnce(minTask);
      mockClient.tasks.getTask.mockResolvedValueOnce(minTask);

      const minResult = await callTool('create', {
        title: 'Min values test',
        projectId: 1,
        priority: 0,
        percent_done: 0,
      });

      const minResponse = JSON.parse(minResult.content[0].text);
      expect(minResponse.data.task.priority).toBe(0);
      expect(minResponse.data.task.percent_done).toBe(0);

      // Test maximum values
      const maxTask: Task = {
        id: 2,
        title: 'Max values test',
        description: '',
        done: false,
        done_at: null,
        priority: 10, // Maximum priority
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 31536000, // 1 year in seconds
        repeat_mode: 2,
        reminder_dates: [],
        hex_color: '',
        percent_done: 100, // 100%
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 999999,
        is_favorite: true,
      };

      mockClient.tasks.createTask.mockResolvedValueOnce(maxTask);
      mockClient.tasks.getTask.mockResolvedValueOnce(maxTask);

      const maxResult = await callTool('create', {
        title: 'Max values test',
        projectId: 1,
        priority: 10,
        percent_done: 100,
        repeat_after: 31536000,
      });

      const maxResponse = JSON.parse(maxResult.content[0].text);
      expect(maxResponse.data.task.priority).toBe(10);
      expect(maxResponse.data.task.percent_done).toBe(100);
      expect(maxResponse.data.task.repeat_after).toBe(31536000);
    });

    it('should handle string fields at maximum lengths', async () => {
      // Test with maximum reasonable lengths
      const maxLengthTitle = 'T'.repeat(500);
      const maxLengthDescription = 'D'.repeat(10000);
      const maxLengthHexColor = '#FFFFFF';

      const maxLengthTask: Task = {
        id: 1,
        title: maxLengthTitle,
        description: maxLengthDescription,
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: maxLengthHexColor,
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      mockClient.tasks.createTask.mockResolvedValueOnce(maxLengthTask);
      mockClient.tasks.getTask.mockResolvedValueOnce(maxLengthTask);

      const result = await callTool('create', {
        title: maxLengthTitle,
        description: maxLengthDescription,
        projectId: 1,
        hex_color: maxLengthHexColor,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.task.title).toBe(maxLengthTitle);
      expect(response.data.task.description).toBe(maxLengthDescription);
      expect(response.data.task.hex_color).toBe(maxLengthHexColor);
    });

    it('should handle arrays with 0, 1, and many items', async () => {
      // Mock labels
      const labels: Label[] = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        title: `Label ${i + 1}`,
        description: '',
        hex_color: '#FF0000',
        created_by: mockUser,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
      }));

      mockClient.labels.getLabels.mockResolvedValue(labels);

      // Test with 0 labels
      const task0Labels: Task = {
        id: 1,
        title: 'Task with 0 labels',
        description: '',
        done: false,
        done_at: null,
        priority: 5,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      mockClient.tasks.createTask.mockResolvedValueOnce(task0Labels);
      mockClient.tasks.getTask.mockResolvedValueOnce(task0Labels);
      const result0 = await callTool('create', {
        title: 'Task with 0 labels',
        projectId: 1,
      });
      const response0 = JSON.parse(result0.content[0].text);
      expect(response0.data.task.labels).toHaveLength(0);

      // Test with 1 label
      const task1Label: Task = {
        ...task0Labels,
        id: 2,
        title: 'Task with 1 label',
        labels: [labels[0]],
      };

      mockClient.tasks.createTask.mockResolvedValueOnce(task1Label);
      mockClient.tasks.getTask.mockResolvedValueOnce(task1Label);
      const result1 = await callTool('create', {
        title: 'Task with 1 label',
        projectId: 1,
        labels: ['Label 1'],
      });
      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.data.task.labels).toHaveLength(1);

      // Test with many labels and assignees
      const manyUsers = Array.from({ length: 10 }, (_, i) => ({
        ...mockUser,
        id: i + 1,
        username: `user${i + 1}`,
      }));

      const taskManyItems: Task = {
        ...task0Labels,
        id: 3,
        title: 'Task with many items',
        labels: labels.slice(0, 10),
        assignees: manyUsers,
        reminder_dates: Array.from({ length: 5 }, (_, i) => new Date(2024, i, 1).toISOString()),
      };

      mockClient.tasks.createTask.mockResolvedValueOnce(taskManyItems);
      mockClient.tasks.getTask.mockResolvedValueOnce(taskManyItems);
      mockClient.users.getAll.mockResolvedValue(manyUsers);

      const resultMany = await callTool('create', {
        title: 'Task with many items',
        projectId: 1,
        labels: labels.slice(0, 10).map((l) => l.title),
        assignees: manyUsers.map((u) => u.id),
      });

      const responseMany = JSON.parse(resultMany.content[0].text);
      expect(responseMany.data.task.labels).toHaveLength(10);
      expect(responseMany.data.task.assignees).toHaveLength(10);
      expect(responseMany.data.task.reminder_dates).toHaveLength(5);
    });

    it('should handle optional vs required field combinations', async () => {
      // Test with only required fields
      const minimalTask: Task = {
        id: 1,
        title: 'Minimal task',
        description: '',
        done: false,
        done_at: null,
        priority: 0,
        labels: [],
        assignees: [],
        due_date: null,
        start_date: null,
        end_date: null,
        repeat_after: 0,
        repeat_mode: 0,
        reminder_dates: [],
        hex_color: '',
        percent_done: 0,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: '',
        index: 1,
        is_favorite: false,
      };

      mockClient.tasks.createTask.mockResolvedValueOnce(minimalTask);
      mockClient.tasks.getTask.mockResolvedValueOnce(minimalTask);

      const minimalResult = await callTool('create', {
        title: 'Minimal task',
        projectId: 1,
      });

      const minimalResponse = JSON.parse(minimalResult.content[0].text);
      expect(minimalResponse.success).toBe(true);
      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Minimal task',
        project_id: 1,
      });

      // Test with all possible fields
      const fullTask: Task = {
        id: 2,
        title: 'Full task',
        description: 'Complete description',
        done: true,
        done_at: new Date('2024-01-02').toISOString(),
        priority: 8,
        labels: [],
        assignees: [],
        due_date: new Date('2024-12-31').toISOString(),
        start_date: new Date('2024-01-01').toISOString(),
        end_date: new Date('2024-12-31').toISOString(),
        repeat_after: 86400,
        repeat_mode: 1,
        reminder_dates: [new Date('2024-06-01').toISOString()],
        hex_color: '#FF5733',
        percent_done: 75,
        created: new Date('2024-01-01').toISOString(),
        updated: new Date('2024-01-01').toISOString(),
        created_by: mockUser,
        project: mockProject,
        relation_kind: 'subtask',
        index: 5,
        is_favorite: true,
      };

      mockClient.tasks.createTask.mockResolvedValueOnce(fullTask);
      mockClient.tasks.getTask.mockResolvedValueOnce(fullTask);

      const fullResult = await callTool('create', {
        title: 'Full task',
        description: 'Complete description',
        projectId: 1,
        done: true,
        priority: 8,
        due_date: new Date('2024-12-31').toISOString(),
        start_date: new Date('2024-01-01').toISOString(),
        end_date: new Date('2024-12-31').toISOString(),
        repeat_after: 86400,
        repeat_mode: 1,
        hex_color: '#FF5733',
        percent_done: 75,
        is_favorite: true,
      });

      const fullResponse = JSON.parse(fullResult.content[0].text);
      expect(fullResponse.success).toBe(true);
      expect(fullResponse.data.task.title).toBe('Full task');
      expect(fullResponse.data.task.description).toBe('Complete description');
      expect(fullResponse.data.task.priority).toBe(8);
    });
  });
});
