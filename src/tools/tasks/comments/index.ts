/**
 * Comment operations for tasks
 * Refactored to use modular service architecture
 */

import { MCPError, ErrorCode } from '../../../types';
import { CommentOperationsService } from './CommentOperationsService';
import { commentValidationService } from './CommentValidationService';
import { commentResponseFormatter } from './CommentResponseFormatter';

/**
 * Add a comment to a task or list task comments
 */
export async function handleComment(args: {
  id?: number;
  comment?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    const { taskId, commentText } = commentValidationService.validateCommentInput(args);

    // If no comment text provided, list comments
    if (!commentValidationService.shouldCreateComment(commentText)) {
      const comments = await CommentOperationsService.fetchTaskComments(taskId);

      // Format and return response
      const response = commentResponseFormatter.formatListCommentsResponse(comments);
      return commentResponseFormatter.formatMcpResponse(response);
    }

    // Create a new comment
    if (!commentText) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Comment text is required for comment creation');
    }
    const newComment = await CommentOperationsService.createComment(taskId, commentText);

    // Format and return response
    const response = commentResponseFormatter.formatCreateCommentResponse(newComment);
    return commentResponseFormatter.formatMcpResponse(response);

  } catch (error) {
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to handle comment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Remove a comment from a task
 * Note: This functionality is not available in the current node-vikunja API
 */
export function removeComment(): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  throw new MCPError(
    ErrorCode.NOT_IMPLEMENTED,
    'Comment deletion is not currently supported by the node-vikunja API',
  );
}

/**
 * List all comments for a task
 */
export async function listComments(args: {
  id?: number;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    const { taskId } = commentValidationService.validateListInput(args);

    const comments = await CommentOperationsService.fetchTaskComments(taskId);

    // Format and return response
    const response = commentResponseFormatter.formatListCommentsResponse(comments);
    return commentResponseFormatter.formatMcpResponse(response);

  } catch (error) {
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to list comments: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}