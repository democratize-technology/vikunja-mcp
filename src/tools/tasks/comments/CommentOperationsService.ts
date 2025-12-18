/**
 * Comment operations service
 * Handles core business logic for task comment management
 */

import type { StandardTaskResponse } from '../../../types';
import type { TaskComment } from '../../../types/vikunja';
import { getClientFromContext } from '../../../client';

/**
 * Service for managing task comment operations
 */
export class CommentOperationsService {
  /**
   * Create a new comment on a task
   */
  static async createComment(taskId: number, commentText: string): Promise<TaskComment> {
    const client = await getClientFromContext();
    return await client.tasks.createTaskComment(taskId, {
      task_id: taskId,
      comment: commentText,
    });
  }

  /**
   * Fetch all comments for a task
   */
  static async fetchTaskComments(taskId: number): Promise<TaskComment[]> {
    const client = await getClientFromContext();
    return await client.tasks.getTaskComments(taskId);
  }

  /**
   * Get comment count from comments array
   */
  static getCommentCount(comments: TaskComment[]): number {
    return comments.length;
  }
}