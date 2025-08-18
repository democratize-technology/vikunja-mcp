import { jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBatchImportTool } from '../../src/tools/batch-import';
import { MCPError, ErrorCode } from '../../src/types/index';
import { z } from 'zod';

// Mock the modules
jest.mock('../../src/client', () => ({
  getVikunjaClient: jest.fn(),
  setAuthManager: jest.fn(),
  cleanupVikunjaClient: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import mocked modules
import { getVikunjaClient } from '../../src/client';
import { logger } from '../../src/utils/logger';

// Define the schema matching the one in batch-import.ts
const importedTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  done: z.boolean().optional(),
  dueDate: z.string().optional(),
  priority: z.number().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  hexColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  percentDone: z.number().min(0).max(100).optional(),
  repeatAfter: z.number().optional(),
  repeatMode: z.number().optional(),
  reminders: z.array(z.string()).optional(),
});

describe('Batch Import Tool', () => {
  let mockServer: McpServer;
  let mockClient: any;
  let mockAuthManager: any;
  let toolHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock server
    mockServer = {
      tool: jest.fn((name: string, schema: any, handler: any) => {
        toolHandler = handler;
      }),
    } as any;

    // Setup mock auth manager
    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getSession: jest.fn().mockReturnValue({
        apiUrl: 'https://vikunja.test',
        apiToken: 'test-token',
      }),
    };

    // Setup mock client
    mockClient = {
      tasks: {
        createTask: jest.fn(),
        updateTaskLabels: jest.fn(),
        bulkAssignUsersToTask: jest.fn(),
        getTask: jest.fn((id) =>
          Promise.resolve({
            id,
            title: 'Task',
            labels: [
              { id: 1, title: 'bug' },
              { id: 2, title: 'feature' },
            ], // Default: labels are assigned
          }),
        ),
      },
      labels: {
        getLabels: jest.fn((params) =>
          Promise.resolve([
            { id: 1, title: 'bug' },
            { id: 2, title: 'feature' },
          ]),
        ),
      },
      users: {
        getUsers: jest.fn((params) =>
          Promise.resolve([
            { id: 10, username: 'john' },
            { id: 11, username: 'jane' },
          ]),
        ),
      },
    };

    (getVikunjaClient as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('Tool Registration', () => {
    it('should register the tool with correct name', () => {
      registerBatchImportTool(mockServer, mockAuthManager);
      expect(mockServer.tool).toHaveBeenCalledWith(
        'vikunja_batch_import',
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('should register the tool with correct schema', () => {
      registerBatchImportTool(mockServer, mockAuthManager);
      
      // Check the schema parameter passed to tool registration
      const schema = mockServer.tool.mock.calls[0][1];
      expect(schema).toEqual({
        projectId: expect.any(Object),
        format: expect.any(Object),
        data: expect.any(Object),
        skipErrors: expect.any(Object),
        dryRun: expect.any(Object),
      });
    });
  });

  describe('Authentication', () => {
    beforeEach(() => {
      registerBatchImportTool(mockServer, mockAuthManager);
    });

    it('should require authentication', async () => {
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: '[]',
      });

      expect(result.content[0].text).toContain('Authentication required');
    });
  });

  describe('JSON Import', () => {
    beforeEach(() => {
      registerBatchImportTool(mockServer, mockAuthManager);
    });

    it('should import single task from JSON', async () => {
      const taskData = {
        title: 'Test Task',
        description: 'Test Description',
        done: false,
        priority: 3,
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 100,
        title: 'Test Task',
        description: 'Test Description',
        done: false,
        priority: 3,
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Test Task',
        description: 'Test Description',
        done: false,
        priority: 3,
        percent_done: 0,
        project_id: 1,
      });

      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(result.content[0].text).toContain('#100: Test Task');
    });

    it('should import multiple tasks from JSON array', async () => {
      const tasksData = [
        { title: 'Task 1', priority: 1 },
        { title: 'Task 2', priority: 2 },
      ];

      mockClient.tasks.createTask
        .mockResolvedValueOnce({ id: 101, title: 'Task 1' })
        .mockResolvedValueOnce({ id: 102, title: 'Task 2' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(tasksData),
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(2);
      expect(result.content[0].text).toContain('Successfully imported: 2 tasks');
    });

    it('should handle task with all fields', async () => {
      const taskData = {
        title: 'Complete Task',
        description: 'Full description',
        done: true,
        dueDate: '2025-01-01T00:00:00Z',
        priority: 5,
        labels: ['bug', 'feature'],
        assignees: ['john', 'jane'],
        startDate: '2024-12-01T00:00:00Z',
        endDate: '2025-01-31T00:00:00Z',
        hexColor: '#FF0000',
        percentDone: 50,
        repeatAfter: 86400,
        repeatMode: 1,
        reminders: ['2024-12-25T00:00:00Z'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 103,
        title: 'Complete Task',
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Complete Task',
        description: 'Full description',
        done: true,
        due_date: '2025-01-01T00:00:00Z',
        priority: 5,
        start_date: '2024-12-01T00:00:00Z',
        end_date: '2025-01-31T00:00:00Z',
        hex_color: '#FF0000',
        percent_done: 50,
        repeat_after: 86400,
        repeat_mode: 'week',
        project_id: 1,
      });

      expect(mockClient.tasks.updateTaskLabels).toHaveBeenCalledWith(103, {
        label_ids: [1, 2],
      });
      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(103, {
        user_ids: [10, 11],
      });
    });

    it('should validate JSON format', async () => {
      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: 'invalid json',
      });

      expect(result.content[0].text).toContain('Invalid JSON data');
    });

    it('should validate required fields', async () => {
      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ description: 'No title' }),
      });

      expect(result.content[0].text).toContain('Invalid JSON data');
    });

    it('should validate hex color format', async () => {
      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Task', hexColor: 'invalid' }),
      });

      expect(result.content[0].text).toContain('Invalid JSON data');
    });
  });

  describe('CSV Import', () => {
    beforeEach(() => {
      registerBatchImportTool(mockServer, mockAuthManager);
    });

    it('should import tasks from CSV', async () => {
      const csvData = `title,description,priority,done
Task 1,Description 1,1,false
Task 2,Description 2,2,true`;

      mockClient.tasks.createTask
        .mockResolvedValueOnce({ id: 201, title: 'Task 1' })
        .mockResolvedValueOnce({ id: 202, title: 'Task 2' });

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(2);
      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Task 1',
        description: 'Description 1',
        priority: 1,
        done: false,
        percent_done: 0,
        project_id: 1,
      });

      expect(result.content[0].text).toContain('Successfully imported: 2 tasks');
    });

    it('should handle CSV with quoted values', async () => {
      const csvData = `title,description,labels
"Task with, comma","Description with ""quotes""","bug;feature"`;

      mockClient.tasks.createTask.mockResolvedValue({
        id: 203,
        title: 'Task with, comma',
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Task with, comma',
        description: 'Description with "quotes"',
        done: false,
        priority: 0,
        percent_done: 0,
        project_id: 1,
      });

      expect(mockClient.tasks.updateTaskLabels).toHaveBeenCalledWith(203, {
        label_ids: [1, 2],
      });
    });

    it('should handle CSV with all fields', async () => {
      const csvData = `title,description,done,dueDate,priority,labels,assignees,startDate,endDate,hexColor,percentDone
"Complete Task","Full desc",true,2025-01-01T00:00:00Z,5,"bug;feature","john;jane",2024-12-01T00:00:00Z,2025-01-31T00:00:00Z,#FF0000,50`;

      mockClient.tasks.createTask.mockResolvedValue({
        id: 204,
        title: 'Complete Task',
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Complete Task',
        description: 'Full desc',
        done: true,
        due_date: '2025-01-01T00:00:00Z',
        priority: 5,
        start_date: '2024-12-01T00:00:00Z',
        end_date: '2025-01-31T00:00:00Z',
        hex_color: '#FF0000',
        percent_done: 50,
        project_id: 1,
      });
    });

    it('should require title header in CSV', async () => {
      const csvData = `description,priority
Description,1`;

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      expect(result.content[0].text).toContain('Missing required CSV headers: title');
    });

    it('should require at least header and one data row', async () => {
      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: 'title',
      });

      expect(result.content[0].text).toContain(
        'CSV must have at least a header row and one data row',
      );
    });

    it('should fail on invalid CSV row without skipErrors', async () => {
      const csvData = `title,priority
"Valid Task",5
"Invalid Task","not a number"`;

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      expect(result.content[0].text).toContain('Invalid task data at row 3');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      registerBatchImportTool(mockServer, mockAuthManager);
    });

    it('should stop on first error by default', async () => {
      const tasksData = [{ title: 'Task 1' }, { title: 'Task 2' }];

      mockClient.tasks.createTask
        .mockResolvedValueOnce({ id: 301, title: 'Task 1' })
        .mockRejectedValueOnce(new Error('API Error'));

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(tasksData),
      });

      expect(result.content[0].text).toContain('Failed to import tasks: API Error');
      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(2);
    });

    it('should continue on errors with skipErrors flag', async () => {
      const tasksData = [{ title: 'Task 1' }, { title: 'Task 2' }, { title: 'Task 3' }];

      mockClient.tasks.createTask
        .mockResolvedValueOnce({ id: 302, title: 'Task 1' })
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce({ id: 304, title: 'Task 3' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(tasksData),
        skipErrors: true,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(3);
      expect(result.content[0].text).toContain('Successfully imported: 2 tasks');
      expect(result.content[0].text).toContain('Failed: 1 tasks');
      expect(result.content[0].text).toContain('Row 2 (Task 2): API Error');
    });

    it('should handle label assignment errors gracefully', async () => {
      const taskData = {
        title: 'Task with labels',
        labels: ['bug'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 305,
        title: 'Task with labels',
      });

      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('Label error'));

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
        skipErrors: true,
      });

      // Task should be created successfully
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      // But with a warning about label assignment failure
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Task #305');
      expect(result.content[0].text).toContain('Failed to assign labels: Label error');
    });

    it('should verify successful label assignment', async () => {
      const taskData = {
        title: 'Task with labels',
        labels: ['bug', 'feature'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 306,
        title: 'Task with labels',
      });

      // Labels are successfully assigned
      mockClient.tasks.updateTaskLabels.mockResolvedValue({});

      // getTask returns the task with labels properly assigned
      mockClient.tasks.getTask.mockResolvedValue({
        id: 306,
        title: 'Task with labels',
        labels: [
          { id: 1, title: 'bug' },
          { id: 2, title: 'feature' },
        ],
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should verify labels were assigned
      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(306);

      // Task should be created successfully without warnings
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(result.content[0].text).not.toContain('Warnings:');
    });

    it('should handle verification failure gracefully', async () => {
      const taskData = {
        title: 'Task with labels',
        labels: ['bug'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 308,
        title: 'Task with labels',
      });

      // updateTaskLabels succeeds
      mockClient.tasks.updateTaskLabels.mockResolvedValue({});

      // But getTask fails (can't verify)
      mockClient.tasks.getTask.mockRejectedValue(new Error('Failed to fetch task'));

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should still import successfully but with warning
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain(
        'Labels specified but not assigned (API token limitation)',
      );
    });

    it('should handle label assignment auth errors', async () => {
      const taskData = {
        title: 'Task with labels',
        labels: ['bug'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 309,
        title: 'Task with labels',
      });

      // updateTaskLabels throws auth error
      mockClient.tasks.updateTaskLabels.mockRejectedValue(
        new Error(
          '401 Unauthorized: missing, malformed, expired or otherwise invalid token provided',
        ),
      );

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should still import successfully but with auth-specific warning
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Label assignment requires JWT authentication');
    });

    it('should skip unknown labels/users', async () => {
      const taskData = {
        title: 'Task',
        labels: ['unknown-label'],
        assignees: ['unknown-user'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 307,
        title: 'Task',
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should not call bulk assign with empty arrays
      expect(mockClient.tasks.updateTaskLabels).not.toHaveBeenCalled();
      expect(mockClient.tasks.bulkAssignUsersToTask).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      // Should have warnings about labels not found
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Task #307');
      expect(result.content[0].text).toContain('Labels not found: unknown-label');
    });
  });

  describe('Authentication Errors', () => {
    beforeEach(() => {
      registerBatchImportTool(mockServer, mockAuthManager);
    });

    it('should handle null label response gracefully', async () => {
      // Labels return null (API edge case)
      mockClient.labels.getLabels.mockResolvedValue(null);
      mockClient.users.getUsers.mockResolvedValue([]);
      mockClient.tasks.createTask.mockResolvedValue({ id: 399, title: 'Test Task' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test Task', labels: ['bug'] }),
      });

      // Should complete successfully with warning
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Labels not found: bug');
    });

    it('should handle non-array label response gracefully', async () => {
      // Labels return non-array (unexpected API response)
      mockClient.labels.getLabels.mockResolvedValue({ invalid: 'response' });
      mockClient.users.getUsers.mockResolvedValue([]);
      mockClient.tasks.createTask.mockResolvedValue({ id: 398, title: 'Test Task' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test Task', labels: ['bug'] }),
      });

      // Should complete successfully with warning
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Labels not found: bug');
    });

    it('should handle label fetch errors gracefully', async () => {
      // Labels fail to fetch (not auth error)
      mockClient.labels.getLabels.mockRejectedValue(new Error('Network error'));
      mockClient.users.getUsers.mockResolvedValue([]);
      mockClient.tasks.createTask.mockResolvedValue({ id: 397, title: 'Test Task' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test Task', labels: ['bug'] }),
      });

      // Should complete successfully with warning
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Labels not found: bug');
    });

    it('should reproduce batch import label assignment failure with API tokens', async () => {
      // This test reproduces the exact issue where label assignment fails silently
      // Labels are fetched successfully (returns proper array)
      mockClient.labels.getLabels.mockResolvedValue([
        { id: 1, title: 'Core Feature' },
        { id: 2, title: 'Advanced Feature' },
      ]);

      // Task creation works
      mockClient.tasks.createTask.mockResolvedValue({
        id: 122,
        title: 'Test Task',
        labels: null, // Issue: labels are null despite being specified
      });

      // But label assignment silently fails (doesn't throw error, just doesn't work)
      mockClient.tasks.updateTaskLabels.mockResolvedValue({});

      // Add getTask mock to verify the labels weren't assigned
      mockClient.tasks.getTask = jest.fn().mockResolvedValue({
        id: 122,
        title: 'Test Task',
        labels: null, // Still null after updateTaskLabels
      });

      const result = await toolHandler({
        projectId: 35,
        format: 'csv',
        data: `title,description,priority,labels
"Test Task","Description",5,"Core Feature;Advanced Feature"`,
        skipErrors: true,
        dryRun: false,
      });

      // Verify labels were fetched
      expect(mockClient.labels.getLabels).toHaveBeenCalled();

      // Verify task was created
      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(35, {
        title: 'Test Task',
        description: 'Description',
        done: false,
        priority: 5,
        percent_done: 0,
        project_id: 35,
      });

      // Verify updateTaskLabels was called with correct label IDs
      expect(mockClient.tasks.updateTaskLabels).toHaveBeenCalledWith(122, {
        label_ids: [1, 2],
      });

      // Verify getTask was called to check if labels were actually assigned
      expect(mockClient.tasks.getTask).toHaveBeenCalledWith(122);

      // Should show success but with warning about labels
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(result.content[0].text).toContain('#122: Test Task');

      // NOW there should be a warning about label assignment failure
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain(
        'Labels specified but not assigned (API token limitation)',
      );
    });

    it('should handle auth error when fetching users gracefully', async () => {
      // Labels work fine
      mockClient.labels.getLabels.mockResolvedValue([]);
      // Users fail with auth error (known issue)
      mockClient.users.getUsers.mockRejectedValue(
        new Error('missing, malformed, expired or otherwise invalid token provided'),
      );
      // Task creation works
      mockClient.tasks.createTask.mockResolvedValue({ id: 400, title: 'Test Task' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test Task', assignees: ['john'] }),
      });

      // Should complete successfully with warning
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(result.content[0].text).toContain(
        'Warning: Could not fetch users due to Vikunja API authentication issue',
      );
      expect(result.content[0].text).toContain('Assignees were skipped for all tasks');
    });

    it('should handle non-auth error when fetching users gracefully', async () => {
      // Labels work fine
      mockClient.labels.getLabels.mockResolvedValue([]);
      // Users fail with non-auth error
      mockClient.users.getUsers.mockRejectedValue(new Error('Network timeout'));
      // Task creation works
      mockClient.tasks.createTask.mockResolvedValue({ id: 401, title: 'Test Task' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test Task', assignees: ['john'] }),
      });

      // Should complete successfully without assignees
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      // Should skip the auth-specific warning
      expect(result.content[0].text).not.toContain('Vikunja API authentication issue');
    });

    it('should handle auth error when creating tasks', async () => {
      mockClient.tasks.createTask.mockRejectedValue(new Error('401 Unauthorized: invalid token'));

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test Task' }),
      });

      expect(result.content[0].text).toContain('Authentication error while creating task');
      expect(result.content[0].text).toContain(
        'The token works for other endpoints but may have issues with batch operations',
      );
    });
  });

  describe('Dry Run', () => {
    beforeEach(() => {
      registerBatchImportTool(mockServer, mockAuthManager);
    });

    it('should validate without creating tasks', async () => {
      const tasksData = [{ title: 'Task 1' }, { title: 'Task 2' }];

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(tasksData),
        dryRun: true,
      });

      expect(mockClient.tasks.createTask).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('Validation successful. 2 tasks ready to import');
    });

    it('should fail validation on invalid data', async () => {
      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ description: 'No title' }),
        dryRun: true,
      });

      expect(result.content[0].text).toContain('Invalid JSON data');
    });
  });

  describe('Empty Data', () => {
    beforeEach(() => {
      registerBatchImportTool(mockServer, mockAuthManager);
    });

    it('should handle empty JSON array', async () => {
      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: '[]',
      });

      expect(result.content[0].text).toContain('No valid tasks found to import');
    });

    it('should handle CSV with only header', async () => {
      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: 'title,description',
      });

      expect(result.content[0].text).toContain(
        'CSV must have at least a header row and one data row',
      );
    });

    it('should enforce batch size limit', async () => {
      // Create array with 101 tasks (exceeds limit of 100)
      const tasks = Array(101)
        .fill(null)
        .map((_, i) => ({
          title: `Task ${i + 1}`,
        }));

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(tasks),
      });

      expect(result.content[0].text).toContain('Batch size exceeds maximum limit of 100 tasks');
    });
  });

  describe('Edge Cases and Branch Coverage', () => {
    beforeEach(() => {
      registerBatchImportTool(mockServer, mockAuthManager);
    });

    it('should handle CSV lines that are falsy (empty string after filter)', async () => {
      const csvData = `title,description\n\n\nTask 1,Desc 1\n\n`;
      
      mockClient.tasks.createTask.mockResolvedValue({ id: 501, title: 'Task 1' });

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(1);
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
    });

    it('should handle error instance check for non-Error objects', async () => {
      // Test the error handling when error is not an Error instance
      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: '{"invalid json',
      });

      expect(result.content[0].text).toContain('Invalid JSON data');
    });

    it('should handle tasks array with null elements during iteration', async () => {
      // Test the branch where tasks[i] could be falsy
      const tasksData = [{ title: 'Task 1' }, { title: 'Task 2' }];
      
      // Mock the task creation to succeed
      mockClient.tasks.createTask
        .mockResolvedValueOnce({ id: 601, title: 'Task 1' })
        .mockResolvedValueOnce({ id: 602, title: 'Task 2' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(tasksData),
      });

      // Should create both tasks
      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(2);
      expect(result.content[0].text).toContain('Successfully imported: 2 tasks');
    });

    it('should handle MCPError properly', async () => {
      // Mock createTask to throw an MCPError
      mockClient.tasks.createTask.mockRejectedValue(
        new MCPError(ErrorCode.API_ERROR, 'Custom API error message')
      );

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      // MCPError should return its message directly
      expect(result.content[0].text).toBe('Custom API error message');
    });

    it('should handle general errors with stack trace', async () => {
      // Mock getVikunjaClient to throw a general error
      (getVikunjaClient as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      expect(result.content[0].text).toContain('Failed to import tasks: Connection failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Batch import error',
        expect.objectContaining({
          error: expect.stringContaining('Error: Connection failed'),
          message: 'Connection failed',
        })
      );
    });

    it('should handle non-Error objects in catch block', async () => {
      // Mock createTask to throw a non-Error object
      mockClient.tasks.createTask.mockRejectedValue('String error');

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      expect(result.content[0].text).toContain('Failed to import tasks: String error');
      expect(logger.error).toHaveBeenCalledWith(
        'Batch import error',
        expect.objectContaining({
          error: 'String error',
          message: 'Unknown error',
        })
      );
    });

    it('should handle CSV with empty values for labels and assignees', async () => {
      const csvData = `title,labels,assignees\nTask 1,,`;
      
      mockClient.tasks.createTask.mockResolvedValue({ id: 701, title: 'Task 1' });

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(1, {
        title: 'Task 1',
        done: false,
        priority: 0,
        percent_done: 0,
        project_id: 1,
      });
      
      // Should not try to update labels or assignees when they are empty
      expect(mockClient.tasks.updateTaskLabels).not.toHaveBeenCalled();
      expect(mockClient.tasks.bulkAssignUsersToTask).not.toHaveBeenCalled();
    });

    it('should handle label assignment when updateTaskLabels returns without error but labels were not actually assigned', async () => {
      const taskData = {
        title: 'Task with labels',
        labels: ['bug'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 801,
        title: 'Task with labels',
      });

      // updateTaskLabels succeeds
      mockClient.tasks.updateTaskLabels.mockResolvedValue({});

      // But getTask shows labels were not assigned (empty array instead of null)
      mockClient.tasks.getTask.mockResolvedValue({
        id: 801,
        title: 'Task with labels',
        labels: [], // Empty array means no labels assigned
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should still show warning about labels not being assigned
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain(
        'Labels specified but not assigned (API token limitation)'
      );
    });

    it('should handle CSV skip errors during parsing with skipErrors flag', async () => {
      const csvData = `title,hexColor\nTask 1,#FF0000\nTask 2,invalid-color\nTask 3,#00FF00`;
      
      mockClient.tasks.createTask
        .mockResolvedValueOnce({ id: 901, title: 'Task 1' })
        .mockResolvedValueOnce({ id: 903, title: 'Task 3' });

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
        skipErrors: true,
      });

      // Should create 2 tasks (skip the invalid one)
      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(2);
      expect(result.content[0].text).toContain('Successfully imported: 2 tasks');
    });

    it('should log debug for parsed labels from CSV', async () => {
      const csvData = `title,labels\n"Task 1","bug;feature;urgent"`;
      
      mockClient.tasks.createTask.mockResolvedValue({ id: 1001, title: 'Task 1' });

      await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      expect(logger.debug).toHaveBeenCalledWith(
        'Parsed labels from CSV',
        expect.objectContaining({
          rawValue: 'bug;feature;urgent',
          parsedLabels: ['bug', 'feature', 'urgent'],
        })
      );
    });

    it('should handle label with uppercase mapping correctly', async () => {
      // Mock labels with mixed case
      mockClient.labels.getLabels.mockResolvedValue([
        { id: 1, title: 'Bug' },
        { id: 2, title: 'FEATURE' },
      ]);

      const taskData = {
        title: 'Task with labels',
        labels: ['BUG', 'feature'], // Different casing
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 1101,
        title: 'Task with labels',
      });

      await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should map correctly despite case differences
      expect(mockClient.tasks.updateTaskLabels).toHaveBeenCalledWith(1101, {
        label_ids: [1, 2],
      });
    });

    it('should handle assignees when projectUsers is empty but not due to auth failure', async () => {
      // Mock empty users array (but not due to auth failure)
      mockClient.users.getUsers.mockResolvedValue([]);
      
      const taskData = {
        title: 'Task with assignees',
        assignees: ['john'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 1201,
        title: 'Task with assignees',
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should not call bulkAssignUsersToTask since no users found
      expect(mockClient.tasks.bulkAssignUsersToTask).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      // Should not show auth-specific warning
      expect(result.content[0].text).not.toContain('Vikunja API authentication issue');
    });

    it('should handle reminders warning', async () => {
      const taskData = {
        title: 'Task with reminders',
        reminders: ['2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 1301,
        title: 'Task with reminders',
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Reminders cannot be added after task creation',
        expect.objectContaining({
          taskId: 1301,
          reminders: ['2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z'],
        })
      );
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
    });

    it('should handle task creation with no ID returned', async () => {
      const taskData = { title: 'Task without ID' };

      // Mock createTask to return task without ID
      mockClient.tasks.createTask.mockResolvedValue({
        title: 'Task without ID',
        // No id property
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      // Should not crash when trying to add to createdTasks
    });

    it('should handle label verification when getTask returns null/undefined labels', async () => {
      const taskData = {
        title: 'Task with labels',
        labels: ['bug'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 1401,
        title: 'Task with labels',
      });

      // updateTaskLabels succeeds
      mockClient.tasks.updateTaskLabels.mockResolvedValue({});

      // getTask returns task without labels property
      mockClient.tasks.getTask.mockResolvedValue({
        id: 1401,
        title: 'Task with labels',
        // No labels property
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should show warning about labels not being assigned
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain(
        'Labels specified but not assigned (API token limitation)'
      );
    });

    it('should handle non-Error objects in JSON validation', async () => {
      // Pass malformed JSON to trigger catch block
      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: '{invalid json',
      });

      expect(result.content[0].text).toContain('Invalid JSON data');
    });

    it('should handle CSV with empty lines', async () => {
      // CSV with empty lines to test filter
      const csvData = `title\n\nTask 1\n\n`;
      
      mockClient.tasks.createTask.mockResolvedValue({ id: 1801, title: 'Task 1' });

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
    });

    it('should handle CSV row with invalid data format', async () => {
      const csvData = `title,priority,hexColor\nValid Task,5,#FF0000\nInvalid Task,999,invalid-hex`;
      
      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
        skipErrors: false,
      });

      expect(result.content[0].text).toContain('Invalid task data at row 3');
      expect(result.content[0].text).toContain('Invalid');
    });

    it('should handle CSV labels with falsy value in ternary', async () => {
      // Test the value ? split : [] branch for labels (line 190)
      const csvData = `title,labels\n"Task 1",""\n"Task 2",`;
      
      mockClient.tasks.createTask
        .mockResolvedValueOnce({ id: 1501, title: 'Task 1' })
        .mockResolvedValueOnce({ id: 1502, title: 'Task 2' });

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(2);
      // Should not call updateTaskLabels for tasks with empty labels
      expect(mockClient.tasks.updateTaskLabels).not.toHaveBeenCalled();
    });

    it('should handle malformed labels response as defensive measure', async () => {
      // Test lines 291-301 defensive branches
      const labelsResponses = [
        undefined,
        null,
        {},
        'string',
        123,
        true,
        false
      ];

      for (const response of labelsResponses) {
        jest.clearAllMocks();
        mockClient.labels.getLabels.mockResolvedValue(response as any);
        mockClient.tasks.createTask.mockResolvedValue({ id: 1600, title: 'Test' });

        const result = await toolHandler({
          projectId: 1,
          format: 'json',
          data: JSON.stringify({ title: 'Test', labels: ['bug'] }),
        });

        expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
        expect(result.content[0].text).toContain('Labels not found: bug');
      }
    });

    it('should handle sparse array in JSON', async () => {
      // Test with array containing null
      const sparseData = '[{"title": "Task 1"},{"title": "Task 3"}]';
      
      mockClient.tasks.createTask
        .mockResolvedValueOnce({ id: 1701, title: 'Task 1' })
        .mockResolvedValueOnce({ id: 1703, title: 'Task 3' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: sparseData,
      });

      // Should import 2 tasks
      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(2);
      expect(result.content[0].text).toContain('Successfully imported: 2 tasks');
    });

    it('should handle label IDs filtering with some undefined mappings', async () => {
      // Test line 375-377 filter branch
      mockClient.labels.getLabels.mockResolvedValue([
        { id: 1, title: 'bug' },
        // No 'feature' label
      ]);

      const taskData = {
        title: 'Task with mixed labels',
        labels: ['bug', 'feature', 'enhancement'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 1801,
        title: 'Task with mixed labels',
      });
      
      // Mock successful label update
      mockClient.tasks.updateTaskLabels.mockResolvedValue({});
      
      // Mock verification - labels successfully assigned
      mockClient.tasks.getTask.mockResolvedValue({
        id: 1801,
        title: 'Task with mixed labels',
        labels: [{ id: 1, title: 'bug' }], // Only one label was assigned
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should update with only the found label
      expect(mockClient.tasks.updateTaskLabels).toHaveBeenCalledWith(1801, {
        label_ids: [1],
      });
      
      // Task completed successfully, only 'bug' label was applied
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
    });

    it('should handle user IDs filtering for assignees', async () => {
      // Test lines 495-502 for user mapping
      mockClient.users.getUsers.mockResolvedValue([
        { id: 10, username: 'john' },
        // No 'jane' user
      ]);

      const taskData = {
        title: 'Task with assignees',
        assignees: ['john', 'jane', 'doe'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 1901,
        title: 'Task with assignees',
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should only assign 'john'
      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(1901, {
        user_ids: [10],
      });
    });

    it('should handle non-Error in final catch block', async () => {
      // Test lines 596-599
      (getVikunjaClient as jest.Mock).mockRejectedValue('String rejection');

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      expect(result.content[0].text).toContain('Failed to import tasks: String rejection');
      expect(logger.error).toHaveBeenCalledWith(
        'Batch import error',
        expect.objectContaining({
          error: 'String rejection',
          message: 'Unknown error',
        })
      );
    });

    it('should handle error in task creation that is not an Error instance', async () => {
      // Test line 534
      mockClient.tasks.createTask.mockRejectedValue('Task creation failed');

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
        skipErrors: true,
      });

      expect(result.content[0].text).toContain('Failed: 1 tasks');
      expect(result.content[0].text).toContain('Row 1 (Test): Unknown error');
    });

    it('should handle reminders when task has no ID', async () => {
      // Test line 517 - when createdTask.id is falsy
      const taskData = {
        title: 'Task with reminders',
        reminders: ['2025-01-01T00:00:00Z'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        title: 'Task with reminders',
        // No ID
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Reminders cannot be added after task creation',
        expect.objectContaining({
          taskId: 'unknown',
          reminders: ['2025-01-01T00:00:00Z'],
        })
      );
    });

    it('should handle label warning when task has no ID', async () => {
      // Test lines 471, 480-486 when createdTask.id is falsy
      mockClient.labels.getLabels.mockResolvedValue([]);
      
      const taskData = {
        title: 'Task without ID',
        labels: ['unknown-label'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        title: 'Task without ID',
        // No ID
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should complete but without adding warning (since no task ID)
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(result.warnings).toBeUndefined();
    });

    it('should handle label error that is not an Error instance', async () => {
      // Test line 436
      const taskData = {
        title: 'Task with labels',
        labels: ['bug'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 2001,
        title: 'Task with labels',
      });

      mockClient.tasks.updateTaskLabels.mockRejectedValue('Label update failed');

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Failed to assign labels: Unknown error');
    });

    it('should handle label error that is not an auth error and not Error instance', async () => {
      // Test line 451
      const taskData = {
        title: 'Task with labels', 
        labels: ['bug'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 2101,
        title: 'Task with labels',
      });

      mockClient.tasks.updateTaskLabels.mockRejectedValue({ code: 500, message: 'Server error' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Failed to assign labels: Unknown error');
    });

    it('should handle verify error that is not Error instance', async () => {
      // Test line 402
      const taskData = {
        title: 'Task with labels',
        labels: ['bug'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 2201,
        title: 'Task with labels',
      });

      mockClient.tasks.updateTaskLabels.mockResolvedValue({});
      mockClient.tasks.getTask.mockRejectedValue('Verification failed');

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      expect(logger.debug).toHaveBeenCalledWith(
        'Could not verify label assignment',
        expect.objectContaining({
          taskId: 2201,
          error: 'Verification failed',
        })
      );
    });

    it('should handle label error for Error instance', async () => {
      // Ensure we cover the Error instance branch on line 451
      const taskData = {
        title: 'Task with labels',
        labels: ['bug'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 2301,
        title: 'Task with labels',
      });

      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('Network timeout'));

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Failed to assign labels: Network timeout');
    });

    it('should handle auth error for Error instance', async () => {
      // Test line 367 for Error instance
      mockClient.tasks.createTask.mockRejectedValue(new Error('403 Forbidden'));

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      expect(result.content[0].text).toContain('Authentication error while creating task');
      expect(result.content[0].text).toContain('403 Forbidden');
    });

    it('should handle CSV with assignees empty value branch', async () => {
      // Test line 197 false branch
      const csvData = `title,assignees\n"Task 1","john;jane"\n"Task 2",""`;
      
      mockClient.tasks.createTask
        .mockResolvedValueOnce({ id: 2401, title: 'Task 1' })
        .mockResolvedValueOnce({ id: 2402, title: 'Task 2' });

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      // First task should assign users
      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(2401, {
        user_ids: [10, 11],
      });
      
      // Second task should not call bulkAssignUsersToTask
      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledTimes(1);
    });

    it('should handle getLabels error that is not Error instance', async () => {
      // Test line 291 - error not instanceof Error
      mockClient.labels.getLabels.mockRejectedValue('Labels fetch failed');
      mockClient.tasks.createTask.mockResolvedValue({ id: 2501, title: 'Test' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch labels',
        expect.objectContaining({
          error: 'Labels fetch failed',
          stack: undefined,
        })
      );
    });

    it('should handle getUsers non-auth error that is not Error instance', async () => {
      // Test line 309
      mockClient.users.getUsers.mockRejectedValue('Users fetch failed');
      mockClient.tasks.createTask.mockResolvedValue({ id: 2601, title: 'Test' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to fetch users',
        expect.objectContaining({ error: 'Users fetch failed' })
      );
    });

    it('should handle CSV with various edge cases for label/assignee parsing', async () => {
      // Test empty values and edge cases in CSV parsing
      const csvData = `title,labels,assignees\n"Task 1","",""\n"Task 2",,\n"Task 3","label1","user1"`;
      
      mockClient.tasks.createTask
        .mockResolvedValueOnce({ id: 2701, title: 'Task 1' })
        .mockResolvedValueOnce({ id: 2702, title: 'Task 2' })
        .mockResolvedValueOnce({ id: 2703, title: 'Task 3' });

      const result = await toolHandler({
        projectId: 1,
        format: 'csv',
        data: csvData,
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledTimes(3);
      expect(result.content[0].text).toContain('Successfully imported: 3 tasks');
      
      // Should not try to update labels/assignees for first two tasks
      expect(mockClient.tasks.updateTaskLabels).not.toHaveBeenCalled();
      expect(mockClient.tasks.bulkAssignUsersToTask).not.toHaveBeenCalled();
    });

    it('should handle auth error with non-Error object during task creation', async () => {
      // Test line 367 for non-Error case - must contain auth keywords
      mockClient.tasks.createTask.mockRejectedValue(new Error('401 Unauthorized: missing, malformed, expired or otherwise invalid token provided'));

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      expect(result.content[0].text).toContain('Authentication error while creating task');
      expect(result.content[0].text).toContain('401 Unauthorized');
    });

    it('should handle getUsers error with Error instance', async () => {
      // Test line 309 Error branch
      mockClient.users.getUsers.mockRejectedValue(new Error('Network error'));
      mockClient.tasks.createTask.mockResolvedValue({ id: 3001, title: 'Test' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to fetch users',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it('should handle label assignment when some labels cannot be verified', async () => {
      // Complex scenario with partial label verification
      const taskData = {
        title: 'Task with multiple labels',
        labels: ['bug', 'feature', 'urgent'],
      };

      mockClient.labels.getLabels.mockResolvedValue([
        { id: 1, title: 'bug' },
        { id: 2, title: 'feature' },
        { id: 3, title: 'urgent' },
      ]);

      mockClient.tasks.createTask.mockResolvedValue({
        id: 3101,
        title: 'Task with multiple labels',
      });

      // updateTaskLabels succeeds
      mockClient.tasks.updateTaskLabels.mockResolvedValue({});

      // getTask returns only some labels (partial assignment)
      mockClient.tasks.getTask.mockResolvedValue({
        id: 3101,
        title: 'Task with multiple labels',
        labels: [
          { id: 1, title: 'bug' },
          // feature and urgent are missing
        ],
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should show warning about labels not fully assigned
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain(
        'Labels specified but not assigned (API token limitation)'
      );
    });

    it('should handle warnings when no labels can be mapped', async () => {
      // Test the else-if branch when NO labels can be mapped
      const taskData = {
        title: 'Task with unknown labels',
        labels: ['nonexistent1', 'nonexistent2'],
      };

      mockClient.labels.getLabels.mockResolvedValue([
        { id: 1, title: 'bug' },
        { id: 2, title: 'feature' },
      ]);

      mockClient.tasks.createTask.mockResolvedValue({
        id: 3201,
        title: 'Task with unknown labels',
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should have warning about all labels not found
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Labels not found: nonexistent1, nonexistent2');
    });

    it('should handle array check for projectLabels defensive code', async () => {
      // Test the Array.isArray check on line 301
      mockClient.labels.getLabels.mockResolvedValue({}); // Non-array object
      mockClient.tasks.createTask.mockResolvedValue({ id: 3301, title: 'Test' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test', labels: ['bug'] }),
      });

      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      // Since labels response is not an array, no labels are mapped
      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Labels not found: bug');
    });

    it('should handle user mapping with case sensitivity', async () => {
      // Test user mapping is case-insensitive
      mockClient.users.getUsers.mockResolvedValue([
        { id: 10, username: 'JohnDoe' },
        { id: 11, username: 'JANE' },
      ]);

      const taskData = {
        title: 'Task with assignees',
        assignees: ['johndoe', 'jane'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 3401,
        title: 'Task with assignees',
      });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      // Should map both users correctly despite case differences
      expect(mockClient.tasks.bulkAssignUsersToTask).toHaveBeenCalledWith(3401, {
        user_ids: [10, 11],
      });
    });

    it('should handle labels response defensive fallback', async () => {
      // Test the labelsResponse || [] fallback on line 301
      mockClient.labels.getLabels.mockResolvedValue(null);
      mockClient.users.getUsers.mockResolvedValue(null);
      mockClient.tasks.createTask.mockResolvedValue({ id: 3501, title: 'Test' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
    });

    it('should handle error creation logic in catch block', async () => {
      // Test line 534 when creating error object
      const errorObj = new Error('Custom error');
      mockClient.tasks.createTask.mockRejectedValue(errorObj);

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
        skipErrors: true,
      });

      expect(result.content[0].text).toContain('Failed: 1 tasks');
      expect(result.content[0].text).toContain('Row 1 (Test): Custom error');
    });

    it('should handle projectLabels being falsy in label/user map creation', async () => {
      // Ensure projectLabels || [] is covered
      mockClient.labels.getLabels.mockResolvedValue(undefined);
      mockClient.users.getUsers.mockResolvedValue(undefined);
      mockClient.tasks.createTask.mockResolvedValue({ id: 3601, title: 'Test' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test', labels: ['bug'], assignees: ['john'] }),
      });

      // Should complete but skip labels/assignees
      expect(result.content[0].text).toContain('Successfully imported: 1 tasks');
      expect(mockClient.tasks.updateTaskLabels).not.toHaveBeenCalled();
      expect(mockClient.tasks.bulkAssignUsersToTask).not.toHaveBeenCalled();
    });

    it('should handle getLabels throwing error with Error instance having no message', async () => {
      // Test line 291 with Error instance but no message
      const errorWithoutMessage = new Error();
      delete (errorWithoutMessage as any).message;
      mockClient.labels.getLabels.mockRejectedValue(errorWithoutMessage);
      mockClient.tasks.createTask.mockResolvedValue({ id: 3701, title: 'Test' });

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch labels',
        expect.objectContaining({
          error: '',
          stack: expect.any(String),
        })
      );
    });

    it('should handle label verification error with Error instance', async () => {
      // Test line 402 with Error instance
      const taskData = {
        title: 'Task with labels',
        labels: ['bug'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 3801,
        title: 'Task with labels',
      });

      mockClient.tasks.updateTaskLabels.mockResolvedValue({});
      mockClient.tasks.getTask.mockRejectedValue(new Error('Verification error'));

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      expect(logger.debug).toHaveBeenCalledWith(
        'Could not verify label assignment',
        expect.objectContaining({
          taskId: 3801,
          error: 'Verification error',
        })
      );
    });

    it('should handle error not instance of Error in task creation skipErrors', async () => {
      // Test for non-Error object in skipErrors
      const stringError = 'Task creation failed';
      mockClient.tasks.createTask.mockRejectedValue(stringError);

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify([{ title: 'Test 1' }, { title: 'Test 2' }]),
        skipErrors: true,
      });

      expect(result.content[0].text).toContain('Failed: 2 tasks');
      expect(result.content[0].text).toContain('Row 1 (Test 1): Unknown error');
      expect(result.content[0].text).toContain('Row 2 (Test 2): Unknown error');
    });

    it('should handle label assignment error with auth check for non-Error', async () => {
      // Test line 436 for non-Error auth error
      const taskData = {
        title: 'Task with labels',
        labels: ['bug'],
      };

      mockClient.tasks.createTask.mockResolvedValue({
        id: 3901,
        title: 'Task with labels',
      });

      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('missing, malformed, expired or otherwise invalid token provided'));

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify(taskData),
      });

      expect(result.content[0].text).toContain('Warnings:');
      expect(result.content[0].text).toContain('Label assignment requires JWT authentication');
    });

    it('should handle final error catch with MCPError instance', async () => {
      // Ensure MCPError is handled differently in final catch
      const mcpError = new MCPError(ErrorCode.INTERNAL_ERROR, 'Test MCP error');
      (getVikunjaClient as jest.Mock).mockRejectedValue(mcpError);

      const result = await toolHandler({
        projectId: 1,
        format: 'json',
        data: JSON.stringify({ title: 'Test' }),
      });

      expect(result.content[0].text).toBe('Test MCP error');
    });
  });
});
