/**
 * Tests for authentication tool
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AuthManager } from '../../src/auth/AuthManager';
import { registerAuthTool } from '../../src/tools/auth';
import { MCPError, ErrorCode } from '../../src/types';
import type { MockServer, MockAuthManager } from '../types/mocks';

// Mock the cleanupVikunjaClient function
jest.mock('../../src/client', () => ({
  cleanupVikunjaClient: jest.fn(),
}));

describe('Auth Tool', () => {
  let mockServer: MockServer;
  let mockAuthManager: MockAuthManager;
  let toolHandler: (args: any) => any;

  beforeEach(() => {
    // Create mock server that captures the tool registration
    mockServer = {
      tool: jest.fn() as jest.MockedFunction<(name: string, schema: any, handler: any) => void>,
    } as MockServer;

    // Create mock auth manager
    mockAuthManager = {
      connect: jest.fn(),
      getStatus: jest.fn(),
      isConnected: jest.fn(),
      getSession: jest.fn(),
      disconnect: jest.fn(),
      isAuthenticated: jest.fn(),
      setSession: jest.fn(),
      clearSession: jest.fn(),
      getAuthType: jest.fn(),
    } as MockAuthManager;

    // Register the tool
    registerAuthTool(mockServer, mockAuthManager);

    // Capture the tool handler
    expect(mockServer.tool).toHaveBeenCalledWith(
      'vikunja_auth',
      expect.any(Object),
      expect.any(Function),
    );
    toolHandler = mockServer.tool.mock.calls[0][2];
  });

  describe('connect subcommand', () => {
    it('should connect with valid credentials', () => {
      const args = {
        subcommand: 'connect',
        apiUrl: 'https://vikunja.example.com',
        apiToken: 'tk_test-token-123',
      };

      // Mock getStatus to return not authenticated
      mockAuthManager.getStatus.mockReturnValue({ authenticated: false });

      // Mock authManager.getAuthType to return api-token
      mockAuthManager.getAuthType = jest.fn().mockReturnValue('api-token');

      const result = toolHandler(args);

      expect(mockAuthManager.connect).toHaveBeenCalledWith(
        'https://vikunja.example.com',
        'tk_test-token-123',
      );
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'auth-connect',
        message: 'Successfully connected to Vikunja',
        data: {
          authenticated: true,
        },
        metadata: {
          timestamp: expect.any(String),
          apiUrl: 'https://vikunja.example.com',
          authType: 'api-token',
        },
      });
    });

    it('should return already connected message when authenticating to same URL', () => {
      const args = {
        subcommand: 'connect',
        apiUrl: 'https://vikunja.example.com',
        apiToken: 'tk_test-token-123',
      };

      // Mock getStatus to return authenticated
      mockAuthManager.getStatus.mockReturnValue({
        authenticated: true,
        apiUrl: 'https://vikunja.example.com',
      });

      const result = toolHandler(args);

      expect(mockAuthManager.connect).not.toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'auth-connect',
        message: 'Already connected to Vikunja',
        data: {
          authenticated: true,
        },
        metadata: {
          timestamp: expect.any(String),
          apiUrl: 'https://vikunja.example.com',
        },
      });
    });

    it('should throw error when apiUrl is missing', () => {
      const args = {
        subcommand: 'connect',
        apiToken: 'tk_test-token-123',
      };

      expect(() => toolHandler(args)).toThrow(MCPError);
      expect(() => toolHandler(args)).toThrow('apiUrl and apiToken are required for connect');
    });

    it('should throw error when apiToken is missing', () => {
      const args = {
        subcommand: 'connect',
        apiUrl: 'https://vikunja.example.com',
      };

      expect(() => toolHandler(args)).toThrow(MCPError);
      expect(() => toolHandler(args)).toThrow('apiUrl and apiToken are required for connect');
    });

    it('should handle connection errors', () => {
      const args = {
        subcommand: 'connect',
        apiUrl: 'https://vikunja.example.com',
        apiToken: 'tk_test-token-123',
      };

      // Mock getStatus to return not authenticated
      mockAuthManager.getStatus.mockReturnValue({ authenticated: false });

      const connectionError = new Error('Network error');
      mockAuthManager.connect.mockImplementation(() => {
        throw connectionError;
      });

      expect(() => toolHandler(args)).toThrow(MCPError);
      expect(() => toolHandler(args)).toThrow('Authentication error: Network error');
    });

    it('should auto-detect and connect with JWT token', () => {
      const args = {
        subcommand: 'connect',
        apiUrl: 'https://vikunja.example.com',
        apiToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      };

      // Mock getStatus to return not authenticated
      mockAuthManager.getStatus.mockReturnValue({ authenticated: false });

      // Mock authManager.getAuthType to return jwt
      mockAuthManager.getAuthType = jest.fn().mockReturnValue('jwt');

      const result = toolHandler(args);

      expect(mockAuthManager.connect).toHaveBeenCalledWith(
        'https://vikunja.example.com',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      );
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'auth-connect',
        message: 'Successfully connected to Vikunja',
        data: {
          authenticated: true,
        },
        metadata: {
          timestamp: expect.any(String),
          apiUrl: 'https://vikunja.example.com',
          authType: 'jwt',
        },
      });
    });

    it('should auto-detect and connect with API token', () => {
      const args = {
        subcommand: 'connect',
        apiUrl: 'https://vikunja.example.com',
        apiToken: 'tk_test-token-123',
      };

      // Mock getStatus to return not authenticated
      mockAuthManager.getStatus.mockReturnValue({ authenticated: false });

      // Mock authManager.getAuthType to return api-token
      mockAuthManager.getAuthType = jest.fn().mockReturnValue('api-token');

      const result = toolHandler(args);

      expect(mockAuthManager.connect).toHaveBeenCalledWith(
        'https://vikunja.example.com',
        'tk_test-token-123',
      );
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'auth-connect',
        message: 'Successfully connected to Vikunja',
        data: {
          authenticated: true,
        },
        metadata: {
          timestamp: expect.any(String),
          apiUrl: 'https://vikunja.example.com',
          authType: 'api-token',
        },
      });
    });

    it('should correctly identify authType in metadata', () => {
      // Test with API token
      const apiTokenArgs = {
        subcommand: 'connect',
        apiUrl: 'https://vikunja.example.com',
        apiToken: 'tk_test-token-123',
      };

      mockAuthManager.getStatus.mockReturnValue({ authenticated: false });
      mockAuthManager.getAuthType = jest.fn().mockReturnValue('api-token');

      let result = toolHandler(apiTokenArgs);
      let response = JSON.parse(result.content[0].text);
      expect(response.metadata.authType).toBe('api-token');

      // Test with JWT token
      const jwtArgs = {
        subcommand: 'connect',
        apiUrl: 'https://vikunja.example.com',
        apiToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
      };

      mockAuthManager.getAuthType = jest.fn().mockReturnValue('jwt');

      result = toolHandler(jwtArgs);
      response = JSON.parse(result.content[0].text);
      expect(response.metadata.authType).toBe('jwt');
    });
  });

  describe('status subcommand', () => {
    it('should return authenticated status', () => {
      const mockStatus = {
        authenticated: true,
        apiUrl: 'https://vikunja.example.com',
      };
      mockAuthManager.getStatus.mockReturnValue(mockStatus);

      const args = { subcommand: 'status' };
      const result = toolHandler(args);

      expect(mockAuthManager.getStatus).toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'auth-status',
        message: 'Authentication status retrieved',
        data: mockStatus,
        metadata: {
          timestamp: expect.any(String),
          apiUrl: 'https://vikunja.example.com',
        },
      });
    });

    it('should return not authenticated status', () => {
      const mockStatus = {
        authenticated: false,
      };
      mockAuthManager.getStatus.mockReturnValue(mockStatus);

      const args = { subcommand: 'status' };
      const result = toolHandler(args);

      expect(mockAuthManager.getStatus).toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'auth-status',
        message: 'Not authenticated',
        data: mockStatus,
        metadata: {
          timestamp: expect.any(String),
        },
      });
    });
  });

  describe('refresh subcommand', () => {
    it('should return message that refresh is not required', () => {
      const args = { subcommand: 'refresh' };
      const result = toolHandler(args);

      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'auth-refresh',
        message: 'Token refresh not required - tokens do not expire',
        data: {
          refreshed: false,
        },
        metadata: {
          timestamp: expect.any(String),
          reason: expect.any(String),
        },
      });
    });
  });

  describe('disconnect subcommand', () => {
    it('should disconnect and cleanup client', () => {
      const { cleanupVikunjaClient } = require('../../src/client');
      const args = { subcommand: 'disconnect' };
      const result = toolHandler(args);

      expect(mockAuthManager.disconnect).toHaveBeenCalled();
      expect(cleanupVikunjaClient).toHaveBeenCalled();
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response).toMatchObject({
        success: true,
        operation: 'auth-disconnect',
        message: 'Successfully disconnected from Vikunja',
        data: {
          authenticated: false,
        },
        metadata: {
          timestamp: expect.any(String),
          previouslyConnected: true,
        },
      });
    });
  });

  describe('error handling', () => {
    it('should throw error for unknown subcommand', () => {
      const args = { subcommand: 'unknown' as any };

      expect(() => toolHandler(args)).toThrow(MCPError);
      expect(() => toolHandler(args)).toThrow('Unknown subcommand: unknown');
    });

    it('should rethrow MCPError instances', () => {
      const mcpError = new MCPError(ErrorCode.AUTH_ERROR, 'Custom auth error');
      mockAuthManager.getStatus.mockImplementation(() => {
        throw mcpError;
      });

      const args = { subcommand: 'status' };

      expect(() => toolHandler(args)).toThrow(mcpError);
      expect(() => toolHandler(args)).toThrow('Custom auth error');
    });

    it('should wrap non-Error objects as internal errors', () => {
      mockAuthManager.getStatus.mockImplementation(() => {
        throw 'string error';
      });

      const args = { subcommand: 'status' };

      expect(() => toolHandler(args)).toThrow(MCPError);
      expect(() => toolHandler(args)).toThrow('Authentication error: string error');
    });
  });
});
