/**
 * Tasks Tool
 * Handles task operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../../auth/AuthManager';
import { MCPError, ErrorCode } from '../../types/index';
import type { StandardTaskResponse } from '../../types/index';
import { getVikunjaClient } from '../../client';
import { logger } from '../../utils/logger';
import { filterStorage } from '../../storage/FilterStorage';
import { relationSchema, handleRelationSubcommands } from '../tasks-relations';
import { parseFilterString } from '../../utils/filters';
import type { FilterExpression } from '../../types/filters';
import type { FilterParams } from './types';
import { applyFilter } from './filters';
import { validateId } from './validation';
import type { Task } from 'node-vikunja';

// Import all operation handlers
import { createTask, getTask, updateTask, deleteTask } from './crud';
import { bulkCreateTasks, bulkUpdateTasks, bulkDeleteTasks } from './bulk-operations';
import { assignUsers, unassignUsers, listAssignees } from './assignees';
import { handleComment } from './comments';
import { addReminder, removeReminder, listReminders } from './reminders';

/**
 * List tasks with optional filtering
 */
async function listTasks(args: {
  projectId?: number;
  page?: number;
  perPage?: number;
  search?: string;
  sort?: string;
  filter?: string;
  filterId?: string;
  allProjects?: boolean;
  done?: boolean;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const params: FilterParams = {};

  try {
    let tasks;
    let filterExpression: FilterExpression | null = null;
    let filterString: string | undefined;

    // Build query parameters
    if (args.page !== undefined) params.page = args.page;
    if (args.perPage !== undefined) params.per_page = args.perPage;
    if (args.search !== undefined) params.s = args.search;
    if (args.sort !== undefined) params.sort_by = args.sort;

    // Handle filter - either direct filter string or saved filter ID
    if (args.filterId) {
      const savedFilter = await filterStorage.get(args.filterId);
      if (!savedFilter) {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          `Filter with id ${args.filterId} not found`,
        );
      }
      filterString = savedFilter.filter;
    } else if (args.filter !== undefined) {
      filterString = args.filter;
    }

    // Parse the filter string for client-side filtering
    if (filterString) {
      const parseResult = parseFilterString(filterString);
      if (parseResult.error) {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid filter syntax: ${parseResult.error.message}${parseResult.error.context ? `\n${parseResult.error.context}` : ''}`,
        );
      }
      filterExpression = parseResult.expression;

      // Log that we're using client-side filtering due to known issue
      logger.info('Using client-side filtering due to Vikunja API filter parameter being ignored', {
        filter: filterString,
      });
    }

    const client = await getVikunjaClient();

    // Determine which endpoint to use
    // Don't pass the filter parameter to the API since it's ignored
    if (args.projectId && !args.allProjects) {
      // Validate project ID
      validateId(args.projectId, 'projectId');
      // Get tasks for specific project
      tasks = await (client.tasks as any).getTasksForProject(args.projectId, params);
    } else {
      // Get all tasks across all projects
      tasks = await (client.tasks as any).getAll(params);
    }

    // Apply client-side filtering if we have a filter expression
    if (filterExpression) {
      const originalCount = tasks.length;
      tasks = applyFilter(tasks, filterExpression);
      logger.debug('Applied client-side filter', {
        originalCount,
        filteredCount: tasks.length,
        filter: filterString,
      });
    }

    // Filter by done status if specified (this is a simpler filter that works)
    if (args.done !== undefined) {
      tasks = tasks.filter((task: Task) => task.done === args.done);
    }

    const response: StandardTaskResponse = {
      success: true,
      operation: 'list',
      message: `Found ${tasks.length} tasks${filterString ? ' (filtered client-side)' : ''}`,
      tasks: tasks,
      metadata: {
        timestamp: new Date().toISOString(),
        count: tasks.length,
        ...(filterString && {
          filter: filterString,
          clientSideFiltering: true,
          filteringNote: 'Client-side filtering applied due to Vikunja API limitation',
        }),
      },
    };

    logger.debug('Tasks tool response', { subcommand: 'list', itemCount: tasks.length });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }

    // Log the full error for debugging filter issues
    logger.error('Task list error:', {
      error: error instanceof Error ? error.message : String(error),
      params: params,
      filter: args.filter,
      filterId: args.filterId,
    });

    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

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
          case 'list':
            return listTasks(args as Parameters<typeof listTasks>[0]);

          case 'create':
            return createTask(args as Parameters<typeof createTask>[0]);

          case 'get':
            return getTask(args as Parameters<typeof getTask>[0]);

          case 'update':
            return updateTask(args as Parameters<typeof updateTask>[0]);

          case 'delete':
            return deleteTask(args as Parameters<typeof deleteTask>[0]);

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

          case 'bulk-update':
            return bulkUpdateTasks(args as Parameters<typeof bulkUpdateTasks>[0]);

          case 'bulk-delete':
            return bulkDeleteTasks(args as Parameters<typeof bulkDeleteTasks>[0]);

          case 'bulk-create':
            return bulkCreateTasks(args as Parameters<typeof bulkCreateTasks>[0]);

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