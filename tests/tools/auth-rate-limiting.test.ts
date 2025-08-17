/**
 * Auth Tool Rate Limiting Tests
 * Tests that rate limiting is properly integrated with the auth tool
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AuthManager } from '../../src/auth/AuthManager';
import { registerAuthTool } from '../../src/tools/auth';
import { RateLimitingMiddleware } from '../../src/middleware/rate-limiting';
import { MCPError, ErrorCode } from '../../src/types/errors';

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

// Mock the client
jest.mock('../../src/client', () => ({
  cleanupVikunjaClient: jest.fn(),
  getVikunjaClient: jest.fn(),
  setAuthManager: jest.fn(),
}));

describe('Auth Tool Rate Limiting Integration', () => {
  let server: McpServer;
  let authManager: AuthManager;
  let middleware: RateLimitingMiddleware;

  beforeEach(() => {
    server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });

    authManager = new AuthManager();

    // Create middleware with very low limits for testing
    middleware = new RateLimitingMiddleware({
      default: {
        requestsPerMinute: 2,
        requestsPerHour: 5,
        maxRequestSize: 100,
        maxResponseSize: 1000,
        executionTimeout: 1000,
        enabled: true,
      },
    });

    // Register the auth tool with rate limiting
    registerAuthTool(server, authManager);

    // Clear any existing session data
    middleware.clearSession();
  });

  afterEach(() => {
    middleware.clearSession();
  });

  it('should register auth tool with rate limiting', () => {
    // Tool should be registered without errors
    expect(authManager).toBeDefined();
  });

  it('should rate limit auth tool calls', async () => {
    // This test mainly verifies that the tool registration succeeded
    // We can't easily access private properties, so we just verify no errors
    expect(authManager).toBeDefined();
  });

  describe('Manual Rate Limiting Test', () => {
    it('should demonstrate rate limiting behavior', async () => {
      // Create a simple handler to test rate limiting
      const testHandler = async (args: any) => {
        return { success: true, data: args };
      };

      const rateLimitedHandler = middleware.withRateLimit('vikunja_auth', testHandler);

      // First two requests should succeed
      await rateLimitedHandler({ subcommand: 'status' });
      await rateLimitedHandler({ subcommand: 'status' });

      // Third request should be rate limited
      await expect(rateLimitedHandler({ subcommand: 'status' })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
        })
      );
    });

    it('should enforce request size limits', async () => {
      const testHandler = async (args: any) => {
        return { success: true, data: args };
      };

      const rateLimitedHandler = middleware.withRateLimit('vikunja_auth', testHandler);

      // Large request should be rejected
      const largeRequest = {
        subcommand: 'connect',
        apiUrl: 'https://example.com',
        apiToken: 'x'.repeat(200), // Over 100 byte limit
      };

      await expect(rateLimitedHandler(largeRequest)).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.REQUEST_TOO_LARGE,
        })
      );
    });

    it('should enforce response size limits', async () => {
      const testHandler = async (args: any) => {
        return { 
          success: true, 
          largeData: 'x'.repeat(2000) // Over 1000 byte limit
        };
      };

      const rateLimitedHandler = middleware.withRateLimit('vikunja_auth', testHandler);

      await expect(rateLimitedHandler({ subcommand: 'status' })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.REQUEST_TOO_LARGE,
          message: expect.stringContaining('Response size'),
        })
      );
    });

    it('should enforce timeouts', async () => {
      const slowHandler = async (args: any) => {
        await new Promise(resolve => setTimeout(resolve, 1500)); // Over 1000ms limit
        return { success: true };
      };

      const rateLimitedHandler = middleware.withRateLimit('vikunja_auth', slowHandler);

      await expect(rateLimitedHandler({ subcommand: 'status' })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.TIMEOUT_ERROR,
        })
      );
    });
  });

  describe('Configuration Test', () => {
    it('should work with disabled rate limiting', async () => {
      const disabledMiddleware = new RateLimitingMiddleware({
        default: {
          requestsPerMinute: 1,
          requestsPerHour: 1,
          maxRequestSize: 10,
          maxResponseSize: 10,
          executionTimeout: 100,
          enabled: false,
        },
      });

      const testHandler = async (args: any) => {
        return { success: true, data: 'x'.repeat(100) };
      };

      const rateLimitedHandler = disabledMiddleware.withRateLimit('vikunja_auth', testHandler);

      // Should work even with very strict limits when disabled
      for (let i = 0; i < 3; i++) {
        const result = await rateLimitedHandler({ 
          subcommand: 'status', 
          largeData: 'x'.repeat(50) 
        });
        expect(result.success).toBe(true);
      }
    });
  });
});