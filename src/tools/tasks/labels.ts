/**
 * Label operations for tasks
 */

import type { MinimalTask } from '../../types';
import { MCPError, ErrorCode } from '../../types';
import { getClientFromContext } from '../../client';
import { isAuthenticationError } from '../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../utils/retry';
import { validateId } from './validation';
import { createSimpleResponse, formatAorpAsMarkdown } from '../../utils/response-factory';

/**
 * Detects Vikunja's "label already exists on the task" response so that a
 * duplicate label can be treated as a no-op rather than a fatal error.
 */
function isLabelAlreadyOnTaskError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.toLowerCase().includes('already exists');
}

/**
 * Add labels to a task
 *
 * Idempotent: labels already on the task are skipped instead of aborting the
 * whole operation. Vikunja rejects a duplicate label with "label already
 * exists on the task"; treating that as fatal previously stopped the loop and
 * left the remaining requested labels unapplied.
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
    // Deduplicate so a repeated id is not applied or counted twice
    const requestedLabelIds = [...new Set(args.labels)];

    // Skip labels already on the task: applying a duplicate makes Vikunja
    // reject the request, so pre-filtering keeps the operation idempotent.
    const alreadyPresent: number[] = [];
    let toApply = requestedLabelIds;
    try {
      const currentLabels = await client.tasks.getTaskLabels(taskId);
      const existingIds = new Set(
        (Array.isArray(currentLabels) ? currentLabels : [])
          .map((label) => label.id)
          .filter((id): id is number => typeof id === 'number'),
      );
      toApply = requestedLabelIds.filter((id) => {
        if (existingIds.has(id)) {
          alreadyPresent.push(id);
          return false;
        }
        return true;
      });
    } catch {
      // Current labels could not be read; attempt every requested label.
      // A duplicate is still tolerated per-label below.
    }

    // Add the remaining labels to the task with retry logic
    const newlyApplied: number[] = [];
    for (const labelId of toApply) {
      try {
        await withRetry(
          () =>
            client.tasks.addLabelToTask(taskId, {
              task_id: taskId,
              label_id: labelId,
            }),
          {
            ...RETRY_CONFIG.AUTH_ERRORS,
            shouldRetry: (error: unknown) => isAuthenticationError(error),
          },
        );
        newlyApplied.push(labelId);
      } catch (labelError) {
        // Check if it's an auth error after retries
        if (isAuthenticationError(labelError)) {
          throw new MCPError(
            ErrorCode.API_ERROR,
            `Failed to apply label to task (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`,
          );
        }
        // A label already on the task is not a failure: skip it and keep
        // applying the rest instead of aborting the whole operation.
        if (isLabelAlreadyOnTaskError(labelError)) {
          alreadyPresent.push(labelId);
          continue;
        }
        throw labelError;
      }
    }

    // Fetch the updated task to show current labels
    const task = await client.tasks.getTask(taskId);

    let message: string;
    if (newlyApplied.length > 0) {
      message = `Label${newlyApplied.length > 1 ? 's' : ''} applied to task successfully`;
      if (alreadyPresent.length > 0) {
        message += ` (${alreadyPresent.length} already present, skipped)`;
      }
    } else {
      message = `No labels applied: all ${alreadyPresent.length} requested label(s) already present on the task`;
    }

    const response = createSimpleResponse(
      'apply-label',
      message,
      { task },
      {
        metadata: {
          affectedFields: ['labels'],
          labelsApplied: newlyApplied,
          labelsAlreadyPresent: alreadyPresent,
        },
      }
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response),
        },
      ],
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
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
          shouldRetry: (error: unknown) => isAuthenticationError(error),
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

    const response = createSimpleResponse(
      'remove-label',
      `Label${labelIds.length > 1 ? 's' : ''} removed from task successfully`,
      { task },
      { metadata: { affectedFields: ['labels'] } }
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response),
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
 *
 * Reads the labels from the dedicated GET /tasks/{id}/labels endpoint. The
 * labels array embedded in a getTask response is not reliably populated, so
 * relying on it reported zero labels on tasks that actually had some.
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

    // Authoritative source for a task's labels
    const taskLabels = await client.tasks.getTaskLabels(args.id);
    const labels = Array.isArray(taskLabels) ? taskLabels : [];

    // Fetch the task itself only for its identifying fields
    const task = await client.tasks.getTask(args.id);

    const minimalTask: MinimalTask = {
      ...(task.id !== undefined && { id: task.id }),
      title: task.title,
    };

    const response = createSimpleResponse(
      'list-labels',
      `Task has ${labels.length} label(s)`,
      { task: { ...minimalTask, labels: labels } },
      { metadata: { count: labels.length } }
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response),
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
