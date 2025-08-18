/**
 * Export Tool Tests
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import { registerExportTool } from '../../src/tools/export';
import { MCPError, ErrorCode } from '../../src/types/index';
import type { Project, Task, Label } from 'node-vikunja';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';
import { getClientFromContext } from '../../src/client';

// Mock the MCP server
const mockServer = {
  tool: jest.fn(),
} as unknown as MockServer;

// Mock auth manager
const mockAuthManager = {
  isAuthenticated: jest.fn().mockReturnValue(true),
  getAuthType: jest.fn().mockReturnValue('jwt'),
  getSession: jest.fn().mockReturnValue({
    apiUrl: 'https://vikunja.example.com',
    apiToken: 'test-token',
  }),
} as unknown as MockAuthManager;

// Mock the client module
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn().mockResolvedValue({
    projects: {
      getProject: jest.fn(),
      getProjects: jest.fn(),
    },
    tasks: {
      getProjectTasks: jest.fn(),
    },
    labels: {
      getLabel: jest.fn(),
    },
  }),
}));

// Mock fetch for user export endpoints
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('Export Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    registerExportTool(mockServer, mockAuthManager);
  });

  describe('vikunja_export_project', () => {
    it('should register the export project tool', () => {
      expect(mockServer.tool).toHaveBeenCalledWith(
        'vikunja_export_project',
        expect.objectContaining({
          projectId: expect.any(Object),
          includeChildren: expect.any(Object),
        }),
        expect.any(Function),
      );
    });

    describe('Authentication', () => {
      it('should require authentication', async () => {
        const mockAuthManagerNoAuth = {
          isAuthenticated: jest.fn().mockReturnValue(false),
        } as unknown as MockAuthManager;

        mockServer.tool.mockClear();
        registerExportTool(mockServer, mockAuthManagerNoAuth);

        const handler = mockServer.tool.mock.calls.find(
          (call) => call[0] === 'vikunja_export_project',
        )?.[2];

        await expect(handler?.({ projectId: 1 })).rejects.toThrow(
          'Authentication required. Please use vikunja_auth.connect first.',
        );
      });

      it('should require JWT authentication', async () => {
        const mockAuthManagerApiToken = {
          isAuthenticated: jest.fn().mockReturnValue(true),
          getAuthType: jest.fn().mockReturnValue('api-token'),
        } as unknown as MockAuthManager;

        mockServer.tool.mockClear();
        registerExportTool(mockServer, mockAuthManagerApiToken);

        const handler = mockServer.tool.mock.calls.find(
          (call) => call[0] === 'vikunja_export_project',
        )?.[2];

        await expect(handler?.({ projectId: 1 })).rejects.toThrow(
          'Export operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.',
        );
      });

      it('should allow operations with JWT authentication', async () => {
        const mockProject: Project = {
          id: 1,
          title: 'Test Project',
          description: 'Test Description',
          identifier: 'TEST',
          hex_color: '#4287f5',
          is_archived: false,
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
        };

        const mockAuthManagerJWT = {
          isAuthenticated: jest.fn().mockReturnValue(true),
          getAuthType: jest.fn().mockReturnValue('jwt'),
          getSession: jest.fn().mockReturnValue({
            apiUrl: 'https://vikunja.example.com',
            apiToken: 'test-token',
          }),
        } as unknown as MockAuthManager;

        mockServer.tool.mockClear();
        registerExportTool(mockServer, mockAuthManagerJWT);

        const mockClient = await getClientFromContext();
        jest.mocked(mockClient.projects.getProject).mockResolvedValue(mockProject);
        jest.mocked(mockClient.tasks.getProjectTasks).mockResolvedValue([]);

        const handler = mockServer.tool.mock.calls.find(
          (call) => call[0] === 'vikunja_export_project',
        )?.[2];

        const result = await handler?.({ projectId: 1, includeChildren: false });

        expect(result).toMatchObject({
          content: [
            {
              type: 'text',
              text: expect.any(String),
            },
          ],
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      });
    });

    it('should export a project without children', async () => {
      const mockProject: Project = {
        id: 1,
        title: 'Test Project',
        description: 'Test Description',
        identifier: 'TEST',
        hex_color: '#4287f5',
        is_archived: false,
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      };

      const mockTasks: Task[] = [
        {
          id: 1,
          title: 'Task 1',
          project_id: 1,
          done: false,
          labels: [{ id: 1, title: 'Label 1', hex_color: '#ff0000' }],
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          title: 'Task 2',
          project_id: 1,
          done: true,
          labels: [{ id: 2, title: 'Label 2', hex_color: '#00ff00' }],
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
        },
      ];

      const mockLabels: Label[] = [
        { id: 1, title: 'Label 1', hex_color: '#ff0000' },
        { id: 2, title: 'Label 2', hex_color: '#00ff00' },
      ];

      const mockClient = await getClientFromContext();

      jest.mocked(mockClient.projects.getProject).mockResolvedValue(mockProject);
      jest.mocked(mockClient.tasks.getProjectTasks).mockResolvedValue(mockTasks);
      jest
        .mocked(mockClient.labels.getLabel)
        .mockResolvedValueOnce(mockLabels[0])
        .mockResolvedValueOnce(mockLabels[1]);

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_export_project',
      )?.[2];

      const result = await handler?.({ projectId: 1, includeChildren: false });

      expect(result).toMatchObject({
        content: [
          {
            type: 'text',
            text: expect.any(String),
          },
        ],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'success',
        message: 'Project exported successfully',
        data: expect.objectContaining({
          project_id: 1,
          project_title: 'Test Project',
          task_count: 2,
          label_count: 2,
          child_project_count: 0,
        }),
      });

      const exportData = response.data.data;
      expect(exportData.project).toEqual(mockProject);
      expect(exportData.tasks).toEqual(mockTasks);
      expect(exportData.labels).toEqual(mockLabels);
      expect(exportData.version).toBe('1.0.0');
      expect(exportData.exported_at).toBeDefined();
    });

    it('should export a project with children', async () => {
      const mockParentProject: Project = {
        id: 1,
        title: 'Parent Project',
        description: 'Parent Description',
        identifier: 'PARENT',
        hex_color: '#4287f5',
        is_archived: false,
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      };

      const mockChildProject: Project = {
        id: 2,
        title: 'Child Project',
        description: 'Child Description',
        identifier: 'CHILD',
        hex_color: '#f54242',
        parent_project_id: 1,
        is_archived: false,
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      };

      const mockAllProjects: Project[] = [mockParentProject, mockChildProject];

      const mockClient = await getClientFromContext();

      jest
        .mocked(mockClient.projects.getProject)
        .mockResolvedValueOnce(mockParentProject)
        .mockResolvedValueOnce(mockChildProject);
      jest.mocked(mockClient.projects.getProjects).mockResolvedValue(mockAllProjects);
      jest.mocked(mockClient.tasks.getProjectTasks).mockResolvedValue([]);

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_export_project',
      )?.[2];

      const result = await handler?.({ projectId: 1, includeChildren: true });

      expect(result).toMatchObject({
        content: [
          {
            type: 'text',
            text: expect.any(String),
          },
        ],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'success',
        message: 'Project exported successfully',
        data: expect.objectContaining({
          project_id: 1,
          project_title: 'Parent Project',
          child_project_count: 1,
        }),
      });

      const exportData = response.data.data;
      expect(exportData.child_projects).toHaveLength(1);
      expect(exportData.child_projects[0].project).toEqual(mockChildProject);
    });

    it('should handle circular references in project hierarchy', async () => {
      const mockProject: Project = {
        id: 1,
        title: 'Test Project',
        parent_project_id: 1, // Self-reference
        description: '',
        identifier: 'TEST',
        hex_color: '#4287f5',
        is_archived: false,
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      };

      const mockClient = await getClientFromContext();

      jest.mocked(mockClient.projects.getProject).mockResolvedValue(mockProject);
      jest.mocked(mockClient.projects.getProjects).mockResolvedValue([mockProject]);
      jest.mocked(mockClient.tasks.getProjectTasks).mockResolvedValue([]);

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_export_project',
      )?.[2];

      await expect(handler?.({ projectId: 1, includeChildren: true })).rejects.toThrow(
        'Circular reference detected in project hierarchy',
      );
    });

    it('should validate project ID', async () => {
      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_export_project',
      )?.[2];

      await expect(handler?.({ projectId: 0 })).rejects.toThrow(
        'projectId must be a positive integer',
      );

      await expect(handler?.({ projectId: -1 })).rejects.toThrow(
        'projectId must be a positive integer',
      );

      await expect(handler?.({ projectId: 1.5 })).rejects.toThrow(
        'projectId must be a positive integer',
      );
    });

    it('should handle non-existent project', async () => {
      const mockClient = await getClientFromContext();

      jest.mocked(mockClient.projects.getProject).mockResolvedValue(null);

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_export_project',
      )?.[2];

      await expect(handler?.({ projectId: 999 })).rejects.toThrow('Project with ID 999 not found');
    });

    it('should skip missing labels gracefully', async () => {
      const mockProject: Project = {
        id: 1,
        title: 'Test Project',
        description: '',
        identifier: 'TEST',
        hex_color: '#4287f5',
        is_archived: false,
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
      };

      const mockTasks: Task[] = [
        {
          id: 1,
          title: 'Task 1',
          project_id: 1,
          done: false,
          labels: [{ id: 1, title: 'Label 1', hex_color: '#ff0000' }],
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
        },
      ];

      const mockClient = await getClientFromContext();

      jest.mocked(mockClient.projects.getProject).mockResolvedValue(mockProject);
      jest.mocked(mockClient.tasks.getProjectTasks).mockResolvedValue(mockTasks);
      jest.mocked(mockClient.labels.getLabel).mockRejectedValue(new Error('Label not found'));

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_export_project',
      )?.[2];

      const result = await handler?.({ projectId: 1 });

      expect(result).toMatchObject({
        content: [
          {
            type: 'text',
            text: expect.any(String),
          },
        ],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'success',
        data: expect.objectContaining({
          label_count: 0, // No labels due to fetch error
        }),
      });
    });
  });

  describe('vikunja_request_user_export', () => {
    it('should register the request user export tool', () => {
      expect(mockServer.tool).toHaveBeenCalledWith(
        'vikunja_request_user_export',
        expect.objectContaining({
          password: expect.any(Object),
        }),
        expect.any(Function),
      );
    });

    it('should request user data export successfully', async () => {
      jest.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Export requested' }),
        statusText: 'OK',
      } as Response);

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_request_user_export',
      )?.[2];

      const result = await handler?.({ password: 'test-password' });

      expect(result).toMatchObject({
        content: [
          {
            type: 'text',
            text: expect.any(String),
          },
        ],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'success',
        message:
          'User data export requested successfully. You will receive an email when the export is ready.',
        data: { message: 'Export requested' },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://vikunja.example.com/user/export/request',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ password: 'test-password' }),
        }),
      );
    });

    it('should handle API errors when requesting export', async () => {
      jest.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Invalid password' }),
        statusText: 'Unauthorized',
      } as Response);

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_request_user_export',
      )?.[2];

      await expect(handler?.({ password: 'wrong-password' })).rejects.toThrow('Invalid password');
    });

    it('should handle missing authentication token', async () => {
      jest.mocked(mockAuthManager.getSession).mockReturnValueOnce({
        apiUrl: 'https://vikunja.example.com',
        apiToken: null,
      });

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_request_user_export',
      )?.[2];

      await expect(handler?.({ password: 'test-password' })).rejects.toThrow(
        'No authentication token available',
      );
    });

    it('should validate password parameter', async () => {
      // Test that the schema is properly defined
      const toolCall = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_request_user_export',
      );

      expect(toolCall).toBeDefined();
      expect(toolCall?.[1]).toMatchObject({
        password: expect.objectContaining({
          minLength: 1,
        }),
      });
    });

    it('should handle JSON parse errors in error response', async () => {
      jest.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('Invalid JSON');
        },
        statusText: 'Bad Gateway',
      } as Response);

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_request_user_export',
      )?.[2];

      await expect(handler?.({ password: 'test-password' })).rejects.toThrow(
        'Failed to request export: Bad Gateway',
      );
    });

    it('should handle network timeouts', async () => {
      jest.mocked(global.fetch).mockRejectedValueOnce(new Error('Request timeout'));

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_request_user_export',
      )?.[2];

      await expect(handler?.({ password: 'test-password' })).rejects.toThrow('Request timeout');
    });
  });

  describe('vikunja_download_user_export', () => {
    it('should register the download user export tool', () => {
      expect(mockServer.tool).toHaveBeenCalledWith(
        'vikunja_download_user_export',
        expect.objectContaining({
          password: expect.any(Object),
        }),
        expect.any(Function),
      );
    });

    it('should handle missing authentication token in download', async () => {
      jest.mocked(mockAuthManager.getSession).mockReturnValueOnce({
        apiUrl: 'https://vikunja.example.com',
        apiToken: null,
      });

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_download_user_export',
      )?.[2];

      await expect(handler?.({ password: 'test-password' })).rejects.toThrow(
        'No authentication token available',
      );
    });

    it('should download user data export successfully', async () => {
      const mockExportData = {
        user: { id: 1, username: 'test' },
        projects: [],
        tasks: [],
      };

      jest.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockExportData,
        statusText: 'OK',
      } as Response);

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_download_user_export',
      )?.[2];

      const result = await handler?.({ password: 'test-password' });

      expect(result).toMatchObject({
        content: [
          {
            type: 'text',
            text: expect.any(String),
          },
        ],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'success',
        message: 'User data export downloaded successfully',
        data: mockExportData,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://vikunja.example.com/user/export/download',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ password: 'test-password' }),
        }),
      );
    });

    it('should handle API errors when downloading export', async () => {
      jest.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Export not ready' }),
        statusText: 'Not Found',
      } as Response);

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_download_user_export',
      )?.[2];

      await expect(handler?.({ password: 'test-password' })).rejects.toThrow('Export not ready');
    });

    it('should handle JSON parse errors gracefully', async () => {
      jest.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('Invalid JSON');
        },
        statusText: 'Server Error',
      } as Response);

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_download_user_export',
      )?.[2];

      await expect(handler?.({ password: 'test-password' })).rejects.toThrow(
        'Failed to download export: Server Error',
      );
    });

    it('should handle network connection errors', async () => {
      jest.mocked(global.fetch).mockRejectedValueOnce(new Error('Network request failed'));

      const handler = mockServer.tool.mock.calls.find(
        (call) => call[0] === 'vikunja_download_user_export',
      )?.[2];

      await expect(handler?.({ password: 'test-password' })).rejects.toThrow(
        'Network request failed',
      );
    });
  });
});
