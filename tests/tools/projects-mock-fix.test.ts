import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import { registerProjectsTool } from '../../src/tools/projects';
import type { Project, User } from 'node-vikunja';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';
import { parseMarkdown } from '../utils/markdown';

// Import the function we're mocking
import { getClientFromContext } from '../../src/client';

// Mock the modules
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
}));
jest.mock('../../src/auth/AuthManager');

describe('Projects Tool Mock Fixes', () => {
  let mockClient: MockVikunjaClient;
  let mockAuthManager: MockAuthManager;
  let mockServer: MockServer;
  let toolHandler: (args: any) => Promise<any>;

  // Helper function to call a tool
  async function callTool(subcommand: string, args: Record<string, any> = {}) {
    if (typeof toolHandler !== 'function') {
      throw new Error('toolHandler is not a function in callTool');
    }

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
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  const mockProject: Project = {
    id: 1,
    title: 'Test Project',
    description: 'Test Description',
    parent_project_id: undefined,
    is_archived: false,
    hex_color: '#4287f5',
    owner: mockUser,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    position: 1,
    identifier: 'TEST',
  };

  beforeEach(() => {
    jest.clearAllMocks();

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
    } as MockVikunjaClient;

    // Setup mock auth manager
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

    // Setup mock server
    mockServer = {
      tool: jest.fn((name, description, schema, handler) => {
        toolHandler = handler;
      }),
    } as MockServer;

    // Mock getClientFromContext
    (getClientFromContext as jest.Mock).mockReturnValue(mockClient);
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);

    try {
      // Register the tool
      registerProjectsTool(mockServer, mockAuthManager);

      // Debug: Check if toolHandler was set
      if (typeof toolHandler !== 'function') {
        throw new Error('toolHandler was not set properly by registerProjectsTool');
      }
    } catch (error) {
      console.error('Error setting up projects tool test:', error);
      throw error;
    }
  });

  describe('delete subcommand mock fixes', () => {
    it('should delete a project with proper mock setup', async () => {
      // Mock both getProject (to get project details) and deleteProject
      mockClient.projects.getProject.mockResolvedValue(mockProject);
      mockClient.projects.deleteProject.mockResolvedValue({ message: 'Success' });

      const result = await callTool('delete', { id: 1 });

      expect(mockClient.projects.getProject).toHaveBeenCalledWith(1);
      expect(mockClient.projects.deleteProject).toHaveBeenCalledWith(1);
      expect(result.content[0].type).toBe('text');
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ success:");
      expect(markdown).toContain('delete-project');
      expect(markdown).toContain('Deleted project');
    });
  });

  describe('archive subcommand mock fixes', () => {
    it('should archive a project with proper mock setup', async () => {
      // Mock getProject to return current project
      mockClient.projects.getProject.mockResolvedValue(mockProject);
      mockClient.projects.updateProject.mockResolvedValue({
        ...mockProject,
        is_archived: true
      });

      const result = await callTool('archive', { id: 1 });

      expect(mockClient.projects.getProject).toHaveBeenCalledWith(1);
      expect(mockClient.projects.updateProject).toHaveBeenCalledWith(1, {
        title: 'Test Project',
        is_archived: true
      });
      expect(result.content[0].type).toBe('text');
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ success:");
      expect(markdown).toContain('archive-project');
      expect(markdown).toContain('archived successfully');
    });
  });

  describe('unarchive subcommand mock fixes', () => {
    it('should unarchive a project with proper mock setup', async () => {
      // Mock getProject to return archived project
      const archivedProject = { ...mockProject, is_archived: true };
      mockClient.projects.getProject.mockResolvedValue(archivedProject);
      mockClient.projects.updateProject.mockResolvedValue(mockProject);

      const result = await callTool('unarchive', { id: 1 });

      expect(mockClient.projects.getProject).toHaveBeenCalledWith(1);
      expect(mockClient.projects.updateProject).toHaveBeenCalledWith(1, {
        title: 'Test Project',
        is_archived: false
      });
      expect(result.content[0].type).toBe('text');
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ success:");
      expect(markdown).toContain('unarchive-project');
      expect(markdown).toContain('unarchived successfully');
    });
  });
});