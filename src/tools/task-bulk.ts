/**
 * Task Bulk Operations Tool
 * Handles bulk task operations: bulk-create, bulk-update, bulk-delete
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

/**
 * Register task bulk operations tool
 */
export function registerTaskBulkTool(
  server: McpServer,
  authManager: AuthManager,
  clientFactory?: VikunjaClientFactory
): void {
  server.tool(
    'vikunja_task_bulk',
    'Manage bulk task operations: create, update, delete multiple tasks',
    {
      operation: z.enum(['bulk-create', 'bulk-update', 'bulk-delete']),
      // Bulk operation fields
      taskIds: z.array(z.number()).optional(),
      field: z.string().optional(),
      value: z.unknown().optional(),
      projectId: z.number().optional(), // Add projectId for bulk-create
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
    },
    async (args) => {
      try {
        logger.debug('Executing task bulk operations tool', { operation: args.operation, taskCount: args.tasks?.length || args.taskIds?.length });

        // Check authentication
        if (!authManager.isAuthenticated()) {
          throw createAuthRequiredError('access task bulk operations');
        }

        // Set the client factory for this request if provided
        if (clientFactory) {
          await setGlobalClientFactory(clientFactory);
        }

        // Test client connection
        await getClientFromContext();

        switch (args.operation) {
          case 'bulk-create': {
            const { bulkCreateTasks } = await import('./tasks/bulk-operations.js');
            // Filter out undefined values for type safety
            if (!args.projectId) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'projectId is required for bulk create operations');
            }
            // Filter out undefined values from tasks to satisfy exactOptionalPropertyTypes
            const filteredTasks = (args.tasks || []).map(task => {
              const filteredTask: { title: string; description?: string; due_date?: string; priority?: number; labels?: number[]; assignees?: number[]; repeat_after?: number; repeat_mode?: 'day' | 'week' | 'month' | 'year' } = { title: task.title };
              if (task.description !== undefined) filteredTask.description = task.description;
              if (task.dueDate !== undefined) filteredTask.due_date = task.dueDate;
              if (task.priority !== undefined) filteredTask.priority = task.priority;
              if (task.labels !== undefined) filteredTask.labels = task.labels;
              if (task.assignees !== undefined) filteredTask.assignees = task.assignees;
              if (task.repeatAfter !== undefined) filteredTask.repeat_after = task.repeatAfter;
              if (task.repeatMode !== undefined) filteredTask.repeat_mode = task.repeatMode;
              return filteredTask;
            });

            const filteredArgs = {
              projectId: args.projectId,
              tasks: filteredTasks
            };
            return bulkCreateTasks(filteredArgs);
          }

          case 'bulk-update': {
            const { bulkUpdateTasks } = await import('./tasks/bulk-operations.js');
            // Filter out undefined values for type safety
            if (!args.field) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'field is required for bulk update operations');
            }
            const filteredArgs = {
              taskIds: args.taskIds || [],
              field: args.field,
              value: args.value
            };
            return bulkUpdateTasks(filteredArgs);
          }

          case 'bulk-delete': {
            const { bulkDeleteTasks } = await import('./tasks/bulk-operations.js');
            // Filter out undefined values for type safety
            const filteredArgs = {
              taskIds: args.taskIds || []
            };
            return bulkDeleteTasks(filteredArgs);
          }

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
          `Task bulk operation error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}