/**
 * Assignee response formatter service
 * Handles response formatting for assignee operations
 */

import type { StandardTaskResponse, MinimalTask, ResponseMetadata } from '../../../types/index';
import { createStandardResponse } from '../../../types/index';
import { formatAorpAsMarkdown } from '../../../aorp/markdown';

/**
 * Service for formatting assignee operation responses
 */
export class AssigneeResponseFormatter {
  /**
   * Format successful assign operation response
   */
  static formatAssignResponse(task: any): StandardTaskResponse {
    return {
      success: true,
      operation: 'assign',
      message: 'Users assigned to task successfully',
      task: task,
      metadata: {
        timestamp: new Date().toISOString(),
        affectedFields: ['assignees'],
      },
    };
  }

  /**
   * Format successful unassign operation response
   */
  static formatUnassignResponse(task: any): StandardTaskResponse {
    return {
      success: true,
      operation: 'unassign',
      message: 'Users removed from task successfully',
      task: task,
      metadata: {
        timestamp: new Date().toISOString(),
        affectedFields: ['assignees'],
      },
    };
  }

  /**
   * Format list assignees operation response
   */
  static formatListAssigneesResponse(minimalTask: MinimalTask, assigneeCount: number): StandardTaskResponse {
    return {
      success: true,
      operation: 'get',
      message: `Task has ${assigneeCount} assignee(s)`,
      task: minimalTask,
      metadata: {
        timestamp: new Date().toISOString(),
        count: assigneeCount,
      },
    };
  }

  /**
   * Format MCP response wrapper
   */
  static formatMcpResponse(response: StandardTaskResponse): { content: Array<{ type: 'text'; text: string }> } {
    // Create proper AORP response instead of casting StandardTaskResponse
    const aorpResponse = createStandardResponse(
      response.operation || 'unknown',
      response.message || 'Operation completed',
      response,
      response.metadata || {} as any
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