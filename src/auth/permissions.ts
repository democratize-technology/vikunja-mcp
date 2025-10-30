/**
 * Permission System for Tool Access Control
 * Centralizes authentication requirements and eliminates conditional tool registration
 */

import type { AuthSession } from '../types/index';

/**
 * Permissions required for different tool operations
 */
export enum Permission {
  // Basic permissions available with both auth types
  BASIC_AUTH = 'basic_auth',          // Basic authentication required
  TASK_MANAGEMENT = 'task_management', // Task CRUD operations
  PROJECT_MANAGEMENT = 'project_management', // Project CRUD operations
  LABEL_MANAGEMENT = 'label_management', // Label CRUD operations
  TEAM_MANAGEMENT = 'team_management', // Team CRUD operations
  FILTER_MANAGEMENT = 'filter_management', // Filter operations
  TEMPLATE_MANAGEMENT = 'template_management', // Template operations
  WEBHOOK_MANAGEMENT = 'webhook_management', // Webhook operations
  BATCH_IMPORT = 'batch_import',      // Batch import operations
  
  // Advanced permissions requiring JWT authentication
  USER_MANAGEMENT = 'user_management', // User operations and settings
  DATA_EXPORT = 'data_export',        // Export operations
}

/**
 * Maps authentication types to their available permissions
 */
const AUTH_TYPE_PERMISSIONS: Record<'api-token' | 'jwt', Permission[]> = {
  'api-token': [
    Permission.BASIC_AUTH,
    Permission.TASK_MANAGEMENT,
    Permission.PROJECT_MANAGEMENT,
    Permission.LABEL_MANAGEMENT,
    Permission.TEAM_MANAGEMENT,
    Permission.FILTER_MANAGEMENT,
    Permission.TEMPLATE_MANAGEMENT,
    Permission.WEBHOOK_MANAGEMENT,
    Permission.BATCH_IMPORT,
  ],
  'jwt': [
    // JWT includes all API token permissions plus advanced ones
    Permission.BASIC_AUTH,
    Permission.TASK_MANAGEMENT,
    Permission.PROJECT_MANAGEMENT,
    Permission.LABEL_MANAGEMENT,
    Permission.TEAM_MANAGEMENT,
    Permission.FILTER_MANAGEMENT,
    Permission.TEMPLATE_MANAGEMENT,
    Permission.WEBHOOK_MANAGEMENT,
    Permission.BATCH_IMPORT,
    Permission.USER_MANAGEMENT,
    Permission.DATA_EXPORT,
  ],
};

/**
 * Maps tools to their required permissions
 */
export const TOOL_PERMISSIONS: Record<string, Permission[]> = {
  // Always available (only requires basic auth)
  'vikunja_auth': [Permission.BASIC_AUTH],
  'vikunja_tasks': [Permission.BASIC_AUTH, Permission.TASK_MANAGEMENT],
  'vikunja_projects': [Permission.BASIC_AUTH, Permission.PROJECT_MANAGEMENT],
  'vikunja_labels': [Permission.BASIC_AUTH, Permission.LABEL_MANAGEMENT],
  'vikunja_teams': [Permission.BASIC_AUTH, Permission.TEAM_MANAGEMENT],
  'vikunja_filters': [Permission.BASIC_AUTH, Permission.FILTER_MANAGEMENT],
  'vikunja_templates': [Permission.BASIC_AUTH, Permission.TEMPLATE_MANAGEMENT],
  'vikunja_webhooks': [Permission.BASIC_AUTH, Permission.WEBHOOK_MANAGEMENT],
  'vikunja_batch_import': [Permission.BASIC_AUTH, Permission.BATCH_IMPORT],
  
  // JWT-only tools
  'vikunja_users': [Permission.BASIC_AUTH, Permission.USER_MANAGEMENT],
  'vikunja_export_project': [Permission.BASIC_AUTH, Permission.DATA_EXPORT],
  'vikunja_request_user_export': [Permission.BASIC_AUTH, Permission.DATA_EXPORT],
  'vikunja_download_user_export': [Permission.BASIC_AUTH, Permission.DATA_EXPORT],
};

/**
 * Permission validation result
 */
export interface PermissionCheckResult {
  hasPermission: boolean;
  missingPermissions: Permission[];
  suggestedAuthType?: 'jwt';
  errorMessage?: string;
}

/**
 * Centralized permission checker
 */
export class PermissionManager {
  /**
   * Check if current session has required permissions for a tool
   */
  static checkToolPermission(
    session: AuthSession | null,
    toolName: string
  ): PermissionCheckResult {
    // Handle no authentication
    if (!session) {
      const requiredPermissions = TOOL_PERMISSIONS[toolName] || [Permission.BASIC_AUTH];
      return {
        hasPermission: false,
        missingPermissions: requiredPermissions,
        errorMessage: 'Authentication required. Please use vikunja_auth.connect first.',
      };
    }

    // Get required permissions for the tool
    const requiredPermissions = TOOL_PERMISSIONS[toolName];
    if (!requiredPermissions) {
      // Unknown tool - allow by default but require basic auth
      return this.checkPermissions(session, [Permission.BASIC_AUTH]);
    }

    return this.checkPermissions(session, requiredPermissions);
  }

  /**
   * Check if session has specific permissions
   */
  static checkPermissions(
    session: AuthSession,
    requiredPermissions: Permission[]
  ): PermissionCheckResult {
    const availablePermissions = AUTH_TYPE_PERMISSIONS[session.authType];
    const missingPermissions: Permission[] = [];

    // Handle case where auth type is not recognized
    if (!availablePermissions) {
      return {
        hasPermission: false,
        missingPermissions: requiredPermissions,
        errorMessage: `Unknown authentication type: ${session.authType}`,
      };
    }

    // Check each required permission
    for (const permission of requiredPermissions) {
      if (!availablePermissions.includes(permission)) {
        missingPermissions.push(permission);
      }
    }

    if (missingPermissions.length === 0) {
      return { hasPermission: true, missingPermissions: [] };
    }

    // Generate helpful error message and suggestions
    const errorMessage = this.generatePermissionErrorMessage(session.authType, missingPermissions);
    const suggestedAuthType = this.shouldSuggestJWT(missingPermissions) ? 'jwt' : undefined;

    const result: PermissionCheckResult = {
      hasPermission: false,
      missingPermissions,
      errorMessage,
      ...(suggestedAuthType !== undefined && { suggestedAuthType }),
    };

    return result;
  }

  /**
   * Get all available permissions for an auth type
   */
  static getAvailablePermissions(authType: 'api-token' | 'jwt'): Permission[] {
    return [...AUTH_TYPE_PERMISSIONS[authType]];
  }

  /**
   * Check if upgrading to JWT would grant the missing permissions
   */
  private static shouldSuggestJWT(missingPermissions: Permission[]): boolean {
    const jwtOnlyPermissions = [Permission.USER_MANAGEMENT, Permission.DATA_EXPORT];
    return missingPermissions.some(permission => jwtOnlyPermissions.includes(permission));
  }

  /**
   * Generate helpful error message for permission failures
   */
  private static generatePermissionErrorMessage(
    currentAuthType: 'api-token' | 'jwt',
    missingPermissions: Permission[]
  ): string {
    const jwtOnlyPermissions = [Permission.USER_MANAGEMENT, Permission.DATA_EXPORT];
    const needsJWT = missingPermissions.some(permission => jwtOnlyPermissions.includes(permission));

    if (needsJWT && currentAuthType === 'api-token') {
      const operationNames = missingPermissions
        .filter(p => jwtOnlyPermissions.includes(p))
        .map(p => {
          switch (p) {
            case Permission.USER_MANAGEMENT: return 'user operations';
            case Permission.DATA_EXPORT: return 'export operations';
            default: return p.replace('_', ' ');
          }
        })
        .join(' and ');

      return `${operationNames} require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.`;
    }

    // Generic permission error (shouldn't happen in current implementation)
    return `Insufficient permissions. Missing: ${missingPermissions.join(', ')}`;
  }
}