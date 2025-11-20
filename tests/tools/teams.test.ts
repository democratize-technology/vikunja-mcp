import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import { registerTeamsTool } from '../../src/tools/teams';
import { MCPError, ErrorCode } from '../../src/types';
import type { Team } from 'node-vikunja';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';
import { parseMarkdown } from '../utils/markdown';

// Import the function we're mocking
import { getClientFromContext } from '../../src/client';

// Mock the modules
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
  setGlobalClientFactory: jest.fn(),
  clearGlobalClientFactory: jest.fn(),
}));
jest.mock('../../src/auth/AuthManager');

describe('Teams Tool', () => {
  let mockClient: MockVikunjaClient;
  let mockAuthManager: MockAuthManager;
  let mockServer: MockServer;
  let toolHandler: (args: any) => Promise<any>;

  // Helper function to call a tool
  async function callTool(subcommand?: string, args: Record<string, any> = {}) {
    return toolHandler({
      subcommand,
      ...args,
    });
  }

  // Mock data
  const mockTeam: Team = {
    id: 1,
    name: 'Test Team',
    description: 'Test team description',
    created: '2025-01-01T00:00:00Z',
    updated: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
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
        getTeams: jest.fn(),
        createTeam: jest.fn(),
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
        apiToken: 'test-token',
      }),
      setSession: jest.fn(),
      clearSession: jest.fn(),
      connect: jest.fn(),
      getStatus: jest.fn(),
      isConnected: jest.fn(),
      disconnect: jest.fn(),
    } as MockAuthManager;

    // Mock getClientFromContext
    (getClientFromContext as jest.Mock).mockReturnValue(mockClient);
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);

    // Setup mock server
    mockServer = {
      tool: jest.fn() as jest.MockedFunction<(name: string, description: string, schema: any, handler: any) => void>,
    } as MockServer;

    // Register the tool
    registerTeamsTool(mockServer, mockAuthManager);

    // Get the tool handler
    expect(mockServer.tool).toHaveBeenCalledWith(
      'vikunja_teams',
      expect.any(String),
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

  describe('Authentication', () => {
    it('should require authentication for all operations', async () => {
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await expect(callTool('list')).rejects.toThrow(
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    });
  });

  describe('list subcommand', () => {
    it('should list all teams', async () => {
      const mockTeams = [mockTeam, { ...mockTeam, id: 2, name: 'Team 2' }];
      mockClient.teams.getTeams.mockResolvedValue(mockTeams);

      const result = await callTool('list');

      expect(mockClient.teams.getTeams).toHaveBeenCalledWith({});
      expect(result.content[0].type).toBe('text');
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('list-teams');
      expect(markdown).toContain('Retrieved 2 teams');
    });

    it('should support pagination parameters', async () => {
      mockClient.teams.getTeams.mockResolvedValue([mockTeam]);

      await callTool('list', { page: 2, perPage: 10 });

      expect(mockClient.teams.getTeams).toHaveBeenCalledWith({
        page: 2,
        per_page: 10,
      });
    });

    it('should support search parameter', async () => {
      mockClient.teams.getTeams.mockResolvedValue([mockTeam]);

      await callTool('list', { search: 'test' });

      expect(mockClient.teams.getTeams).toHaveBeenCalledWith({
        s: 'test',
      });
    });

    it('should handle API errors', async () => {
      mockClient.teams.getTeams.mockRejectedValue(new Error('API Error'));

      await expect(callTool('list')).rejects.toThrow('vikunja_teams.list team failed: API Error');
    });

    it('should handle non-Error API errors', async () => {
      mockClient.teams.getTeams.mockRejectedValue('String error');

      await expect(callTool('list')).rejects.toThrow('vikunja_teams.list team failed: Unknown error');
    });
  });

  describe('create subcommand', () => {
    it('should create a team', async () => {
      mockClient.teams.createTeam.mockResolvedValue(mockTeam);

      const result = await callTool('create', {
        name: 'Test Team',
        description: 'Test team description',
      });

      expect(mockClient.teams.createTeam).toHaveBeenCalledWith({
        name: 'Test Team',
        description: 'Test team description',
      });
      expect(result.content[0].type).toBe('text');
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('create-team');
      expect(markdown).toContain('Team "Test Team" created successfully');
    });

    it('should require team name', async () => {
      await expect(callTool('create')).rejects.toThrow('Team name is required');
    });

    it('should handle API errors', async () => {
      mockClient.teams.createTeam.mockRejectedValue(new Error('Creation failed'));

      await expect(callTool('create', { name: 'New Team' })).rejects.toThrow(
        'vikunja_teams.create team failed: Creation failed',
      );
    });
  });

  describe('get subcommand', () => {
    it('should require team ID', async () => {
      await expect(callTool('get')).rejects.toThrow('Team ID is required');
    });

    it('should validate team ID', async () => {
      await expect(callTool('get', { id: -1 })).rejects.toThrow('id must be a positive integer');
      await expect(callTool('get', { id: 0 })).rejects.toThrow('id must be a positive integer');
      await expect(callTool('get', { id: 1.5 })).rejects.toThrow('id must be a positive integer');
      await expect(callTool('get', { id: 'invalid' })).rejects.toThrow(
        'id must be a positive integer',
      );
    });

    it('should throw not implemented error', async () => {
      await expect(callTool('get', { id: 1 })).rejects.toThrow(
        'Get team by ID is not yet implemented in the node-vikunja library',
      );
    });
  });

  describe('update subcommand', () => {
    it('should require team ID', async () => {
      await expect(callTool('update')).rejects.toThrow('Team ID is required');
    });

    it('should validate team ID', async () => {
      await expect(callTool('update', { id: -1, name: 'New Name' })).rejects.toThrow(
        'id must be a positive integer',
      );
    });

    it('should require at least one field to update', async () => {
      await expect(callTool('update', { id: 1 })).rejects.toThrow(
        'At least one field to update is required',
      );
    });

    it('should throw not implemented error', async () => {
      await expect(callTool('update', { id: 1, name: 'New Name' })).rejects.toThrow(
        'Update team is not yet implemented in the node-vikunja library',
      );
    });
  });

  describe('delete subcommand', () => {
    it('should require team ID', async () => {
      await expect(callTool('delete')).rejects.toThrow('Team ID is required');
    });

    it('should validate team ID', async () => {
      await expect(callTool('delete', { id: -1 })).rejects.toThrow('id must be a positive integer');
    });

    it('should delete a team successfully', async () => {
      const mockResponse = { message: 'The team was successfully deleted.' };
      mockClient.teams.deleteTeam = jest.fn().mockResolvedValue(mockResponse);

      const result = await callTool('delete', { id: 1 });

      expect(mockClient.teams.deleteTeam).toHaveBeenCalledWith(1);
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('delete-team');
      expect(markdown).toContain('Team deleted successfully');
    });

    it('should handle string ID', async () => {
      const mockResponse = { message: 'The team was successfully deleted.' };
      mockClient.teams.deleteTeam = jest.fn().mockResolvedValue(mockResponse);

      const result = await callTool('delete', { id: '5' });

      expect(mockClient.teams.deleteTeam).toHaveBeenCalledWith(5);
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('delete-team');
    });

    it('should handle team not found error', async () => {
      mockClient.teams.deleteTeam = jest.fn().mockRejectedValue(new Error('Team not found'));

      await expect(callTool('delete', { id: 999 })).rejects.toThrow(
        'vikunja_teams.delete team failed: Team not found',
      );
    });

    it('should use fallback API call when deleteTeam method does not exist', async () => {
      // Remove deleteTeam method to simulate it not being available
      delete (mockClient.teams as any).deleteTeam;

      // Mock fetch for the fallback API call
      const mockResponse = { message: 'The team was successfully deleted.' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
        text: jest.fn().mockResolvedValue(''),
      });

      const result = await callTool('delete', { id: 1 });

      expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      });

      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('delete-team');
      expect(markdown).toContain('Team deleted successfully');
    });

    it('should handle API error in fallback method', async () => {
      // Remove deleteTeam method
      delete (mockClient.teams as any).deleteTeam;

      // Mock fetch to return an error
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('Team not found'),
      } as any);

      await expect(callTool('delete', { id: 999 })).rejects.toThrow(
        'Failed to leave team 999: Team not found',
      );
    });

    it('should handle TypeError when method is not a function', async () => {
      // Set deleteTeam to something that's not a function
      mockClient.teams.deleteTeam = 'not a function' as any;

      // Mock fetch for the fallback
      const mockResponse = { message: 'The team was successfully deleted.' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      } as any);

      const result = await callTool('delete', { id: 1 });

      expect(global.fetch).toHaveBeenCalled();
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
    });
  });

  describe('members subcommand', () => {
    it('should require team ID', async () => {
      await expect(callTool('members')).rejects.toThrow('Team ID is required');
    });

    it('should validate team ID', async () => {
      await expect(callTool('members', { id: 'invalid' })).rejects.toThrow(
        'id must be a positive integer',
      );
    });

    it('should throw not implemented error', async () => {
      await expect(callTool('members', { id: 1 })).rejects.toThrow(
        'Team member operations are not yet implemented in the node-vikunja library',
      );
    });
  });

  describe('invalid subcommand', () => {
    it('should reject invalid subcommands', async () => {
      await expect(callTool('invalid')).rejects.toThrow('Invalid subcommand: invalid');
    });
  });

  describe('error handling', () => {
    it('should pass through MCPError instances', async () => {
      const customError = new MCPError(ErrorCode.API_ERROR, 'Custom error');
      mockClient.teams.getTeams.mockRejectedValue(customError);

      await expect(callTool('list')).rejects.toThrow('Custom error');
    });

    it('should handle non-MCPError objects in catch block', async () => {
      // Mock getTeams to throw a non-MCPError
      mockClient.teams.getTeams = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(callTool('list')).rejects.toThrow('vikunja_teams.list team failed: Unexpected error');
    });

    it('should handle non-Error thrown values in main handler', async () => {
      // Mock getTeams to throw a non-Error value
      mockClient.teams.getTeams = jest.fn().mockImplementation(() => {
        throw 'String error thrown';
      });

      await expect(callTool('list')).rejects.toThrow('vikunja_teams.list team failed: Unknown error');
    });
  });

  describe('default subcommand', () => {
    it('should default to list when no subcommand provided', async () => {
      mockClient.teams.getTeams.mockResolvedValue([mockTeam]);

      const result = await callTool();

      expect(mockClient.teams.getTeams).toHaveBeenCalled();
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(parsed.hasHeading(2, /✅ Success/)).toBe(true);
      expect(markdown).toContain('list-teams');
      expect(markdown).toContain('Retrieved 1 team');
    });
  });

  describe('tool registration', () => {
    it('should register the vikunja_teams tool', () => {
      expect(mockServer.tool).toHaveBeenCalledWith(
        'vikunja_teams',
        'Manage teams and team memberships for collaborative project management',
        expect.any(Object), // Zod schema
        expect.any(Function), // Handler function
      );
    });

    it('should have the correct tool handler', () => {
      expect(toolHandler).toBeDefined();
      expect(typeof toolHandler).toBe('function');
    });
  });
});
