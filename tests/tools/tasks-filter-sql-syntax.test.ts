/**
 * Tests for SQL-like filter syntax handling
 * Tests filtering functionality with complex boolean expressions
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import { registerTasksTool } from '../../src/tools/tasks';
import { MCPError } from '../../src/types';
import type { Task } from 'node-vikunja';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';

// Import the function we're mocking
import { getVikunjaClient } from '../../src/client';

// Mock the modules
jest.mock('../../src/client', () => ({
  getVikunjaClient: jest.fn(),
  setAuthManager: jest.fn(),
  cleanupVikunjaClient: jest.fn(),
}));
jest.mock('../../src/auth/AuthManager');
jest.mock('../../src/utils/logger');

describe('Tasks Tool - SQL-like Filter Syntax', () => {
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
  const mockHighPriorityTask: Task = {
    id: 1,
    title: 'High Priority Task',
    description: 'Important task',
    done: false,
    priority: 5,
    project_id: 1,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  } as Task;

  const mockLowPriorityTask: Task = {
    id: 2,
    title: 'Low Priority Task',
    description: 'Less important task',
    done: false,
    priority: 2,
    project_id: 1,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  } as Task;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

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

    mockServer = {
      tool: jest.fn((name: string, schema: any, handler: any) => {
        toolHandler = handler;
      }),
    } as MockServer;

    // Set up the mock client
    (getVikunjaClient as jest.MockedFunction<typeof getVikunjaClient>).mockResolvedValue(
      mockClient,
    );

    // Register the tool
    registerTasksTool(mockServer as any, mockAuthManager);
  });

  describe('Filter string with special characters', () => {
    it('should pass simple filter with parentheses directly to API', async () => {
      // Simple filter with parentheses
      const filter = '(priority >= 4)';

      // Mock successful response - the API should handle the filter correctly
      mockClient.tasks.getAllTasks.mockResolvedValue([mockHighPriorityTask]);

      const result = await callTool('list', { filter });

      // Verify that only pagination parameters are passed to the API (client-side filtering)
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 1000,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.tasks).toHaveLength(1);
      expect(response.tasks[0].priority).toBeGreaterThanOrEqual(4);
    });

    it('should handle complex filter that cannot be converted', async () => {
      // This is the exact filter from the issue report - too complex to convert
      const filter = '(priority >= 4 && done = false)';

      // Mock error response since complex filters can't be converted
      mockClient.tasks.getAllTasks.mockRejectedValue(new Error('Internal Server Error'));

      await expect(callTool('list', { filter })).rejects.toThrow(MCPError);
    });

    it('should handle filter without parentheses', async () => {
      const filter = 'priority >= 4 && done = false';

      // Complex filter can't be converted
      mockClient.tasks.getAllTasks.mockRejectedValue(new Error('Internal Server Error'));

      await expect(callTool('list', { filter })).rejects.toThrow(MCPError);
    });

    it('should handle simple filter expressions', async () => {
      const filter = 'priority >= 4';

      mockClient.tasks.getAllTasks.mockResolvedValue([mockHighPriorityTask]);

      const result = await callTool('list', { filter });

      // Should not pass filter to API (client-side filtering)
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 1,
        per_page: 1000,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle complex filter with multiple conditions', async () => {
      const filter = "(priority >= 3 && priority <= 5) || (done = true && updated > '2024-01-01')";

      // Complex filter can't be converted
      mockClient.tasks.getAllTasks.mockRejectedValue(new Error('Internal Server Error'));

      await expect(callTool('list', { filter })).rejects.toThrow(MCPError);
    });

    it('should handle filter with project-specific tasks', async () => {
      const projectId = 42;
      const filter = '(priority >= 4 && done = false)';

      mockClient.tasks.getProjectTasks.mockResolvedValue([mockHighPriorityTask]);

      const result = await callTool('list', { projectId, filter });

      expect(mockClient.tasks.getProjectTasks).toHaveBeenCalledWith(projectId, {
        page: 1,
        per_page: 1000,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should combine filter with other query parameters', async () => {
      const filter = '(priority >= 4 && done = false)';

      mockClient.tasks.getAllTasks.mockResolvedValue([mockHighPriorityTask]);

      const result = await callTool('list', {
        filter,
        page: 2,
        perPage: 20,
        sort: 'priority',
        search: 'urgent',
      });

      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
        page: 2,
        per_page: 20,
        sort_by: 'priority',
        s: 'urgent',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      const filter = '(priority >= 4 && done = false)';

      // Simulate the Internal Server Error from the issue
      mockClient.tasks.getAllTasks.mockRejectedValue(new Error('Internal Server Error'));

      await expect(callTool('list', { filter })).rejects.toThrow(MCPError);
      await expect(callTool('list', { filter })).rejects.toMatchObject({
        code: 'API_ERROR',
        message: expect.stringContaining('Failed to list tasks'),
      });
    });
  });

  describe('Filter operators', () => {
    const testCases = [
      {
        filter: 'priority = 5',
        description: 'equals operator',
        expected: { page: 1, per_page: 1000 },
      },
      {
        filter: 'priority > 3',
        description: 'greater than operator',
        expected: { page: 1, per_page: 1000 },
      },
      {
        filter: 'priority >= 4',
        description: 'greater than or equal operator',
        expected: { page: 1, per_page: 1000 },
      },
      {
        filter: 'priority < 3',
        description: 'less than operator',
        expected: { page: 1, per_page: 1000 },
      },
      {
        filter: 'priority <= 2',
        description: 'less than or equal operator',
        expected: { page: 1, per_page: 1000 },
      },
      {
        filter: "title like 'urgent'",
        description: 'like operator',
        expected: { page: 1, per_page: 1000 },
      },
      {
        filter: 'priority in 3,4,5',
        description: 'in operator',
        expected: { page: 1, per_page: 1000 },
      },
    ];

    testCases.forEach(({ filter, description, expected }) => {
      it(`should handle ${description}`, async () => {
        mockClient.tasks.getAllTasks.mockResolvedValue([mockHighPriorityTask]);

        const result = await callTool('list', { filter });

        expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith(expected);

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      });
    });
  });

  describe('Filter logical operators', () => {
    const testCases = [
      { filter: 'priority >= 4 && done = false', description: 'AND operator' },
      { filter: 'priority >= 5 || done = true', description: 'OR operator' },
      {
        filter: '(priority >= 4 && done = false) || assignees in 1',
        description: 'combined operators with parentheses',
      },
    ];

    testCases.forEach(({ filter, description }) => {
      it(`should handle ${description}`, async () => {
        mockClient.tasks.getAllTasks.mockResolvedValue([mockHighPriorityTask]);

        const result = await callTool('list', { filter });

        expect(mockClient.tasks.getAllTasks).toHaveBeenCalledWith({
          page: 1,
          per_page: 1000,
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      });
    });
  });
});
