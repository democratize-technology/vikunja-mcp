/**
 * Users Tool
 * Handles user operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { MCPError, ErrorCode, createStandardResponse } from '../types';
import { getClientFromContext } from '../client';
import type { User, ExtendedUserSettings } from '../types/vikunja';
import { handleAuthError } from '../utils/auth-error-handler';
import { formatAorpAsMarkdown } from '../utils/response-factory';

interface SearchParams {
  page?: number;
  per_page?: number;
  s?: string;
}

/**
 * Type guard to check if an object is a valid user structure
 */
function isUserObject(obj: unknown): obj is Record<string, unknown> {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
}

/**
 * Safely transforms a node-vikunja User to our extended User interface
 */
function transformUser(rawUser: unknown): User {
  if (!isUserObject(rawUser)) {
    throw new Error('Invalid user data received');
  }

  const user = rawUser;

  const safeString = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value !== null && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[object Object]';
      }
    }
    return value !== null && value !== undefined && typeof value !== 'object' && typeof value !== 'boolean' ?
      (typeof value === 'string' || typeof value === 'number' ? value.toString() : '') : '';
  };

  const result = {
    id: Number(user.id) || 0,
    username: safeString(user.username),
    frontend_settings: (user.frontend_settings && typeof user.frontend_settings === 'object') ? user.frontend_settings : {},
  };

  const userResult: User = {
    id: result.id,
    username: result.username,
    frontend_settings: result.frontend_settings as Record<string, unknown>,
    ...(user.email ? { email: safeString(user.email) } : {}),
    ...(user.name ? { name: safeString(user.name) } : {}),
    ...(user.created ? { created: safeString(user.created) } : {}),
    ...(user.updated ? { updated: safeString(user.updated) } : {}),
    ...(user.language ? { language: safeString(user.language) } : {}),
    ...(user.timezone ? { timezone: safeString(user.timezone) } : {}),
    ...(user.week_start !== undefined ? { week_start: Number(user.week_start) } : {}),
    ...(user.email_reminders_enabled !== undefined ? { email_reminders_enabled: Boolean(user.email_reminders_enabled) } : {}),
    ...(user.overdue_tasks_reminders_enabled !== undefined ? { overdue_tasks_reminders_enabled: Boolean(user.overdue_tasks_reminders_enabled) } : {}),
  };

  return userResult;
}

export function registerUsersTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
  server.tool(
    'vikunja_users',
    'Manage user profiles, search users, and update user settings',
    {
      // Operation type
      subcommand: z.enum(['current', 'search', 'settings', 'update-settings']),

      // Search parameters
      search: z.string().optional(),
      page: z.number().positive().optional(),
      perPage: z.number().positive().max(100).optional(),

      // Settings update fields
      name: z.string().optional(),
      language: z.string().optional(),
      timezone: z.string().optional(),
      weekStart: z.number().min(0).max(6).optional(),
      frontendSettings: z.record(z.unknown()).optional(),

      // Notification preferences
      emailRemindersEnabled: z.boolean().optional(),
      overdueTasksRemindersEnabled: z.boolean().optional(),
      overdueTasksRemindersTime: z.string().optional(),
    },
    async (args) => {
      if (!authManager.isAuthenticated()) {
        throw new MCPError(
          ErrorCode.AUTH_REQUIRED,
          'Authentication required. Please use vikunja_auth.connect first.',
        );
      }

      // User operations require JWT authentication
      if (authManager.getAuthType() !== 'jwt') {
        throw new MCPError(
          ErrorCode.PERMISSION_DENIED,
          'User operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.',
        );
      }

      const client = await getClientFromContext();

      try {
        const subcommand = args.subcommand;

        switch (subcommand) {
          case 'current': {
            const rawUser = await client.users.getUser();

            // Safely transform the node-vikunja User to our extended User interface
            // Extended properties may not be available from all Vikunja API versions
            const enhancedUser: User = transformUser(rawUser);

            const response = createStandardResponse(
              'get-current-user',
              'Current user retrieved successfully',
              { user: enhancedUser },
            );

            return {
              content: [
                {
                  type: 'text',
                  text: formatAorpAsMarkdown(response),
                },
              ],
            };
          }

          case 'search': {
            const params: SearchParams = {};
            if (args.search !== undefined) params.s = args.search;
            if (args.page !== undefined) params.page = args.page;
            if (args.perPage !== undefined) params.per_page = args.perPage;

            const users = await client.users.getUsers(params);

            const paramsMetadata: Record<string, string | number> = {};
            if (args.search !== undefined) paramsMetadata.search = args.search;
            if (args.page !== undefined) paramsMetadata.page = args.page;
            if (args.perPage !== undefined) paramsMetadata.perPage = args.perPage;

            const response = createStandardResponse(
              'search-users',
              `Found ${users.length} users`,
              { users: users.map(transformUser) },
              { count: users.length, params: paramsMetadata },
            );

            return {
              content: [
                {
                  type: 'text',
                  text: formatAorpAsMarkdown(response),
                },
              ],
            };
          }

          case 'settings': {
            // Get current user first to get their settings
            const rawUser = await client.users.getUser();

            // Safely transform the node-vikunja User to our extended User interface
            const user: User = transformUser(rawUser);

            // Handle the actual API response format gracefully
            const settings = {
              id: user.id,
              username: user.username,
              ...(user.email && { email: user.email }),
              ...(user.name && { name: user.name }),
              ...(user.language && { language: user.language }),
              ...(user.timezone && { timezone: user.timezone }),
              ...(user.week_start !== undefined && { weekStart: user.week_start }),
              frontendSettings: user.frontend_settings || {},
              ...(user.email_reminders_enabled !== undefined && { emailRemindersEnabled: user.email_reminders_enabled }),
              ...(user.overdue_tasks_reminders_enabled !== undefined && { overdueTasksRemindersEnabled: user.overdue_tasks_reminders_enabled }),
              ...(user.overdue_tasks_reminders_time && { overdueTasksRemindersTime: user.overdue_tasks_reminders_time }),
            };

            const response = createStandardResponse(
              'get-user-settings',
              'User settings retrieved successfully',
              { settings },
            );

            return {
              content: [
                {
                  type: 'text',
                  text: formatAorpAsMarkdown(response),
                },
              ],
            };
          }

          case 'update-settings': {
            if (
              !args.name &&
              !args.language &&
              !args.timezone &&
              args.weekStart === undefined &&
              !args.frontendSettings &&
              args.emailRemindersEnabled === undefined &&
              args.overdueTasksRemindersEnabled === undefined &&
              args.overdueTasksRemindersTime === undefined
            ) {
              throw new MCPError(
                ErrorCode.VALIDATION_ERROR,
                'At least one setting field is required',
              );
            }

            const settings: Partial<ExtendedUserSettings> = {};
            const affectedFields: string[] = [];

            if (args.name !== undefined) {
              settings.name = args.name;
              affectedFields.push('name');
            }
            if (args.language !== undefined) {
              settings.language = args.language;
              affectedFields.push('language');
            }
            if (args.timezone !== undefined) {
              settings.timezone = args.timezone;
              affectedFields.push('timezone');
            }
            if (args.weekStart !== undefined) {
              settings.week_start = args.weekStart;
              affectedFields.push('weekStart');
            }
            if (args.frontendSettings !== undefined) {
              settings.frontend_settings = args.frontendSettings;
              affectedFields.push('frontendSettings');
            }
            if (args.emailRemindersEnabled !== undefined) {
              settings.email_reminders_enabled = args.emailRemindersEnabled;
              affectedFields.push('emailRemindersEnabled');
            }
            if (args.overdueTasksRemindersEnabled !== undefined) {
              settings.overdue_tasks_reminders_enabled = args.overdueTasksRemindersEnabled;
              affectedFields.push('overdueTasksRemindersEnabled');
            }
            if (args.overdueTasksRemindersTime !== undefined) {
              settings.overdue_tasks_reminders_time = args.overdueTasksRemindersTime;
              affectedFields.push('overdueTasksRemindersTime');
            }

            // Use type assertion to bypass node-vikunja's limited UserSettings type
            // The API accepts these additional fields even if the TypeScript types don't include them
            await client.users.updateGeneralSettings(
              settings as unknown as Parameters<typeof client.users.updateGeneralSettings>[0],
            );

            // Get updated user info
            const rawUpdatedUser = await client.users.getUser();

            // Safely transform the node-vikunja User to our extended User interface
            const updatedUser: User = transformUser(rawUpdatedUser);

            const response = createStandardResponse(
              'update-user-settings',
              'User settings updated successfully',
              { user: updatedUser },
              { affectedFields },
            );

            return {
              content: [
                {
                  type: 'text',
                  text: formatAorpAsMarkdown(response),
                },
              ],
            };
          }

          default:
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Invalid subcommand: ${String(subcommand)}`,
            );
        }
      } catch (error) {
        if (error instanceof MCPError) {
          throw error;
        }

        // Use consistent auth error handling
        handleAuthError(
          error,
          `user.${args.subcommand}`,
          `User operation error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
