/**
 * Assignee operations for tasks
 */

import type { StandardTaskResponse, MinimalTask } from '../../types/index';
import { MCPError, ErrorCode } from '../../types/index';
import { getClientFromContext } from '../../client';
import { isAuthenticationError } from '../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../utils/retry';
import { AUTH_ERROR_MESSAGES } from './constants';
import { validateId } from './validation';

/**
 * Assign users to a task
 */
export async function assignUsers(args: {
  id?: number;
  assignees?: number[];
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for assign operation');
    }
    validateId(args.id, 'id');

    if (!args.assignees || args.assignees.length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'At least one assignee (user id) is required',
      );
    }

    // Validate assignee IDs
    args.assignees.forEach((id) => validateId(id, 'assignee ID'));

    const client = await getClientFromContext();
    const taskId = args.id;
    const assigneeIds = args.assignees;

    // Assign users to the task with retry logic
    try {
      await withRetry(
        () => client.tasks.bulkAssignUsersToTask(taskId, {
          user_ids: assigneeIds,
        }),
        {
          ...RETRY_CONFIG.AUTH_ERRORS,
          shouldRetry: (error) => isAuthenticationError(error)
        }
      );
    } catch (assigneeError) {
      // Check if it's an auth error after retries
      if (isAuthenticationError(assigneeError)) {
        throw new MCPError(
          ErrorCode.API_ERROR, 
          `${AUTH_ERROR_MESSAGES.ASSIGNEE_ASSIGN} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`
        );
      }
      throw assigneeError;
    }

    // Fetch the updated task to show current assignees
    const task = await client.tasks.getTask(args.id);

    const response: StandardTaskResponse = {
      success: true,
      operation: 'assign',
      message: 'Users assigned to task successfully',
      task: task,
      metadata: {
        timestamp: new Date().toISOString(),
        affectedFields: ['assignees'],
      },
    };

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
      `Failed to assign users to task: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Unassign users from a task
 */
export async function unassignUsers(args: {
  id?: number;
  assignees?: number[];
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for unassign operation');
    }
    validateId(args.id, 'id');

    if (!args.assignees || args.assignees.length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'At least one assignee (user id) is required to unassign',
      );
    }

    // Validate assignee IDs
    args.assignees.forEach((id) => validateId(id, 'assignee ID'));

    const client = await getClientFromContext();
    const taskId = args.id;
    const assigneeIds = args.assignees;

    // Remove users from the task with retry logic
    for (const userId of assigneeIds) {
      try {
        await withRetry(
          () => client.tasks.removeUserFromTask(taskId, userId),
          {
            ...RETRY_CONFIG.AUTH_ERRORS,
            shouldRetry: (error) => isAuthenticationError(error)
          }
        );
      } catch (removeError) {
        // Check if it's an auth error after retries
        if (isAuthenticationError(removeError)) {
          throw new MCPError(
            ErrorCode.API_ERROR, 
            `${AUTH_ERROR_MESSAGES.ASSIGNEE_REMOVE} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`
          );
        }
        throw removeError;
      }
    }

    // Fetch the updated task to show current assignees
    const task = await client.tasks.getTask(args.id);

    const response: StandardTaskResponse = {
      success: true,
      operation: 'unassign',
      message: 'Users removed from task successfully',
      task: task,
      metadata: {
        timestamp: new Date().toISOString(),
        affectedFields: ['assignees'],
      },
    };

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
      `Failed to remove users from task: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * List assignees of a task
 */
export async function listAssignees(args: {
  id?: number;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (args.id === undefined) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Task id is required for list-assignees operation',
      );
    }
    validateId(args.id, 'id');

    const client = await getClientFromContext();

    // Fetch the task to get current assignees
    const task = await client.tasks.getTask(args.id);

    const assignees = task.assignees || [];

    const minimalTask: MinimalTask = {
      ...(task.id !== undefined && { id: task.id }),
      title: task.title,
      assignees: assignees,
    };

    const response: StandardTaskResponse = {
      success: true,
      operation: 'get',
      message: `Task has ${assignees.length} assignee(s)`,
      task: minimalTask,
      metadata: {
        timestamp: new Date().toISOString(),
        count: assignees.length,
      },
    };

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
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to list task assignees: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}