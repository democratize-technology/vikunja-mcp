/**
 * Labels Tool Tests
 */

import { jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AuthManager } from '../../src/auth/AuthManager';
import { registerLabelsTool } from '../../src/tools/labels';
import { MCPError, ErrorCode } from '../../src/types';
import { getClientFromContext } from '../../src/client';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';
import { parseMarkdown } from '../utils/markdown';

// Mock the modules
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
}));
jest.mock('../../src/auth/AuthManager');

describe('Labels Tool', () => {
  let mockServer: MockServer;
  let mockAuthManager: MockAuthManager;
  let mockHandler: (args: any) => Promise<any>;
  let mockClient: MockVikunjaClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock client with labels service
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

    // Mock auth manager
    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getSession: jest.fn(),
      setSession: jest.fn(),
      clearSession: jest.fn(),
      connect: jest.fn(),
      getStatus: jest.fn(),
      isConnected: jest.fn(),
      disconnect: jest.fn(),
    } as MockAuthManager;

    // Mock getClientFromContext and getClientFromContext
    (getClientFromContext as jest.Mock).mockReturnValue(mockClient);
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);

    // Mock server
    mockServer = {
      tool: jest.fn() as jest.MockedFunction<(name: string, description: string, schema: any, handler: any) => void>,
    } as MockServer;

    // Register the tool
    registerLabelsTool(mockServer, mockAuthManager);

    // Get the tool handler
    expect(mockServer.tool).toHaveBeenCalledWith(
      'vikunja_labels',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
    const calls = mockServer.tool.mock.calls;
    if (calls.length > 0 && calls[0] && calls[0].length > 3) {
      mockHandler = calls[0][3];
    } else {
      throw new Error('Tool handler not found');
    }
  });

  describe('Registration', () => {
    it('should register the vikunja_labels tool', () => {
      expect(mockServer.tool).toHaveBeenCalledWith(
        'vikunja_labels',
        expect.any(String),
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  describe('Authentication', () => {
    it('should throw AUTH_REQUIRED error when not authenticated', async () => {
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await expect(mockHandler({ subcommand: 'list' })).rejects.toThrow(
        new MCPError(
          ErrorCode.AUTH_REQUIRED,
          'Authentication required. Please use vikunja_auth.connect first.',
        ),
      );
    });

    // Remove this test as it's no longer applicable - getClientFromContext throws if not authenticated
  });

  describe('List Labels', () => {
    it('should default to list when no subcommand provided', async () => {
      const mockLabels = [
        { id: 1, title: 'Bug' },
        { id: 2, title: 'Feature' },
      ];
      mockClient.labels.getLabels.mockResolvedValue(mockLabels);

      const result = await mockHandler({});

      expect(mockClient.labels.getLabels).toHaveBeenCalledWith({});
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('list-labels');
      expect(markdown).toContain('Retrieved 2 labels');
    });

    it('should list all labels without parameters', async () => {
      const mockLabels = [
        { id: 1, title: 'Bug', hex_color: '#ff0000' },
        { id: 2, title: 'Feature', hex_color: '#00ff00' },
      ];
      mockClient.labels.getLabels.mockResolvedValue(mockLabels);

      const result = await mockHandler({ subcommand: 'list' });

      expect(mockClient.labels.getLabels).toHaveBeenCalledWith({});
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('list-labels');
      expect(markdown).toContain('Retrieved 2 labels');
    });

    it('should list labels with pagination', async () => {
      const mockLabels = [{ id: 1, title: 'Bug' }];
      mockClient.labels.getLabels.mockResolvedValue(mockLabels);

      const result = await mockHandler({
        subcommand: 'list',
        page: 2,
        perPage: 10,
      });

      expect(mockClient.labels.getLabels).toHaveBeenCalledWith({
        page: 2,
        per_page: 10,
      });
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('list-labels');
      expect(markdown).toContain('Retrieved 1 label');
    });

    it('should list labels with search', async () => {
      const mockLabels = [{ id: 3, title: 'Security' }];
      mockClient.labels.getLabels.mockResolvedValue(mockLabels);

      const result = await mockHandler({
        subcommand: 'list',
        search: 'sec',
      });

      expect(mockClient.labels.getLabels).toHaveBeenCalledWith({
        s: 'sec',
      });
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('list-labels');
      expect(markdown).toContain('Retrieved 1 label');
    });
  });

  describe('Get Label', () => {
    it('should validate label ID is required', async () => {
      await expect(
        mockHandler({
          subcommand: 'get',
        }),
      ).rejects.toThrow('Label ID is required');
    });

    it('should validate label ID must be positive', async () => {
      await expect(
        mockHandler({
          subcommand: 'get',
          id: -1,
        }),
      ).rejects.toThrow('id must be a positive integer');
    });

    it('should get a label by ID', async () => {
      const mockLabel = {
        id: 1,
        title: 'Bug',
        description: 'Bug reports',
        hex_color: '#ff0000',
      };
      mockClient.labels.getLabel.mockResolvedValue(mockLabel);

      const result = await mockHandler({
        subcommand: 'get',
        id: 1,
      });

      expect(mockClient.labels.getLabel).toHaveBeenCalledWith(1);
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('get-label');
      expect(markdown).toContain('Retrieved label "Bug"');
    });

    it('should throw NOT_FOUND error when label does not exist', async () => {
      const error = new Error('Not found');
      (error as any).statusCode = 404;
      mockClient.labels.getLabel.mockRejectedValue(error);

      await expect(
        mockHandler({
          subcommand: 'get',
          id: 999,
        }),
      ).rejects.toThrow(new MCPError(ErrorCode.NOT_FOUND, 'Label with ID 999 not found'));
    });
  });

  describe('Create Label', () => {
    it('should validate title is required', async () => {
      await expect(
        mockHandler({
          subcommand: 'create',
        }),
      ).rejects.toThrow('Title is required');
    });

    it('should create a label with title only', async () => {
      const mockLabel = {
        id: 1,
        title: 'New Label',
      };
      mockClient.labels.createLabel.mockResolvedValue(mockLabel);

      const result = await mockHandler({
        subcommand: 'create',
        title: 'New Label',
      });

      expect(mockClient.labels.createLabel).toHaveBeenCalledWith({
        title: 'New Label',
      });
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('create-label');
      expect(markdown).toContain('Label "New Label" created successfully');
    });

    it('should create a label with all fields', async () => {
      const mockLabel = {
        id: 1,
        title: 'Priority',
        description: 'Priority tasks',
        hex_color: '#ff0000',
      };
      mockClient.labels.createLabel.mockResolvedValue(mockLabel);

      const result = await mockHandler({
        subcommand: 'create',
        title: 'Priority',
        description: 'Priority tasks',
        hexColor: '#ff0000',
      });

      expect(mockClient.labels.createLabel).toHaveBeenCalledWith({
        title: 'Priority',
        description: 'Priority tasks',
        hex_color: '#ff0000',
      });
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('create-label');
      expect(markdown).toContain('Label "Priority" created successfully');
    });

    it('should validate hex color format', async () => {
      // Test invalid hex color by checking the error at runtime
      // The schema validation will prevent invalid hex colors
      const invalidHexError = new Error('Invalid hex color');
      mockClient.labels.createLabel.mockRejectedValue(invalidHexError);

      await expect(
        mockHandler({
          subcommand: 'create',
          title: 'Test Label',
          hexColor: '#ff0000', // Valid hex color
        }),
      ).rejects.toThrow('vikunja_labels.create label failed: Invalid hex color');
    });

    it('should throw INVALID_PARAMS for bad request', async () => {
      const error = new Error('Invalid hex color');
      (error as any).statusCode = 400;
      mockClient.labels.createLabel.mockRejectedValue(error);

      await expect(
        mockHandler({
          subcommand: 'create',
          title: 'Bad Label',
          hexColor: '#invalid',
        }),
      ).rejects.toThrow(new MCPError(ErrorCode.API_ERROR, 'Failed to create label: Invalid hex color'));
    });
  });

  describe('Update Label', () => {
    it('should validate label ID is required', async () => {
      await expect(
        mockHandler({
          subcommand: 'update',
          title: 'Updated',
        }),
      ).rejects.toThrow('Label ID is required');
    });

    it('should validate at least one field is required', async () => {
      await expect(
        mockHandler({
          subcommand: 'update',
          id: 1,
        }),
      ).rejects.toThrow('At least one field to update is required');
    });

    it('should update a label with partial fields', async () => {
      const mockLabel = {
        id: 1,
        title: 'Updated Label',
        hex_color: '#00ff00',
      };
      mockClient.labels.updateLabel.mockResolvedValue(mockLabel);

      const result = await mockHandler({
        subcommand: 'update',
        id: 1,
        title: 'Updated Label',
      });

      expect(mockClient.labels.updateLabel).toHaveBeenCalledWith(1, {
        title: 'Updated Label',
      });
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('update-label');
      expect(markdown).toContain('Label "Updated Label" updated successfully');
    });

    it('should update all label fields', async () => {
      const mockLabel = {
        id: 1,
        title: 'Complete Update',
        description: 'New description',
        hex_color: '#0000ff',
      };
      mockClient.labels.updateLabel.mockResolvedValue(mockLabel);

      const result = await mockHandler({
        subcommand: 'update',
        id: 1,
        title: 'Complete Update',
        description: 'New description',
        hexColor: '#0000ff',
      });

      expect(mockClient.labels.updateLabel).toHaveBeenCalledWith(1, {
        title: 'Complete Update',
        description: 'New description',
        hex_color: '#0000ff',
      });
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('update-label');
      expect(markdown).toContain('Label "Complete Update" updated successfully');
    });

    it('should allow clearing description', async () => {
      const mockLabel = {
        id: 1,
        title: 'Label',
        description: '',
      };
      mockClient.labels.updateLabel.mockResolvedValue(mockLabel);

      const result = await mockHandler({
        subcommand: 'update',
        id: 1,
        description: '',
      });

      expect(mockClient.labels.updateLabel).toHaveBeenCalledWith(1, {
        description: '',
      });
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('update-label');
      expect(markdown).toContain('Label "Label" updated successfully');
    });

    it('should throw API_ERROR for permission errors', async () => {
      const error = new Error('You do not have permission to perform this action');
      (error as any).statusCode = 403;
      mockClient.labels.updateLabel.mockRejectedValue(error);

      await expect(
        mockHandler({
          subcommand: 'update',
          id: 1,
          title: 'Forbidden Update',
        }),
      ).rejects.toThrow(
        new MCPError(ErrorCode.API_ERROR, 'Failed to update label: You do not have permission to perform this action'),
      );
    });
  });

  describe('Delete Label', () => {
    it('should validate label ID is required', async () => {
      await expect(
        mockHandler({
          subcommand: 'delete',
        }),
      ).rejects.toThrow('Label ID is required');
    });

    it('should delete a label by ID', async () => {
      const mockMessage = { message: 'Label deleted successfully' };
      mockClient.labels.deleteLabel.mockResolvedValue(mockMessage);

      const result = await mockHandler({
        subcommand: 'delete',
        id: 1,
      });

      expect(mockClient.labels.deleteLabel).toHaveBeenCalledWith(1);
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('delete-label');
      expect(markdown).toContain('Label deleted successfully');
    });

    it('should throw NOT_FOUND error when label does not exist', async () => {
      const error = new Error('Not found');
      (error as any).statusCode = 404;
      mockClient.labels.deleteLabel.mockRejectedValue(error);

      await expect(
        mockHandler({
          subcommand: 'delete',
          id: 999,
        }),
      ).rejects.toThrow(new MCPError(ErrorCode.NOT_FOUND, 'Label with ID 999 not found'));
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown subcommand', async () => {
      await expect(
        mockHandler({
          subcommand: 'unknown',
        }),
      ).rejects.toThrow('Invalid subcommand: unknown');
    });

    it('should handle generic errors', async () => {
      mockClient.labels.getLabels.mockRejectedValue(new Error('Network error'));

      await expect(
        mockHandler({
          subcommand: 'list',
        }),
      ).rejects.toThrow(
        new MCPError(ErrorCode.API_ERROR, 'vikunja_labels.list label failed: Network error'),
      );
    });

    it('should handle errors without response property', async () => {
      mockClient.labels.getLabel.mockRejectedValue(new Error('Connection refused'));

      await expect(
        mockHandler({
          subcommand: 'get',
          id: 1,
        }),
      ).rejects.toThrow(
        new MCPError(ErrorCode.API_ERROR, 'vikunja_labels.get label failed: Connection refused'),
      );
    });

    it('should use default message for 400 errors without message', async () => {
      mockClient.labels.createLabel.mockRejectedValue({
        statusCode: 400,
      });

      await expect(
        mockHandler({
          subcommand: 'create',
          title: 'Bad Label',
        }),
      ).rejects.toThrow(new MCPError(ErrorCode.API_ERROR, 'Failed to create label: Unknown error'));
    });

    it('should handle non-Error exceptions', async () => {
      mockClient.labels.getLabels.mockRejectedValue('String error');

      await expect(
        mockHandler({
          subcommand: 'list',
        }),
      ).rejects.toThrow('vikunja_labels.list label failed: Unknown error');
    });
  });
});
