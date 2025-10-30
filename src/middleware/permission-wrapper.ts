/**
 * Permission Wrapper Middleware
 * Provides consistent permission checking and error handling for all tools
 */

import type { AuthManager } from '../auth/AuthManager';
import { PermissionManager } from '../auth/permissions';
import { MCPError, ErrorCode } from '../types/index';
import { logger } from '../utils/logger';

/**
 * Tool handler function type
 */
type ToolHandler<TArgs = any, TResult = any> = (args: TArgs) => Promise<TResult>;

/**
 * Wraps a tool handler with permission checking
 */
export function withPermissions<TArgs = any, TResult = any>(
  toolName: string,
  authManager: AuthManager,
  handler: ToolHandler<TArgs, TResult>
): ToolHandler<TArgs, TResult> {
  return async (args: TArgs): Promise<TResult> => {
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

    return handler(args);
  };
}

/**
 * Creates a complete tool definition with permission checking
 */
export function createPermissionTool<TArgs = any, TResult = any>(
  toolName: string,
  schema: any,
  authManager: AuthManager,
  handler: ToolHandler<TArgs, TResult>
): any {
  return {
    name: toolName,
    description: schema.description,
    inputSchema: schema.inputSchema || {
      type: 'object',
      properties: {},
    },
    // Wrap the handler with permission checking
    handler: withPermissions(toolName, authManager, handler),
  };
}

/**
 * Permission status utility for debugging and monitoring
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PermissionStatus {
  /**
   * Get permission status for all tools
   */
  static getAllToolPermissions(authManager: AuthManager): Record<string, {
    hasAccess: boolean;
    authType?: string;
    missingPermissions?: string[];
    suggestedAuthType?: string;
  }> {
    const session = authManager.isAuthenticated() ? authManager.getSession() : null;
    const allTools = [
      'vikunja_auth',
      'vikunja_tasks', 
      'vikunja_projects',
      'vikunja_labels',
      'vikunja_teams',
      'vikunja_filters',
      'vikunja_templates',
      'vikunja_webhooks',
      'vikunja_batch_import',
      'vikunja_users',
      'vikunja_export_project',
      'vikunja_request_user_export',
      'vikunja_download_user_export',
    ];

    const status: Record<string, any> = {};

    for (const toolName of allTools) {
      const result = PermissionManager.checkToolPermission(session, toolName);
      status[toolName] = {
        hasAccess: result.hasPermission,
        authType: session?.authType,
        missingPermissions: result.missingPermissions,
        suggestedAuthType: result.suggestedAuthType,
      };
    }

    return status;
  }

  /**
   * Get summary of current access level
   */
  static getAccessSummary(authManager: AuthManager): {
    authenticated: boolean;
    authType?: string;
    availableTools: string[];
    restrictedTools: string[];
    upgradeMessage?: string;
  } {
    const allPermissions = this.getAllToolPermissions(authManager);
    const availableTools = Object.keys(allPermissions).filter(
      tool => allPermissions[tool]?.hasAccess
    );
    const restrictedTools = Object.keys(allPermissions).filter(
      tool => !allPermissions[tool]?.hasAccess
    );

    const session = authManager.isAuthenticated() ? authManager.getSession() : null;

    let upgradeMessage: string | undefined;
    if (session?.authType === 'api-token' && restrictedTools.length > 0) {
      upgradeMessage = 'Reconnect with JWT authentication to access user management and export features.';
    }

    const result: {
      authenticated: boolean;
      authType?: string;
      availableTools: string[];
      restrictedTools: string[];
      upgradeMessage?: string;
    } = {
      authenticated: authManager.isAuthenticated(),
      availableTools,
      restrictedTools,
    };

    if (session?.authType !== undefined) {
      result.authType = session.authType;
    }

    if (upgradeMessage !== undefined) {
      result.upgradeMessage = upgradeMessage;
    }

    return result;
  }
}