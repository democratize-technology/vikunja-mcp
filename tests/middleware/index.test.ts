/**
 * Tests for middleware index exports
 * Simple test to achieve function coverage for export-only file
 */

import * as middleware from '../../src/middleware/index';
import * as rateLimit from '../../src/middleware/rate-limiting';
import * as toolWrapper from '../../src/middleware/tool-wrapper';
import * as permissionWrapper from '../../src/middleware/permission-wrapper';

describe('Middleware Index Exports', () => {
  it('should export rate limiting middleware components', () => {
    // Verify all exports are present
    expect(middleware.RateLimitingMiddleware).toBeDefined();
    expect(middleware.rateLimitingMiddleware).toBeDefined();
    expect(middleware.withRateLimit).toBeDefined();
    expect(middleware.TOOL_CATEGORIES).toBeDefined();
    expect(middleware.registerToolWithRateLimit).toBeDefined();
    expect(middleware.createRateLimitedTool).toBeDefined();

    // Verify types are exported
    expect(typeof middleware.RateLimitingMiddleware).toBe('function');
    expect(typeof middleware.rateLimitingMiddleware).toBe('object');
    expect(typeof middleware.withRateLimit).toBe('function');
    expect(typeof middleware.TOOL_CATEGORIES).toBe('object');
    expect(typeof middleware.registerToolWithRateLimit).toBe('function');
    expect(typeof middleware.createRateLimitedTool).toBe('function');
  });

  it('should export permission wrapper middleware components', () => {
    // Verify all permission exports are present
    expect(middleware.withPermissions).toBeDefined();
    expect(middleware.createPermissionTool).toBeDefined();
    expect(middleware.PermissionStatus).toBeDefined();

    // Verify types are exported
    expect(typeof middleware.withPermissions).toBe('function');
    expect(typeof middleware.createPermissionTool).toBe('function');
    expect(typeof middleware.PermissionStatus).toBe('function');
  });

  it('should have consistent export structure', () => {
    // Verify rate limiting re-exports match original exports
    expect(middleware.RateLimitingMiddleware).toBe(rateLimit.RateLimitingMiddleware);
    expect(middleware.rateLimitingMiddleware).toBe(rateLimit.rateLimitingMiddleware);
    expect(middleware.withRateLimit).toBe(rateLimit.withRateLimit);
    expect(middleware.TOOL_CATEGORIES).toBe(rateLimit.TOOL_CATEGORIES);
    expect(middleware.registerToolWithRateLimit).toBe(toolWrapper.registerToolWithRateLimit);
    expect(middleware.createRateLimitedTool).toBe(toolWrapper.createRateLimitedTool);

    // Verify permission re-exports match original exports
    expect(middleware.withPermissions).toBe(permissionWrapper.withPermissions);
    expect(middleware.createPermissionTool).toBe(permissionWrapper.createPermissionTool);
    expect(middleware.PermissionStatus).toBe(permissionWrapper.PermissionStatus);
  });
});