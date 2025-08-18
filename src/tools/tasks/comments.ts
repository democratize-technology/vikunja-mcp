/**
 * Comment operations for tasks
 */

import type { StandardTaskResponse } from '../../types/index';
import { MCPError, ErrorCode } from '../../types/index';
import { getClientFromContext } from '../../client';
import { validateId } from './validation';

/**
 * Add a comment to a task or list task comments
 */
export async function handleComment(args: {
  id?: number;
  comment?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for comment operation');
    }
    validateId(args.id, 'id');

    const client = await getClientFromContext();

    // If no comment text provided, list comments
    if (!args.comment) {
      const comments = await client.tasks.getTaskComments(args.id);

      const response: StandardTaskResponse = {
        success: true,
        operation: 'comment',
        message: `Found ${comments.length} comments`,
        comments: comments,
        metadata: {
          timestamp: new Date().toISOString(),
          count: comments.length,
        },
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    // Create a new comment
    const newComment = await client.tasks.createTaskComment(args.id, {
      task_id: args.id,
      comment: args.comment,
    });

    const response: StandardTaskResponse = {
      success: true,
      operation: 'comment',
      message: 'Comment added successfully',
      comment: newComment,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
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
    if (!args.id) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Task id is required for list-comments operation',
      );
    }
    validateId(args.id, 'id');

    const client = await getClientFromContext();
    const comments = await client.tasks.getTaskComments(args.id);

    const response: StandardTaskResponse = {
      success: true,
      operation: 'comment',
      message: `Found ${comments.length} comments`,
      comments: comments,
      metadata: {
        timestamp: new Date().toISOString(),
        count: comments.length,
      },
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to list comments: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}