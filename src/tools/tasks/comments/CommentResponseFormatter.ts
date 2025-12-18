/**
 * Comment response formatter service
 * Handles response formatting for comment operations
 */

import type { StandardTaskResponse, ResponseMetadata } from '../../../types';
import type { TaskComment } from '../../../types/vikunja';
import { createStandardResponse } from '../../../types';
import { formatAorpAsMarkdown } from '../../../utils/response-factory';

/**
 * Service for formatting comment operation responses
 */
export class CommentResponseFormatter {
  /**
   * Format successful comment creation response
   */
  static formatCreateCommentResponse(comment: TaskComment): StandardTaskResponse {
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
  static formatListCommentsResponse(comments: TaskComment[]): StandardTaskResponse {
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
    // Handle metadata properly to avoid type issues
    const safeMetadata: ResponseMetadata = {
      timestamp: response.metadata?.timestamp || new Date().toISOString(),
      ...(response.metadata?.count !== undefined ? { count: response.metadata.count } : {}),
      ...(response.metadata?.affectedFields ? { affectedFields: response.metadata.affectedFields } : {}),
      // Convert previousState to proper Record<string, unknown> if it exists
      ...(response.metadata?.previousState && typeof response.metadata.previousState === 'object' && response.metadata.previousState !== null
        ? { previousState: response.metadata.previousState as Record<string, unknown> }
        : {})
    };

    // Create proper AORP response instead of casting StandardTaskResponse
    const aorpResponse = createStandardResponse(
      response.operation || 'unknown',
      response.message || 'Operation completed',
      response,
      safeMetadata
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(aorpResponse), // Format AORP response as markdown
        },
      ],
    };
  }
}