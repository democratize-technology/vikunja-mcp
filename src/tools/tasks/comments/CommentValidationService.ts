/**
 * Comment validation service
 * Handles input validation for comment operations
 */

import { MCPError, ErrorCode } from '../../../types/index';
import { validateId } from '../validation';

export interface CommentOperationInput {
  id?: number;
  comment?: string;
}

/**
 * Service for validating comment operation inputs
 */
export class CommentValidationService {
  /**
   * Validate input for comment operations (create or list)
   */
  static validateCommentInput(args: CommentOperationInput): { taskId: number; commentText?: string } {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for comment operation');
    }
    validateId(args.id, 'id');

    return {
      taskId: args.id,
      commentText: args.comment,
    };
  }

  /**
   * Validate input specifically for listing comments
   */
  static validateListInput(args: { id?: number }): { taskId: number } {
    if (!args.id) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Task id is required for list-comments operation',
      );
    }
    validateId(args.id, 'id');

    return {
      taskId: args.id,
    };
  }

  /**
   * Check if operation should create a comment or list comments
   */
  static shouldCreateComment(commentText?: string): boolean {
    return commentText !== undefined && commentText.trim() !== '';
  }
}