/**
 * Task Relations Extensions
 * Handles task relation operations for Vikunja
 */

import { z } from 'zod';
import { MCPError, ErrorCode } from '../types/index';
import type { StandardTaskResponse } from '../types/index';
import type { SimpleResponse } from '../utils/simple-response';
import { getClientFromContext } from '../client';
import { logger } from '../utils/logger';
import { validateId as validateSharedId } from '../utils/validation';
import { wrapToolError } from '../utils/error-handler';
import type { RelationKind } from 'node-vikunja';
import { formatAorpAsMarkdown, createStandardResponse } from '../utils/response-factory';

// Use shared validateId from utils/validation

// Relation kind mapping - matches the node-vikunja RelationKind enum
const RELATION_KIND_MAP: Record<string, string> = {
  unknown: 'unknown',
  subtask: 'subtask',
  parenttask: 'parenttask',
  related: 'related',
  duplicateof: 'duplicateof',
  duplicates: 'duplicates',
  blocking: 'blocking',
  blocked: 'blocked',
  precedes: 'precedes',
  follows: 'follows',
  copiedfrom: 'copiedfrom',
  copiedto: 'copiedto',
};

export const relationSchema = {
  // Relation fields
  otherTaskId: z.number().optional(),
  relationKind: z
    .enum([
      'unknown',
      'subtask',
      'parenttask',
      'related',
      'duplicateof',
      'duplicates',
      'blocking',
      'blocked',
      'precedes',
      'follows',
      'copiedfrom',
      'copiedto',
    ])
    .optional(),
};

export const relationSubcommands = ['relate', 'unrelate', 'relations'];

interface RelationArgs {
  subcommand: string;
  id?: number | undefined;
  otherTaskId?: number | undefined;
  relationKind?: string | undefined;
}

export async function handleRelationSubcommands(
  args: RelationArgs,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const client = await getClientFromContext();

  switch (args.subcommand) {
    case 'relate': {
      try {
        if (!args.id) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task ID is required');
        }
        validateSharedId(args.id, 'Task ID');

        if (!args.otherTaskId) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Other task ID is required');
        }
        validateSharedId(args.otherTaskId, 'Other task ID');

        if (!args.relationKind) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Relation kind is required');
        }

        const relationKind = RELATION_KIND_MAP[args.relationKind];
        if (!relationKind) {
          throw new MCPError(
            ErrorCode.VALIDATION_ERROR,
            `Invalid relation kind: ${args.relationKind}`,
          );
        }

        // Create the relation
        await client.tasks.createTaskRelation(args.id, {
          task_id: args.id,
          other_task_id: args.otherTaskId,
          relation_kind: relationKind as RelationKind,
        });

        // Fetch the updated task to show all relations
        const updatedTask = await client.tasks.getTask(args.id);

        const response: StandardTaskResponse = {
          success: true,
          operation: 'relate',
          message: `Successfully created ${args.relationKind} relation between task ${args.id} and task ${args.otherTaskId}`,
          task: updatedTask,
          metadata: {
            timestamp: new Date().toISOString(),
            affectedFields: ['related_tasks'],
          },
        };

        logger.debug('Task relation created', {
          taskId: args.id,
          otherTaskId: args.otherTaskId,
          relationKind: args.relationKind,
        });

        // Convert StandardTaskResponse to proper AORP response before formatting
        const aorpResponse = createStandardResponse(
          response.operation || 'unknown',
          response.message || 'Operation completed',
          response,
          response.metadata as Record<string, unknown>
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: formatAorpAsMarkdown(aorpResponse),
            },
          ],
        };
      } catch (error) {
        throw wrapToolError(error, 'vikunja_tasks_relations', 'create task relation', `${args.id}-${args.otherTaskId}`);
      }
    }

    case 'unrelate': {
      try {
        if (!args.id) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task ID is required');
        }
        validateSharedId(args.id, 'Task ID');

        if (!args.otherTaskId) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Other task ID is required');
        }
        validateSharedId(args.otherTaskId, 'Other task ID');

        if (!args.relationKind) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Relation kind is required');
        }

        const relationKind = RELATION_KIND_MAP[args.relationKind];
        if (!relationKind) {
          throw new MCPError(
            ErrorCode.VALIDATION_ERROR,
            `Invalid relation kind: ${args.relationKind}`,
          );
        }

        // Delete the relation
        await client.tasks.deleteTaskRelation(
          args.id,
          relationKind as RelationKind,
          args.otherTaskId,
        );

        // Fetch the updated task to show remaining relations
        const updatedTask = await client.tasks.getTask(args.id);

        const response: StandardTaskResponse = {
          success: true,
          operation: 'unrelate',
          message: `Successfully removed ${args.relationKind} relation between task ${args.id} and task ${args.otherTaskId}`,
          task: updatedTask,
          metadata: {
            timestamp: new Date().toISOString(),
            affectedFields: ['related_tasks'],
          },
        };

        logger.debug('Task relation removed', {
          taskId: args.id,
          otherTaskId: args.otherTaskId,
          relationKind: args.relationKind,
        });

        // Convert StandardTaskResponse to proper AORP response before formatting
        const aorpResponse = createStandardResponse(
          response.operation || 'unknown',
          response.message || 'Operation completed',
          response,
          response.metadata as Record<string, unknown>
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: formatAorpAsMarkdown(aorpResponse),
            },
          ],
        };
      } catch (error) {
        throw wrapToolError(error, 'vikunja_tasks_relations', 'remove task relation', `${args.id}-${args.otherTaskId}`);
      }
    }

    case 'relations': {
      try {
        if (!args.id) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task ID is required');
        }
        validateSharedId(args.id, 'Task ID');

        // Fetch the task with its relations
        const task = await client.tasks.getTask(args.id);

        const response: StandardTaskResponse = {
          success: true,
          operation: 'relations',
          message: `Found ${task.related_tasks?.length || 0} relations for task ${args.id}`,
          task: task,
          metadata: {
            timestamp: new Date().toISOString(),
            count: task.related_tasks?.length || 0,
          },
        };

        logger.debug('Task relations retrieved', {
          taskId: args.id,
          relationCount: task.related_tasks?.length || 0,
        });

        // Convert StandardTaskResponse to proper AORP response before formatting
        const aorpResponse = createStandardResponse(
          response.operation || 'unknown',
          response.message || 'Operation completed',
          response,
          response.metadata as Record<string, unknown>
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: formatAorpAsMarkdown(aorpResponse),
            },
          ],
        };
      } catch (error) {
        throw wrapToolError(error, 'vikunja_tasks_relations', 'get task relations', args.id);
      }
    }

    default:
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid relation subcommand');
  }
}
