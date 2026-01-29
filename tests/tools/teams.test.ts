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
      expect(markdown).toContain("## ✅ Success");
      expect(markdown).toContain("**Operation:** list-teams");
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
      expect(markdown).toContain("## ✅ Success");
      expect(markdown).toContain("**Operation:** create-team");
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

    it('should get a team by ID', async () => {
      // Mock fetch for the API call
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockTeam),
      } as any);

      const result = await callTool('get', { id: 1 });

      expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      });

      const markdown = result.content[0].text;
      expect(markdown).toContain("## ✅ Success");
      expect(markdown).toContain("**Operation:** get-team");
      expect(markdown).toContain('Retrieved team "Test Team"');
    });

    it('should handle API errors when getting team', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('Team not found'),
      } as any);

      await expect(callTool('get', { id: 999 })).rejects.toThrow('Failed to get team 999');
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

    it('should update a team name', async () => {
      const updatedTeam = { ...mockTeam, name: 'Updated Team Name' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(updatedTeam),
      } as any);

      const result = await callTool('update', { id: 1, name: 'Updated Team Name' });

      expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Updated Team Name' }),
      });

      const markdown = result.content[0].text;
      expect(markdown).toContain("## ✅ Success");
      expect(markdown).toContain("**Operation:** update-team");
      expect(markdown).toContain('Team "Updated Team Name" updated successfully');
    });

    it('should update team description', async () => {
      const updatedTeam = { ...mockTeam, description: 'New description' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(updatedTeam),
      } as any);

      const result = await callTool('update', { id: 1, description: 'New description' });

      expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: 'New description' }),
      });

      const markdown = result.content[0].text;
      expect(markdown).toContain("## ✅ Success");
      expect(markdown).toContain("**Operation:** update-team");
    });

    it('should update both name and description', async () => {
      const updatedTeam = { ...mockTeam, name: 'Updated', description: 'Updated desc' };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(updatedTeam),
      } as any);

      await callTool('update', { id: 1, name: 'Updated', description: 'Updated desc' });

      expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Updated', description: 'Updated desc' }),
      });
    });

    it('should handle API errors when updating team', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: jest.fn().mockResolvedValue('Team not found'),
      } as any);

      await expect(callTool('update', { id: 999, name: 'New Name' })).rejects.toThrow(
        'Failed to update team 999',
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
      expect(markdown).toContain("## ✅ Success");
      expect(markdown).toContain("**Operation:** delete-team");
      expect(markdown).toContain('Team deleted successfully');
    });

    it('should handle string ID', async () => {
      const mockResponse = { message: 'The team was successfully deleted.' };
      mockClient.teams.deleteTeam = jest.fn().mockResolvedValue(mockResponse);

      const result = await callTool('delete', { id: '5' });

      expect(mockClient.teams.deleteTeam).toHaveBeenCalledWith(5);
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("## ✅ Success");
      expect(markdown).toContain("**Operation:** delete-team");
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
      expect(markdown).toContain("## ✅ Success");
      expect(markdown).toContain("**Operation:** delete-team");
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
      expect(markdown).toContain("## ✅ Success");
      expect(markdown).toContain("**Operation:** delete-team");
    });
  });

  describe('members subcommand', () => {
    const mockMembers = [
      { id: 1, username: 'user1', admin: true, email: 'user1@example.com', created: '2025-01-01T00:00:00Z' },
      { id: 2, username: 'user2', admin: false, email: 'user2@example.com', created: '2025-01-01T00:00:00Z' },
    ];

    it('should require team ID', async () => {
      await expect(callTool('members')).rejects.toThrow('Team ID is required');
    });

    it('should validate team ID', async () => {
      await expect(callTool('members', { id: 'invalid' })).rejects.toThrow(
        'id must be a positive integer',
      );
    });

    describe('members list subcommand', () => {
      it('should list team members by default', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(mockMembers),
        } as any);

        const result = await callTool('members', { id: 1 });

        expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1/members', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        });

        const markdown = result.content[0].text;
        expect(markdown).toContain("## ✅ Success");
        expect(markdown).toContain("**Operation:** list-team-members");
        expect(markdown).toContain('Retrieved 2 members');
      });

      it('should list team members explicitly', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(mockMembers),
        } as any);

        const result = await callTool('members', { id: 1, memberSubcommand: 'list' });

        expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1/members', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        });

        const markdown = result.content[0].text;
        expect(markdown).toContain('Retrieved 2 members');
      });

      it('should handle single member response', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(mockMembers[0]),
        } as any);

        const result = await callTool('members', { id: 1, memberSubcommand: 'list' });

        const markdown = result.content[0].text;
        expect(markdown).toContain('Retrieved 1 member');
      });

      it('should handle API errors when listing members', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: jest.fn().mockResolvedValue('Team not found'),
        } as any);

        await expect(callTool('members', { id: 999, memberSubcommand: 'list' })).rejects.toThrow(
          'Failed to list members for team 999',
        );
      });
    });

    describe('members add subcommand', () => {
      it('should require user ID', async () => {
        await expect(callTool('members', { id: 1, memberSubcommand: 'add' })).rejects.toThrow(
          'User ID is required',
        );
      });

      it('should validate user ID', async () => {
        await expect(callTool('members', { id: 1, memberSubcommand: 'add', userId: 'invalid' })).rejects.toThrow(
          'userId must be a positive integer',
        );
      });

      it('should add a member to team', async () => {
        const newMember = { ...mockMembers[0], id: 3 };
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(newMember),
        } as any);

        const result = await callTool('members', { id: 1, memberSubcommand: 'add', userId: 3 });

        expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1/members', {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username: '3' }),
        });

        const markdown = result.content[0].text;
        expect(markdown).toContain("## ✅ Success");
        expect(markdown).toContain("**Operation:** add-team-member");
        expect(markdown).toContain('User 3 added to team successfully');
      });

      it('should add a member as admin', async () => {
        const newMember = { ...mockMembers[0], id: 3, admin: true };
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(newMember),
        } as any);

        const result = await callTool('members', {
          id: 1,
          memberSubcommand: 'add',
          userId: 3,
          admin: true,
        });

        expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1/members', {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username: '3', admin: true }),
        });

        const markdown = result.content[0].text;
        expect(markdown).toContain('User 3 added to team successfully');
      });

      it('should handle API errors when adding member', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: jest.fn().mockResolvedValue('User not found'),
        } as any);

        await expect(
          callTool('members', { id: 1, memberSubcommand: 'add', userId: 999 }),
        ).rejects.toThrow('Failed to add user 999 to team 1');
      });
    });

    describe('members remove subcommand', () => {
      it('should require user ID', async () => {
        await expect(callTool('members', { id: 1, memberSubcommand: 'remove' })).rejects.toThrow(
          'User ID is required',
        );
      });

      it('should validate user ID', async () => {
        await expect(
          callTool('members', { id: 1, memberSubcommand: 'remove', userId: 'invalid' }),
        ).rejects.toThrow('userId must be a positive integer');
      });

      it('should remove a member from team', async () => {
        const deleteResult = { message: 'The team member was successfully deleted.' };
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(deleteResult),
        } as any);

        const result = await callTool('members', { id: 1, memberSubcommand: 'remove', userId: 2 });

        expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1/members/2', {
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        });

        const markdown = result.content[0].text;
        expect(markdown).toContain("## ✅ Success");
        expect(markdown).toContain("**Operation:** remove-team-member");
        expect(markdown).toContain('User 2 removed from team successfully');
      });

      it('should handle API errors when removing member', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: jest.fn().mockResolvedValue('Member not found'),
        } as any);

        await expect(
          callTool('members', { id: 1, memberSubcommand: 'remove', userId: 999 }),
        ).rejects.toThrow('Failed to remove user 999 from team 1');
      });
    });

    describe('members update subcommand', () => {
      it('should require user ID', async () => {
        await expect(callTool('members', { id: 1, memberSubcommand: 'update', admin: true })).rejects.toThrow(
          'User ID is required',
        );
      });

      it('should require admin flag', async () => {
        await expect(
          callTool('members', { id: 1, memberSubcommand: 'update', userId: 2 }),
        ).rejects.toThrow('Admin flag is required for updating member');
      });

      it('should update member admin status to true', async () => {
        const updatedMember = { ...mockMembers[1], admin: true };
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(updatedMember),
        } as any);

        const result = await callTool('members', {
          id: 1,
          memberSubcommand: 'update',
          userId: 2,
          admin: true,
        });

        expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1/members/2', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username: '2', admin: true }),
        });

        const markdown = result.content[0].text;
        expect(markdown).toContain("## ✅ Success");
        expect(markdown).toContain("**Operation:** update-team-member");
        expect(markdown).toContain('User 2 updated in team successfully');
      });

      it('should update member admin status to false', async () => {
        const updatedMember = { ...mockMembers[0], admin: false };
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue(updatedMember),
        } as any);

        const result = await callTool('members', {
          id: 1,
          memberSubcommand: 'update',
          userId: 1,
          admin: false,
        });

        expect(global.fetch).toHaveBeenCalledWith('https://vikunja.example.com/teams/1/members/1', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username: '1', admin: false }),
        });

        const markdown = result.content[0].text;
        expect(markdown).toContain('User 1 updated in team successfully');
      });

      it('should handle API errors when updating member', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: jest.fn().mockResolvedValue('Member not found'),
        } as any);

        await expect(
          callTool('members', { id: 1, memberSubcommand: 'update', userId: 999, admin: true }),
        ).rejects.toThrow('Failed to update user 999 in team 1');
      });
    });

    describe('members invalid subcommand', () => {
      it('should reject invalid member subcommands', async () => {
        await expect(
          callTool('members', { id: 1, memberSubcommand: 'invalid' }),
        ).rejects.toThrow('Invalid member subcommand: invalid');
      });
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
      expect(markdown).toContain("## ✅ Success");
      expect(markdown).toContain("**Operation:** list-teams");
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
