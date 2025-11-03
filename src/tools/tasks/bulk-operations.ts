/**
 * Bulk operations for tasks with performance optimizations
 */

import { MCPError, ErrorCode, createStandardResponse } from '../../types/index';
import { getClientFromContext } from '../../client';
import type { Task } from 'node-vikunja';
import { logger } from '../../utils/logger';
import { isAuthenticationError } from '../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../utils/retry';
import { BatchProcessor, type BatchResult } from '../../utils/performance/batch-processor';
import {
  AUTH_ERROR_MESSAGES,
  MAX_BULK_OPERATION_TASKS,
} from './constants';
import { validateDateString, validateId, convertRepeatConfiguration } from './validation';

// Batch processors for bulk operations
const updateBatchProcessor = new BatchProcessor({
  maxConcurrency: 5,
  batchSize: 10,
  enableMetrics: true,
  batchDelay: 0,
});
const deleteBatchProcessor = new BatchProcessor({
  maxConcurrency: 3,
  batchSize: 5,
  enableMetrics: true,
  batchDelay: 100,
});
const createBatchProcessor = new BatchProcessor({
  maxConcurrency: 8,
  batchSize: 15,
  enableMetrics: true,
  batchDelay: 0,
});



/**
 * Process tasks in batches with appropriate batch processor
 */
async function processTasksInBatches<T>(
  items: number[],
  processor: (item: number, index: number) => Promise<T>,
  operationType: string
): Promise<BatchResult<T>> {
  const batchProcessor = operationType.includes('delete')
    ? deleteBatchProcessor
    : operationType.includes('create')
    ? createBatchProcessor
    : updateBatchProcessor;

  return await batchProcessor.processBatches(items, processor);
}


/**
 * Bulk update tasks
 */
export async function bulkUpdateTasks(args: {
  taskIds?: number[];
  field?: string;
  value?: unknown;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.taskIds || args.taskIds.length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'taskIds array is required for bulk update operation',
      );
    }

    if (!args.field) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'field is required for bulk update operation');
    }

    if (args.value === undefined) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'value is required for bulk update operation');
    }

    if (args.taskIds.length > MAX_BULK_OPERATION_TASKS) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Too many tasks for bulk operation. Maximum allowed: ${MAX_BULK_OPERATION_TASKS}. Consider breaking into smaller batches.`,
      );
    }

    args.taskIds.forEach((id) => validateId(id, 'task ID'));

    const taskIds = args.taskIds;

    // Preprocess value to handle type coercion from MCP
    if (args.field === 'done' && typeof args.value === 'string') {
      const originalValue = args.value;
      if (args.value === 'true') {
        args.value = true;
      } else if (args.value === 'false') {
        args.value = false;
      }
      logger.debug('Preprocessed done field value', {
        originalValue: originalValue,
        processedValue: args.value,
      });
    }

    // Handle numeric fields that come as strings
    if (['priority', 'project_id', 'repeat_after'].includes(args.field) && typeof args.value === 'string') {
      const originalValue = args.value;
      const numValue = Number(args.value);
      if (!isNaN(numValue)) {
        args.value = numValue;
        logger.debug(`Preprocessed ${args.field} field value`, {
          originalValue: originalValue,
          processedValue: args.value,
        });
      }
    }

    const allowedFields = [
      'done',
      'priority',
      'due_date',
      'project_id',
      'assignees',
      'labels',
      'repeat_after',
      'repeat_mode',
    ];
    if (!allowedFields.includes(args.field)) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid field: ${args.field}. Allowed fields: ${allowedFields.join(', ')}`,
      );
    }

    // Field-specific validation
    if (args.field === 'priority' && typeof args.value === 'number') {
      if (args.value < 0 || args.value > 5) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Priority must be between 0 and 5');
      }
    }

    if (args.field === 'due_date' && typeof args.value === 'string') {
      validateDateString(args.value, 'due_date');
    }

    if (args.field === 'project_id' && typeof args.value === 'number') {
      validateId(args.value, 'project_id');
    }

    if (['assignees', 'labels'].includes(args.field)) {
      if (!Array.isArray(args.value)) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, `${args.field} must be an array of numbers`);
      }
      const valueArray = args.value as number[];
      valueArray.forEach((id) => validateId(id, `${args.field} ID`));
    }

    if (args.field === 'done') {
        if (typeof args.value !== 'boolean') {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'done field must be a boolean value (true or false)',
        );
      }
    }

    // Recurring field validation
    if (args.field === 'repeat_after' && typeof args.value === 'number' && args.value < 0) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'repeat_after must be a non-negative number');
    }

    if (args.field === 'repeat_mode' && typeof args.value === 'string') {
      const validModes = ['day', 'week', 'month', 'year'];
      if (!validModes.includes(args.value)) {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid repeat_mode: ${args.value}. Valid modes: ${validModes.join(', ')}`,
        );
      }
    }

    const client = await getClientFromContext();

    // Use the proper bulk update API endpoint
    try {
      // Build the bulk update operation using TaskBulkOperation interface
      const bulkOperation = {
        task_ids: taskIds,
        field: args.field,
        value: args.value,
      };

      if (args.field === 'repeat_mode' && typeof args.value === 'string') {
        const modeMap: Record<string, number> = {
          default: 0,
          month: 1,
          from_current: 2,
        };
        bulkOperation.value = modeMap[args.value] ?? args.value;
      }

      // Call the proper bulk update API
      logger.debug('Calling bulkUpdateTasks API', { bulkOperation });
      const bulkUpdateResult = await client.tasks.bulkUpdateTasks(bulkOperation);

      // Handle inconsistent return types from the bulk update API
      // Sometimes it returns Message object, sometimes Task[] array
      let updatedTasks: Task[] = [];
      let bulkUpdateSuccessful = false;

      if (Array.isArray(bulkUpdateResult)) {
        if (bulkUpdateResult.length > 0) {
          bulkUpdateSuccessful = true;

          // Verify the returned tasks have the expected values
          for (const task of bulkUpdateResult) {
            if ((args.field === 'priority' && task.priority !== args.value) ||
                (args.field === 'done' && task.done !== args.value) ||
                (args.field === 'due_date' && task.due_date !== args.value) ||
                (args.field === 'project_id' && task.project_id !== args.value)) {
              logger.warn(`Bulk update API returned task with unchanged ${args.field}`, {
                taskId: task.id,
                expected: args.value,
                actual: task[args.field as keyof Task],
              });
              bulkUpdateSuccessful = false;
              break;
            }
          }

          if (bulkUpdateSuccessful) {
            updatedTasks = bulkUpdateResult;
          }
        }
      } else if (
        bulkUpdateResult &&
        typeof bulkUpdateResult === 'object' &&
        'message' in bulkUpdateResult
      ) {
            bulkUpdateSuccessful = true;
      }

      if (!bulkUpdateSuccessful) {
        // Bulk update didn't actually update the values, throw an error to trigger fallback
        throw new Error('Bulk update API reported success but did not update task values');
      }

      // If we don't have the updated tasks yet (Message response), fetch them
      if (updatedTasks.length === 0) {
        const fetchResult = await processTasksInBatches(
          taskIds,
          async (taskId: number) => {
            return await client.tasks.getTask(taskId);
          },
          'bulk_update_fetch'
        );

        updatedTasks = fetchResult.successful;
        
        if (fetchResult.failed.length > 0) {
          logger.warn('Some tasks could not be fetched after bulk update', {
            failedCount: fetchResult.failed.length,
            failedTaskIds: fetchResult.failed.map(f => f.originalItem),
          });
        }
      }

      const response = createStandardResponse(
        'update-task',
        `Successfully updated ${taskIds.length} tasks`,
        { tasks: updatedTasks },
        {
          timestamp: new Date().toISOString(),
          count: taskIds.length,
          affectedFields: [args.field],
        },
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (bulkError) {
      // If bulk update fails, fall back to individual updates
      logger.warn('Bulk update API failed, falling back to individual updates', {
        error: bulkError instanceof Error ? bulkError.message : String(bulkError),
        field: args.field,
      });

      // Perform bulk update using individual task updates as fallback
      const updateResult = await processTasksInBatches(
        taskIds,
        async (taskId: number) => {
          // Fetch current task to preserve required fields
          const currentTask = await client.tasks.getTask(taskId);

          // Build update object based on field, preserving existing data
          const updateData: Task = { ...currentTask };

          switch (args.field) {
            case 'done':
              updateData.done = args.value as boolean;
              break;
            case 'priority':
              updateData.priority = args.value as number;
              break;
            case 'due_date':
              updateData.due_date = args.value as string;
              break;
            case 'project_id':
              updateData.project_id = args.value as number;
              break;
            case 'assignees':
              // For assignees, we need to handle the user assignment separately
              // This is a limitation of the current API
              break;
            case 'labels':
              // For labels, we need to handle the label assignment separately
              // This is a limitation of the current API
              break;
            case 'repeat_after':
              updateData.repeat_after = args.value as number;
              break;
            case 'repeat_mode':
              // The repeat_mode field in the API expects a number
              // But TypeScript types might be out of sync
              Object.assign(updateData, { repeat_mode: args.value });
              break;
          }

          // Update the task
          const updatedTask = await client.tasks.updateTask(taskId, updateData);

          // Handle assignees and labels separately if needed
          if (args.field === 'assignees' && Array.isArray(args.value)) {
            try {
              // Replace all assignees with the new list
              const currentTaskWithAssignees = await client.tasks.getTask(taskId);
              const currentAssigneeIds = currentTaskWithAssignees.assignees?.map((a) => a.id) || [];
              const newAssigneeIds = args.value as number[];

              // Add new assignees first to avoid leaving task unassigned
              if (newAssigneeIds.length > 0) {
                await withRetry(
                  () => client.tasks.bulkAssignUsersToTask(taskId, {
                    user_ids: newAssigneeIds,
                  }),
                  {
                    ...RETRY_CONFIG.AUTH_ERRORS,
                    shouldRetry: (error) => isAuthenticationError(error)
                  }
                );
              }

              // Remove old assignees only after new ones are successfully added
              for (const userId of currentAssigneeIds) {
                try {
                  await withRetry(
                    () => client.tasks.removeUserFromTask(taskId, userId),
                    {
                      ...RETRY_CONFIG.AUTH_ERRORS,
                      shouldRetry: (error) => isAuthenticationError(error)
                    }
                  );
                } catch (removeError) {
                  // Check if it's an auth error on remove after retries
                  if (isAuthenticationError(removeError)) {
                    throw new MCPError(
                      ErrorCode.API_ERROR,
                      `${AUTH_ERROR_MESSAGES.ASSIGNEE_REMOVE_PARTIAL} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`,
                    );
                  }
                  throw removeError;
                }
              }
            } catch (assigneeError) {
              // Check if it's an auth error after retries
              if (isAuthenticationError(assigneeError)) {
                throw new MCPError(
                  ErrorCode.API_ERROR, 
                  `${AUTH_ERROR_MESSAGES.ASSIGNEE_BULK_UPDATE} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`
                );
              }
              throw assigneeError;
            }
          }
          if (args.field === 'labels' && Array.isArray(args.value)) {
            await withRetry(
              () => client.tasks.updateTaskLabels(taskId, {
                label_ids: args.value as number[],
              }),
              {
                ...RETRY_CONFIG.AUTH_ERRORS,
                shouldRetry: (error) => isAuthenticationError(error)
              }
            );
          }

          return updatedTask;
        },
        'bulk_update_individual_fallback'
      );

      // Check for any failures with optimized result format
      const failures = updateResult.failed;
      const successCount = updateResult.successful.length;

      if (failures.length > 0) {
        const failedIds = failures.map((f) => f.originalItem);

        // Check if all failures are due to assignee auth errors
        if (args.field === 'assignees') {
          const authFailures = failures.filter((f) => {
            const error = f.error;
            return (
              error instanceof MCPError &&
              error.message.includes('Assignee operations may have authentication issues')
            );
          });

          if (authFailures.length === failures.length) {
            // All failures are auth-related
            throw new MCPError(
              ErrorCode.API_ERROR,
              'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
                'This is a known limitation that prevents bulk updating assignees.',
            );
          }
        }

        // If some succeeded, report partial success
        if (successCount > 0) {
          logger.warn('Bulk update partially failed', {
            successCount,
            failedCount: failures.length,
            failedIds,
          });
        } else {
          // All failed
          throw new MCPError(
            ErrorCode.API_ERROR,
            `Bulk update failed. Could not update any tasks. Failed IDs: ${failedIds.join(', ')}`,
          );
        }
      }

      // Use successful tasks from the update operation, or fetch fresh if needed
      let updatedTasks = updateResult.successful;
      let failedFetches = 0;

      // If we need fresh task data for display, fetch it
      if (updatedTasks.length < successCount) {
        const fetchResult = await processTasksInBatches(
          taskIds,
          async (taskId: number) => {
            return await client.tasks.getTask(taskId);
          },
          'bulk_update_final_fetch'
        );

        updatedTasks = fetchResult.successful;
        failedFetches = fetchResult.failed.length;
      }

      const response = createStandardResponse(
        'update-task',
        `Successfully updated ${taskIds.length} tasks${failedFetches > 0 ? ` (${failedFetches} tasks could not be fetched after update)` : ''}`,
        { tasks: updatedTasks },
        {
          timestamp: new Date().toISOString(),
          affectedFields: [args.field],
          count: taskIds.length,
          ...(failedFetches > 0 && { fetchErrors: failedFetches }),
          performanceMetrics: {
            totalDuration: updateResult.metrics.totalDuration,
            operationsPerSecond: updateResult.metrics.operationsPerSecond,
            apiCallsUsed: updateResult.metrics.successfulOperations + updateResult.metrics.failedOperations,
          },
        },
      );

      logger.info('Bulk update completed', {
        taskCount: taskIds.length,
        field: args.field,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to bulk update tasks: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Bulk delete tasks
 */
export async function bulkDeleteTasks(args: {
  taskIds?: number[];
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.taskIds || args.taskIds.length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'taskIds array is required for bulk delete operation',
      );
    }

    // Store taskIds in a const for TypeScript
    const taskIds = args.taskIds;

    // Check max tasks limit
    if (taskIds.length > MAX_BULK_OPERATION_TASKS) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Too many tasks for bulk operation. Maximum allowed: ${MAX_BULK_OPERATION_TASKS}. Consider breaking into smaller batches.`,
      );
    }

    // Validate all task IDs
    taskIds.forEach((id) => validateId(id, 'task ID'));

    const client = await getClientFromContext();

    // Fetch tasks before deletion for response metadata
    const fetchResult = await processTasksInBatches(
      taskIds,
      async (taskId: number) => {
        return await client.tasks.getTask(taskId);
      },
      'bulk_delete_fetch'
    );

    const tasksToDelete = fetchResult.successful;

    // Delete tasks using batch processing
    const deletionResult = await processTasksInBatches(
      taskIds,
      async (taskId: number) => {
        await client.tasks.deleteTask(taskId);
        return { taskId, deleted: true }; // Return result for tracking
      },
      'bulk_delete_execution'
    );

    // Check for any failures
    const failures = deletionResult.failed;

    if (failures.length > 0) {
      const failedIds = failures.map((f) => f.originalItem);
      const successCount = deletionResult.successful.length;

      // If some succeeded, report partial success
      if (successCount > 0) {
        const response = createStandardResponse(
          'delete-task',
          `Bulk delete partially completed. Successfully deleted ${successCount} tasks. Failed to delete task IDs: ${failedIds.join(', ')}`,
          { deletedTaskIds: failedIds.filter((id): id is number => id !== undefined) },
          {
            timestamp: new Date().toISOString(),
            count: successCount,
            failedCount: failures.length,
            failedIds: failedIds.filter((id): id is number => id !== undefined),
            previousState: tasksToDelete as unknown as Record<string, unknown>,
          },
        );

        // Override success to false for partial failures as expected by tests
        response.success = false;

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } else {
        // All failed
        throw new MCPError(
          ErrorCode.API_ERROR,
          `Bulk delete failed. Could not delete any tasks. Failed IDs: ${failedIds.join(', ')}`,
        );
      }
    }

    const response = createStandardResponse(
      'delete-task',
      `Successfully deleted ${taskIds.length} tasks`,
      { deletedTaskIds: taskIds },
      {
        timestamp: new Date().toISOString(),
        count: taskIds.length,
        previousState: tasksToDelete as unknown as Record<string, unknown>,
      },
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
      `Failed to bulk delete tasks: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Bulk create tasks
 */
export async function bulkCreateTasks(args: {
  projectId?: number;
  tasks?: Array<{
    title: string;
    description?: string;
    dueDate?: string;
    priority?: number;
    labels?: number[];
    assignees?: number[];
    repeatAfter?: number;
    repeatMode?: 'day' | 'week' | 'month' | 'year';
  }>;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.projectId) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'projectId is required for bulk create operation',
      );
    }
    validateId(args.projectId, 'projectId');

    if (!args.tasks || args.tasks.length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'tasks array is required and must contain at least one task',
      );
    }

    // Check max tasks limit
    if (args.tasks.length > MAX_BULK_OPERATION_TASKS) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Too many tasks for bulk operation. Maximum allowed: ${MAX_BULK_OPERATION_TASKS}. Consider breaking into smaller batches.`,
      );
    }

    // Validate all tasks have required fields
    args.tasks.forEach((task, index) => {
      if (!task.title || task.title.trim() === '') {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          `Task at index ${index} must have a non-empty title`,
        );
      }

      // Validate optional fields
      if (task.dueDate) {
        validateDateString(task.dueDate, `tasks[${index}].dueDate`);
      }

      if (task.assignees) {
        task.assignees.forEach((id) => validateId(id, `tasks[${index}].assignee ID`));
      }

      if (task.labels) {
        task.labels.forEach((id) => validateId(id, `tasks[${index}].label ID`));
      }
    });

    const client = await getClientFromContext();

    // Create tasks using batch processor
    const projectId = args.projectId; // TypeScript knows this is defined due to earlier check
    const creationResult = await createBatchProcessor.processBatches(
      args.tasks.map((_, index) => index), // Use indices as items
      async (index: number) => {
        const taskData = args.tasks?.[index];
        if (!taskData) {
          throw new Error(`Task data not found at index ${index}`);
        }
        
        // Create the base task
        const newTask: Task = {
          title: taskData.title,
          project_id: projectId,
        };

        if (taskData.description !== undefined) newTask.description = taskData.description;
        if (taskData.dueDate !== undefined) newTask.due_date = taskData.dueDate;
        if (taskData.priority !== undefined) newTask.priority = taskData.priority;
        // Handle repeat configuration for bulk create
        if (taskData.repeatAfter !== undefined || taskData.repeatMode !== undefined) {
          const repeatConfig = convertRepeatConfiguration(
            taskData.repeatAfter,
            taskData.repeatMode,
          );
          if (repeatConfig.repeat_after !== undefined)
            newTask.repeat_after = repeatConfig.repeat_after;
          if (repeatConfig.repeat_mode !== undefined) {
            // Use index signature to bypass type mismatch - API expects number but node-vikunja types expect string
            (newTask as Record<string, unknown>).repeat_mode = repeatConfig.repeat_mode;
          }
        }

        // Create the task
        const createdTask = await client.tasks.createTask(projectId, newTask);

        // Add labels and assignees if provided
        if (createdTask.id) {
          try {
            if (taskData.labels && taskData.labels.length > 0) {
              const taskId = createdTask.id;
              const labelIds = taskData.labels;
              await withRetry(
                () => client.tasks.updateTaskLabels(taskId, {
                  label_ids: labelIds,
                }),
                {
                  ...RETRY_CONFIG.AUTH_ERRORS,
                  shouldRetry: (error) => isAuthenticationError(error)
                }
              );
            }

            if (taskData.assignees && taskData.assignees.length > 0) {
              const taskId = createdTask.id;
              const assigneeIds = taskData.assignees;
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
                    'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
                      'This is a known limitation. The task was created but assignees could not be added. ' +
                      `(Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times). Task ID: ${createdTask.id}`,
                  );
                }
                throw assigneeError;
              }
            }

            // Fetch the complete task with labels and assignees
            return await client.tasks.getTask(createdTask.id);
          } catch (updateError) {
            // If updating labels/assignees fails, try to clean up
            try {
              await client.tasks.deleteTask(createdTask.id);
            } catch (deleteError) {
              logger.error('Failed to clean up partially created task:', deleteError);
            }
            throw updateError;
          }
        }

        return createdTask;
      }
    );

    // Process results
    const successfulTasks = creationResult.successful;
    const failedTasks = creationResult.failed.map((f) => ({
      index: f.originalItem,
      error: f.error instanceof Error ? f.error.message : String(f.error),
    }));

    if (failedTasks.length > 0 && successfulTasks.length === 0) {
      // All failed
      throw new MCPError(
        ErrorCode.API_ERROR,
        `Bulk create failed. Could not create any tasks. Errors: ${JSON.stringify(failedTasks)}`,
      );
    }

    const response = createStandardResponse(
      'create-tasks',
      failedTasks.length > 0
        ? `Bulk create partially completed. Successfully created ${successfulTasks.length} tasks, ${failedTasks.length} failed.`
        : `Successfully created ${successfulTasks.length} tasks`,
      { tasks: successfulTasks },
      {
        timestamp: new Date().toISOString(),
        count: successfulTasks.length,
        ...(failedTasks.length > 0 && {
          failedCount: failedTasks.length,
          failures: failedTasks,
        }),
      },
    );

    // Override success to false for partial failures as expected by tests
    if (failedTasks.length > 0) {
      response.success = false;
    }

  
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
      `Failed to bulk create tasks: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}