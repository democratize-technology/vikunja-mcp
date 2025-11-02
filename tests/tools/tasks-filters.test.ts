/**
 * Integration tests for tasks tool with filters
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import { registerTasksTool } from '../../src/tools/tasks';
import { storageManager } from '../../src/storage/FilterStorage';
import { MCPError } from '../../src/types';
import type { Task } from 'node-vikunja';
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
jest.mock('../../src/utils/logger');

describe('Tasks Tool - Filter Integration', () => {
  let mockClient: MockVikunjaClient;
  let mockAuthManager: MockAuthManager;
  let mockServer: MockServer;
  let toolHandler: (args: any) => Promise<any>;
  let testStorage: Awaited<ReturnType<typeof storageManager.getStorage>>;

  // Clean up after all tests to prevent Jest warnings
  afterAll(async () => {
    await storageManager.clearAll();
    storageManager.stopCleanupTimer();
  });

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
    done_at: null,
    priority: 5,
    labels: [],
    assignees: [],
    due_date: null,
    start_date: null,
    end_date: null,
    repeat_after: 0,
    repeat_from_current_date: false,
    reminder_dates: [],
    hex_color: '',
    percent_done: 0,
    bucket_id: 0,
    identifier: '',
    index: 0,
    cover_image_attachment_id: null,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    createdBy: {
      id: 1,
      name: '',
      username: 'testuser',
      email: 'test@example.com',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    is_current_user_assigned: false,
    subscription_id: 0,
  } as unknown as Task;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Clear all storage sessions
    await storageManager.clearAll();

    // Create fresh mock instances
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

    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getAuthenticatedClient: jest.fn(),
      updateCredentials: jest.fn(),
      clearCredentials: jest.fn(),
      verifyCredentials: jest.fn(),
      getCredentials: jest.fn(),
      authenticate: jest.fn(),
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
      tool: jest.fn((name: string, schema: any, handler: any) => {
        toolHandler = handler;
      }),
    } as MockServer;

    // Set up the mock client
    (getClientFromContext as jest.MockedFunction<typeof getClientFromContext>).mockResolvedValue(
      mockClient,
    );
    (getClientFromContext as jest.MockedFunction<typeof getClientFromContext>).mockResolvedValue(
      mockClient,
    );

    // Get test storage instance for the same session that will be used in the tool
    const session = mockAuthManager.getSession();
    const sessionId = `${session.apiUrl}:${session.apiToken?.substring(0, 8)}` || 'anonymous';
    testStorage = await storageManager.getStorage(sessionId, session.userId, session.apiUrl);

    // Register the tool
    registerTasksTool(mockServer as any, mockAuthManager);
  });

  describe('list with direct filter strings', () => {
    it('should apply client-side filtering in test environment', async () => {
      // Return tasks with different priorities
      const highPriorityTask = { ...mockTask, id: 1, priority: 5 };
      const mediumPriorityTask = { ...mockTask, id: 2, priority: 3 };
      const lowPriorityTask = { ...mockTask, id: 3, priority: 1 };
      
      // Mock client-side filtering approach (default in test environment)
      mockClient.tasks.getAllTasks.mockResolvedValueOnce([
        highPriorityTask,
        mediumPriorityTask,
        lowPriorityTask,
      ]);

      const result = await callTool('list', { filter: 'priority >= 3' });

      // Verify client-side approach was used (no filter parameter in API call)
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 1000,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list-tasks');
      // Verify client-side filtering worked
      expect(response.data.tasks).toHaveLength(2);
      expect(response.data.tasks[0].priority).toBe(5);
      expect(response.data.tasks[1].priority).toBe(3);
      expect(response.metadata.clientSideFiltering).toBe(true);
      expect(response.metadata.serverSideFilteringAttempted).toBe(false);
      expect(response.metadata.serverSideFilteringUsed).toBe(false);
      expect(response.metadata.filter).toBe('priority >= 3');
      expect(response.message).toContain('(filtered client-side');
    });

    it('should handle filtering with client-side strategy by default', async () => {
      // Return pre-filtered tasks (simulating what would happen with filtering)
      const highPriorityTask = { ...mockTask, id: 1, priority: 5 };
      const mediumPriorityTask = { ...mockTask, id: 2, priority: 3 };
      
      mockClient.tasks.getAllTasks.mockResolvedValue([
        highPriorityTask,
        mediumPriorityTask,
      ]);

      const result = await callTool('list', { filter: 'priority >= 3' });

      // Verify client-side approach (no filter parameter sent to API)
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 1000,
      });

      // Should only be called once
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledTimes(1);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list-tasks');
      // Verify client-side filtering was used
      expect(response.data.tasks).toHaveLength(2);
      expect(response.data.tasks[0].priority).toBe(5);
      expect(response.data.tasks[1].priority).toBe(3);
      expect(response.metadata.clientSideFiltering).toBe(true);
      expect(response.metadata.serverSideFilteringUsed).toBe(false);
      expect(response.metadata.serverSideFilteringAttempted).toBe(false);
      expect(response.metadata.filter).toBe('priority >= 3');
      expect(response.message).toContain('client-side');
    });

    it('should handle complex filter expressions', async () => {
      // Return tasks with different states
      const task1 = { ...mockTask, id: 1, done: false, priority: 4 };
      const task2 = { ...mockTask, id: 2, done: true, priority: 5 };
      const task3 = { ...mockTask, id: 3, done: false, priority: 2 };
      const task4 = { ...mockTask, id: 4, done: false, priority: 5 };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2, task3, task4]);

      const result = await callTool('list', {
        filter: '(done = false && priority >= 4) || (done = true && priority = 5)',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(3); // task1, task2, task4
      expect(response.data.tasks.map((t: any) => t.id)).toEqual([1, 2, 4]);
    });

    it('should return validation error for invalid filter syntax', async () => {
      await expect(callTool('list', { filter: 'invalid filter syntax' })).rejects.toThrow(MCPError);

      await expect(callTool('list', { filter: 'invalid filter syntax' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('Invalid filter syntax'),
      });
    });

    it('should handle filter with date comparisons', async () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const taskDueTomorrow = { ...mockTask, id: 1, due_date: tomorrow.toISOString() };
      const taskDueNextWeek = { ...mockTask, id: 2, due_date: nextWeek.toISOString() };
      const taskNoDueDate = { ...mockTask, id: 3, due_date: null };

      mockClient.tasks.getAllTasks.mockResolvedValue([
        taskDueTomorrow,
        taskDueNextWeek,
        taskNoDueDate,
      ]);

      const result = await callTool('list', { filter: 'dueDate < now+3d' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(1);
    });

    it('should handle filter with assignee/label arrays', async () => {
      const task1 = {
        ...mockTask,
        id: 1,
        assignees: [{ id: 1, username: 'user1' }],
        labels: [{ id: 10, title: 'bug' }],
      };
      const task2 = {
        ...mockTask,
        id: 2,
        assignees: [{ id: 2, username: 'user2' }],
        labels: [{ id: 20, title: 'feature' }],
      };
      const task3 = {
        ...mockTask,
        id: 3,
        assignees: [
          { id: 1, username: 'user1' },
          { id: 2, username: 'user2' },
        ],
        labels: [
          { id: 10, title: 'bug' },
          { id: 20, title: 'feature' },
        ],
      };

      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2, task3]);

      const result = await callTool('list', { filter: 'assignees in 1 && labels in 10' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(2); // task1 and task3
      expect(response.data.tasks.map((t: any) => t.id)).toEqual([1, 3]);
    });

    it('should handle string filters with like operator', async () => {
      const task1 = { ...mockTask, id: 1, title: 'Fix urgent bug' };
      const task2 = { ...mockTask, id: 2, title: 'Add new feature' };
      const task3 = { ...mockTask, id: 3, title: 'Update documentation' };

      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2, task3]);

      const result = await callTool('list', { filter: 'title like "bug"' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(1);
    });
  });

  describe('list with saved filters', () => {
    it('should apply a saved filter by ID', async () => {
      // Create a saved filter
      const savedFilter = await testStorage.create({
        name: 'High Priority',
        filter: 'priority >= 4',
        isGlobal: true,
      });

      // Return tasks with different priorities to test filtering
      const highPriorityTask = { ...mockTask, id: 1, priority: 5 };
      const lowPriorityTask = { ...mockTask, id: 2, priority: 2 };
      mockClient.tasks.getAllTasks.mockResolvedValue([highPriorityTask, lowPriorityTask]);

      const result = await callTool('list', { filterId: savedFilter.id });

      // Verify the filter was NOT passed to API, but default pagination was applied
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 1000,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list-tasks');
      // Verify client-side filtering worked
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].priority).toBe(5);
      expect(response.metadata.clientSideFiltering).toBe(true);
    });

    it('should apply project-specific saved filter', async () => {
      const projectId = 42;

      // Create a project-specific filter
      const savedFilter = await testStorage.create({
        name: 'Project Tasks',
        filter: 'done = false && priority >= 3',
        projectId,
        isGlobal: false,
      });

      // Return tasks with different states to test filtering
      const undoneHighPriorityTask = { ...mockTask, id: 1, done: false, priority: 4 };
      const doneHighPriorityTask = { ...mockTask, id: 2, done: true, priority: 4 };
      const undoneLowPriorityTask = { ...mockTask, id: 3, done: false, priority: 2 };
      mockClient.tasks.getProjectTasks.mockResolvedValue([
        undoneHighPriorityTask,
        doneHighPriorityTask,
        undoneLowPriorityTask,
      ]);

      const result = await callTool('list', {
        projectId,
        filterId: savedFilter.id,
      });

      // Verify the filter was NOT passed to API, but default pagination was applied
      expect(mockClient.tasks.getProjectTasks).toHaveBeenCalledWith(projectId, {
        page: 1,
        per_page: 1000,
      });

      const response = JSON.parse(result.content[0].text);
      // Verify client-side filtering worked (done = false && priority >= 3)
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].done).toBe(false);
      expect(response.data.tasks[0].priority).toBe(4);
    });

    it('should throw error for non-existent filter ID', async () => {
      await expect(callTool('list', { filterId: 'non-existent-id' })).rejects.toThrow(MCPError);

      await expect(callTool('list', { filterId: 'non-existent-id' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('Filter with id non-existent-id not found'),
      });
    });

    it('should prefer filterId over direct filter parameter', async () => {
      // Create a saved filter
      const savedFilter = await testStorage.create({
        name: 'Saved Filter',
        filter: 'priority = 5',
        isGlobal: true,
      });

      // Return tasks with different priorities
      const priority5Task = { ...mockTask, id: 1, priority: 5 };
      const priority1Task = { ...mockTask, id: 2, priority: 1 };
      mockClient.tasks.getAllTasks.mockResolvedValue([priority5Task, priority1Task]);

      // Provide both filterId and filter
      const result = await callTool('list', {
        filterId: savedFilter.id,
        filter: 'priority = 1', // This should be ignored
      });

      // Verify no filter was passed to API, but default pagination was applied
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 1000,
      });

      const response = JSON.parse(result.content[0].text);
      // Verify the saved filter was used for client-side filtering
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].priority).toBe(5);
    });

    it('should work with pagination and saved filters', async () => {
      const savedFilter = await testStorage.create({
        name: 'Paginated Filter',
        filter: 'done = false',
        isGlobal: true,
      });

      // Return multiple tasks to test pagination with filtering
      const undoneTask = { ...mockTask, id: 1, done: false };
      const doneTask = { ...mockTask, id: 2, done: true };
      mockClient.tasks.getAllTasks.mockResolvedValue([undoneTask, doneTask]);

      const result = await callTool('list', {
        filterId: savedFilter.id,
        page: 2,
        perPage: 10,
        sort: 'priority',
      });

      // Verify filter was NOT passed to API, but other params were
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 2,
        per_page: 10,
        sort_by: 'priority',
      });

      const response = JSON.parse(result.content[0].text);
      // Verify client-side filtering worked
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].done).toBe(false);
    });

    it('should work with search and saved filters', async () => {
      const savedFilter = await testStorage.create({
        name: 'Search Filter',
        filter: 'priority >= 3',
        isGlobal: true,
      });

      // Return tasks with different priorities
      const highPriorityTask = { ...mockTask, id: 1, priority: 4, title: 'Urgent task' };
      const lowPriorityTask = { ...mockTask, id: 2, priority: 1, title: 'Not urgent' };
      mockClient.tasks.getAllTasks.mockResolvedValue([highPriorityTask, lowPriorityTask]);

      const result = await callTool('list', {
        filterId: savedFilter.id,
        search: 'urgent',
      });

      // Verify filter was NOT passed but search was, plus default pagination
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 1000,
        s: 'urgent',
      });

      // Note: The search is handled by the API, our client-side filter applies after
      // In this test, we assume the API would return tasks matching 'urgent'
    });

    it('should apply client-side done filter with saved filter', async () => {
      const savedFilter = await testStorage.create({
        name: 'Priority Filter',
        filter: 'priority >= 3',
        isGlobal: true,
      });

      const doneTask = { ...mockTask, id: 2, done: true };
      const undoneTask = { ...mockTask, id: 3, done: false };

      mockClient.tasks.getAllTasks.mockResolvedValue([doneTask, undoneTask]);

      const result = await callTool('list', {
        filterId: savedFilter.id,
        done: false, // Client-side filter
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].done).toBe(false);
    });
  });

  describe('filter evaluation edge cases', () => {
    it('should handle percentDone field filtering', async () => {
      const task1 = { ...mockTask, id: 1, percent_done: 0 };
      const task2 = { ...mockTask, id: 2, percent_done: 50 };
      const task3 = { ...mockTask, id: 3, percent_done: 100 };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2, task3]);

      const result = await callTool('list', { filter: 'percentDone >= 50' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(2);
      expect(response.data.tasks.map((t: any) => t.id)).toEqual([2, 3]);
    });

    it('should handle created date field filtering', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const task1 = { ...mockTask, id: 1, created: yesterday.toISOString() };
      const task2 = { ...mockTask, id: 2, created: tomorrow.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'created < now' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(1);
    });

    it('should handle updated date field filtering', async () => {
      const now = new Date();
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const task1 = { ...mockTask, id: 1, updated: lastWeek.toISOString() };
      const task2 = { ...mockTask, id: 2, updated: nextWeek.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'updated > now-3d' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(2);
    });

    it('should handle description field filtering with empty descriptions', async () => {
      const task1 = { ...mockTask, id: 1, description: 'Important task' };
      const task2 = { ...mockTask, id: 2, description: '' };
      const task3 = { ...mockTask, id: 3, description: 'Another task' };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2, task3]);

      const result = await callTool('list', { filter: 'description like "task"' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(2);
      expect(response.data.tasks.map((t: any) => t.id)).toEqual([1, 3]);
    });

    it('should handle invalid field names in filters', async () => {
      mockClient.tasks.getAllTasks.mockResolvedValue([mockTask]);

      // Invalid field names cause parse errors because they're not recognized tokens
      await expect(callTool('list', { filter: 'invalidField = "test"' })).rejects.toThrow(
        'Invalid filter syntax',
      );
    });

    it('should handle default case in evaluateCondition', async () => {
      // This tests the default case by creating a malformed AST that bypasses normal parsing
      const task1 = { ...mockTask, id: 1 };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1]);

      // We need to test the internal logic, so let's use an invalid operator
      await expect(callTool('list', { filter: 'priority INVALID 5' })).rejects.toThrow(
        'Invalid filter syntax',
      );
    });
  });

  describe('date comparison operators', () => {
    it('should handle date equality (=) operator', async () => {
      const targetDate = '2024-01-15T00:00:00Z';
      const task1 = { ...mockTask, id: 1, due_date: targetDate };
      const task2 = { ...mockTask, id: 2, due_date: '2024-01-16T00:00:00Z' };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'dueDate = "2024-01-15T00:00:00Z"' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(1);
    });

    it('should handle date inequality (!=) operator', async () => {
      const targetDate = '2024-01-15T00:00:00Z';
      const task1 = { ...mockTask, id: 1, due_date: targetDate };
      const task2 = { ...mockTask, id: 2, due_date: '2024-01-16T00:00:00Z' };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'dueDate != "2024-01-15T00:00:00Z"' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(2);
    });

    it('should handle date greater than (>) operator', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const task1 = { ...mockTask, id: 1, due_date: yesterday.toISOString() };
      const task2 = { ...mockTask, id: 2, due_date: tomorrow.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'dueDate > now' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(2);
    });

    it('should handle date greater than or equal (>=) operator', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const oneHourFromNow = new Date(now);
      oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const task1 = { ...mockTask, id: 1, due_date: yesterday.toISOString() };
      const task2 = { ...mockTask, id: 2, due_date: oneHourFromNow.toISOString() };
      const task3 = { ...mockTask, id: 3, due_date: tomorrow.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2, task3]);

      const result = await callTool('list', { filter: 'dueDate >= now' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(2);
      expect(response.data.tasks.map((t: any) => t.id)).toEqual([2, 3]);
    });

    it('should handle date less than (<) operator', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const task1 = { ...mockTask, id: 1, due_date: yesterday.toISOString() };
      const task2 = { ...mockTask, id: 2, due_date: tomorrow.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'dueDate < now' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(1);
    });

    it('should handle date less than or equal (<=) operator', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const task1 = { ...mockTask, id: 1, due_date: yesterday.toISOString() };
      const task2 = { ...mockTask, id: 2, due_date: now.toISOString() };
      const task3 = { ...mockTask, id: 3, due_date: tomorrow.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2, task3]);

      const result = await callTool('list', { filter: 'dueDate <= now' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(2);
      expect(response.data.tasks.map((t: any) => t.id)).toEqual([1, 2]);
    });

    it('should handle invalid date comparison operator', async () => {
      const task1 = { ...mockTask, id: 1, due_date: '2024-01-15T00:00:00Z' };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1]);

      // Test with an invalid operator that would hit the default case
      await expect(callTool('list', { filter: 'dueDate ~ now' })).rejects.toThrow(
        'Invalid filter syntax',
      );
    });
  });

  describe('relative date parsing with all time units', () => {
    it('should handle seconds (s) time unit', async () => {
      const now = new Date();
      const thirtySecondsAgo = new Date(now.getTime() - 30000);
      const thirtySecondsFromNow = new Date(now.getTime() + 30000);

      const task1 = { ...mockTask, id: 1, created: thirtySecondsAgo.toISOString() };
      const task2 = { ...mockTask, id: 2, created: thirtySecondsFromNow.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'created > now-60s' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(2);
    });

    it('should handle minutes (m) time unit', async () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      const task1 = { ...mockTask, id: 1, created: fiveMinutesAgo.toISOString() };
      const task2 = { ...mockTask, id: 2, created: tenMinutesAgo.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'created > now-7m' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(1);
    });

    it('should handle hours (h) time unit', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      const task1 = { ...mockTask, id: 1, created: twoHoursAgo.toISOString() };
      const task2 = { ...mockTask, id: 2, created: fourHoursAgo.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'created > now-3h' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(1);
    });

    it('should handle months (M) time unit', async () => {
      const now = new Date();
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const task1 = { ...mockTask, id: 1, created: oneMonthAgo.toISOString() };
      const task2 = { ...mockTask, id: 2, created: threeMonthsAgo.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'created > now-2M' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(1);
    });

    it('should handle years (y) time unit', async () => {
      const now = new Date();
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const threeYearsAgo = new Date(now);
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

      const task1 = { ...mockTask, id: 1, created: oneYearAgo.toISOString() };
      const task2 = { ...mockTask, id: 2, created: threeYearsAgo.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'created > now-2y' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(1);
    });

    it('should handle "now" without offset', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const task1 = { ...mockTask, id: 1, due_date: yesterday.toISOString() };
      const task2 = { ...mockTask, id: 2, due_date: tomorrow.toISOString() };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'dueDate = now' });

      const response = JSON.parse(result.content[0].text);
      // Should match neither task as they're not exactly "now"
      expect(response.data.tasks).toHaveLength(0);
    });

    it('should handle invalid time unit in relative date', async () => {
      const task1 = { ...mockTask, id: 1, due_date: '2024-01-15T00:00:00Z' };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1]);

      // Invalid relative dates are parsed as literal strings, which won't match any tasks
      const result = await callTool('list', { filter: 'dueDate > now-5x' });
      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(0);
    });
  });

  describe('string comparison operators', () => {
    it('should handle string inequality (!=) operator', async () => {
      const task1 = { ...mockTask, id: 1, title: 'Important task' };
      const task2 = { ...mockTask, id: 2, title: 'Regular task' };
      const task3 = { ...mockTask, id: 3, title: 'Important task' };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2, task3]);

      const result = await callTool('list', { filter: 'title != "Important task"' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(2);
    });

    it('should handle invalid string comparison operator', async () => {
      const task1 = { ...mockTask, id: 1, title: 'Test task' };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1]);

      // Invalid operators for strings just return false (no match)
      const result = await callTool('list', { filter: 'title > "test"' });
      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(0);
    });
  });

  describe('array comparison edge cases', () => {
    it('should handle invalid array comparison operator', async () => {
      const task1 = { ...mockTask, id: 1, labels: [{ id: 1, title: 'bug' }] };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1]);

      // Invalid operators for arrays just return false (no match)
      const result = await callTool('list', { filter: 'labels = 1' });
      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(0);
    });
  });

  describe('general comparison edge cases', () => {
    it('should handle != operator in evaluateComparison', async () => {
      const task1 = { ...mockTask, id: 1, priority: 5 };
      const task2 = { ...mockTask, id: 2, priority: 3 };
      mockClient.tasks.getAllTasks.mockResolvedValue([task1, task2]);

      const result = await callTool('list', { filter: 'priority != 5' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.tasks).toHaveLength(1);
      expect(response.data.tasks[0].id).toBe(2);
    });
  });
});
