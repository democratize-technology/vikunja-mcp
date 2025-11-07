/**
 * Task Update Service
 * Handles task updates with field diffing and relationship management
 */

import { MCPError, ErrorCode } from '../../../types/index';
import { getClientFromContext } from '../../../client';
import type { Task } from 'node-vikunja';
import { validateDateString, validateId, convertRepeatConfiguration } from '../validation';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { AUTH_ERROR_MESSAGES } from '../constants';
import { createTaskResponse } from './TaskResponseFormatter';
import type { AorpBuilderConfig } from '../../../aorp/types';

export interface UpdateTaskArgs {
  id?: number;
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: number;
  done?: boolean;
  labels?: number[];
  assignees?: number[];
  repeatAfter?: number;
  repeatMode?: 'day' | 'week' | 'month' | 'year';
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
  aorpConfig?: AorpBuilderConfig;
  sessionId?: string;
}

/**
 * Internal interface for tracking update state and field changes
 */
interface UpdateState {
  currentTask: Task;
  previousState: Partial<Task>;
  affectedFields: string[];
}

/**
 * Updates a task with comprehensive field diffing and relationship management
 */
export async function updateTask(args: UpdateTaskArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for update operation');
    }
    validateId(args.id, 'id');

    // Validate date if provided
    if (args.dueDate) {
      validateDateString(args.dueDate, 'dueDate');
    }

    const client = await getClientFromContext();

    // Analyze current state and track changes
    const updateState = await analyzeUpdateState(client, args.id, args);

    // Build and apply the update
    const updateData = buildUpdateData(updateState.currentTask, args);
    await client.tasks.updateTask(args.id, updateData);

    // Update labels if provided
    if (args.labels !== undefined) {
      await updateTaskLabels(client, args.id, args.labels);
    }

    // Update assignees if provided
    if (args.assignees !== undefined) {
      await updateTaskAssignees(client, args.id, args.assignees);
    }

    // Fetch the complete updated task
    const completeTask = await client.tasks.getTask(args.id);

    const response = createTaskResponse(
      'update-task',
      'Task updated successfully',
      { task: completeTask },
      {
        timestamp: new Date().toISOString(),
        affectedFields: updateState.affectedFields,
        previousState: updateState.previousState as Partial<Task>,
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
    if (error instanceof MCPError) {
      throw error;
    }
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to update task: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Analyzes the current task state and determines which fields are being updated
 */
async function analyzeUpdateState(client: any, taskId: number, args: UpdateTaskArgs): Promise<UpdateState> {
  // Fetch the current task to preserve all fields and track changes
  const currentTask = await client.tasks.getTask(taskId);
  const previousState = {
    title: currentTask.title,
    description: currentTask.description,
    due_date: currentTask.due_date,
    priority: currentTask.priority,
    done: currentTask.done,
    repeat_after: currentTask.repeat_after,
    repeat_mode: currentTask.repeat_mode,
  };

  // Track which fields are being updated
  const affectedFields: string[] = [];

  if (args.title !== undefined && args.title !== currentTask.title) affectedFields.push('title');
  if (args.description !== undefined && args.description !== currentTask.description) affectedFields.push('description');
  if (args.dueDate !== undefined && args.dueDate !== currentTask.due_date) affectedFields.push('dueDate');
  if (args.priority !== undefined && args.priority !== currentTask.priority) affectedFields.push('priority');
  if (args.done !== undefined && args.done !== currentTask.done) affectedFields.push('done');
  if (args.repeatAfter !== undefined && args.repeatAfter !== currentTask.repeat_after) affectedFields.push('repeatAfter');
  if (args.repeatMode !== undefined && args.repeatMode !== currentTask.repeat_mode) affectedFields.push('repeatMode');
  if (args.labels !== undefined) affectedFields.push('labels');
  if (args.assignees !== undefined) affectedFields.push('assignees');

  return {
    currentTask,
    previousState,
    affectedFields
  };
}

/**
 * Builds the update data object by merging current task data with updates
 * This prevents the API from clearing fields that aren't explicitly updated
 */
function buildUpdateData(currentTask: Task, args: UpdateTaskArgs): Task {
  const updateData: Task = {
    ...currentTask,
    // Override with any provided updates
    ...(args.title !== undefined && { title: args.title }),
    ...(args.description !== undefined && { description: args.description }),
    ...(args.dueDate !== undefined && { due_date: args.dueDate }),
    ...(args.priority !== undefined && { priority: args.priority }),
    ...(args.done !== undefined && { done: args.done }),
    // Handle repeat configuration for updates
    ...(args.repeatAfter !== undefined || args.repeatMode !== undefined
      ? ((): Record<string, unknown> => {
          const repeatConfig = convertRepeatConfiguration(
            args.repeatAfter !== undefined ? args.repeatAfter : currentTask.repeat_after,
            args.repeatMode !== undefined ? args.repeatMode : undefined,
          );
          const updates: Record<string, unknown> = {};
          if (repeatConfig.repeat_after !== undefined)
            updates.repeat_after = repeatConfig.repeat_after;
          if (repeatConfig.repeat_mode !== undefined) updates.repeat_mode = repeatConfig.repeat_mode;
          return updates;
        })()
      : {}),
  };

  return updateData;
}

/**
 * Updates task labels with authentication error handling
 */
async function updateTaskLabels(client: any, taskId: number, labelIds: number[]): Promise<void> {
  try {
    await client.tasks.updateTaskLabels(taskId, {
      label_ids: labelIds,
    });
  } catch (labelError) {
    // Check if it's an auth error
    if (isAuthenticationError(labelError)) {
      throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.LABEL_UPDATE);
    }
    throw labelError;
  }
}

/**
 * Updates task assignees with diff calculation and authentication error handling
 */
async function updateTaskAssignees(client: any, taskId: number, newAssigneeIds: number[]): Promise<void> {
  try {
    // Get current assignees to calculate diff
    const currentTask = await client.tasks.getTask(taskId);
    const currentAssigneeIds = currentTask.assignees?.map((a: any) => a.id) || [];

    // Calculate which assignees to add and remove
    const toAdd = newAssigneeIds.filter((id) => !currentAssigneeIds.includes(id));
    const toRemove = currentAssigneeIds.filter((id) => !newAssigneeIds.includes(id));

    // Add new assignees first to avoid leaving task unassigned if removal fails
    if (toAdd.length > 0) {
      await client.tasks.bulkAssignUsersToTask(taskId, {
        user_ids: toAdd,
      });
    }

    // Remove old assignees only after new ones are successfully added
    for (const userId of toRemove) {
      try {
        await client.tasks.removeUserFromTask(taskId, userId);
      } catch (removeError) {
        // Check if it's an auth error on remove
        if (isAuthenticationError(removeError)) {
          throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.ASSIGNEE_REMOVE_PARTIAL);
        }
        throw removeError;
      }
    }
  } catch (assigneeError) {
    // Check if it's an auth error after retries
    if (isAuthenticationError(assigneeError)) {
      throw new MCPError(
        ErrorCode.API_ERROR,
        `${AUTH_ERROR_MESSAGES.ASSIGNEE_UPDATE} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`
      );
    }
    throw assigneeError;
  }
}