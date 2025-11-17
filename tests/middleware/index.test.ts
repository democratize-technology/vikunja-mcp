/**
 * Tests for simplified middleware index exports
 * Simple test to achieve function coverage for export-only file
 */

import * as middleware from '../../src/middleware/index';
import * as rateLimit from '../../src/middleware/simplified-rate-limit';
import * as directMiddleware from '../../src/middleware/direct-middleware';

describe('Middleware Index Exports', () => {
  it('should export rate limiting middleware components', () => {
    // Verify all exports are present
    expect(middleware.SimplifiedRateLimitMiddleware).toBeDefined();
    expect(middleware.simplifiedRateLimitMiddleware).toBeDefined();
    expect(middleware.withRateLimit).toBeDefined();
    expect(middleware.TOOL_CATEGORIES).toBeDefined();

    // Verify types are exported
    expect(typeof middleware.SimplifiedRateLimitMiddleware).toBe('function');
    expect(typeof middleware.simplifiedRateLimitMiddleware).toBe('object');
    expect(typeof middleware.withRateLimit).toBe('function');
    expect(typeof middleware.TOOL_CATEGORIES).toBe('object');
  });

  it('should export direct middleware components', () => {
    // Verify all direct middleware exports are present
    expect(middleware.applyRateLimiting).toBeDefined();
    expect(middleware.applyPermissions).toBeDefined();
    expect(middleware.applyBothMiddleware).toBeDefined();

    // Verify types are exported
    expect(typeof middleware.applyRateLimiting).toBe('function');
    expect(typeof middleware.applyPermissions).toBe('function');
    expect(typeof middleware.applyBothMiddleware).toBe('function');
  });

  it('should have consistent export structure', () => {
    // Verify rate limiting re-exports match original exports
    expect(middleware.SimplifiedRateLimitMiddleware).toBe(rateLimit.SimplifiedRateLimitMiddleware);
    expect(middleware.simplifiedRateLimitMiddleware).toBe(rateLimit.simplifiedRateLimitMiddleware);
    expect(middleware.withRateLimit).toBe(rateLimit.withRateLimit);
    expect(middleware.TOOL_CATEGORIES).toBe(rateLimit.TOOL_CATEGORIES);

    // Verify direct middleware re-exports match original exports
    expect(middleware.applyRateLimiting).toBe(directMiddleware.applyRateLimiting);
    expect(middleware.applyPermissions).toBe(directMiddleware.applyPermissions);
    expect(middleware.applyBothMiddleware).toBe(directMiddleware.applyBothMiddleware);
  });
});