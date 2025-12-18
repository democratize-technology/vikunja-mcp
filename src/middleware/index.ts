/**
 * Middleware Exports
 * Simplified middleware exports without wrapper-on-wrapper patterns
 */

export {
  SimplifiedRateLimitMiddleware,
  simplifiedRateLimitMiddleware,
  withRateLimit,
  TOOL_CATEGORIES,
  type RateLimitConfig,
  type ToolRateLimits,
} from './simplified-rate-limit';

// Backward compatibility exports
export {
  rateLimitingMiddleware,
  RateLimitingMiddleware,
} from './simplified-rate-limit';

export {
  applyRateLimiting,
  applyPermissions,
  applyBothMiddleware,
} from './direct-middleware';