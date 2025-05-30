/**
 * Tasks Tool with Typed Operations
 * Handles task operations for Vikunja using typed request/response patterns
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../../auth/AuthManager';
import { MCPError, ErrorCode } from '../../types/index';
import { getVikunjaClient } from '../../client';
import { logger } from '../../utils/logger';
import { filterStorage } from '../../storage/FilterStorage';
import { relationSchema, handleRelationSubcommands } from '../tasks-relations';
import type { BaseOperationResponse } from '../../types/operations/base';

// Import typed handlers
import {
  handleCreateTask,
  handleListTasks,
  handleUpdateTask,
  handleDeleteTask,
  handleBulkCreateTasks,
  handleBulkUpdateTasks,
  handleBulkDeleteTasks
} from './handlers';

// Import other handlers (to be typed later)
import { getTask } from './crud';
import { assignUsers, unassignUsers, listAssignees } from './assignees';
import { handleComment } from './comments';
import { addReminder, removeReminder, listReminders } from './reminders';

/**
 * Format MCP response from typed operation response
 */
function formatMcpResponse(response: BaseOperationResponse): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(response, null, 2)
    }]
  };
}

// Define the schema for the tasks tool
const tasksSchema = {
  name: 'vikunja_tasks',
  description: 'Manage tasks in Vikunja',
  inputSchema: z.object({
    subcommand: z.enum([
      'list',
      'create',
      'get',
      'update',
      'delete',
      'assign',
      'unassign',
      'list-assignees',
      'comment',
      'attach',
      'bulk-update',
      'bulk-delete',
      'bulk-create',
      'relate',
      'unrelate',
      'relations',
      'add-reminder',
      'remove-reminder',
      'list-reminders',
    ]),
    // Task listing/filtering
    projectId: z.number().optional(),
    filter: z.string().optional(),
    filterId: z.string().optional(),
    page: z.number().optional(),
    perPage: z.number().optional(),
    sort: z.string().optional(),
    search: z.string().optional(),
    allProjects: z.boolean().optional(),
    done: z.boolean().optional(),

    // Task creation/update
    id: z.number().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    priority: z.number().optional(),
    labels: z.array(z.number()).optional(),
    assignees: z.array(z.number()).optional(),
    repeatAfter: z.number().optional(),
    repeatMode: z.enum(['day', 'week', 'month', 'year']).optional(),

    // Bulk operations
    taskIds: z.array(z.number()).optional(),
    field: z.enum(['done', 'priority', 'due_date', 'project_id', 'assignees', 'labels', 'repeat_after', 'repeat_mode']).optional(),
    value: z.unknown().optional(),
    tasks: z
      .array(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          dueDate: z.string().optional(),
          priority: z.number().optional(),
          labels: z.array(z.number()).optional(),
          assignees: z.array(z.number()).optional(),
          repeatAfter: z.number().optional(),
          repeatMode: z.enum(['day', 'week', 'month', 'year']).optional(),
        }),
      )
      .optional(),

    // Comments
    content: z.string().optional(),
    action: z.enum(['add', 'get', 'delete']).optional(),
    commentId: z.number().optional(),

    // Relations
    relationKind: relationSchema.optional(),
    otherTaskId: z.number().optional(),

    // Assignees
    userIds: z.array(z.number()).optional(),

    // Reminders
    date: z.string().optional(),
    duration: z.string().optional(),
  }),
};

/**
 * Handle file attachments (not implemented)
 */
function handleAttach(): never {
  throw new MCPError(
    ErrorCode.NOT_IMPLEMENTED,
    'File attachments are not supported through the MCP protocol.',
  );
}

/**
 * Register the tasks tool with the MCP server
 */
export function registerTasksTool(server: McpServer, authManager: AuthManager): void {
  server.addTool(
    tasksSchema,
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

        // Get client for all operations
        const client = await getVikunjaClient();

        switch (args.subcommand) {
          case 'list': {
            const response = await handleListTasks({
              operation: 'list',
              projectId: args.projectId,
              filter: args.filter,
              filterId: args.filterId,
              page: args.page,
              perPage: args.perPage,
              sort: args.sort,
              search: args.search,
              allProjects: args.allProjects,
              done: args.done
            }, client);
            return formatMcpResponse(response);
          }

          case 'create': {
            const response = await handleCreateTask({
              operation: 'create',
              projectId: args.projectId!,
              title: args.title!,
              description: args.description,
              dueDate: args.dueDate,
              priority: args.priority,
              labels: args.labels,
              assignees: args.assignees,
              repeatAfter: args.repeatAfter,
              repeatMode: args.repeatMode
            }, client);
            return formatMcpResponse(response);
          }

          case 'get':
            return getTask(args as Parameters<typeof getTask>[0]);

          case 'update': {
            const response = await handleUpdateTask({
              operation: 'update',
              id: args.id!,
              title: args.title,
              description: args.description,
              dueDate: args.dueDate,
              priority: args.priority,
              done: args.done,
              labels: args.labels,
              assignees: args.assignees,
              repeatAfter: args.repeatAfter,
              repeatMode: args.repeatMode
            }, client);
            return formatMcpResponse(response);
          }

          case 'delete': {
            const response = await handleDeleteTask({
              operation: 'delete',
              id: args.id!
            }, client);
            return formatMcpResponse(response);
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
            const response = await handleBulkUpdateTasks({
              operation: 'bulk-update',
              taskIds: args.taskIds!,
              field: args.field!,
              value: args.value
            }, client);
            return formatMcpResponse(response);
          }

          case 'bulk-delete': {
            const response = await handleBulkDeleteTasks({
              operation: 'bulk-delete',
              taskIds: args.taskIds!
            }, client);
            return formatMcpResponse(response);
          }

          case 'bulk-create': {
            const response = await handleBulkCreateTasks({
              operation: 'bulk-create',
              projectId: args.projectId!,
              tasks: args.tasks!
            }, client);
            return formatMcpResponse(response);
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