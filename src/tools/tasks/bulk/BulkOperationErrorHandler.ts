/**
 * Error handling and fallback logic for bulk operations
 */

import { MCPError, ErrorCode, createStandardResponse, type Assignee } from '../../../types/index';
import { getClientFromContext } from '../../../client';
import type { Task, VikunjaClient } from 'node-vikunja';
import { logger } from '../../../utils/logger';
import { formatAorpAsMarkdown } from '../../../utils/response-factory';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { BatchProcessorFactory } from './index';
import { AUTH_ERROR_MESSAGES } from '../constants';
import type { BulkOperationFailure } from './BulkOperationTypes';
import type { BulkUpdateArgs } from './BulkOperationValidator';
import type { BatchResult } from '../../../utils/performance/batch-processor';

/**
 * Handles fallback logic when bulk APIs fail
 */
export const bulkOperationErrorHandler = {
  /**
   * Handle bulk update fallback when main API fails
   */
  async handleBulkUpdateFallback(
    args: BulkUpdateArgs,
    taskIds: number[],
    bulkError: Error
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    logger.warn('Bulk update API failed, falling back to individual updates', {
      error: bulkError instanceof Error ? bulkError.message : String(bulkError),
      field: args.field,
    });

    const client = await getClientFromContext();

    // Perform bulk update using individual task updates as fallback
    const updateResult = await BatchProcessorFactory.processBatches(
      taskIds,
      async (taskId: number) => {
        return await this.updateIndividualTask(client, taskId, args);
      },
      'bulk_update_individual_fallback'
    );

    // Process results and handle failures
    return await this.processUpdateResults(args, taskIds, updateResult);
  },

  /**
   * Update a single task as part of fallback logic
   */
  async updateIndividualTask(
    client: VikunjaClient,
    taskId: number,
    args: BulkUpdateArgs
  ): Promise<Task> {
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
        // Handled separately below
        break;
      case 'labels':
        // Handled separately below
        break;
      case 'repeat_after':
        updateData.repeat_after = args.value as number;
        break;
      case 'repeat_mode':
        Object.assign(updateData, { repeat_mode: args.value });
        break;
    }

    // Update the task
    const updatedTask = await client.tasks.updateTask(taskId, updateData);

    // Handle special fields that require separate API calls
    await this.handleSpecialFields(client, taskId, args, updatedTask);

    return updatedTask;
  },

  /**
   * Handle fields that require separate API calls (assignees, labels)
   */
  async handleSpecialFields(
    client: VikunjaClient,
    taskId: number,
    args: BulkUpdateArgs,
    updatedTask: Task
  ): Promise<void> {
    if (args.field === 'assignees' && Array.isArray(args.value)) {
      await this.handleAssigneeUpdate(client, taskId, args.value as number[]);
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
  },

  /**
   * Handle assignee updates with proper error handling
   */
  async handleAssigneeUpdate(
    client: VikunjaClient,
    taskId: number,
    newAssigneeIds: number[]
  ): Promise<void> {
    try {
      // Replace all assignees with the new list
      const currentTaskWithAssignees = await client.tasks.getTask(taskId);
      const currentAssigneeIds = currentTaskWithAssignees.assignees?.map((a: Assignee) => a.id) || [];

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
      if (isAuthenticationError(assigneeError)) {
        throw new MCPError(
          ErrorCode.API_ERROR,
          `${AUTH_ERROR_MESSAGES.ASSIGNEE_BULK_UPDATE} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`
        );
      }
      throw assigneeError;
    }
  },

  /**
   * Process update results and handle various failure scenarios
   */
  async processUpdateResults(
    args: BulkUpdateArgs,
    taskIds: number[],
    updateResult: BatchResult<Task>
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const failures = updateResult.failed;
    const successCount = updateResult.successful.length;

    if (failures.length > 0) {
      await this.handleUpdateFailures(args, failures, successCount);
    }

    // Use successful tasks from the update operation, or fetch fresh if needed
    let updatedTasks = updateResult.successful;
    let failedFetches = 0;

    if (updatedTasks.length < successCount) {
      const fetchResult = await BatchProcessorFactory.processBatches(
        taskIds,
        async (taskId: number) => {
          const client = await getClientFromContext();
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
        affectedFields: args.field ? [args.field] : [],
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
          text: formatAorpAsMarkdown(response), // createStandardResponse returns AORP object, format as markdown
        },
      ],
    };
  },

  /**
   * Handle various types of update failures
   */
  async handleUpdateFailures(
    args: BulkUpdateArgs,
    failures: Array<{ index: number; error: unknown; originalItem: unknown }>,
    successCount: number
  ): Promise<void> {
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
};