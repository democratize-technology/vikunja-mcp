/**
 * Users Tool
 * Handles user operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { MCPError, ErrorCode, createStandardResponse } from '../types/index';
import { getClientFromContext } from '../client';
import type { ExtendedUserSettings } from '../types/vikunja';
import { handleAuthError } from '../utils/auth-error-handler';

interface SearchParams {
  page?: number;
  per_page?: number;
  s?: string;
}

export function registerUsersTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
  server.tool(
    'vikunja_users',
    'Manage user profiles, search users, and update user settings',
    {
      // Operation type
      subcommand: z.enum(['current', 'search', 'settings', 'update-settings']).optional(),

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
        const subcommand = args.subcommand || 'current';

        switch (subcommand) {
          case 'current': {
            const user = await client.users.getUser();

            const response = createStandardResponse(
              'get-current-user',
              'Current user retrieved successfully',
              { user },
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
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
              { users },
              { count: users.length, params: paramsMetadata },
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'settings': {
            // Get current user first to get their settings
            const user = await client.users.getUser();

            const settings = {
              id: user.id,
              username: user.username,
              email: user.email,
              name: user.name,
              language: user.language,
              timezone: user.timezone,
              weekStart: user.week_start,
              frontendSettings: user.frontend_settings,
              emailRemindersEnabled: user.email_reminders_enabled,
              overdueTasksRemindersEnabled: user.overdue_tasks_reminders_enabled,
              overdueTasksRemindersTime: user.overdue_tasks_reminders_time,
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
                  text: JSON.stringify(response, null, 2),
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
            const updatedUser = await client.users.getUser();

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
                  text: JSON.stringify(response, null, 2),
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
          `user.${args.subcommand || 'current'}`,
          `User operation error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
