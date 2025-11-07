/**
 * Task Read Service
 * Handles task retrieval operations with comprehensive error handling
 */

import { MCPError, ErrorCode } from '../../../types/index';
import { getClientFromContext } from '../../../client';
import type { Task } from 'node-vikunja';
import { validateId } from '../validation';
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
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to get task: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}