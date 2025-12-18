import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { getClientFromContext } from '../client';
import { logger } from '../utils/logger';
import { MCPError, ErrorCode } from '../types/index';
import { parseInputData } from '../parsers/InputParserFactory';
import { EntityResolver } from '../services/EntityResolver';
import { TaskCreationService } from '../services/TaskCreationService';
import { BatchImportResponseFormatter, type ImportResult } from '../formatters/BatchImportResponseFormatter';

const MAX_BATCH_SIZE = 100;

/* ===================================================================
 * BATCH IMPORT ORCHESTRATION
 * Main tool registration and orchestration layer for batch task import
 * =================================================================== */

export function registerBatchImportTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
  server.tool(
    'vikunja_batch_import',
    'Import tasks in bulk from CSV or JSON formats with error handling and dry-run support',
    {
      projectId: z.number(),
      format: z.enum(['csv', 'json']),
      data: z.string(),
      skipErrors: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    },
    async (args) => {
      try {
        logger.debug('Executing batch import', {
          projectId: args.projectId,
          format: args.format,
          skipErrors: args.skipErrors,
          dryRun: args.dryRun,
        });

        // Authentication check
        if (!authManager.isAuthenticated()) {
          throw new MCPError(
            ErrorCode.AUTH_REQUIRED,
            'Authentication required. Please use vikunja_auth.connect first.',
          );
        }

        const client = await getClientFromContext();
        const responseFormatter = new BatchImportResponseFormatter();

        // Parse input data
        const parseOptions = {
          format: args.format,
          data: args.data,
          ...(args.skipErrors !== undefined && { skipErrors: args.skipErrors }),
        } as { format: 'csv' | 'json'; data: string; skipErrors?: boolean };

        const tasks = parseInputData(parseOptions);

        // Validate tasks
        if (tasks.length === 0) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'No valid tasks found to import');
        }

        if (tasks.length > MAX_BATCH_SIZE) {
          throw new MCPError(
            ErrorCode.VALIDATION_ERROR,
            `Batch size exceeds maximum limit of ${MAX_BATCH_SIZE} tasks. Please split your import into smaller batches.`,
          );
        }

        // Handle dry run
        if (args.dryRun) {
          return {
            content: [{
              type: 'text',
              text: `Validation successful. ${tasks.length} tasks ready to import.`,
            }],
          };
        }

        // Initialize services
        const entityResolver = new EntityResolver();
        const taskCreationService = new TaskCreationService();

        // Resolve entities (labels and users)
        const entityResult = await entityResolver.resolveEntities(client);
        const { userFetchFailedDueToAuth } = entityResult;

        // Process tasks
        const result: ImportResult = {
          success: 0,
          failed: 0,
          errors: [],
          createdTasks: [],
        };

        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          if (!task) continue;

          try {
            const creationResult = await taskCreationService.createTask(
              task,
              args.projectId,
              client,
              entityResult,
              args.skipErrors === true
            );

            if (creationResult.success) {
              result.success++;
              if (creationResult.taskId) {
                result.createdTasks.push({
                  id: creationResult.taskId,
                  title: creationResult.title,
                });
              }

              if (creationResult.warnings?.length) {
                if (!result.warnings) result.warnings = [];
                creationResult.warnings.forEach((warning) => {
                  (result.warnings || []).push({
                    taskId: creationResult.taskId || 0,
                    title: creationResult.title,
                    warning,
                  });
                });
              }
            } else {
              result.failed++;
              result.errors.push({
                index: i,
                title: task.title,
                error: creationResult.error || 'Unknown error',
              });
            }
          } catch (error) {
            result.failed++;
            result.errors.push({
              index: i,
              title: task.title,
              error: error instanceof Error ? error.message : 'Unknown error',
            });

            if (!args.skipErrors) {
              throw error;
            }
          }
        }

        // Format and return response
        const hasAssignees = tasks.some((t) => t.assignees && t.assignees.length > 0);
        const responseText = responseFormatter.formatResult(result, userFetchFailedDueToAuth, hasAssignees);

        return {
          content: [{
            type: 'text',
            text: responseText,
          }],
        };
      } catch (error) {
        if (error instanceof MCPError) {
          return {
            content: [{ type: 'text', text: error.message }],
          };
        }

        logger.error('Batch import error', {
          error: error instanceof Error ? error.stack : String(error),
          message: error instanceof Error ? error.message : 'Unknown error',
        });

        return {
          content: [{
            type: 'text',
            text: `Failed to import tasks: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );
}
