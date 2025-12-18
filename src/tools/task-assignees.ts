/**
 * Task Assignees Tool
 * Handles task assignment operations: assign, unassign, list-assignees
 * Replaces monolithic tasks tool with focused individual tool
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { MCPError, ErrorCode } from '../types/index';
import { getClientFromContext, setGlobalClientFactory } from '../client';
import { logger } from '../utils/logger';
import { createAuthRequiredError } from '../utils/error-handler';
import { assignUsers, unassignUsers, listAssignees } from '../tools/tasks/assignees/index';

/**
 * Register task assignees tool
 */
export function registerTaskAssigneesTool(
  server: McpServer,
  authManager: AuthManager,
  clientFactory?: VikunjaClientFactory
): void {
  server.tool(
    'vikunja_task_assignees',
    'Manage task assignments: assign users, unassign users, list assignees',
    {
      operation: z.enum(['assign', 'unassign', 'list-assignees']),
      // Task and user identification
      id: z.number(),
      assignees: z.array(z.number()).optional(),
    },
    async (args) => {
      try {
        logger.debug('Executing task assignees tool', { operation: args.operation, taskId: args.id, assigneeCount: args.assignees?.length });

        // Check authentication
        if (!authManager.isAuthenticated()) {
          throw createAuthRequiredError('access task assignment operations');
        }

        // Set the client factory for this request if provided
        if (clientFactory) {
          await setGlobalClientFactory(clientFactory);
        }

        // Test client connection
        await getClientFromContext();

        switch (args.operation) {
          case 'assign':
            return assignUsers({
              id: args.id,
              assignees: args.assignees || []
            });

          case 'unassign':
            return unassignUsers({
              id: args.id,
              assignees: args.assignees || []
            });

          case 'list-assignees':
            return listAssignees(args);

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
          `Task assignee operation error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}