/**
 * Task Creation Service
 * Handles task creation with label/assignee management and rollback logic
 */

import { MCPError, ErrorCode } from '../../../types/index';
import { getClientFromContext } from '../../../client';
import type { Task } from 'node-vikunja';
import { logger } from '../../../utils/logger';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { AUTH_ERROR_MESSAGES } from '../constants';
import { validateDateString, validateId, convertRepeatConfiguration } from '../validation';
import { createTaskResponse } from './TaskResponseFormatter';
import type { AorpBuilderConfig } from '../../../aorp/types';

export interface CreateTaskArgs {
  projectId?: number;
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: number;
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
 * Internal interface for tracking creation state during rollback scenarios
 */
interface CreationState {
  createdTask: Task;
  labelsAdded: boolean;
  assigneesAdded: boolean;
}

/**
 * Creates a new task with comprehensive error handling and rollback support
 */
export async function createTask(args: CreateTaskArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    // Validate required fields
    if (!args.projectId) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'projectId is required to create a task');
    }
    validateId(args.projectId, 'projectId');

    if (!args.title) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'title is required to create a task');
    }

    // Validate optional date fields
    if (args.dueDate) {
      validateDateString(args.dueDate, 'dueDate');
    }

    // Validate assignee IDs upfront
    if (args.assignees && args.assignees.length > 0) {
      args.assignees.forEach((id) => validateId(id, 'assignee ID'));
    }

    const client = await getClientFromContext();

    // Build the initial task object
    const newTask: Task = {
      title: args.title,
      project_id: args.projectId,
    };

    // Add optional fields
    if (args.description !== undefined) newTask.description = args.description;
    if (args.dueDate !== undefined) newTask.due_date = args.dueDate;
    if (args.priority !== undefined) newTask.priority = args.priority;

    // Handle repeat configuration
    if (args.repeatAfter !== undefined || args.repeatMode !== undefined) {
      const repeatConfig = convertRepeatConfiguration(args.repeatAfter, args.repeatMode);
      if (repeatConfig.repeat_after !== undefined) newTask.repeat_after = repeatConfig.repeat_after;
      if (repeatConfig.repeat_mode !== undefined) {
        // Use index signature to bypass type mismatch - API expects number but node-vikunja types expect string
        (newTask as Record<string, unknown>).repeat_mode = repeatConfig.repeat_mode;
      }
    }

    // Create the base task
    const createdTask = await client.tasks.createTask(args.projectId, newTask);

    // Track creation state for potential rollback
    const creationState: CreationState = {
      createdTask,
      labelsAdded: false,
      assigneesAdded: false
    };

    try {
      // Add labels if provided
      if (args.labels && args.labels.length > 0 && createdTask.id) {
        await addLabelsToTask(client, createdTask.id, args.labels);
        creationState.labelsAdded = true;
      }

      // Add assignees if provided
      if (args.assignees && args.assignees.length > 0 && createdTask.id) {
        await addAssigneesToTask(client, createdTask.id, args.assignees);
        creationState.assigneesAdded = true;
      }

    } catch (updateError) {
      // Attempt to clean up the partially created task
      await rollbackTaskCreation(client, creationState, updateError);
      // The rollback function will re-throw the original error with context
    }

    // Fetch the complete task with labels and assignees
    const completeTask = createdTask.id ? await client.tasks.getTask(createdTask.id) : createdTask;

    const response = createTaskResponse(
      'create-task',
      'Task created successfully',
      { task: completeTask },
      {
        timestamp: new Date().toISOString(),
        projectId: args.projectId,
        labelsAdded: args.labels ? args.labels.length > 0 : false,
        assigneesAdded: args.assignees ? args.assignees.length > 0 : false,
      },
      args.verbosity,
      args.useOptimizedFormat,
      args.useAorp,
      args.aorpConfig,
      args.sessionId
    );

    logger.debug('Tasks tool response', {
      subcommand: 'create',
      taskId: completeTask.id,
    });

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
      `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Adds labels to a task with retry logic for authentication errors
 */
async function addLabelsToTask(client: any, taskId: number, labelIds: number[]): Promise<void> {
  try {
    await withRetry(
      () => client.tasks.updateTaskLabels(taskId, {
        label_ids: labelIds,
      }),
      {
        ...RETRY_CONFIG.AUTH_ERRORS,
        shouldRetry: (error) => isAuthenticationError(error)
      }
    );
  } catch (labelError) {
    // Check if it's an auth error after retries
    if (isAuthenticationError(labelError)) {
      throw new MCPError(
        ErrorCode.API_ERROR,
        `${AUTH_ERROR_MESSAGES.LABEL_CREATE} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times). Task ID: ${taskId}`,
      );
    }
    throw labelError;
  }
}

/**
 * Adds assignees to a task with retry logic for authentication errors
 */
async function addAssigneesToTask(client: any, taskId: number, assigneeIds: number[]): Promise<void> {
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
        `${AUTH_ERROR_MESSAGES.ASSIGNEE_CREATE} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times). Task ID: ${taskId}`,
      );
    }
    throw assigneeError;
  }
}

/**
 * Attempts to roll back a partially created task and throws enhanced error context
 */
async function rollbackTaskCreation(
  client: any,
  creationState: CreationState,
  originalError: unknown
): Promise<never> {
  // Attempt to clean up the partially created task
  let rollbackSucceeded = false;
  if (creationState.createdTask.id) {
    try {
      await client.tasks.deleteTask(creationState.createdTask.id);
      rollbackSucceeded = true;
    } catch (deleteError) {
      // Log the cleanup failure but throw the original error
      logger.error('Failed to clean up partially created task:', deleteError);
    }
  }

  // Re-throw the original error with context
  const errorMessage = `Failed to complete task creation: ${originalError instanceof Error ? originalError.message : String(originalError)}. ${
    rollbackSucceeded
      ? 'Task was successfully rolled back.'
      : 'Task rollback also failed - manual cleanup may be required.'
  }`;

  throw new MCPError(ErrorCode.API_ERROR, errorMessage, {
    vikunjaError: {
      taskId: creationState.createdTask.id,
      partiallyCreated: true,
      labelsAdded: creationState.labelsAdded,
      assigneesAdded: creationState.assigneesAdded,
      rollbackSucceeded,
    },
  });
}