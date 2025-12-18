import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import { registerUsersTool } from '../../src/tools/users';
import { MCPError, ErrorCode } from '../../src/types';
import type { User } from 'node-vikunja';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';
import { parseMarkdown } from '../utils/markdown';

// Import the function we're mocking
import { getClientFromContext } from '../../src/client';

// Mock the modules
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
}));
jest.mock('../../src/auth/AuthManager');

describe('Users Tool', () => {
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
  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User',
    language: 'en',
    timezone: 'UTC',
    week_start: 1,
    frontend_settings: {},
    email_reminders_enabled: true,
    overdue_tasks_reminders_enabled: false,
    overdue_tasks_reminders_time: '09:00',
    created: '2025-01-01T00:00:00Z',
    updated: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    // Setup mock client
    mockClient = {
      getToken: jest.fn(),
      tasks: {} as any,
      projects: {} as any,
      labels: {} as any,
      teams: {} as any,
      shares: {} as any,
      users: {
        getAll: jest.fn(),
        getUser: jest.fn(),
        getUsers: jest.fn(),
        updateGeneralSettings: jest.fn(),
      } as any,
    } as MockVikunjaClient;

    // Setup mock auth manager
    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getAuthType: jest.fn().mockReturnValue('jwt'),
      getAuthenticatedClient: jest.fn(),
      updateCredentials: jest.fn(),
      clearCredentials: jest.fn(),
      verifyCredentials: jest.fn(),
      getCredentials: jest.fn(),
      authenticate: jest.fn(),
      getSession: jest.fn(),
      setSession: jest.fn(),
      clearSession: jest.fn(),
    } as MockAuthManager;

    // Mock getClientFromContext
    (getClientFromContext as jest.Mock).mockReturnValue(mockClient);
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);

    // Setup mock server
    mockServer = {
      tool: jest.fn() as jest.MockedFunction<(name: string, description: string, schema: any, handler: any) => void>,
    } as MockServer;

    // Register the tool
    registerUsersTool(mockServer, mockAuthManager);

    // Get the tool handler
    expect(mockServer.tool).toHaveBeenCalledWith(
      'vikunja_users',
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

      await expect(callTool('current')).rejects.toThrow(
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    });

    it('should require JWT authentication for all operations', async () => {
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthType.mockReturnValue('api-token');

      await expect(callTool('current')).rejects.toThrow(
        'User operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.',
      );
    });

    it('should allow operations with JWT authentication', async () => {
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthType.mockReturnValue('jwt');
      mockClient.users.getUser.mockResolvedValue(mockUser);

      const result = await callTool('current');

      expect(result.content[0].type).toBe('text');
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ get-current-user:");
    });
  });

  describe('current subcommand', () => {
    it('should get current user info', async () => {
      mockClient.users.getUser.mockResolvedValue(mockUser);

      const result = await callTool('current');

      expect(mockClient.users.getUser).toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ get-current-user:");
      expect(markdown).toContain('Current user retrieved successfully');
    });

    it('should handle API errors', async () => {
      mockClient.users.getUser.mockRejectedValue(new Error('API Error'));

      await expect(callTool('current')).rejects.toThrow('User operation error: API Error');
    });

    it('should handle non-Error API errors', async () => {
      mockClient.users.getUser.mockRejectedValue('String error');

      await expect(callTool('current')).rejects.toThrow('User operation error: String error');
    });
  });

  describe('search subcommand', () => {
    it('should search for users', async () => {
      const mockUsers = [mockUser, { ...mockUser, id: 2, username: 'user2' }];
      mockClient.users.getUsers.mockResolvedValue(mockUsers);

      const result = await callTool('search');

      expect(mockClient.users.getUsers).toHaveBeenCalledWith({});
      expect(result.content[0].type).toBe('text');
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ search-users:");
      expect(markdown).toContain('Found 2 users');
    });

    it('should support search parameter', async () => {
      mockClient.users.getUsers.mockResolvedValue([mockUser]);

      const result = await callTool('search', { search: 'test' });

      expect(mockClient.users.getUsers).toHaveBeenCalledWith({
        s: 'test',
      });
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ search-users:");
    });

    it('should support pagination parameters', async () => {
      mockClient.users.getUsers.mockResolvedValue([mockUser]);

      const result = await callTool('search', { page: 2, perPage: 10 });

      expect(mockClient.users.getUsers).toHaveBeenCalledWith({
        page: 2,
        per_page: 10,
      });
      const markdown = result.content[0].text;
      expect(markdown).toContain('2'); // page number
    });

    it('should handle API errors', async () => {
      mockClient.users.getUsers.mockRejectedValue(new Error('Search failed'));

      await expect(callTool('search')).rejects.toThrow('User operation error: Search failed');
    });
  });

  describe('settings subcommand', () => {
    it('should get user settings', async () => {
      mockClient.users.getUser.mockResolvedValue(mockUser);

      const result = await callTool('settings');

      expect(mockClient.users.getUser).toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ get-user-settings:");
      expect(markdown).toContain('User settings retrieved successfully');
    });

    it('should handle API errors', async () => {
      mockClient.users.getUser.mockRejectedValue(new Error('Failed to get settings'));

      await expect(callTool('settings')).rejects.toThrow(
        'User operation error: Failed to get settings',
      );
    });
  });

  describe('update-settings subcommand', () => {
    it('should update user settings', async () => {
      const updatedUser = { ...mockUser, name: 'Updated Name', language: 'es' };
      mockClient.users.updateGeneralSettings.mockResolvedValue({ message: 'Success' });
      mockClient.users.getUser.mockResolvedValue(updatedUser);

      const result = await callTool('update-settings', {
        name: 'Updated Name',
        language: 'es',
      });

      expect(mockClient.users.updateGeneralSettings).toHaveBeenCalledWith({
        name: 'Updated Name',
        language: 'es',
      });
      expect(result.content[0].type).toBe('text');
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ update-user-settings:");
      expect(markdown).toContain('User settings updated successfully');
    });

    it('should update all settings fields', async () => {
      mockClient.users.updateGeneralSettings.mockResolvedValue({ message: 'Success' });
      mockClient.users.getUser.mockResolvedValue(mockUser);

      const result = await callTool('update-settings', {
        name: 'New Name',
        language: 'fr',
        timezone: 'Europe/Paris',
        weekStart: 0,
        frontendSettings: { theme: 'dark' },
      });

      expect(mockClient.users.updateGeneralSettings).toHaveBeenCalledWith({
        name: 'New Name',
        language: 'fr',
        timezone: 'Europe/Paris',
        week_start: 0,
        frontend_settings: { theme: 'dark' },
      });
      const markdown = result.content[0].text;
      expect(markdown).toContain('name');
      expect(markdown).toContain('language');
      expect(markdown).toContain('timezone');
    });

    it('should update notification preferences', async () => {
      mockClient.users.updateGeneralSettings.mockResolvedValue({ message: 'Success' });
      mockClient.users.getUser.mockResolvedValue({
        ...mockUser,
        email_reminders_enabled: false,
        overdue_tasks_reminders_enabled: true,
        overdue_tasks_reminders_time: '08:00',
      });

      const result = await callTool('update-settings', {
        emailRemindersEnabled: false,
        overdueTasksRemindersEnabled: true,
        overdueTasksRemindersTime: '08:00',
      });

      expect(mockClient.users.updateGeneralSettings).toHaveBeenCalledWith({
        email_reminders_enabled: false,
        overdue_tasks_reminders_enabled: true,
        overdue_tasks_reminders_time: '08:00',
      });
      const markdown = result.content[0].text;
      expect(markdown).toContain('emailRemindersEnabled');
      expect(markdown).toContain('overdueTasksRemindersEnabled');
    });

    it('should update mixed settings including notifications', async () => {
      mockClient.users.updateGeneralSettings.mockResolvedValue({ message: 'Success' });
      mockClient.users.getUser.mockResolvedValue(mockUser);

      const result = await callTool('update-settings', {
        name: 'Updated Name',
        emailRemindersEnabled: true,
        overdueTasksRemindersTime: '10:00',
      });

      expect(mockClient.users.updateGeneralSettings).toHaveBeenCalledWith({
        name: 'Updated Name',
        email_reminders_enabled: true,
        overdue_tasks_reminders_time: '10:00',
      });
      const markdown = result.content[0].text;
      expect(markdown).toContain('name');
      expect(markdown).toContain('emailRemindersEnabled');
    });

    it('should require at least one field to update', async () => {
      await expect(callTool('update-settings')).rejects.toThrow(
        'At least one setting field is required',
      );
    });

    it('should handle weekStart as 0', async () => {
      mockClient.users.updateGeneralSettings.mockResolvedValue({ message: 'Success' });
      mockClient.users.getUser.mockResolvedValue(mockUser);

      const result = await callTool('update-settings', { weekStart: 0 });

      expect(mockClient.users.updateGeneralSettings).toHaveBeenCalledWith({
        week_start: 0,
      });
      const markdown = result.content[0].text;
      expect(markdown).toContain('weekStart');
    });

    it('should handle API errors', async () => {
      mockClient.users.updateGeneralSettings.mockRejectedValue(new Error('Update failed'));

      await expect(callTool('update-settings', { name: 'New Name' })).rejects.toThrow(
        'User operation error: Update failed',
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
      mockClient.users.getUser.mockRejectedValue(customError);

      await expect(callTool('current')).rejects.toThrow('Custom error');
    });

    it('should handle non-MCPError objects in catch block', async () => {
      // Mock getUser to throw a non-MCPError
      mockClient.users.getUser = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(callTool('current')).rejects.toThrow('User operation error: Unexpected error');
    });

    it('should handle non-Error thrown values in main handler', async () => {
      // Mock getUser to throw a non-Error value
      mockClient.users.getUser = jest.fn().mockImplementation(() => {
        throw 'String error thrown';
      });

      await expect(callTool('current')).rejects.toThrow(
        'User operation error: String error thrown',
      );
    });

    it('should handle authentication errors for current user endpoint', async () => {
      // Mock getUser to throw an authentication error
      mockClient.users.getUser.mockRejectedValue(new Error('401 Unauthorized: Invalid auth token'));

      await expect(callTool('current')).rejects.toThrow(
        'User endpoint authentication error. This is a known Vikunja API limitation. ' +
          'User endpoints require JWT authentication instead of API tokens. ' +
          'To use user operations, connect with a JWT token (starting with eyJ).',
      );
    });

    it('should handle token-related errors for current user endpoint', async () => {
      // Mock getUser to throw a token error
      mockClient.users.getUser.mockRejectedValue(new Error('Token validation failed'));

      await expect(callTool('current')).rejects.toThrow(
        'User operation error: Token validation failed'
      );
    });

    it('should handle auth errors for search operation', async () => {
      mockClient.users.getUsers.mockRejectedValue(new Error('403 Forbidden'));

      await expect(callTool('search')).rejects.toThrow(
        'User endpoint authentication error. This is a known Vikunja API limitation.',
      );
    });

    it('should handle auth errors for settings operation', async () => {
      mockClient.users.getUser.mockRejectedValue(new Error('unauthorized'));

      await expect(callTool('settings')).rejects.toThrow(
        'User endpoint authentication error. This is a known Vikunja API limitation.',
      );
    });

    it('should handle auth errors for update-settings operation', async () => {
      mockClient.users.updateGeneralSettings.mockRejectedValue(new Error('Auth token expired'));

      await expect(callTool('update-settings', { name: 'New Name' })).rejects.toThrow(
        'JWT token has expired',
      );
    });
  });

  describe('default subcommand', () => {
    it('should default to current when no subcommand provided', async () => {
      mockClient.users.getUser.mockResolvedValue(mockUser);

      const result = await callTool();

      expect(mockClient.users.getUser).toHaveBeenCalled();
      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("✅ get-current-user:");
      expect(markdown).toContain('Current user retrieved successfully');
    });

    it('should handle errors when defaulting to current subcommand', async () => {
      mockClient.users.getUser.mockRejectedValue(new Error('Default error'));

      await expect(callTool()).rejects.toThrow('User operation error: Default error');
    });
  });

  describe('tool registration', () => {
    it('should register the vikunja_users tool', () => {
      expect(mockServer.tool).toHaveBeenCalledWith(
        'vikunja_users',
        'Manage user profiles, search users, and update user settings',
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
