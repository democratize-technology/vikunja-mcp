/**
 * Task Reminders Tool
 * Handles task reminder operations: add-reminder, remove-reminder, list-reminders
 * Replaces monolithic tasks tool with focused individual tool
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { MCPError, ErrorCode } from '../types';
import { getClientFromContext, setGlobalClientFactory } from '../client';
import { logger } from '../utils/logger';
import { createAuthRequiredError } from '../utils/error-handler';
import { addReminder, removeReminder, listReminders } from '../tools/tasks/reminders';

/**
 * Register task reminders tool
 */
export function registerTaskRemindersTool(
  server: McpServer,
  authManager: AuthManager,
  clientFactory?: VikunjaClientFactory
): void {
  server.tool(
    'vikunja_task_reminders',
    'Manage task reminders: add, remove, list reminders',
    {
      operation: z.enum(['add-reminder', 'remove-reminder', 'list-reminders']),
      // Task and reminder identification
      id: z.number(),
      reminderDate: z.string().optional(),
      reminderId: z.number().optional(),
    },
    async (args) => {
      try {
        logger.debug('Executing task reminders tool', { operation: args.operation, taskId: args.id, reminderId: args.reminderId });

        // Check authentication
        if (!authManager.isAuthenticated()) {
          throw createAuthRequiredError('access task reminder operations');
        }

        // Set the client factory for this request if provided
        if (clientFactory) {
          await setGlobalClientFactory(clientFactory);
        }

        // Test client connection
        await getClientFromContext();

        switch (args.operation) {
          case 'add-reminder':
            return addReminder({
              id: args.id,
              reminderDate: args.reminderDate || ''
            });

          case 'remove-reminder':
            return removeReminder({
              id: args.id,
              reminderId: args.reminderId || 0
            });

          case 'list-reminders':
            return listReminders(args);

          default:
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Unknown operation: ${args.operation}`,
            );
        }
      } catch (error) {
        if (error instanceof MCPError) {
          throw error;
        }
        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          `Task reminder operation error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}