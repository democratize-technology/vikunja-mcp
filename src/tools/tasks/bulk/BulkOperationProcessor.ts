/**
 * Main orchestration for bulk operations
 */

import { MCPError, ErrorCode, createStandardResponse, getClientFromContext, logger, isAuthenticationError, RETRY_CONFIG, transformApiError, handleFetchError } from '../../../index';
import { withRetry } from '../../../utils/retry';
import type { BatchResult } from '../../../utils/performance/batch-processor';
import type { Task, VikunjaClient } from 'node-vikunja';
import { BatchProcessorFactory, BulkOperationValidator, BulkOperationErrorHandler, type BulkUpdateArgs, type BulkDeleteArgs, type BulkCreateArgs, type BulkCreateTaskData } from './index';
import { convertRepeatConfiguration } from '../validation';
import { REPEAT_MODE_MAP } from '../constants';

import { formatAorpAsMarkdown } from '../../../utils/response-factory';
/**
 * Main processor for all bulk operations
 */
export const BulkOperationProcessor = {
  /**
   * Bulk update tasks with fallback support
   */
  async bulkUpdateTasks(args: BulkUpdateArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      // Validate inputs
      BulkOperationValidator.validateBulkUpdate(args);
      BulkOperationValidator.preprocessFieldValue(args);
      BulkOperationValidator.validateFieldConstraints(args);

      const taskIds = args.taskIds; // Validated by BulkOperationValidator.validateBulkUpdate
      if (!taskIds) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, 'taskIds is required after validation');
      }
      const client = await getClientFromContext();

      // Try the proper bulk update API first
      try {
        return await BulkOperationProcessor.attemptBulkUpdateAPI(args, taskIds, client);
      } catch (bulkError) {
        // Fall back to individual updates
        return await BulkOperationErrorHandler.handleBulkUpdateFallback(args, taskIds, bulkError as Error);
      }
    } catch (error) {
      // Re-throw MCPError instances without modification
      if (error instanceof MCPError) {
        throw error;
      }

      // Handle fetch/connection errors with helpful guidance
      if (error instanceof Error && (
        error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')
      )) {
        throw handleFetchError(error, 'bulk update tasks');
      }

      // Use standardized error transformation for all other errors
      throw transformApiError(error, 'Failed to bulk update tasks');
    }
  },

  /**
   * Attempt the bulk update API first
   */
  async attemptBulkUpdateAPI(
    args: BulkUpdateArgs,
    taskIds: number[],
    client: VikunjaClient
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    // Build the bulk update operation
    // Note: args.field and args.value are validated to be non-undefined in BulkOperationValidator
    if (!args.field) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Field is required for bulk update operation');
    }
    const bulkOperation = {
      task_ids: taskIds,
      field: args.field, // Validated by BulkOperationValidator.validateFieldConstraints
      value: args.value,
    };

    // Handle repeat_mode conversion
    if (args.field === 'repeat_mode' && typeof args.value === 'string') {
      bulkOperation.value = REPEAT_MODE_MAP[args.value] ?? args.value;
    }

    // Call the proper bulk update API
    logger.debug('Calling bulkUpdateTasks API', { bulkOperation });
    const bulkUpdateResult = await client.tasks.bulkUpdateTasks(bulkOperation);

    // Handle inconsistent return types from the bulk update API
    const { updatedTasks, bulkUpdateSuccessful } = BulkOperationProcessor.processBulkUpdateResult(args, bulkUpdateResult);

    if (!bulkUpdateSuccessful) {
      throw new Error('Bulk update API reported success but did not update task values');
    }

    // If we don't have the updated tasks yet (Message response), fetch them
    if (updatedTasks.length === 0) {
      const fetchResult = await BatchProcessorFactory.processBatches(
        taskIds,
        async (taskId: number) => {
          return await client.tasks.getTask(taskId);
        },
        'bulk_update_fetch'
      );

      return BulkOperationProcessor.createUpdateResponse(taskIds, fetchResult.successful, args.field || 'unknown', fetchResult.failed.length);
    }

    return BulkOperationProcessor.createUpdateResponse(taskIds, updatedTasks, args.field || 'unknown', 0);
  },

  /**
   * Process the inconsistent bulk update API result
   */
  processBulkUpdateResult(
    args: BulkUpdateArgs,
    bulkUpdateResult: unknown
  ): { updatedTasks: Task[], bulkUpdateSuccessful: boolean } {
    let updatedTasks: Task[] = [];
    let bulkUpdateSuccessful = false;

    if (Array.isArray(bulkUpdateResult)) {
      if (bulkUpdateResult.length > 0) {
        bulkUpdateSuccessful = true;

        // Verify the returned tasks have the expected values
        for (const task of bulkUpdateResult) {
          // Type guard to ensure task is a valid Task object
          if (!BulkOperationProcessor.isValidTask(task)) {
            logger.warn('Bulk update API returned invalid task object', { task: JSON.stringify(task) });
            bulkUpdateSuccessful = false;
            break;
          }

          const fieldName = args.field;
          if (!fieldName || !BulkOperationProcessor.verifyTaskFieldValue(task, fieldName, args.value)) {
            logger.warn(`Bulk update API returned task with unchanged ${fieldName || 'unknown'}`, {
              taskId: task.id,
              expected: args.value,
              actual: task[args.field as keyof Task],
            });
            bulkUpdateSuccessful = false;
            break;
          }
        }

        if (bulkUpdateSuccessful) {
          // Cast to Task[] since we've validated each item
          updatedTasks = bulkUpdateResult as Task[];
        }
      }
    } else if (
      bulkUpdateResult &&
      typeof bulkUpdateResult === 'object' &&
      'message' in bulkUpdateResult
    ) {
      bulkUpdateSuccessful = true;
    }

    return { updatedTasks, bulkUpdateSuccessful };
  },

  /**
   * Type guard to validate that an object is a valid Task
   */
  isValidTask(obj: unknown): obj is Task {
    if (obj === null || typeof obj !== 'object') {
      return false;
    }

    const taskObj = obj as Record<string, unknown>;
    return (
      'project_id' in taskObj &&
      'title' in taskObj &&
      typeof taskObj.project_id === 'number' &&
      typeof taskObj.title === 'string'
    );
  },

  /**
   * Verify that a task field has the expected value
   */
  verifyTaskFieldValue(task: Task, field: string, value: unknown): boolean {
    switch (field) {
      case 'priority':
      case 'done':
      case 'due_date':
      case 'project_id':
        return task[field as keyof Task] === value;
      default:
        return true; // For complex fields, assume success
    }
  },

  /**
   * Create the update response
   */
  createUpdateResponse(
    taskIds: number[],
    updatedTasks: Task[],
    field: string,
    fetchErrors: number
  ): { content: Array<{ type: 'text'; text: string }> } {
    const response = createStandardResponse(
      'update-task',
      `Successfully updated ${taskIds.length} tasks${fetchErrors > 0 ? ` (${fetchErrors} tasks could not be fetched after update)` : ''}`,
      { tasks: updatedTasks },
      {
        timestamp: new Date().toISOString(),
        count: taskIds.length,
        affectedFields: [field],
        ...(fetchErrors > 0 && { fetchErrors }),
      },
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response),
        },
      ],
    };
  },

  /**
   * Bulk delete tasks
   */
  async bulkDeleteTasks(args: BulkDeleteArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      BulkOperationValidator.validateBulkDelete(args);

      const taskIds = args.taskIds; // Validated by BulkOperationValidator.validateBulkUpdate
      if (!taskIds) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, 'taskIds is required after validation');
      }
      const client = await getClientFromContext();

      // Fetch tasks before deletion for response metadata
      const fetchResult = await BatchProcessorFactory.processBatches(
        taskIds,
        async (taskId: number) => {
          return await client.tasks.getTask(taskId);
        },
        'bulk_delete_fetch'
      );

      const tasksToDelete = fetchResult.successful;

      // Delete tasks using batch processing
      const deletionResult = await BatchProcessorFactory.processBatches(
        taskIds,
        async (taskId: number) => {
          await client.tasks.deleteTask(taskId);
          return { taskId, deleted: true };
        },
        'bulk_delete_execution'
      );

      return BulkOperationProcessor.processDeleteResults(taskIds, deletionResult, tasksToDelete);
    } catch (error) {
      // Re-throw MCPError instances without modification
      if (error instanceof MCPError) {
        throw error;
      }

      // Handle fetch/connection errors with helpful guidance
      if (error instanceof Error && (
        error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')
      )) {
        throw handleFetchError(error, 'bulk delete tasks');
      }

      // Use standardized error transformation for all other errors
      throw transformApiError(error, 'Failed to bulk delete tasks');
    }
  },

  /**
   * Process delete operation results
   */
  processDeleteResults(
    taskIds: number[],
    deletionResult: BatchResult<{ taskId: number; deleted: boolean; }>,
    tasksToDelete: Task[]
  ): { content: Array<{ type: 'text'; text: string }> } {
    const failures = deletionResult.failed;

    if (failures.length > 0) {
      const failedIds = failures.map((f) => f.originalItem as number);
      const successCount = deletionResult.successful.length;

      if (successCount > 0) {
        // Create a mixed success/failure response
        const response = createStandardResponse(
          'delete-task',
          `Bulk delete partially completed. Successfully deleted ${successCount} tasks. Failed to delete task IDs: ${failedIds.join(', ')}`,
          { deletedTaskIds: failedIds.filter((id: unknown): id is number => id !== undefined) },
          {
            timestamp: new Date().toISOString(),
            count: successCount,
            failedCount: failures.length,
            failedIds: failedIds.filter((id: unknown): id is number => id !== undefined),
            previousState: tasksToDelete as unknown as Record<string, unknown>,
            success: false, // Mark as partial failure
          },
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: formatAorpAsMarkdown(response),
            },
          ],
        };
      } else {
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
          text: formatAorpAsMarkdown(response),
        },
      ],
    };
  },

  /**
   * Bulk create tasks
   */
  async bulkCreateTasks(args: BulkCreateArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      BulkOperationValidator.validateBulkCreate(args);

      const client = await getClientFromContext();
      const projectId = args.projectId;
      if (!projectId) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, 'projectId is required for bulk task creation');
      }

      // Create tasks using batch processor
      const tasks = args.tasks;
      if (!tasks) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, 'tasks array is required for bulk task creation');
      }
      const creationResult = await BatchProcessorFactory.getCreateProcessor().processBatches(
        tasks.map((_, index) => index), // Use indices as items
        async (index: number) => {
          const taskData = tasks[index];
          if (!taskData) {
            throw new Error(`Task data at index ${index} is undefined`);
          }
          return await BulkOperationProcessor.createIndividualTask(client, projectId, taskData, index);
        }
      );

      return BulkOperationProcessor.processCreateResults(creationResult);
    } catch (error) {
      // Re-throw MCPError instances without modification
      if (error instanceof MCPError) {
        throw error;
      }

      // Handle fetch/connection errors with helpful guidance
      if (error instanceof Error && (
        error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')
      )) {
        throw handleFetchError(error, 'bulk create tasks');
      }

      // Use standardized error transformation for all other errors
      throw transformApiError(error, 'Failed to bulk create tasks');
    }
  },

  /**
   * Create an individual task as part of bulk operation
   */
  async createIndividualTask(
    client: VikunjaClient,
    projectId: number,
    taskData: BulkCreateTaskData,
    _index: number
  ): Promise<Task> {
    // Create the base task
    const newTask: Task = {
      title: taskData.title,
      project_id: projectId,
    };

    if (taskData.description !== undefined) newTask.description = taskData.description;
    if (taskData.dueDate !== undefined) newTask.due_date = taskData.dueDate;
    if (taskData.priority !== undefined) newTask.priority = taskData.priority;

    // Handle repeat configuration
    if (taskData.repeatAfter !== undefined || taskData.repeatMode !== undefined) {
      const repeatConfig = convertRepeatConfiguration(
        taskData.repeatAfter,
        taskData.repeatMode,
      );
      if (repeatConfig.repeat_after !== undefined)
        newTask.repeat_after = repeatConfig.repeat_after;
      if (repeatConfig.repeat_mode !== undefined) {
        (newTask as Record<string, unknown>).repeat_mode = repeatConfig.repeat_mode;
      }
    }

    // Create the task
    const createdTask = await client.tasks.createTask(projectId, newTask);

    if (createdTask.id) {
      try {
        await BulkOperationProcessor.handleTaskPostCreation(client, createdTask.id, taskData);
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
  },

  /**
   * Handle post-creation operations (labels, assignees)
   */
  async handleTaskPostCreation(
    client: VikunjaClient,
    taskId: number,
    taskData: BulkCreateTaskData
  ): Promise<void> {
    // Add labels and assignees if provided
    if (taskData.labels && taskData.labels.length > 0) {
      await withRetry(
        () => client.tasks.updateTaskLabels(taskId, {
          label_ids: taskData.labels || [],
        }),
        {
          maxRetries: RETRY_CONFIG.AUTH_ERRORS.maxRetries,
          timeout: RETRY_CONFIG.AUTH_ERRORS.initialDelay + RETRY_CONFIG.AUTH_ERRORS.maxDelay,
          shouldRetry: (error: unknown) => isAuthenticationError(error)
        }
      );
    }

    if (taskData.assignees && taskData.assignees.length > 0) {
      try {
        await withRetry(
          () => client.tasks.bulkAssignUsersToTask(taskId, {
            user_ids: taskData.assignees || [],
          }),
          {
            maxRetries: RETRY_CONFIG.AUTH_ERRORS.maxRetries,
            timeout: RETRY_CONFIG.AUTH_ERRORS.initialDelay + RETRY_CONFIG.AUTH_ERRORS.maxDelay,
            shouldRetry: (error: unknown) => isAuthenticationError(error)
          }
        );
      } catch (assigneeError) {
        if (isAuthenticationError(assigneeError)) {
          throw new MCPError(
            ErrorCode.API_ERROR,
            'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
              'This is a known limitation. The task was created but assignees could not be added. ' +
              `(Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times). Task ID: ${taskId}`,
          );
        }
        throw assigneeError;
      }
    }
  },

  /**
   * Process create operation results
   */
  processCreateResults(creationResult: BatchResult<Task>): { content: Array<{ type: 'text'; text: string }> } {
    const successfulTasks = creationResult.successful;
    const failedTasks = creationResult.failed.map((f) => ({
      index: f.originalItem as number,
      error: f.error instanceof Error ? f.error.message : String(f.error),
    }));

    if (failedTasks.length > 0 && successfulTasks.length === 0) {
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
        success: failedTasks.length === 0, // Mark as failed if there are any failures
        ...(failedTasks.length > 0 && {
          failedCount: failedTasks.length,
          failures: failedTasks,
        }),
      },
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response),
        },
      ],
    };
  },
};