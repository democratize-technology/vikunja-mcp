/**
 * CRUD operations for tasks
 */

import { MCPError, ErrorCode, createStandardResponse, type TaskResponseData, type TaskResponseMetadata, type QualityIndicatorFunction } from '../../types/index';
import { getClientFromContext } from '../../client';
import type { Task } from 'node-vikunja';
import { logger } from '../../utils/logger';
import { createAorpEnabledFactory } from '../../utils/response-factory';
import type { Verbosity } from '../../transforms/index';
import type { AorpBuilderConfig, AorpTransformationContext } from '../../aorp/types';
import { isAuthenticationError } from '../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../utils/retry';
import { AUTH_ERROR_MESSAGES } from './constants';
import { validateDateString, validateId, convertRepeatConfiguration } from './validation';

/**
 * Helper function to create response with optional optimization and AORP support
 */
function createTaskCrudResponse(
  operation: string,
  message: string,
  data: TaskResponseData,
  metadata: TaskResponseMetadata = { timestamp: new Date().toISOString() },
  verbosity?: string,
  useOptimizedFormat?: boolean,
  useAorp?: boolean,
  aorpConfig?: AorpBuilderConfig,
  sessionId?: string
): unknown {
  // Default to standard verbosity if not specified
  const selectedVerbosity = verbosity || 'standard';

  // Use optimized format if requested or if verbosity is not standard
  const shouldOptimize = useOptimizedFormat || selectedVerbosity !== 'standard';

  // Use AORP if explicitly requested
  if (useAorp) {
    const aorpFactory = createAorpEnabledFactory();
    return aorpFactory.createResponse(operation, message, data, metadata, {
      verbosity: selectedVerbosity as Verbosity,
      useOptimization: shouldOptimize,
      useAorp: true,
      aorpOptions: {
        builderConfig: {
          confidenceMethod: 'adaptive',
          enableNextSteps: true,
          enableQualityIndicators: true,
          ...aorpConfig
        },
        nextStepsConfig: {
          maxSteps: 5,
          enableContextual: true,
          templates: {
            [`${operation}`]: [
              "Verify the task data appears correctly in listings",
              "Check related tasks and dependencies",
              "Test any automated workflows or notifications"
            ]
          }
        },
        qualityConfig: {
          completenessWeight: 0.6,
          reliabilityWeight: 0.4,
          customIndicators: {
            taskPriority: ((data: unknown, _context: AorpTransformationContext) => {
              // Higher completeness for high-priority tasks
              const taskData = data as { task?: Task };
              if (!taskData?.task) return 0.7;
              const priority = taskData.task.priority || 0;
              return Math.min(1.0, 0.5 + (priority / 5) * 0.5);
            }) as QualityIndicatorFunction,
            taskCompleteness: ((data: unknown, _context: AorpTransformationContext) => {
              // Based on task fields completeness
              const taskData = data as { task?: Task };
              if (!taskData?.task) return 0.5;
              const task = taskData.task;
              let score = 0.3; // Base score for having a task
              if (task.title) score += 0.2;
              if (task.description) score += 0.2;
              if (task.due_date) score += 0.1;
              if (task.priority !== undefined) score += 0.1;
              if (task.labels && task.labels.length > 0) score += 0.05;
              if (task.assignees && task.assignees.length > 0) score += 0.05;
              return Math.min(1.0, score);
            }) as QualityIndicatorFunction
          }
        },
        ...(sessionId && { sessionId })
      }
    });
  }

  if (shouldOptimize) {
    // For tasks, we'll use the standard response with optimization
    return createStandardResponse(operation, message, data, metadata);
  }

  return createStandardResponse(operation, message, data, metadata);
}

/**
 * Create a new task
 */
export async function createTask(args: {
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
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
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

    const newTask: Task = {
      title: args.title,
      project_id: args.projectId,
    };
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

    const createdTask = await client.tasks.createTask(args.projectId, newTask);

    // Track whether labels were successfully added for error context
    let labelsAdded = false;

    try {
      // If labels were provided, add them with retry logic
      if (args.labels && args.labels.length > 0 && createdTask.id) {
        const taskId = createdTask.id;
        const labelIds = args.labels;
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
          labelsAdded = true;
        } catch (labelError) {
          // Check if it's an auth error after retries
          if (isAuthenticationError(labelError)) {
            throw new MCPError(
              ErrorCode.API_ERROR,
              `${AUTH_ERROR_MESSAGES.LABEL_CREATE} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times). Task ID: ${createdTask.id}`,
            );
          }
          throw labelError;
        }
      }

      // If assignees were provided, assign them with retry logic
      if (args.assignees && args.assignees.length > 0 && createdTask.id) {
        const taskId = createdTask.id;
        const assigneeIds = args.assignees;
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
              `${AUTH_ERROR_MESSAGES.ASSIGNEE_CREATE} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times). Task ID: ${createdTask.id}`,
            );
          }
          throw assigneeError;
        }
      }
    } catch (updateError) {
      // Attempt to clean up the partially created task
      let rollbackSucceeded = false;
      if (createdTask.id) {
        try {
          await client.tasks.deleteTask(createdTask.id);
          rollbackSucceeded = true;
        } catch (deleteError) {
          // Log the cleanup failure but throw the original error
          logger.error('Failed to clean up partially created task:', deleteError);
        }
      }

      // Re-throw the original error with context
      const errorMessage = `Failed to complete task creation: ${updateError instanceof Error ? updateError.message : String(updateError)}. ${
        rollbackSucceeded
          ? 'Task was successfully rolled back.'
          : 'Task rollback also failed - manual cleanup may be required.'
      }`;

      throw new MCPError(ErrorCode.API_ERROR, errorMessage, {
        vikunjaError: {
          taskId: createdTask.id,
          partiallyCreated: true,
          labelsAdded,
          assigneesAdded: false,
          rollbackSucceeded,
        },
      });
    }

    // Fetch the complete task with labels and assignees
    const completeTask = createdTask.id ? await client.tasks.getTask(createdTask.id) : createdTask;

    const response = createTaskCrudResponse(
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
 * Get a task by ID
 */
export async function getTask(args: {
  id?: number;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
  aorpConfig?: AorpBuilderConfig;
  sessionId?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for get operation');
    }
    validateId(args.id, 'id');

    const client = await getClientFromContext();
    const task = await client.tasks.getTask(args.id);

    const response = createTaskCrudResponse(
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

/**
 * Update a task
 */
export async function updateTask(args: {
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
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
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

    // Fetch the current task to preserve all fields and track changes
    const currentTask = await client.tasks.getTask(args.id);
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
    if (args.description !== undefined && args.description !== currentTask.description)
      affectedFields.push('description');
    if (args.dueDate !== undefined && args.dueDate !== currentTask.due_date)
      affectedFields.push('dueDate');
    if (args.priority !== undefined && args.priority !== currentTask.priority)
      affectedFields.push('priority');
    if (args.done !== undefined && args.done !== currentTask.done) affectedFields.push('done');
    if (args.repeatAfter !== undefined && args.repeatAfter !== currentTask.repeat_after)
      affectedFields.push('repeatAfter');
    if (args.repeatMode !== undefined && args.repeatMode !== currentTask.repeat_mode)
      affectedFields.push('repeatMode');
    if (args.labels !== undefined) affectedFields.push('labels');
    if (args.assignees !== undefined) affectedFields.push('assignees');

    // Build update object by merging current task data with updates
    // This prevents the API from clearing fields that aren't explicitly updated
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

    await client.tasks.updateTask(args.id, updateData);

    // Update labels if provided
    if (args.labels !== undefined) {
      try {
        await client.tasks.updateTaskLabels(args.id, {
          label_ids: args.labels,
        });
      } catch (labelError) {
        // Check if it's an auth error
        if (isAuthenticationError(labelError)) {
          throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.LABEL_UPDATE);
        }
        throw labelError;
      }
    }

    // Update assignees if provided
    if (args.assignees !== undefined) {
      try {
        // Get current assignees to calculate diff
        const currentTask = await client.tasks.getTask(args.id);
        const currentAssigneeIds = currentTask.assignees?.map((a) => a.id) || [];
        const newAssigneeIds = args.assignees;

        // Calculate which assignees to add and remove
        const toAdd = newAssigneeIds.filter((id) => !currentAssigneeIds.includes(id));
        const toRemove = currentAssigneeIds.filter((id) => !newAssigneeIds.includes(id));

        // Add new assignees first to avoid leaving task unassigned if removal fails
        if (toAdd.length > 0) {
          await client.tasks.bulkAssignUsersToTask(args.id, {
            user_ids: toAdd,
          });
        }

        // Remove old assignees only after new ones are successfully added
        for (const userId of toRemove) {
          try {
            await client.tasks.removeUserFromTask(args.id, userId);
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

    // Fetch the complete updated task
    const completeTask = await client.tasks.getTask(args.id);

    const response = createTaskCrudResponse(
      'update-task',
      'Task updated successfully',
      { task: completeTask },
      {
        timestamp: new Date().toISOString(),
        affectedFields,
        previousState: previousState as Partial<Task>,
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
 * Delete a task
 */
export async function deleteTask(args: {
  id?: number;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
  aorpConfig?: AorpBuilderConfig;
  sessionId?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for delete operation');
    }
    validateId(args.id, 'id');

    const client = await getClientFromContext();

    // Try to get task before deletion for response, but handle failure gracefully
    let taskToDelete: Task | undefined;
    try {
      taskToDelete = await client.tasks.getTask(args.id);
    } catch {
      // If we can't get the task, proceed with deletion anyway
      taskToDelete = undefined;
    }

    await client.tasks.deleteTask(args.id);

    const response = createTaskCrudResponse(
      'delete-task',
      taskToDelete
        ? `Task "${taskToDelete.title}" deleted successfully`
        : `Task ${args.id} deleted successfully`,
      taskToDelete ? { task: taskToDelete } : { deletedTaskId: args.id },
      {
        timestamp: new Date().toISOString(),
        taskId: args.id,
        ...(taskToDelete?.title && { taskTitle: taskToDelete.title }),
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