/**
 * Comment response formatter service
 * Handles response formatting for comment operations
 */

import type { StandardTaskResponse } from '../../../types/index';
import { formatAorpAsMarkdown } from '../../../aorp/markdown';

/**
 * Service for formatting comment operation responses
 */
export class CommentResponseFormatter {
  /**
   * Format successful comment creation response
   */
  static formatCreateCommentResponse(comment: any): StandardTaskResponse {
    return {
      success: true,
      operation: 'comment',
      message: 'Comment added successfully',
      comment: comment,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Format successful comment list response
   */
  static formatListCommentsResponse(comments: any[]): StandardTaskResponse {
    return {
      success: true,
      operation: 'list',
      message: `Found ${comments.length} comments`,
      comments: comments,
      metadata: {
        timestamp: new Date().toISOString(),
        count: comments.length,
      },
    };
  }

  /**
   * Format MCP response wrapper
   */
  static formatMcpResponse(response: StandardTaskResponse): { content: Array<{ type: 'text'; text: string }> } {
    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(response as any),
        },
      ],
    };
  }
}