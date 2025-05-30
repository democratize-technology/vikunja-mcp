/**
 * Handler for bulk task operations with proper type safety
 */

import type { VikunjaClient, Task } from 'node-vikunja';
import type { 
  BulkCreateTasksRequest, 
  BulkCreateTasksResponse,
  BulkUpdateTasksRequest,
  BulkUpdateTasksResponse,
  BulkDeleteTasksRequest,
  BulkDeleteTasksResponse
} from '../../../types/operations/tasks';
import { MCPError, ErrorCode } from '../../../types/errors';
import { logger } from '../../../utils/logger';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { AUTH_ERROR_MESSAGES } from '../constants';
import { convertRepeatConfiguration } from '../validation';
import { 
  BulkCreateTasksSchema, 
  BulkUpdateTasksSchema,
  BulkDeleteTasksSchema 
} from '../../../types/schemas/tasks';
import { wrapVikunjaClient } from '../../../utils/vikunja-client-wrapper';
import { handleZodError } from '../../../utils/zod-error-handler';
import { z } from 'zod';

/**
 * Handle bulk task creation
 */
export async function handleBulkCreateTasks(
  request: BulkCreateTasksRequest,
  client: VikunjaClient
): Promise<BulkCreateTasksResponse> {
  const extendedClient = wrapVikunjaClient(client);
  
  try {
    // Validate input using Zod schema
    const validated = BulkCreateTasksSchema.parse({
      projectId: request.projectId,
      tasks: request.tasks
    });

    const createdTasks: Task[] = [];
    const failures: Array<{ index: number; error: string; taskData?: unknown }> = [];

    // Create tasks one by one
    for (let i = 0; i < validated.tasks.length; i++) {
      const taskData = validated.tasks[i];
      if (!taskData) continue;
      
      try {
        // Prepare task data
        const createData: Record<string, unknown> = {
          title: taskData.title,
          description: taskData.description,
          due_date: taskData.dueDate,
          priority: taskData.priority
        };

        // Handle repeating tasks
        if (taskData.repeatAfter && taskData.repeatMode) {
          const repeatConfig = convertRepeatConfiguration(taskData.repeatAfter, taskData.repeatMode);
          createData.repeat_after = repeatConfig.repeat_after;
          createData.repeat_mode = repeatConfig.repeat_mode;
        }

        // Create the task
        const task = await withRetry(
          () => extendedClient.tasks.createTask(validated.projectId, createData as Partial<Task>),
          {
            ...RETRY_CONFIG,
            shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
          }
        );

        if (!task.id) {
          throw new Error('Task created without ID');
        }
        const taskId = task.id;
        
        // Add labels if provided
        if (taskData.labels && taskData.labels.length > 0) {
          for (const labelId of taskData.labels) {
            await withRetry(
              () => extendedClient.tasks.addLabelToTask(taskId, labelId),
              {
                ...RETRY_CONFIG,
                shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
              }
            );
          }
        }

        // Add assignees if provided
        if (taskData.assignees && taskData.assignees.length > 0) {
          for (const assigneeId of taskData.assignees) {
            await withRetry(
              () => extendedClient.tasks.addAssigneeToTask(taskId, assigneeId),
              {
                ...RETRY_CONFIG,
                shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
              }
            );
          }
        }

        // Fetch complete task
        const completeTask = await withRetry(
          () => extendedClient.tasks.getTask(taskId),
          {
            ...RETRY_CONFIG,
            shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
          }
        );

        createdTasks.push(completeTask);
      } catch (error) {
        failures.push({
          index: i,
          error: error instanceof Error ? error.message : String(error),
          taskData
        });
      }
    }

    return {
      success: failures.length === 0,
      operation: 'bulk-create',
      message: `Created ${createdTasks.length} tasks${failures.length > 0 ? `, ${failures.length} failed` : ''}`,
      tasks: createdTasks,
      data: createdTasks,
      metadata: {
        timestamp: new Date().toISOString(),
        count: createdTasks.length,
        ...(failures.length > 0 && {
          failedCount: failures.length,
          failures: failures
        })
      }
    };
  } catch (error) {
    // Handle authentication errors
    if (error instanceof Error && isAuthenticationError(error)) {
      logger.error('Authentication error in bulk create', { error: error.message });
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        AUTH_ERROR_MESSAGES.NOT_AUTHENTICATED
      );
    }

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw handleZodError(error);
    }

    // Re-throw MCPErrors
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle other errors
    logger.error('Failed to create tasks in bulk', {
      error: error instanceof Error ? error.message : String(error)
    });

    throw new MCPError(
      ErrorCode.API_ERROR,
      error instanceof Error ? error.message : 'Failed to create tasks in bulk'
    );
  }
}

/**
 * Handle bulk task updates
 */
export async function handleBulkUpdateTasks(
  request: BulkUpdateTasksRequest,
  client: VikunjaClient
): Promise<BulkUpdateTasksResponse> {
  const extendedClient = wrapVikunjaClient(client);
  
  try {
    // Validate input using Zod schema
    const validated = BulkUpdateTasksSchema.parse({
      taskIds: request.taskIds,
      field: request.field,
      value: request.value
    });

    const updatedTasks: Task[] = [];
    let fetchErrors = 0;

    // Update tasks one by one
    for (const taskId of validated.taskIds) {
      try {
        // Prepare update data based on field
        const updateData: Record<string, unknown> = {};
        
        switch (validated.field) {
          case 'done':
            updateData.done = validated.value as boolean;
            break;
          case 'priority':
            updateData.priority = validated.value as number;
            break;
          case 'due_date':
            updateData.due_date = validated.value as string | null;
            break;
          case 'project_id':
            updateData.project_id = validated.value as number;
            break;
          case 'repeat_after':
            updateData.repeat_after = validated.value as number | null;
            break;
          case 'repeat_mode':
            updateData.repeat_mode = validated.value as number | null;
            break;
        }

        if (validated.field === 'assignees' || validated.field === 'labels') {
          // Handle assignees and labels separately
          const task = await withRetry(
            () => extendedClient.tasks.getTask(taskId),
            {
              ...RETRY_CONFIG,
              shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
            }
          );

          if (validated.field === 'assignees') {
            const newAssignees = validated.value as number[];
            const currentAssignees = task.assignees?.map(a => a.id) || [];

            // Remove current assignees
            for (const assigneeId of currentAssignees) {
              await withRetry(
                () => extendedClient.tasks.removeAssigneeFromTask(taskId, assigneeId),
                {
                  ...RETRY_CONFIG,
                  shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
                }
              );
            }

            // Add new assignees
            for (const assigneeId of newAssignees) {
              await withRetry(
                () => extendedClient.tasks.addAssigneeToTask(taskId, assigneeId),
                {
                  ...RETRY_CONFIG,
                  shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
                }
              );
            }
          } else {
            const newLabels = validated.value as number[];
            const currentLabels = task.labels?.map(l => l.id) || [];

            // Remove current labels
            if (currentLabels.length > 0) {
              await withRetry(
                () => extendedClient.tasks.removeLabelsFromTask(taskId, currentLabels.filter((id): id is number => id !== undefined)),
                {
                  ...RETRY_CONFIG,
                  shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
                }
              );
            }

            // Add new labels
            if (newLabels.length > 0) {
              await withRetry(
                () => extendedClient.tasks.addLabelsToTask(taskId, newLabels),
                {
                  ...RETRY_CONFIG,
                  shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
                }
              );
            }
          }
        } else {
          // Update other fields
          await withRetry(
            () => extendedClient.tasks.updateTask(taskId, updateData as Partial<Task>),
            {
              ...RETRY_CONFIG,
              shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
            }
          );
        }

        // Fetch updated task
        try {
          const updatedTask = await withRetry(
            () => extendedClient.tasks.getTask(taskId),
            {
              ...RETRY_CONFIG,
              shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
            }
          );
          updatedTasks.push(updatedTask);
        } catch (fetchError) {
          fetchErrors++;
          logger.warn('Failed to fetch task after update', {
            taskId,
            error: fetchError instanceof Error ? fetchError.message : String(fetchError)
          });
        }
      } catch (error) {
        logger.error('Failed to update task in bulk operation', {
          taskId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      success: true,
      operation: 'bulk-update',
      message: `Updated ${updatedTasks.length} tasks`,
      tasks: updatedTasks,
      data: updatedTasks,
      metadata: {
        timestamp: new Date().toISOString(),
        affectedField: validated.field,
        count: updatedTasks.length,
        ...(fetchErrors > 0 && { fetchErrors })
      }
    };
  } catch (error) {
    // Handle authentication errors
    if (error instanceof Error && isAuthenticationError(error)) {
      logger.error('Authentication error in bulk update', { error: error.message });
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        AUTH_ERROR_MESSAGES.NOT_AUTHENTICATED
      );
    }

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw handleZodError(error);
    }

    // Re-throw MCPErrors
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle other errors
    logger.error('Failed to update tasks in bulk', {
      error: error instanceof Error ? error.message : String(error)
    });

    throw new MCPError(
      ErrorCode.API_ERROR,
      error instanceof Error ? error.message : 'Failed to update tasks in bulk'
    );
  }
}

/**
 * Handle bulk task deletion
 */
export async function handleBulkDeleteTasks(
  request: BulkDeleteTasksRequest,
  client: VikunjaClient
): Promise<BulkDeleteTasksResponse> {
  const extendedClient = wrapVikunjaClient(client);
  
  try {
    // Validate input using Zod schema
    const validated = BulkDeleteTasksSchema.parse({
      taskIds: request.taskIds
    });

    const deletedTaskIds: number[] = [];
    const failedTaskIds: number[] = [];

    // Delete tasks one by one
    for (const taskId of validated.taskIds) {
      try {
        await withRetry(
          () => extendedClient.tasks.deleteTask(taskId),
          {
            ...RETRY_CONFIG,
            shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
          }
        );
        deletedTaskIds.push(taskId);
      } catch (error) {
        failedTaskIds.push(taskId);
        logger.error('Failed to delete task in bulk operation', {
          taskId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      success: failedTaskIds.length === 0,
      operation: 'bulk-delete',
      message: `Deleted ${deletedTaskIds.length} tasks${failedTaskIds.length > 0 ? `, ${failedTaskIds.length} failed` : ''}`,
      metadata: {
        timestamp: new Date().toISOString(),
        count: deletedTaskIds.length,
        deletedTaskIds,
        ...(failedTaskIds.length > 0 && { failedTaskIds })
      }
    };
  } catch (error) {
    // Handle authentication errors
    if (error instanceof Error && isAuthenticationError(error)) {
      logger.error('Authentication error in bulk delete', { error: error.message });
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        AUTH_ERROR_MESSAGES.NOT_AUTHENTICATED
      );
    }

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw handleZodError(error);
    }

    // Re-throw MCPErrors
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle other errors
    logger.error('Failed to delete tasks in bulk', {
      error: error instanceof Error ? error.message : String(error)
    });

    throw new MCPError(
      ErrorCode.API_ERROR,
      error instanceof Error ? error.message : 'Failed to delete tasks in bulk'
    );
  }
}