/**
 * Direct Middleware Application
 * Simplified middleware functions without wrapper-on-wrapper patterns
 */

import type { AuthManager } from '../auth/AuthManager';
import { PermissionManager } from '../auth/permissions';
import { MCPError, ErrorCode } from '../types/errors';
import { logger } from '../utils/logger';
import { withRateLimit } from './simplified-rate-limit';

// Direct rate limiting application
export function applyRateLimiting<T extends unknown[], R>(
  toolName: string,
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return withRateLimit(toolName, handler);
}

// Direct permission checking application
export function applyPermissions<T extends unknown[], R>(
  toolName: string,
  authManager: AuthManager,
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    // Get current session (null if not authenticated)
    const session = authManager.isAuthenticated() ? authManager.getSession() : null;

    // Check permissions
    const permissionResult = PermissionManager.checkToolPermission(session, toolName);

    if (!permissionResult.hasPermission) {
      logger.debug(`Permission denied for tool ${toolName}:`, {
        authType: session?.authType,
        missingPermissions: permissionResult.missingPermissions,
        suggestedAuthType: permissionResult.suggestedAuthType,
      });

      // Use appropriate error code based on the issue
      const errorCode = session
        ? ErrorCode.PERMISSION_DENIED
        : ErrorCode.AUTH_REQUIRED;

      throw new MCPError(errorCode, permissionResult.errorMessage || 'Permission denied');
    }

    // Permission granted - execute the tool
    logger.debug(`Permission granted for tool ${toolName}`, {
      authType: session?.authType,
    });

    return handler(...args);
  };
}

// Combined middleware application for tools that need both
export function applyBothMiddleware<T extends unknown[], R>(
  toolName: string,
  authManager: AuthManager,
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  const withPermissions = applyPermissions(toolName, authManager, handler);
  return applyRateLimiting(toolName, withPermissions);
}