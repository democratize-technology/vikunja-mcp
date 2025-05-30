/**
 * Handler for creating tasks with proper type safety
 */

import type { VikunjaClient, Task } from 'node-vikunja';
import type { CreateTaskRequest, CreateTaskResponse } from '../../../types/operations/tasks';
import { MCPError, ErrorCode } from '../../../types/errors';
import { wrapVikunjaClient } from '../../../utils/vikunja-client-wrapper';
import { logger } from '../../../utils/logger';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { AUTH_ERROR_MESSAGES } from '../constants';
import { convertRepeatConfiguration } from '../validation';
import { CreateTaskSchema } from '../../../types/schemas/tasks';
import { handleZodError } from '../../../utils/zod-error-handler';
import { z } from 'zod';

/**
 * Handle task creation with validation and proper error handling
 */
export async function handleCreateTask(
  request: CreateTaskRequest,
  client: VikunjaClient
): Promise<CreateTaskResponse> {
  const extendedClient = wrapVikunjaClient(client);
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
      project_id: validated.projectId
    };
    
    // Only add optional fields if they are defined
    if (validated.description !== undefined) {
      taskData.description = validated.description;
    }
    if (validated.dueDate !== undefined) {
      taskData.due_date = validated.dueDate;
    }
    if (validated.priority !== undefined) {
      taskData.priority = validated.priority;
    }

    // Handle repeating tasks
    if (validated.repeatAfter && validated.repeatMode) {
      const repeatConfig = convertRepeatConfiguration(validated.repeatAfter, validated.repeatMode);
      taskData.repeat_after = repeatConfig.repeat_after;
      taskData.repeat_mode = repeatConfig.repeat_mode;
    }

    // Create the task
    const task = await withRetry(
      () => extendedClient.tasks.createTask(validated.projectId, taskData as Partial<Task>),
      {
        ...RETRY_CONFIG,
        shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
      }
    );

    let labelsAdded = false;
    let assigneesAdded = false;
    let completeTask: Task = task;

    // Add labels if provided
    if (validated.labels && validated.labels.length > 0 && task.id !== undefined) {
      const taskId = task.id;
      try {
        // Add labels one by one
        for (const labelId of validated.labels) {
          await withRetry(
            () => extendedClient.tasks.addLabelToTask(taskId, labelId),
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
    if (validated.assignees && validated.assignees.length > 0 && task.id !== undefined) {
      const taskId = task.id;
      try {
        for (const assigneeId of validated.assignees) {
          await withRetry(
            () => extendedClient.tasks.addAssigneeToTask(taskId, assigneeId),
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
    if (task.id !== undefined) {
      const taskId = task.id;
      try {
        completeTask = await withRetry(
          () => extendedClient.tasks.getTask(taskId),
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
    if (error instanceof z.ZodError) {
      throw handleZodError(error);
    }

    // Handle other errors
    logger.error('Failed to create task', {
      error: error instanceof Error ? error.message : String(error)
    });

    throw new MCPError(
      ErrorCode.API_ERROR,
      error instanceof Error ? error.message : 'Failed to create task'
    );
  }
}