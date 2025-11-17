/**
 * Task Read Service
 * Handles task retrieval operations with comprehensive error handling
 */

import { MCPError, ErrorCode } from '../../../types/index';
import { getClientFromContext } from '../../../client';
import type { Task } from 'node-vikunja';
import { validateId } from '../validation';
import { transformApiError, handleFetchError, handleStatusCodeError } from '../../../utils/error-handler';
import { createTaskResponse } from './TaskResponseFormatter';
import type { AorpBuilderConfig } from '../../../aorp/types';

export interface GetTaskArgs {
  id?: number;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
  aorpConfig?: AorpBuilderConfig;
  sessionId?: string;
}

/**
 * Retrieves a task by ID with comprehensive error handling
 */
export async function getTask(args: GetTaskArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for get operation');
    }
    validateId(args.id, 'id');

    const client = await getClientFromContext();
    const task = await client.tasks.getTask(args.id);

    const response = createTaskResponse(
      'get-task',
      `Retrieved task "${task.title}"`,
      { task },
      {
        timestamp: new Date().toISOString(),
        taskId: args.id,
      },
      args.verbosity,
      args.useOptimizedFormat,
      args.useAorp,
      args.aorpConfig,
      args.sessionId
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    // Re-throw MCPError instances without modification
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle fetch/connection errors with helpful guidance
    if (error instanceof Error && (
      error.message.includes('fetch failed') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND')
    )) {
      throw handleFetchError(error, 'get task');
    }

    // Use standardized error transformation for all other errors
    if (args.id) {
      throw handleStatusCodeError(error, 'get task', args.id, `Task with ID ${args.id} not found`);
    }
    throw transformApiError(error, 'Failed to get task');
  }
}