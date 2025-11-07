/**
 * Main orchestration for bulk operations
 */

import { MCPError, ErrorCode, createStandardResponse } from '../../../types/index';
import { getClientFromContext } from '../../../client';
import type { Task, VikunjaClient } from 'node-vikunja';
import { logger } from '../../../utils/logger';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { BatchProcessorFactory } from './BatchProcessorFactory';
import { BulkOperationValidator, type BulkUpdateArgs, type BulkDeleteArgs, type BulkCreateArgs } from './BulkOperationValidator';
import { BulkOperationErrorHandler } from './BulkOperationErrorHandler';
import { convertRepeatConfiguration } from '../validation';

/**
 * Main processor for all bulk operations
 */
export class BulkOperationProcessor {
  /**
   * Bulk update tasks with fallback support
   */
  static async bulkUpdateTasks(args: BulkUpdateArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      // Validate inputs
      BulkOperationValidator.validateBulkUpdate(args);
      BulkOperationValidator.preprocessFieldValue(args);
      BulkOperationValidator.validateFieldConstraints(args);

      const taskIds = args.taskIds!;
      const client = await getClientFromContext();

      // Try the proper bulk update API first
      try {
        return await this.attemptBulkUpdateAPI(args, taskIds, client);
      } catch (bulkError) {
        // Fall back to individual updates
        return await BulkOperationErrorHandler.handleBulkUpdateFallback(args, taskIds, bulkError as Error);
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
   * Attempt the bulk update API first
   */
  private static async attemptBulkUpdateAPI(
    args: BulkUpdateArgs,
    taskIds: number[],
    client: VikunjaClient
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    // Build the bulk update operation
    // Note: args.field and args.value are validated to be non-undefined in BulkOperationValidator
    const bulkOperation = {
      task_ids: taskIds,
      field: args.field!,
      value: args.value,
    };

    // Handle repeat_mode conversion
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
    const { updatedTasks, bulkUpdateSuccessful } = await this.processBulkUpdateResult(args, bulkUpdateResult);

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

      return this.createUpdateResponse(taskIds, fetchResult.successful, args.field!, fetchResult.failed.length);
    }

    return this.createUpdateResponse(taskIds, updatedTasks, args.field!, 0);
  }

  /**
   * Process the inconsistent bulk update API result
   */
  private static async processBulkUpdateResult(
    args: BulkUpdateArgs,
    bulkUpdateResult: any
  ): Promise<{ updatedTasks: Task[], bulkUpdateSuccessful: boolean }> {
    let updatedTasks: Task[] = [];
    let bulkUpdateSuccessful = false;

    if (Array.isArray(bulkUpdateResult)) {
      if (bulkUpdateResult.length > 0) {
        bulkUpdateSuccessful = true;

        // Verify the returned tasks have the expected values
        for (const task of bulkUpdateResult) {
          if (!this.verifyTaskFieldValue(task, args.field!, args.value)) {
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

    return { updatedTasks, bulkUpdateSuccessful };
  }

  /**
   * Verify that a task field has the expected value
   */
  private static verifyTaskFieldValue(task: Task, field: string, value: unknown): boolean {
    switch (field) {
      case 'priority':
      case 'done':
      case 'due_date':
      case 'project_id':
        return task[field as keyof Task] === value;
      default:
        return true; // For complex fields, assume success
    }
  }

  /**
   * Create the update response
   */
  private static createUpdateResponse(
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
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }

  /**
   * Bulk delete tasks
   */
  static async bulkDeleteTasks(args: BulkDeleteArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      BulkOperationValidator.validateBulkDelete(args);

      const taskIds = args.taskIds!;
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

      return this.processDeleteResults(taskIds, deletionResult, tasksToDelete);
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
   * Process delete operation results
   */
  private static processDeleteResults(
    taskIds: number[],
    deletionResult: any,
    tasksToDelete: Task[]
  ): { content: Array<{ type: 'text'; text: string }> } {
    const failures = deletionResult.failed;

    if (failures.length > 0) {
      const failedIds = failures.map((f: any) => f.originalItem);
      const successCount = deletionResult.successful.length;

      if (successCount > 0) {
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
          },
        );

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
  }

  /**
   * Bulk create tasks
   */
  static async bulkCreateTasks(args: BulkCreateArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      BulkOperationValidator.validateBulkCreate(args);

      const client = await getClientFromContext();
      const projectId = args.projectId!;

      // Create tasks using batch processor
      const creationResult = await BatchProcessorFactory.getCreateProcessor().processBatches(
        args.tasks!.map((_, index) => index), // Use indices as items
        async (index: number) => {
          return await this.createIndividualTask(client, projectId, args.tasks![index], index);
        }
      );

      return this.processCreateResults(creationResult);
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

  /**
   * Create an individual task as part of bulk operation
   */
  private static async createIndividualTask(
    client: VikunjaClient,
    projectId: number,
    taskData: any,
    index: number
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
        await this.handleTaskPostCreation(client, createdTask.id, taskData);
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

  /**
   * Handle post-creation operations (labels, assignees)
   */
  private static async handleTaskPostCreation(
    client: VikunjaClient,
    taskId: number,
    taskData: any
  ): Promise<void> {
    // Add labels and assignees if provided
    if (taskData.labels && taskData.labels.length > 0) {
      await withRetry(
        () => client.tasks.updateTaskLabels(taskId, {
          label_ids: taskData.labels,
        }),
        {
          ...RETRY_CONFIG.AUTH_ERRORS,
          shouldRetry: (error) => isAuthenticationError(error)
        }
      );
    }

    if (taskData.assignees && taskData.assignees.length > 0) {
      try {
        await withRetry(
          () => client.tasks.bulkAssignUsersToTask(taskId, {
            user_ids: taskData.assignees,
          }),
          {
            ...RETRY_CONFIG.AUTH_ERRORS,
            shouldRetry: (error) => isAuthenticationError(error)
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
  }

  /**
   * Process create operation results
   */
  private static processCreateResults(creationResult: any): { content: Array<{ type: 'text'; text: string }> } {
    const successfulTasks = creationResult.successful;
    const failedTasks = creationResult.failed.map((f: any) => ({
      index: f.originalItem,
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
        ...(failedTasks.length > 0 && {
          failedCount: failedTasks.length,
          failures: failedTasks,
        }),
      },
    );

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
  }
}