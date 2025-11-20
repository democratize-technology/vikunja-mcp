/**
 * Label operations for tasks
 */

import type { StandardTaskResponse, MinimalTask } from '../../types/index';
import { MCPError, ErrorCode } from '../../types/index';
import { getClientFromContext } from '../../client';
import { isAuthenticationError } from '../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../utils/retry';
import { validateId } from './validation';
import { formatAorpAsMarkdown } from '../../aorp/markdown';

/**
 * Add labels to a task
 */
export async function applyLabels(args: {
  id?: number;
  labels?: number[];
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Task id is required for apply-label operation',
      );
    }
    validateId(args.id, 'id');

    if (!args.labels || args.labels.length === 0) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'At least one label id is required');
    }

    // Validate label IDs
    args.labels.forEach((id) => validateId(id, 'label ID'));

    const client = await getClientFromContext();
    const taskId = args.id;
    const labelIds = args.labels;

    // Add labels to the task with retry logic
    for (const labelId of labelIds) {
      try {
        await withRetry(
          () =>
            client.tasks.addLabelToTask(taskId, {
              task_id: taskId,
              label_id: labelId,
            }),
          {
            ...RETRY_CONFIG.AUTH_ERRORS,
            shouldRetry: (error) => isAuthenticationError(error),
          },
        );
      } catch (labelError) {
        // Check if it's an auth error after retries
        if (isAuthenticationError(labelError)) {
          throw new MCPError(
            ErrorCode.API_ERROR,
            `Failed to apply label to task (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`,
          );
        }
        throw labelError;
      }
    }

    // Fetch the updated task to show current labels
    const task = await client.tasks.getTask(args.id);

    const response: StandardTaskResponse = {
      success: true,
      operation: 'update',
      message: `Label${labelIds.length > 1 ? 's' : ''} applied to task successfully`,
      task: task,
      metadata: {
        timestamp: new Date().toISOString(),
        affectedFields: ['labels'],
      },
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response as any),
        },
      ],
    };
  } catch (error) {
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to apply labels to task: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Remove labels from a task
 */
export async function removeLabels(args: {
  id?: number;
  labels?: number[];
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Task id is required for remove-label operation',
      );
    }
    validateId(args.id, 'id');

    if (!args.labels || args.labels.length === 0) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'At least one label id is required to remove');
    }

    // Validate label IDs
    args.labels.forEach((id) => validateId(id, 'label ID'));

    const client = await getClientFromContext();
    const taskId = args.id;
    const labelIds = args.labels;

    // Remove labels from the task with retry logic
    for (const labelId of labelIds) {
      try {
        await withRetry(() => client.tasks.removeLabelFromTask(taskId, labelId), {
          ...RETRY_CONFIG.AUTH_ERRORS,
          shouldRetry: (error) => isAuthenticationError(error),
        });
      } catch (removeError) {
        // Check if it's an auth error after retries
        if (isAuthenticationError(removeError)) {
          throw new MCPError(
            ErrorCode.API_ERROR,
            `Failed to remove label from task (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`,
          );
        }
        throw removeError;
      }
    }

    // Fetch the updated task to show current labels
    const task = await client.tasks.getTask(args.id);

    const response: StandardTaskResponse = {
      success: true,
      operation: 'update',
      message: `Label${labelIds.length > 1 ? 's' : ''} removed from task successfully`,
      task: task,
      metadata: {
        timestamp: new Date().toISOString(),
        affectedFields: ['labels'],
      },
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response as any),
        },
      ],
    };
  } catch (error) {
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to remove labels from task: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * List labels of a task
 */
export async function listTaskLabels(args: {
  id?: number;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (args.id === undefined) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Task id is required for list-labels operation',
      );
    }
    validateId(args.id, 'id');

    const client = await getClientFromContext();

    // Fetch the task to get current labels
    const task = await client.tasks.getTask(args.id);

    const labels = task.labels || [];

    const minimalTask: MinimalTask = {
      ...(task.id !== undefined && { id: task.id }),
      title: task.title,
    };

    const response: StandardTaskResponse = {
      success: true,
      operation: 'get',
      message: `Task has ${labels.length} label(s)`,
      task: { ...minimalTask, labels: labels },
      metadata: {
        timestamp: new Date().toISOString(),
        count: labels.length,
      },
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response as any),
        },
      ],
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to list task labels: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
