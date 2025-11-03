/**
 * Middleware Exports
 * Simplified middleware exports without wrapper-on-wrapper patterns
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
  applyRateLimiting,
  applyPermissions,
  applyBothMiddleware,
} from './direct-middleware';