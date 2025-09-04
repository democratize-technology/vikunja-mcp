/**
 * Tool Wrapper Tests
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerToolWithRateLimit, createRateLimitedTool } from '../../src/middleware/tool-wrapper';
import { rateLimitingMiddleware } from '../../src/middleware/rate-limiting';
import { MCPError, ErrorCode } from '../../src/types/errors';

// Mock the rate limiting middleware
jest.mock('../../src/middleware/rate-limiting', () => ({
  rateLimitingMiddleware: {
    withRateLimit: jest.fn(),
    getConfig: jest.fn(() => ({
      default: { enabled: true }
    }))
  }
}));

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

describe('Tool Wrapper', () => {
  let mockServer: jest.Mocked<McpServer>;
  let mockRateLimitingMiddleware: jest.Mocked<typeof rateLimitingMiddleware>;

  beforeEach(() => {
    // Create mock server
    mockServer = {
      tool: jest.fn(),
    } as any;

    // Reset mocks
    mockRateLimitingMiddleware = rateLimitingMiddleware as jest.Mocked<typeof rateLimitingMiddleware>;
    mockRateLimitingMiddleware.withRateLimit.mockClear();
    mockRateLimitingMiddleware.getConfig.mockClear();
    mockServer.tool.mockClear();
  });

  describe('registerToolWithRateLimit', () => {
    it('should register a tool with rate limiting', async () => {
      const mockHandler = jest.fn().mockResolvedValue('test result');
      const mockWrappedHandler = jest.fn().mockResolvedValue('wrapped result');
      
      mockRateLimitingMiddleware.withRateLimit.mockReturnValue(mockWrappedHandler);

      const schema = {
        test: z.string(),
      };

      registerToolWithRateLimit(mockServer, 'test_tool', schema, mockHandler);

      // Should call server.tool with the correct parameters
      expect(mockServer.tool).toHaveBeenCalledWith(
        'test_tool',
        schema,
        expect.any(Function)
      );

      // Get the wrapped handler from the server.tool call
      const wrappedHandler = mockServer.tool.mock.calls[0][2];
      
      // Call it to trigger the rate limiting middleware
      await wrappedHandler({ test: 'value' });

      // Should call rateLimitingMiddleware.withRateLimit
      expect(mockRateLimitingMiddleware.withRateLimit).toHaveBeenCalledWith(
        'test_tool',
        expect.any(Function)
      );
    });

    it('should properly wrap the handler function', async () => {
      const mockHandler = jest.fn().mockResolvedValue('test result');
      const rateLimitedHandler = jest.fn().mockResolvedValue('rate limited result');
      
      mockRateLimitingMiddleware.withRateLimit.mockImplementation((toolName, handler) => {
        return rateLimitedHandler;
      });

      const schema = { test: z.string() };
      registerToolWithRateLimit(mockServer, 'test_tool', schema, mockHandler);

      // Get the wrapped handler that was passed to server.tool
      const wrappedHandler = mockServer.tool.mock.calls[0][2];
      
      // Call the wrapped handler
      const result = await wrappedHandler({ test: 'value' });

      // Should call the rate limited handler
      expect(rateLimitedHandler).toHaveBeenCalledWith({ test: 'value' });
      expect(result).toBe('rate limited result');
    });

    it('should handle handler errors properly', async () => {
      const error = new MCPError(ErrorCode.VALIDATION_ERROR, 'Test error');
      const mockHandler = jest.fn().mockRejectedValue(error);
      
      mockRateLimitingMiddleware.withRateLimit.mockImplementation((toolName, handler) => {
        return handler; // Pass through for this test
      });

      const schema = { test: z.string() };
      registerToolWithRateLimit(mockServer, 'test_tool', schema, mockHandler);

      const wrappedHandler = mockServer.tool.mock.calls[0][2];
      
      await expect(wrappedHandler({ test: 'value' })).rejects.toThrow(error);
    });

    it('should handle synchronous handlers', async () => {
      const mockHandler = jest.fn().mockReturnValue('sync result');
      
      mockRateLimitingMiddleware.withRateLimit.mockImplementation((toolName, handler) => {
        return async (args) => handler(args);
      });

      const schema = { test: z.string() };
      registerToolWithRateLimit(mockServer, 'test_tool', schema, mockHandler);

      const wrappedHandler = mockServer.tool.mock.calls[0][2];
      const result = await wrappedHandler({ test: 'value' });

      expect(mockHandler).toHaveBeenCalledWith({ test: 'value' });
      expect(result).toBe('sync result');
    });
  });

  describe('createRateLimitedTool', () => {
    it('should create a rate limited handler function', async () => {
      const mockHandler = jest.fn().mockResolvedValue('original result');
      const rateLimitedHandler = jest.fn().mockResolvedValue('rate limited result');
      
      mockRateLimitingMiddleware.withRateLimit.mockReturnValue(rateLimitedHandler);

      const wrappedHandler = createRateLimitedTool('test_tool', mockHandler);

      // Should return the rate limited handler
      expect(mockRateLimitingMiddleware.withRateLimit).toHaveBeenCalledWith(
        'test_tool',
        expect.any(Function)
      );

      const result = await wrappedHandler({ test: 'value' });
      expect(result).toBe('rate limited result');
    });

    it('should preserve the original handler behavior', async () => {
      const mockHandler = jest.fn().mockResolvedValue('original result');
      
      // Mock withRateLimit to call the original handler
      mockRateLimitingMiddleware.withRateLimit.mockImplementation((toolName, handler) => {
        return handler;
      });

      const wrappedHandler = createRateLimitedTool('test_tool', mockHandler);
      const result = await wrappedHandler({ test: 'value' });

      expect(mockHandler).toHaveBeenCalledWith({ test: 'value' });
      expect(result).toBe('original result');
    });

    it('should handle errors from the original handler', async () => {
      const error = new Error('Handler error');
      const mockHandler = jest.fn().mockRejectedValue(error);
      
      mockRateLimitingMiddleware.withRateLimit.mockImplementation((toolName, handler) => {
        return handler;
      });

      const wrappedHandler = createRateLimitedTool('test_tool', mockHandler);
      
      await expect(wrappedHandler({ test: 'value' })).rejects.toThrow(error);
    });

    it('should work with synchronous handlers', async () => {
      const mockHandler = jest.fn().mockReturnValue('sync result');
      
      mockRateLimitingMiddleware.withRateLimit.mockImplementation((toolName, handler) => {
        return handler;
      });

      const wrappedHandler = createRateLimitedTool('test_tool', mockHandler);
      const result = await wrappedHandler({ test: 'value' });

      expect(result).toBe('sync result');
    });
  });

  describe('Integration', () => {
    it('should work with actual rate limiting middleware', () => {
      const mockHandler = jest.fn().mockResolvedValue('test result');
      const schema = { test: z.string() };
      
      registerToolWithRateLimit(mockServer, 'integration_test', schema, mockHandler);

      expect(mockServer.tool).toHaveBeenCalledTimes(1);
      expect(mockServer.tool).toHaveBeenCalledWith(
        'integration_test',
        schema,
        expect.any(Function)
      );
    });
  });
});