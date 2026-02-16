/**
 * Tasks Tool
 * Handles task operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../../auth/AuthManager';
import type { VikunjaClientFactory } from '../../client/VikunjaClientFactory';
import { MCPError, ErrorCode } from '../../types';
import { getClientFromContext, setGlobalClientFactory } from '../../client';
import { logger } from '../../utils/logger';
import { storageManager } from '../../storage';
import { relationSchema, handleRelationSubcommands } from '../tasks-relations';
import { TaskFilteringOrchestrator } from './filtering';
import type { TaskListingArgs } from './types/filters';
import { createAuthRequiredError, handleFetchError } from '../../utils/error-handler';
import { formatAorpAsMarkdown } from '../../utils/response-factory';


// Import all operation handlers
import { createTask, getTask, updateTask, deleteTask, createTaskResponse } from './crud';
import { bulkCreateTasks, bulkUpdateTasks, bulkDeleteTasks } from './bulk-operations';
import { assignUsers, unassignUsers, listAssignees } from './assignees';
import { handleComment } from './comments';
import { addReminder, removeReminder, listReminders } from './reminders';
import { applyLabels, removeLabels, listTaskLabels } from './labels';
import { listBuckets, assignBucket } from './buckets';


/**
 * Get session-scoped storage instance
 */
async function getSessionStorage(authManager: AuthManager): ReturnType<typeof storageManager.getStorage> {
  const session = authManager.getSession();
  const sessionId = session.apiToken ? `${session.apiUrl}:${session.apiToken.substring(0, 8)}` : 'anonymous';
  return storageManager.getStorage(sessionId, session.userId, session.apiUrl);
}

/**
 * List tasks with optional filtering
 */
async function listTasks(
  args: TaskListingArgs,
  storage: Awaited<ReturnType<typeof storageManager.getStorage>>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    // Execute the complete filtering workflow using the orchestrator
    const filteringResult = await TaskFilteringOrchestrator.executeTaskFiltering(args, storage);

    // Determine filtering method message
    let filteringMessage = '';
    if (args.filter) {
      if (filteringResult.metadata?.serverSideFilteringUsed) {
        filteringMessage = ' (filtered server-side)';
      } else if (filteringResult.metadata?.serverSideFilteringAttempted) {
        filteringMessage = ' (filtered client-side - server-side fallback)';
      } else {
        filteringMessage = ' (filtered client-side)';
      }
    }

    const taskCount = filteringResult.tasks?.length || 0;
    const response = createTaskResponse(
      'list-tasks',
      `Found ${taskCount} tasks${filteringMessage}`,
      { tasks: filteringResult.tasks || [] },
      {
        timestamp: new Date().toISOString(),
        count: taskCount,
        ...(filteringResult.metadata || {}),
      },
      undefined, // verbosity (ignored - using standard AORP)
      undefined, // useOptimizedFormat (ignored - using standard AORP)
      undefined, // useAorp (ignored - always using AORP)
      undefined, // aorpConfig (using auto-generated)
      args.sessionId
    );

    logger.debug('Tasks tool response', { subcommand: 'list', itemCount: taskCount });

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response.response),
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
      filter: args.filter,
      filterId: args.filterId,
    });

    throw handleFetchError(error, 'list tasks');
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

export function registerTasksTool(
  server: McpServer, 
  authManager: AuthManager, 
  clientFactory?: VikunjaClientFactory
): void {
  server.tool(
    'vikunja_tasks',
    'Manage tasks with comprehensive operations (create, update, delete, list, assign, attach files, comment, bulk operations)',
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
        'apply-label',
        'remove-label',
        'list-labels',
        'list-buckets',
        'assign-bucket',
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
      // Bucket fields
      viewId: z.number().optional(),
      bucketId: z.number().optional(),
      // Add relation schema
      ...relationSchema,
      // Session ID for AORP response tracking
      sessionId: z.string().optional(),
    },
    async (args) => {
      try {
        logger.debug('Executing tasks tool', { subcommand: args.subcommand, args });

        // Check authentication with enhanced error message
        if (!authManager.isAuthenticated()) {
          throw createAuthRequiredError('access task management features');
        }

        // Set the client factory for this request if provided
        if (clientFactory) {
          await setGlobalClientFactory(clientFactory);
        }

        // Test client connection
        await getClientFromContext();

        switch (args.subcommand) {
          case 'list': {
            // Get session-scoped storage for filter operations (only when needed)
            const storage = await getSessionStorage(authManager);
            return listTasks(args as Parameters<typeof listTasks>[0], storage);
          }

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
          case 'apply-label':
            return applyLabels(args as Parameters<typeof applyLabels>[0]);

          case 'remove-label':
            return removeLabels(args as Parameters<typeof removeLabels>[0]);

          case 'list-labels':
            return listTaskLabels(args as Parameters<typeof listTaskLabels>[0]);

          // Handle bucket operations
          case 'list-buckets':
            return listBuckets(args as Parameters<typeof listBuckets>[0], authManager);

          case 'assign-bucket':
            return assignBucket(args as Parameters<typeof assignBucket>[0], authManager);

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
