/**
 * Tasks Tool
 * Handles task operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../../auth/AuthManager';
import { MCPError, ErrorCode } from '../../types/index';
import { getVikunjaClient } from '../../client';
import { logger } from '../../utils/logger';
import { relationSchema, handleRelationSubcommands } from '../tasks-relations';

// Import new typed handlers
import { 
  handleCreateTask,
  handleListTasks,
  handleUpdateTask,
  handleDeleteTask,
  handleBulkCreateTasks,
  handleBulkUpdateTasks,
  handleBulkDeleteTasks
} from './handlers';

// Import legacy handlers that haven't been migrated yet
import { assignUsers, unassignUsers, listAssignees } from './assignees';
import { handleComment } from './comments';
import { addReminder, removeReminder, listReminders } from './reminders';


/**
 * Handle file attachments (not supported)
 */
function handleAttach(): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Attachment handling would require file upload capabilities
  // which are not available in the current MCP context
  throw new MCPError(
    ErrorCode.NOT_IMPLEMENTED,
    'File attachments are not supported in the current MCP context',
  );
}

export function registerTasksTool(server: McpServer, authManager: AuthManager): void {
  server.tool(
    'vikunja_tasks',
    {
      subcommand: z.enum([
        'create',
        'get',
        'update',
        'delete',
        'list',
        'assign',
        'unassign',
        'list-assignees',
        'attach',
        'comment',
        'bulk-create',
        'bulk-update',
        'bulk-delete',
        'relate',
        'unrelate',
        'relations',
        'add-reminder',
        'remove-reminder',
        'list-reminders',
      ]),
      // Task creation/update fields
      title: z.string().optional(),
      description: z.string().optional(),
      projectId: z.number().optional(),
      dueDate: z.string().optional(),
      priority: z.number().min(0).max(5).optional(),
      labels: z.array(z.number()).optional(),
      assignees: z.array(z.number()).optional(),
      // Recurring task fields
      repeatAfter: z.number().min(0).optional(),
      repeatMode: z.enum(['day', 'week', 'month', 'year']).optional(),
      // Query fields
      id: z.number().optional(),
      filter: z.string().optional(),
      filterId: z.string().optional(),
      page: z.number().optional(),
      perPage: z.number().optional(),
      sort: z.string().optional(),
      search: z.string().optional(),
      // List specific filters
      allProjects: z.boolean().optional(),
      done: z.boolean().optional(),
      // Comment fields
      comment: z.string().optional(),
      commentId: z.number().optional(),
      // Bulk operation fields
      taskIds: z.array(z.number()).optional(),
      field: z.string().optional(),
      value: z.unknown().optional(),
      tasks: z
        .array(
          z.object({
            title: z.string(),
            description: z.string().optional(),
            dueDate: z.string().optional(),
            priority: z.number().min(0).max(5).optional(),
            labels: z.array(z.number()).optional(),
            assignees: z.array(z.number()).optional(),
            repeatAfter: z.number().min(0).optional(),
            repeatMode: z.enum(['day', 'week', 'month', 'year']).optional(),
          }),
        )
        .optional(),
      // Reminder fields
      reminderDate: z.string().optional(),
      reminderId: z.number().optional(),
      // Add relation schema
      ...relationSchema,
    },
    async (args) => {
      try {
        logger.debug('Executing tasks tool', { subcommand: args.subcommand, args });

        // Check authentication
        if (!authManager.isAuthenticated()) {
          throw new MCPError(
            ErrorCode.AUTH_REQUIRED,
            'Authentication required. Please use vikunja_auth.connect first.',
          );
        }

        // Get client once for operations that need it (kept for backward compatibility)
        await getVikunjaClient();

        switch (args.subcommand) {
          case 'list': {
            const vikunjaClient = await getVikunjaClient();
            const result = await handleListTasks({ ...args, operation: 'list' }, vikunjaClient);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'create': {
            const vikunjaClient = await getVikunjaClient();
            const result = await handleCreateTask({ ...args, operation: 'create' }, vikunjaClient);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get': {
            const vikunjaClient = await getVikunjaClient();
            // Map 'get' to the list handler with specific ID
            const result = await handleListTasks({ filter: `id = ${args.id}`, operation: 'list' }, vikunjaClient);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result.tasks?.[0] || { error: 'Task not found' }, null, 2),
                },
              ],
            };
          }

          case 'update': {
            const vikunjaClient = await getVikunjaClient();
            const result = await handleUpdateTask({ ...args, operation: 'update' }, vikunjaClient);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'delete': {
            const vikunjaClient = await getVikunjaClient();
            const result = await handleDeleteTask({ ...args, operation: 'delete' }, vikunjaClient);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'assign':
            return assignUsers(args as Parameters<typeof assignUsers>[0]);

          case 'unassign':
            return unassignUsers(args as Parameters<typeof unassignUsers>[0]);

          case 'list-assignees':
            return listAssignees(args as Parameters<typeof listAssignees>[0]);

          case 'comment':
            return handleComment(args as Parameters<typeof handleComment>[0]);

          case 'attach':
            return handleAttach();

          case 'bulk-update': {
            const vikunjaClient = await getVikunjaClient();
            const result = await handleBulkUpdateTasks({ ...args, operation: 'bulk-update' }, vikunjaClient);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'bulk-delete': {
            const vikunjaClient = await getVikunjaClient();
            const result = await handleBulkDeleteTasks({ ...args, operation: 'bulk-delete' }, vikunjaClient);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'bulk-create': {
            const vikunjaClient = await getVikunjaClient();
            const result = await handleBulkCreateTasks({ ...args, operation: 'bulk-create' }, vikunjaClient);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          // Handle relation subcommands
          case 'relate':
          case 'unrelate':
          case 'relations':
            return handleRelationSubcommands({
              subcommand: args.subcommand,
              id: args.id,
              otherTaskId: args.otherTaskId,
              relationKind: args.relationKind,
            });

          // Handle reminder operations
          case 'add-reminder':
            return addReminder(args as Parameters<typeof addReminder>[0]);

          case 'remove-reminder':
            return removeReminder(args as Parameters<typeof removeReminder>[0]);

          case 'list-reminders':
            return listReminders(args as Parameters<typeof listReminders>[0]);

          default:
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Unknown subcommand: ${args.subcommand as string}`,
            );
        }
      } catch (error) {
        if (error instanceof MCPError) {
          throw error;
        }
        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          `Task operation error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}