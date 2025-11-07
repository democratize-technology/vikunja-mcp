/**
 * Assignee operations service
 * Handles core business logic for task assignee management
 */

import type { StandardTaskResponse, MinimalTask } from '../../../types/index';
import { MCPError, ErrorCode } from '../../../types/index';
import { getClientFromContext } from '../../../client';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { AUTH_ERROR_MESSAGES } from '../constants';

/**
 * Service for managing task assignee operations
 */
export class AssigneeOperationsService {
  /**
   * Assign multiple users to a task
   */
  static async assignUsersToTask(taskId: number, assigneeIds: number[]): Promise<void> {
    const client = await getClientFromContext();

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
          `${AUTH_ERROR_MESSAGES.ASSIGNEE_ASSIGN} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`
        );
      }
      throw assigneeError;
    }
  }

  /**
   * Remove multiple users from a task
   */
  static async removeUsersFromTask(taskId: number, userIds: number[]): Promise<void> {
    const client = await getClientFromContext();

    // Remove users from the task with retry logic
    for (const userId of userIds) {
      try {
        await withRetry(
          () => client.tasks.removeUserFromTask(taskId, userId),
          {
            ...RETRY_CONFIG.AUTH_ERRORS,
            shouldRetry: (error) => isAuthenticationError(error)
          }
        );
      } catch (removeError) {
        // Check if it's an auth error after retries
        if (isAuthenticationError(removeError)) {
          throw new MCPError(
            ErrorCode.API_ERROR,
            `${AUTH_ERROR_MESSAGES.ASSIGNEE_REMOVE} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`
          );
        }
        throw removeError;
      }
    }
  }

  /**
   * Fetch task data to get current assignees
   */
  static async fetchTaskWithAssignees(taskId: number): Promise<any> {
    const client = await getClientFromContext();
    return await client.tasks.getTask(taskId);
  }

  /**
   * Extract assignee information from task
   */
  static extractAssignees(task: any): any[] {
    return task.assignees || [];
  }

  /**
   * Create minimal task representation with assignees
   */
  static createMinimalTaskWithAssignees(task: any): MinimalTask {
    const assignees = this.extractAssignees(task);

    return {
      ...(task.id !== undefined && { id: task.id }),
      title: task.title,
      assignees: assignees,
    };
  }
}