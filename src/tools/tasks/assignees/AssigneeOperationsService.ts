/**
 * Assignee operations service
 * Handles core business logic for task assignee management
 */

import type { MinimalTask, TaskWithAssignees, Assignee } from '../../../types';
import { MCPError, ErrorCode } from '../../../types';
import { getClientFromContext } from '../../../client';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { AUTH_ERROR_MESSAGES } from '../constants';

/**
 * Service for managing task assignee operations
 */
export const AssigneeOperationsService = {
  /**
   * Assign multiple users to a task
   */
  async assignUsersToTask(taskId: number, assigneeIds: number[]): Promise<void> {
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
  },

  /**
   * Remove multiple users from a task
   */
  async removeUsersFromTask(taskId: number, userIds: number[]): Promise<void> {
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
  },

  /**
   * Fetch task data to get current assignees
   */
  async fetchTaskWithAssignees(taskId: number): Promise<TaskWithAssignees> {
    const client = await getClientFromContext();
    const task = await client.tasks.getTask(taskId);
    // Ensure required properties exist for TaskWithAssignees
    if (!task.id) {
      throw new MCPError(ErrorCode.INTERNAL_ERROR, 'Task returned from API is missing required id field');
    }
    return {
      ...task,
      id: task.id,
      title: task.title || '',
      assignees: task.assignees || [],
    };
  },

  /**
   * Extract assignee information from task
   */
  extractAssignees(task: TaskWithAssignees): Assignee[] {
    return task.assignees || [];
  },

  /**
   * Create minimal task representation with assignees
   */
  createMinimalTaskWithAssignees(task: TaskWithAssignees): MinimalTask {
    const assignees = AssigneeOperationsService.extractAssignees(task);

    return {
      ...(task.id !== undefined && { id: task.id }),
      title: task.title,
      assignees: assignees,
    };
  }
};