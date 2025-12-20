/**
 * Comment operations service
 * Handles core business logic for task comment management
 */

import type { TaskComment } from '../../../types/vikunja';
import { getClientFromContext } from '../../../client';

/**
 * Service for managing task comment operations
 */
export const CommentOperationsService = {
  /**
   * Create a new comment on a task
   */
  async createComment(taskId: number, commentText: string): Promise<TaskComment> {
    const client = await getClientFromContext();
    return await client.tasks.createTaskComment(taskId, {
      task_id: taskId,
      comment: commentText,
    });
  },

  /**
   * Fetch all comments for a task
   */
  async fetchTaskComments(taskId: number): Promise<TaskComment[]> {
    const client = await getClientFromContext();
    return await client.tasks.getTaskComments(taskId);
  },

  /**
   * Get comment count from comments array
   */
  getCommentCount(comments: TaskComment[]): number {
    return comments.length;
  },
};