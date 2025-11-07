/**
 * Task Deletion Service
 * Handles task deletion with graceful error handling and response formatting
 */

import { MCPError, ErrorCode } from '../../../types/index';
import { getClientFromContext } from '../../../client';
import type { Task, VikunjaClient } from 'node-vikunja';
import { validateId } from '../validation';
import { createTaskResponse } from './TaskResponseFormatter';
import type { AorpBuilderConfig } from '../../../aorp/types';

export interface DeleteTaskArgs {
  id?: number;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
  aorpConfig?: AorpBuilderConfig;
  sessionId?: string;
}

/**
 * Deletes a task with graceful error handling and informative response
 */
export async function deleteTask(args: DeleteTaskArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for delete operation');
    }
    validateId(args.id, 'id');

    const client = await getClientFromContext();

    // Try to get task before deletion for response, but handle failure gracefully
    const deletionContext = await gatherDeletionContext(client, args.id);

    // Perform the deletion
    await client.tasks.deleteTask(args.id);

    const response = createTaskResponse(
      'delete-task',
      deletionContext.taskToDelete
        ? `Task "${deletionContext.taskToDelete.title}" deleted successfully`
        : `Task ${args.id} deleted successfully`,
      deletionContext.taskToDelete ? { task: deletionContext.taskToDelete } : { deletedTaskId: args.id },
      {
        timestamp: new Date().toISOString(),
        taskId: args.id,
        ...(deletionContext.taskToDelete?.title && { taskTitle: deletionContext.taskToDelete.title }),
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
      `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Internal interface for deletion context information
 */
interface DeletionContext {
  taskToDelete: Task | undefined;
  retrievalSuccess: boolean;
}

/**
 * Gathers information about the task before deletion for better response messaging
 * Handles cases where the task might not exist or be accessible
 */
async function gatherDeletionContext(client: VikunjaClient, taskId: number): Promise<DeletionContext> {
  let taskToDelete: Task | undefined;
  let retrievalSuccess = false;

  try {
    taskToDelete = await client.tasks.getTask(taskId);
    retrievalSuccess = true;
  } catch (error) {
    // If we can't get the task, proceed with deletion anyway
    // This handles cases where the task exists but isn't accessible due to permissions
    // or the task is already deleted/inconsistent state
    taskToDelete = undefined;
    retrievalSuccess = false;
  }

  return {
    taskToDelete,
    retrievalSuccess
  };
}