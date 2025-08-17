/**
 * Tool Wrapper for Rate Limiting Integration
 * Provides a wrapper around MCP tool registration to apply rate limiting middleware
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import { rateLimitingMiddleware } from './rate-limiting';
import { logger } from '../utils/logger';

/**
 * Tool handler function type matching MCP SDK expectations
 */
type ToolHandler<T> = (args: T) => Promise<{
  content: Array<{ type: 'text'; text: string; [x: string]: unknown }>;
  _meta?: { [x: string]: unknown };
  structuredContent?: { [x: string]: unknown };
  isError?: boolean;
  [x: string]: unknown;
}>;

/**
 * Wrapper function to register tools with rate limiting
 * This replaces the direct server.tool() calls with rate-limited versions
 */
export function registerToolWithRateLimit<T>(
  server: McpServer,
  toolName: string,
  schema: Record<string, z.ZodType>,
  handler: ToolHandler<T>
): void {
  // Wrap the handler with rate limiting
  const wrappedHandler = async (args: T): Promise<{
    content: Array<{ type: 'text'; text: string; [x: string]: unknown }>;
    _meta?: { [x: string]: unknown };
    structuredContent?: { [x: string]: unknown };
    isError?: boolean;
    [x: string]: unknown;
  }> => {
    // Apply rate limiting middleware
    const rateLimitedHandler = rateLimitingMiddleware.withRateLimit(
      toolName,
      async (toolArgs: T) => {
        return await handler(toolArgs);
      }
    );

    return await rateLimitedHandler(args);
  };

  // Register the tool with the wrapped handler
  server.tool(toolName, schema, async (args: { [x: string]: unknown }) => {
    const result = await wrappedHandler(args as T);
    return result;
  });

  logger.debug('Tool registered with rate limiting', { 
    toolName,
    rateLimitsEnabled: rateLimitingMiddleware.getConfig().default.enabled,
  });
}

/**
 * Convenience function for backward compatibility
 * This allows gradual migration of existing tool registrations
 */
export function createRateLimitedTool<T>(
  toolName: string,
  handler: ToolHandler<T>
): ToolHandler<T> {
  return rateLimitingMiddleware.withRateLimit(toolName, async (args: T) => {
    return await handler(args);
  });
}