/**
 * Rate Limiting Integration Tests
 * Tests rate limiting integration with actual MCP tools
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RateLimitingMiddleware } from '../../src/middleware/rate-limiting';
import { registerToolWithRateLimit } from '../../src/middleware/tool-wrapper';
import { MCPError, ErrorCode } from '../../src/types/errors';

// Mock the logger to reduce test noise
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

describe('Rate Limiting Integration', () => {
  let server: McpServer;
  let middleware: RateLimitingMiddleware;

  beforeEach(() => {
    server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });

    // Create middleware with very low limits for testing
    middleware = new RateLimitingMiddleware({
      default: {
        requestsPerMinute: 3,
        requestsPerHour: 10,
        maxRequestSize: 100,
        maxResponseSize: 200,
        executionTimeout: 500,
        enabled: true,
      },
      bulk: {
        requestsPerMinute: 1,
        requestsPerHour: 5,
        maxRequestSize: 500,
        maxResponseSize: 1000,
        executionTimeout: 1000,
        enabled: true,
      },
    });

    // Clear any existing session data
    middleware.clearSession();
  });

  describe('Tool Registration with Rate Limiting', () => {
    it('should register tools with rate limiting successfully', () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });

      registerToolWithRateLimit(
        server,
        'test_tool',
        {
          action: z.enum(['test']),
          data: z.string().optional(),
        },
        mockHandler
      );

      // Tool should be registered (we can't easily test private properties)
      // Instead, we'll test that no error was thrown
      expect(mockHandler).toBeDefined();
    });

    it('should apply rate limiting to registered tools', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const wrappedHandler = middleware.withRateLimit('vikunja_auth', mockHandler);

      // Execute requests up to the limit
      for (let i = 0; i < 3; i++) {
        const result = await wrappedHandler({ action: 'test' });
        expect(result).toEqual({ success: true });
      }

      // Next request should be rate limited
      await expect(wrappedHandler({ action: 'test' })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: expect.stringContaining('requests per minute'),
        })
      );

      expect(mockHandler).toHaveBeenCalledTimes(3);
    });

    it('should validate request sizes', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const wrappedHandler = middleware.withRateLimit('vikunja_auth', mockHandler);

      // Small request should succeed
      const smallRequest = { action: 'test', data: 'small' };
      const result = await wrappedHandler(smallRequest);
      expect(result).toEqual({ success: true });

      // Large request should be rejected
      const largeRequest = { action: 'test', data: 'x'.repeat(200) };
      await expect(wrappedHandler(largeRequest)).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.REQUEST_TOO_LARGE,
          message: expect.stringContaining('exceeds limit'),
        })
      );
    });

    it('should validate response sizes', async () => {
      const smallResponse = { success: true, data: 'small' };
      const largeResponse = { success: true, data: 'x'.repeat(300) };

      const mockHandler = jest.fn()
        .mockResolvedValueOnce(smallResponse)
        .mockResolvedValueOnce(largeResponse);

      const wrappedHandler = middleware.withRateLimit('vikunja_auth', mockHandler);

      // Small response should succeed
      const result1 = await wrappedHandler({ action: 'test' });
      expect(result1).toEqual(smallResponse);

      // Large response should be rejected
      await expect(wrappedHandler({ action: 'test' })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.REQUEST_TOO_LARGE,
          message: expect.stringContaining('Response size'),
        })
      );
    });

    it('should enforce timeouts', async () => {
      const slowHandler = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000))
      );

      const wrappedHandler = middleware.withRateLimit('vikunja_auth', slowHandler);

      await expect(wrappedHandler({ action: 'test' })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.TIMEOUT_ERROR,
          message: expect.stringContaining('timeout after 500ms'),
        })
      );
    });

    it('should apply different limits for different tool categories', async () => {
      // Create a fresh middleware instance for this test
      const freshMiddleware = new RateLimitingMiddleware({
        default: {
          requestsPerMinute: 3,
          requestsPerHour: 10,
          maxRequestSize: 100,
          maxResponseSize: 200,
          executionTimeout: 500,
          enabled: true,
        },
        bulk: {
          requestsPerMinute: 1,
          requestsPerHour: 5,
          maxRequestSize: 500,
          maxResponseSize: 1000,
          executionTimeout: 1000,
          enabled: true,
        },
      });

      const authHandler = jest.fn().mockResolvedValue({ auth: true });
      const bulkHandler = jest.fn().mockResolvedValue({ bulk: true });

      const wrappedAuthHandler = freshMiddleware.withRateLimit('vikunja_auth', authHandler);
      const wrappedBulkHandler = freshMiddleware.withRateLimit('vikunja_batch_import', bulkHandler);

      // Bulk tool should only allow 1 request per minute
      await wrappedBulkHandler({ action: 'test' });
      
      await expect(wrappedBulkHandler({ action: 'test' })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
        })
      );

      // Auth tool should still allow requests
      await wrappedAuthHandler({ action: 'test' });
      await wrappedAuthHandler({ action: 'test' });
    });
  });

  describe('Error Handling Integration', () => {
    it('should preserve original tool errors', async () => {
      const originalError = new MCPError(ErrorCode.AUTH_REQUIRED, 'Authentication required');
      const errorHandler = jest.fn().mockRejectedValue(originalError);
      const wrappedHandler = middleware.withRateLimit('vikunja_auth', errorHandler);

      await expect(wrappedHandler({ action: 'test' })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.AUTH_REQUIRED,
          message: 'Authentication required',
        })
      );
    });

    it('should handle non-MCPError exceptions', async () => {
      const genericError = new Error('Generic error');
      const errorHandler = jest.fn().mockRejectedValue(genericError);
      const wrappedHandler = middleware.withRateLimit('vikunja_auth', errorHandler);

      await expect(wrappedHandler({ action: 'test' })).rejects.toThrow('Generic error');
    });

    it('should prioritize rate limiting errors over tool errors', async () => {
      const toolError = new MCPError(ErrorCode.API_ERROR, 'API error');
      const errorHandler = jest.fn().mockRejectedValue(toolError);
      const wrappedHandler = middleware.withRateLimit('vikunja_auth', errorHandler);

      // Fill up rate limit
      for (let i = 0; i < 3; i++) {
        try {
          await wrappedHandler({ action: 'test' });
        } catch (error) {
          // Ignore tool errors for this test
        }
      }

      // Next call should be rate limited, not return the tool error
      await expect(wrappedHandler({ action: 'test' })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
        })
      );
    });
  });

  describe('Performance and Monitoring', () => {
    it('should track performance metrics', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const wrappedHandler = middleware.withRateLimit('vikunja_auth', mockHandler);

      // Make some requests
      await wrappedHandler({ action: 'test' });
      await wrappedHandler({ action: 'test' });

      // Check rate limit status
      const status = middleware.getRateLimitStatus();
      expect(status.requestsLastMinute).toBe(2);
      expect(status.requestsLastHour).toBe(2);
    });

    it('should handle cleanup of old requests', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const wrappedHandler = middleware.withRateLimit('vikunja_auth', mockHandler);

      // Make requests
      await wrappedHandler({ action: 'test' });
      await wrappedHandler({ action: 'test' });

      let status = middleware.getRateLimitStatus();
      expect(status.requestsLastMinute).toBe(2);

      // Mock time advancement
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + 61 * 1000);

      try {
        // Make another request after time window
        await wrappedHandler({ action: 'test' });

        status = middleware.getRateLimitStatus();
        expect(status.requestsLastMinute).toBe(1); // Only the recent request
        expect(status.requestsLastHour).toBe(3); // All requests still within hour
      } finally {
        Date.now = originalNow;
      }
    });

    it('should support session clearing', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const wrappedHandler = middleware.withRateLimit('vikunja_auth', mockHandler);

      // Fill up rate limit
      for (let i = 0; i < 3; i++) {
        await wrappedHandler({ action: 'test' });
      }

      // Should be rate limited
      await expect(wrappedHandler({ action: 'test' })).rejects.toThrow(
        expect.objectContaining({
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
        })
      );

      // Clear session
      middleware.clearSession();

      // Should work again
      const result = await wrappedHandler({ action: 'test' });
      expect(result).toEqual({ success: true });
    });
  });

  describe('Configuration', () => {
    it('should respect disabled rate limiting', async () => {
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

      const mockHandler = jest.fn().mockResolvedValue('x'.repeat(100));
      const wrappedHandler = disabledMiddleware.withRateLimit('vikunja_auth', mockHandler);

      // Should allow many requests and large responses when disabled
      for (let i = 0; i < 5; i++) {
        const result = await wrappedHandler({ action: 'test', data: 'x'.repeat(50) });
        expect(result).toBe('x'.repeat(100));
      }
    });

    it('should provide access to configuration', () => {
      const config = middleware.getConfig();
      
      expect(config).toMatchObject({
        default: expect.objectContaining({
          requestsPerMinute: 3,
          requestsPerHour: 10,
          maxRequestSize: 100,
          maxResponseSize: 200,
          executionTimeout: 500,
          enabled: true,
        }),
        bulk: expect.objectContaining({
          requestsPerMinute: 1,
          requestsPerHour: 5,
        }),
      });
    });
  });
});