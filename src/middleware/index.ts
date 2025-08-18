/**
 * Middleware Exports
 * Centralized exports for all middleware components
 */

export {
  RateLimitingMiddleware,
  rateLimitingMiddleware,
  withRateLimit,
  TOOL_CATEGORIES,
  type RateLimitConfig,
  type ToolRateLimits,
} from './rate-limiting';

export {
  registerToolWithRateLimit,
  createRateLimitedTool,
} from './tool-wrapper';

export {
  withPermissions,
  createPermissionTool,
  PermissionStatus,
} from './permission-wrapper';