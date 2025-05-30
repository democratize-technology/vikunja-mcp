/**
 * Handler for creating tasks with proper type safety
 */

import type { VikunjaClient, Task } from 'node-vikunja';
import type { CreateTaskRequest, CreateTaskResponse } from '../../../types/operations/tasks';
import { MCPError, ErrorCode } from '../../../types/errors';
import { logger } from '../../../utils/logger';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { AUTH_ERROR_MESSAGES } from '../constants';
import { convertRepeatConfiguration } from '../validation';
import { CreateTaskSchema } from '../../../types/schemas/tasks';

/**
 * Handle task creation with validation and proper error handling
 */
export async function handleCreateTask(
  request: CreateTaskRequest,
  client: VikunjaClient
): Promise<CreateTaskResponse> {
  try {
    // Validate input using Zod schema
    const validated = CreateTaskSchema.parse({
      projectId: request.projectId,
      title: request.title,
      description: request.description,
      dueDate: request.dueDate,
      priority: request.priority,
      labels: request.labels,
      assignees: request.assignees,
      repeatAfter: request.repeatAfter,
      repeatMode: request.repeatMode
    });

    // Prepare task data
    const taskData: Record<string, unknown> = {
      title: validated.title,
      description: validated.description,
      due_date: validated.dueDate,
      priority: validated.priority
    };

    // Handle repeating tasks
    if (validated.repeatAfter && validated.repeatMode) {
      const repeatConfig = convertRepeatConfiguration(validated.repeatAfter, validated.repeatMode);
      taskData.repeat_after = repeatConfig.repeat_after;
      taskData.repeat_mode = repeatConfig.repeat_mode;
    }

    // Create the task
    const task = await withRetry(
      () => client.tasks.createTask(validated.projectId, taskData as any),
      {
        ...RETRY_CONFIG,
        shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
      }
    );

    let labelsAdded = false;
    let assigneesAdded = false;
    let completeTask: Task = task;

    // Add labels if provided
    if (validated.labels && validated.labels.length > 0) {
      try {
        // Add labels one by one
        for (const labelId of validated.labels) {
          await withRetry(
            () => (client.tasks as any).addLabelToTask(task.id!, labelId),
            {
              ...RETRY_CONFIG,
              shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
            }
          );
        }
        labelsAdded = true;
      } catch (labelError) {
        logger.warn('Failed to add labels to task', {
          taskId: task.id,
          error: labelError instanceof Error ? labelError.message : String(labelError)
        });
      }
    }

    // Add assignees if provided
    if (validated.assignees && validated.assignees.length > 0) {
      try {
        for (const assigneeId of validated.assignees) {
          await withRetry(
            () => (client.tasks as any).addAssigneeToTask(task.id!, assigneeId),
            {
              ...RETRY_CONFIG,
              shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
            }
          );
        }
        assigneesAdded = true;
      } catch (assigneeError) {
        logger.warn('Failed to add assignees to task', {
          taskId: task.id,
          error: assigneeError instanceof Error ? assigneeError.message : String(assigneeError)
        });
      }
    }

    // Fetch the complete task with all relationships
    try {
      completeTask = await withRetry(
        () => client.tasks.getTask(task.id!),
        {
          ...RETRY_CONFIG,
          shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
        }
      );
    } catch (fetchError) {
      logger.warn('Failed to fetch complete task after creation', {
        taskId: task.id,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError)
      });
      completeTask = task;
    }

    return {
      success: true,
      operation: 'create',
      message: 'Task created successfully',
      task: completeTask,
      data: completeTask,
      metadata: {
        timestamp: new Date().toISOString(),
        labelsAdded,
        assigneesAdded
      }
    };
  } catch (error) {
    // Handle authentication errors
    if (error instanceof Error && isAuthenticationError(error)) {
      logger.error('Authentication error creating task', { error: error.message });
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
    logger.error('Failed to create task', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      operation: 'create',
      message: 'Failed to create task',
      task: {} as Task,
      metadata: {
        timestamp: new Date().toISOString()
      },
      error: {
        code: ErrorCode.API_ERROR,
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}