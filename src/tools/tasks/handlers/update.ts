/**
 * Handler for updating tasks with proper type safety
 */

import type { VikunjaClient, Task } from 'node-vikunja';
import type { UpdateTaskRequest, UpdateTaskResponse } from '../../../types/operations/tasks';
import { MCPError, ErrorCode } from '../../../types/errors';
import { logger } from '../../../utils/logger';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { AUTH_ERROR_MESSAGES } from '../constants';
import { convertRepeatConfiguration } from '../validation';
import { UpdateTaskSchema } from '../../../types/schemas/tasks';

/**
 * Handle task update with validation and proper error handling
 */
export async function handleUpdateTask(
  request: UpdateTaskRequest,
  client: VikunjaClient
): Promise<UpdateTaskResponse> {
  try {
    // Validate input using Zod schema
    const validated = UpdateTaskSchema.parse({
      id: request.id,
      title: request.title,
      description: request.description,
      dueDate: request.dueDate,
      priority: request.priority,
      done: request.done,
      labels: request.labels,
      assignees: request.assignees,
      repeatAfter: request.repeatAfter,
      repeatMode: request.repeatMode
    });

    // Get the current task first to track changes
    const currentTask = await withRetry(
      () => client.tasks.getTask(validated.id),
      {
        ...RETRY_CONFIG,
        shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
      }
    );

    // Prepare update data
    const updateData: Record<string, unknown> = {};
    const affectedFields: string[] = [];
    const previousState: Partial<Task> = {};

    // Track changes
    if (validated.title !== undefined && validated.title !== currentTask.title) {
      updateData.title = validated.title;
      affectedFields.push('title');
      previousState.title = currentTask.title;
    }

    if (validated.description !== undefined && validated.description !== currentTask.description) {
      updateData.description = validated.description;
      affectedFields.push('description');
      if (currentTask.description !== undefined) {
        previousState.description = currentTask.description;
      }
    }

    if (validated.dueDate !== undefined) {
      updateData.due_date = validated.dueDate;
      affectedFields.push('dueDate');
      if (currentTask.due_date !== undefined) {
        previousState.due_date = currentTask.due_date;
      }
    }

    if (validated.priority !== undefined && validated.priority !== currentTask.priority) {
      updateData.priority = validated.priority;
      affectedFields.push('priority');
      if (currentTask.priority !== undefined) {
        previousState.priority = currentTask.priority;
      }
    }

    if (validated.done !== undefined && validated.done !== currentTask.done) {
      updateData.done = validated.done;
      affectedFields.push('done');
      if (currentTask.done !== undefined) {
        previousState.done = currentTask.done;
      }
    }

    // Handle repeating configuration
    if (validated.repeatAfter !== undefined || validated.repeatMode !== undefined) {
      if (validated.repeatAfter && validated.repeatMode) {
        const repeatConfig = convertRepeatConfiguration(validated.repeatAfter, validated.repeatMode);
        updateData.repeat_after = repeatConfig.repeat_after;
        updateData.repeat_mode = repeatConfig.repeat_mode;
        affectedFields.push('repeatAfter', 'repeatMode');
        if (currentTask.repeat_after !== undefined) {
          previousState.repeat_after = currentTask.repeat_after;
        }
        if (currentTask.repeat_mode !== undefined) {
          previousState.repeat_mode = currentTask.repeat_mode;
        }
      } else {
        // Clear repeat configuration
        updateData.repeat_after = 0;
        updateData.repeat_mode = 0;
        affectedFields.push('repeatAfter', 'repeatMode');
        if (currentTask.repeat_after !== undefined) {
          previousState.repeat_after = currentTask.repeat_after;
        }
        if (currentTask.repeat_mode !== undefined) {
          previousState.repeat_mode = currentTask.repeat_mode;
        }
      }
    }

    // Update the task if there are changes
    if (Object.keys(updateData).length > 0) {
      await withRetry(
        () => (client.tasks as any).updateTask(validated.id, updateData),
        {
          ...RETRY_CONFIG,
          shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
        }
      );
    }

    // Handle label updates
    if (validated.labels !== undefined) {
      const currentLabelIds = currentTask.labels?.map(l => l.id) || [];
      const labelsChanged = JSON.stringify(currentLabelIds.sort()) !== JSON.stringify(validated.labels.sort());
      
      if (labelsChanged) {
        // Remove current labels
        if (currentLabelIds.length > 0) {
          await withRetry(
            () => (client.tasks as any).removeLabelsFromTask(validated.id, currentLabelIds),
            {
              ...RETRY_CONFIG,
              shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
            }
          );
        }

        // Add new labels
        if (validated.labels.length > 0) {
          await withRetry(
            () => (client.tasks as any).addLabelsToTask(validated.id, validated.labels),
            {
              ...RETRY_CONFIG,
              shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
            }
          );
        }

        affectedFields.push('labels');
        if (currentTask.labels !== undefined) {
          previousState.labels = currentTask.labels;
        }
      }
    }

    // Handle assignee updates
    if (validated.assignees !== undefined) {
      const currentAssigneeIds = currentTask.assignees?.map(a => a.id) || [];
      const assigneesChanged = JSON.stringify(currentAssigneeIds.sort()) !== JSON.stringify(validated.assignees.sort());

      if (assigneesChanged) {
        // Remove current assignees
        for (const assigneeId of currentAssigneeIds) {
          await withRetry(
            () => (client.tasks as any).removeAssigneeFromTask(validated.id, assigneeId),
            {
              ...RETRY_CONFIG,
              shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
            }
          );
        }

        // Add new assignees
        for (const assigneeId of validated.assignees) {
          await withRetry(
            () => (client.tasks as any).addAssigneeToTask(validated.id, assigneeId),
            {
              ...RETRY_CONFIG,
              shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
            }
          );
        }

        affectedFields.push('assignees');
        if (currentTask.assignees !== undefined) {
          previousState.assignees = currentTask.assignees;
        }
      }
    }

    // Fetch the complete updated task
    const completeTask = await withRetry(
      () => client.tasks.getTask(validated.id),
      {
        ...RETRY_CONFIG,
        shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
      }
    );

    return {
      success: true,
      operation: 'update',
      message: 'Task updated successfully',
      task: completeTask,
      data: completeTask,
      metadata: {
        timestamp: new Date().toISOString(),
        affectedFields,
        ...(affectedFields.length > 0 && { previousState })
      }
    };
  } catch (error) {
    // Handle authentication errors
    if (error instanceof Error && isAuthenticationError(error)) {
      logger.error('Authentication error updating task', { error: error.message });
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        AUTH_ERROR_MESSAGES.NOT_AUTHENTICATED
      );
    }

    // Re-throw MCPErrors
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle Zod validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as unknown as { errors: Array<{ path: Array<string | number>, message: string }> };
      const firstError = zodError.errors[0];
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        firstError ? `${firstError.path.join('.')}: ${firstError.message}` : 'Validation failed'
      );
    }

    // Handle other errors
    logger.error('Failed to update task', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      operation: 'update',
      message: 'Failed to update task',
      task: {} as Task,
      metadata: {
        timestamp: new Date().toISOString(),
        affectedFields: []
      },
      error: {
        code: ErrorCode.API_ERROR,
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}