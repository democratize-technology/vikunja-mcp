/**
 * Webhooks Tool Tests
 */

import { jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AuthManager } from '../../src/auth/AuthManager';
import {
  registerWebhooksTool,
  clearWebhookEventCache,
  expireWebhookEventCache,
} from '../../src/tools/webhooks';
import { MCPError, ErrorCode } from '../../src/types';
import { getClientFromContext } from '../../src/client';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';
import type { Webhook } from '../../src/types/vikunja';

// Mock the modules
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
  setGlobalClientFactory: jest.fn(),
  clearGlobalClientFactory: jest.fn(),
}));
jest.mock('../../src/auth/AuthManager');

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('Webhooks Tool', () => {
  let mockServer: MockServer;
  let mockAuthManager: MockAuthManager;
  let mockHandler: (args: any) => Promise<any>;
  let mockClient: MockVikunjaClient;

  const mockWebhook: Webhook = {
    id: 1,
    project_id: 1,
    target_url: 'https://example.com/webhook',
    events: ['task.created', 'task.updated'],
    secret: 'test-secret',
    created: '2023-01-01T00:00:00Z',
    updated: '2023-01-01T00:00:00Z',
  };

  const mockEvents = [
    'task.created',
    'task.updated',
    'task.deleted',
    'task.assigned',
    'task.comment.created',
    'project.created',
    'project.updated',
    'project.deleted',
  ];

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Clear webhook event cache
    clearWebhookEventCache();

    // Create mock client
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
    } as MockVikunjaClient;

    // Mock auth manager
    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getSession: jest.fn(),
      setSession: jest.fn(),
      clearSession: jest.fn(),
    } as MockAuthManager;

    // Create mock server
    mockServer = {
      tool: jest.fn() as jest.MockedFunction<(name: string, schema: any, handler: any) => void>,
    } as MockServer;

    // Mock the getClientFromContext function
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);

    // Mock auth manager session
    mockAuthManager.getSession.mockReturnValue({
      apiUrl: 'https://api.vikunja.test',
      apiToken: 'test-token',
    });

    // Reset fetch mock
    mockFetch.mockReset();

    // Register the tool
    registerWebhooksTool(
      mockServer as unknown as McpServer,
      mockAuthManager as unknown as AuthManager,
    );

    // Get the tool handler
    const calls = (mockServer.tool as jest.Mock).mock.calls;
    if (calls.length > 0) {
      mockHandler = calls[0][3]; // Handler is the 4th argument (index 3)
    } else {
      throw new Error('Tool handler not found');
    }
  });

  describe('Authentication', () => {
    it('should throw error when not authenticated', async () => {
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await expect(mockHandler({ subcommand: 'list', projectId: 1 })).rejects.toThrow(
        new MCPError(
          ErrorCode.AUTH_REQUIRED,
          'Authentication required. Please use vikunja_auth.connect first.',
        ),
      );
    });
  });

  describe('List Webhooks', () => {
    it('should default to list subcommand when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await mockHandler({ projectId: 1 }); // No subcommand specified

      expect(mockFetch).toHaveBeenCalledWith('https://api.vikunja.test/projects/1/webhooks', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      });
      expect(result.content[0].text).toContain('"operation": "list"');
    });

    it('should list webhooks for a project', async () => {
      const mockWebhooks = [mockWebhook, { ...mockWebhook, id: 2 }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWebhooks,
      });

      const result = await mockHandler({ subcommand: 'list', projectId: 1 });

      expect(mockFetch).toHaveBeenCalledWith('https://api.vikunja.test/projects/1/webhooks', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      });
      expect(result.content[0].text).toContain('"success": true');
      expect(result.content[0].text).toContain('"operation": "list"');
      expect(result.content[0].text).toContain('"count": 2');
    });

    it('should handle empty webhook list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await mockHandler({ subcommand: 'list', projectId: 1 });

      expect(result.content[0].text).toContain('"webhooks": []');
      expect(result.content[0].text).toContain('"count": 0');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ message: 'Project not found' }),
      });

      await expect(mockHandler({ subcommand: 'list', projectId: 999 })).rejects.toThrow(
        new MCPError(ErrorCode.API_ERROR, 'Project not found'),
      );
    });

    it('should handle JSON parse errors in error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(mockHandler({ subcommand: 'list', projectId: 1 })).rejects.toThrow(
        new MCPError(ErrorCode.API_ERROR, 'Failed to list webhooks: Internal Server Error'),
      );
    });

    it('should provide helpful error message for webhook authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          message: 'missing, malformed, expired or otherwise invalid token provided',
        }),
      });

      await expect(mockHandler({ subcommand: 'list', projectId: 1 })).rejects.toThrow(
        new MCPError(
          ErrorCode.API_ERROR,
          'Webhook operations require additional permissions. Please ensure your API token has webhook access rights.',
        ),
      );
    });

    it('should throw error for invalid project ID', async () => {
      await expect(mockHandler({ subcommand: 'list', projectId: 'invalid' })).rejects.toThrow(
        new MCPError(ErrorCode.VALIDATION_ERROR, 'projectId must be a positive integer'),
      );
    });
  });

  describe('Get Webhook', () => {
    it('should get a specific webhook', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockWebhook, { ...mockWebhook, id: 2 }],
      });

      const result = await mockHandler({
        subcommand: 'get',
        projectId: 1,
        webhookId: 1,
      });

      expect(mockFetch).toHaveBeenCalledWith('https://api.vikunja.test/projects/1/webhooks', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      });
      expect(result.content[0].text).toContain('"operation": "get"');
      expect(result.content[0].text).toContain('"id": 1');
    });

    it('should handle JSON parse errors when getting webhooks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(
        mockHandler({
          subcommand: 'get',
          projectId: 1,
          webhookId: 1,
        }),
      ).rejects.toThrow(new MCPError(ErrorCode.API_ERROR, 'Failed to get webhooks: Bad Request'));
    });

    it('should provide helpful error message for webhook authentication errors when getting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          message: 'insufficient permissions',
        }),
      });

      await expect(
        mockHandler({
          subcommand: 'get',
          projectId: 1,
          webhookId: 1,
        }),
      ).rejects.toThrow(
        new MCPError(
          ErrorCode.API_ERROR,
          'Webhook operations require additional permissions. Please ensure your API token has webhook access rights.',
        ),
      );
    });

    it('should throw error when webhook not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ ...mockWebhook, id: 2 }],
      });

      await expect(
        mockHandler({
          subcommand: 'get',
          projectId: 1,
          webhookId: 1,
        }),
      ).rejects.toThrow(
        new MCPError(ErrorCode.NOT_FOUND, 'Webhook with ID 1 not found in project 1'),
      );
    });
  });

  describe('Create Webhook', () => {
    it('should create a webhook with all fields', async () => {
      // Mock the events validation call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });
      // Mock the webhook creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWebhook,
      });

      const result = await mockHandler({
        subcommand: 'create',
        projectId: 1,
        targetUrl: 'https://example.com/webhook',
        events: ['task.created', 'task.updated'],
        secret: 'test-secret',
      });

      expect(mockFetch).toHaveBeenLastCalledWith('https://api.vikunja.test/projects/1/webhooks', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_url: 'https://example.com/webhook',
          events: ['task.created', 'task.updated'],
          secret: 'test-secret',
        }),
      });
      expect(result.content[0].text).toContain('"operation": "create"');
      expect(result.content[0].text).toContain('Webhook created successfully with ID 1');
    });

    it('should create a webhook without secret', async () => {
      const webhookNoSecret = { ...mockWebhook, secret: undefined };
      // Mock the events validation call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });
      // Mock the webhook creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => webhookNoSecret,
      });

      const result = await mockHandler({
        subcommand: 'create',
        projectId: 1,
        targetUrl: 'https://example.com/webhook',
        events: ['task.created'],
      });

      expect(mockFetch).toHaveBeenLastCalledWith('https://api.vikunja.test/projects/1/webhooks', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target_url: 'https://example.com/webhook',
          events: ['task.created'],
        }),
      });
    });

    it('should throw error when targetUrl is missing', async () => {
      await expect(
        mockHandler({
          subcommand: 'create',
          projectId: 1,
          events: ['task.created'],
        }),
      ).rejects.toThrow(
        new MCPError(ErrorCode.VALIDATION_ERROR, 'targetUrl is required for creating a webhook'),
      );
    });

    it('should throw error when events are missing', async () => {
      await expect(
        mockHandler({
          subcommand: 'create',
          projectId: 1,
          targetUrl: 'https://example.com/webhook',
        }),
      ).rejects.toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'At least one event is required for creating a webhook',
        ),
      );
    });

    it('should throw error when events array is empty', async () => {
      await expect(
        mockHandler({
          subcommand: 'create',
          projectId: 1,
          targetUrl: 'https://example.com/webhook',
          events: [],
        }),
      ).rejects.toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'At least one event is required for creating a webhook',
        ),
      );
    });

    it('should throw error when events are invalid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });

      await expect(
        mockHandler({
          subcommand: 'create',
          projectId: 1,
          targetUrl: 'https://example.com/webhook',
          events: ['task.archived', 'invalid.event'],
        }),
      ).rejects.toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid webhook events: task.archived, invalid.event. Valid events are: ${mockEvents.join(', ')}`,
        ),
      );
    });

    it('should use cached events for validation', async () => {
      // First call fetches events
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });
      // Mock webhook creation for first call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWebhook,
      });

      await mockHandler({
        subcommand: 'create',
        projectId: 1,
        targetUrl: 'https://example.com/webhook',
        events: ['task.created'],
      });

      // Mock webhook creation for second call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWebhook,
      });

      // Second call should use cache, not fetch again
      await mockHandler({
        subcommand: 'create',
        projectId: 1,
        targetUrl: 'https://example.com/webhook',
        events: ['task.updated'],
      });

      // Events API should have been called only once
      const eventsCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/webhooks/events'),
      );
      expect(eventsCalls).toHaveLength(1);
    });

    it('should use stale cache when API fails after initial cache', async () => {
      // First call to populate cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });

      // Create webhook to populate cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWebhook,
      });

      await mockHandler({
        subcommand: 'create',
        projectId: 1,
        targetUrl: 'https://example.com/webhook',
        events: ['task.created'],
      });

      // Expire the cache to trigger a refetch (but keep the cached events)
      expireWebhookEventCache();

      // Now make the events API fail
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // But webhook creation should still succeed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockWebhook,
      });

      // Should not throw error, should use stale cache
      const result = await mockHandler({
        subcommand: 'create',
        projectId: 1,
        targetUrl: 'https://example.com/webhook',
        events: ['task.created'],
      });

      expect(result.content[0].text).toContain('"success": true');
    });

    it('should handle JSON parse errors when creating webhook', async () => {
      // Events fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });

      // Create webhook fails with invalid JSON
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(
        mockHandler({
          subcommand: 'create',
          projectId: 1,
          targetUrl: 'https://example.com/webhook',
          events: ['task.created'],
        }),
      ).rejects.toThrow(new MCPError(ErrorCode.API_ERROR, 'Failed to create webhook: Bad Request'));
    });

    it('should provide helpful error message for webhook authentication errors when creating', async () => {
      // Events fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });

      // Create webhook fails with 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          message: 'invalid token',
        }),
      });

      await expect(
        mockHandler({
          subcommand: 'create',
          projectId: 1,
          targetUrl: 'https://example.com/webhook',
          events: ['task.created'],
        }),
      ).rejects.toThrow(
        new MCPError(
          ErrorCode.API_ERROR,
          'Webhook operations require additional permissions. Please ensure your API token has webhook access rights.',
        ),
      );
    });
  });

  describe('Update Webhook', () => {
    it('should update webhook events', async () => {
      const updatedWebhook = {
        ...mockWebhook,
        events: ['task.created', 'task.updated', 'task.deleted'],
      };
      // Mock events validation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });
      // Mock webhook update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedWebhook,
      });

      const result = await mockHandler({
        subcommand: 'update',
        projectId: 1,
        webhookId: 1,
        events: ['task.created', 'task.updated', 'task.deleted'],
      });

      expect(mockFetch).toHaveBeenLastCalledWith('https://api.vikunja.test/projects/1/webhooks/1', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: ['task.created', 'task.updated', 'task.deleted'],
        }),
      });
      expect(result.content[0].text).toContain('"operation": "update"');
      expect(result.content[0].text).toContain('Webhook events updated successfully');

      // Parse the response to check affectedFields properly
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.affectedFields).toEqual(['events']);
    });

    it('should throw error when events are missing', async () => {
      await expect(
        mockHandler({
          subcommand: 'update',
          projectId: 1,
          webhookId: 1,
        }),
      ).rejects.toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'At least one event is required for updating a webhook',
        ),
      );
    });

    it('should throw error when events array is empty', async () => {
      await expect(
        mockHandler({
          subcommand: 'update',
          projectId: 1,
          webhookId: 1,
          events: [],
        }),
      ).rejects.toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'At least one event is required for updating a webhook',
        ),
      );
    });

    it('should throw error when events are invalid for update', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });

      await expect(
        mockHandler({
          subcommand: 'update',
          projectId: 1,
          webhookId: 1,
          events: ['project.archived', 'webhook.invalid'],
        }),
      ).rejects.toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid webhook events: project.archived, webhook.invalid. Valid events are: ${mockEvents.join(', ')}`,
        ),
      );
    });

    it('should handle JSON parse errors when updating webhook', async () => {
      // Events fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });

      // Update webhook fails with invalid JSON
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(
        mockHandler({
          subcommand: 'update',
          projectId: 1,
          webhookId: 1,
          events: ['task.created'],
        }),
      ).rejects.toThrow(
        new MCPError(ErrorCode.API_ERROR, 'Failed to update webhook: Server Error'),
      );
    });

    it('should provide helpful error message for webhook authentication errors when updating', async () => {
      // Events fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });

      // Update webhook fails with 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          message: 'permission denied',
        }),
      });

      await expect(
        mockHandler({
          subcommand: 'update',
          projectId: 1,
          webhookId: 1,
          events: ['task.created'],
        }),
      ).rejects.toThrow(
        new MCPError(
          ErrorCode.API_ERROR,
          'Webhook operations require additional permissions. Please ensure your API token has webhook access rights.',
        ),
      );
    });
  });

  describe('Delete Webhook', () => {
    it('should delete a webhook', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await mockHandler({
        subcommand: 'delete',
        projectId: 1,
        webhookId: 1,
      });

      expect(mockFetch).toHaveBeenCalledWith('https://api.vikunja.test/projects/1/webhooks/1', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      });
      expect(result.content[0].text).toContain('"operation": "delete"');
      expect(result.content[0].text).toContain('Webhook 1 deleted successfully');
    });

    it('should handle JSON parse errors when deleting webhook', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(
        mockHandler({
          subcommand: 'delete',
          projectId: 1,
          webhookId: 1,
        }),
      ).rejects.toThrow(new MCPError(ErrorCode.API_ERROR, 'Failed to delete webhook: Forbidden'));
    });

    it('should handle delete errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: async () => ({ message: 'Webhook not found' }),
      });

      await expect(
        mockHandler({
          subcommand: 'delete',
          projectId: 1,
          webhookId: 999,
        }),
      ).rejects.toThrow(new MCPError(ErrorCode.API_ERROR, 'Webhook not found'));
    });

    it('should provide helpful error message for webhook authentication errors when deleting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          message: 'authentication required',
        }),
      });

      await expect(
        mockHandler({
          subcommand: 'delete',
          projectId: 1,
          webhookId: 1,
        }),
      ).rejects.toThrow(
        new MCPError(
          ErrorCode.API_ERROR,
          'Webhook operations require additional permissions. Please ensure your API token has webhook access rights.',
        ),
      );
    });
  });

  describe('List Events', () => {
    it('should list available webhook events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEvents,
      });

      const result = await mockHandler({ subcommand: 'list-events' });

      expect(mockFetch).toHaveBeenCalledWith('https://api.vikunja.test/webhooks/events', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      });
      expect(result.content[0].text).toContain('"operation": "list-events"');
      expect(result.content[0].text).toContain('"count": 8');
      expect(result.content[0].text).toContain('task.created');
      expect(result.content[0].text).toContain('project.updated');
    });

    it('should handle empty events list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await mockHandler({ subcommand: 'list-events' });

      expect(result.content[0].text).toContain('"events": []');
      expect(result.content[0].text).toContain('"count": 0');
    });

    it('should use default events when API fails and no cache available', async () => {
      // Clear any existing cache
      clearWebhookEventCache();

      // Make the events API fail
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await mockHandler({ subcommand: 'list-events' });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('list-events');
      expect(response.events).toContain('task.created');
      expect(response.events).toContain('project.created');
      expect(response.events.length).toBeGreaterThan(0);
    });

    it('should use default events when API returns 401/403/404', async () => {
      // Clear any existing cache
      clearWebhookEventCache();

      // Make the events API return 401
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await mockHandler({ subcommand: 'list-events' });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('list-events');
      expect(response.events).toContain('task.created');
      expect(response.events).toContain('project.created');
      expect(response.events).toContain('team.created');
    });

    it('should use default events when events API returns other errors', async () => {
      // Clear any existing cache
      clearWebhookEventCache();

      // Make the events API return 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await mockHandler({ subcommand: 'list-events' });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('list-events');
      expect(response.events).toContain('task.created');
      expect(response.events).toContain('project.created');
      expect(response.events.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown subcommand', async () => {
      await expect(mockHandler({ subcommand: 'unknown' })).rejects.toThrow(
        new MCPError(ErrorCode.VALIDATION_ERROR, 'Unknown subcommand: unknown'),
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockRejectedValue(new Error('API Error'));

      await expect(mockHandler({ subcommand: 'list', projectId: 1 })).rejects.toThrow(
        new MCPError(ErrorCode.API_ERROR, 'Webhook operation failed: API Error'),
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('String error');

      await expect(mockHandler({ subcommand: 'list', projectId: 1 })).rejects.toThrow(
        new MCPError(
          ErrorCode.INTERNAL_ERROR,
          'An unexpected error occurred during webhook operation',
        ),
      );
    });
  });

  describe('Tool Registration', () => {
    it('should register with correct schema', () => {
      expect(mockServer.tool).toHaveBeenCalledWith(
        'vikunja_webhooks',
        expect.any(String), // description
        expect.objectContaining({
          subcommand: expect.any(Object),
          projectId: expect.any(Object),
          webhookId: expect.any(Object),
          targetUrl: expect.any(Object),
          events: expect.any(Object),
          secret: expect.any(Object),
        }),
        expect.any(Function),
      );
    });
  });
});
