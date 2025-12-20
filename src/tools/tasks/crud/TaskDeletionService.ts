/**
 * Task Deletion Service
 * Handles task deletion with graceful error handling and response formatting
 */

import { MCPError, ErrorCode } from '../../../types';
import { getClientFromContext } from '../../../client';
import type { Task, VikunjaClient } from 'node-vikunja';
import { validateId } from '../validation';
import { transformApiError, handleFetchError, handleStatusCodeError } from '../../../utils/error-handler';
import { createTaskResponse } from './TaskResponseFormatter';
import { formatAorpAsMarkdown } from '../../../utils/response-factory';

export interface DeleteTaskArgs {
  id?: number;
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
      undefined, // verbosity (ignored)
      undefined, // useOptimizedFormat (ignored)
      undefined, // useAorp (ignored)
      undefined, // aorpConfig (using auto-generated)
      args.sessionId
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response.response),
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
      throw handleFetchError(error, 'delete task');
    }

    // Use standardized error transformation for all other errors
    if (args.id) {
      throw handleStatusCodeError(error, 'delete task', args.id, `Task with ID ${args.id} not found`);
    }
    throw transformApiError(error, 'Failed to delete task');
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
  } catch {
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