/**
 * Task Kanban bucket operations
 *
 * Implements `set-bucket`, which moves a task into a Kanban bucket (column)
 * of its project's Kanban view. This is the operation behind a "move card to
 * the Doing column" workflow.
 *
 * node-vikunja does not expose the Kanban view endpoints, so this calls the
 * Vikunja REST API directly via the shared `vikunja-rest` helper.
 */

import type { AuthManager } from '../../auth/AuthManager';
import { MCPError, ErrorCode } from '../../types';
import { validateId } from '../../utils/validation';
import { createStandardResponse, formatAorpAsMarkdown } from '../../utils/response-factory';
import { vikunjaRestRequest, resolveKanbanViewId } from '../../utils/vikunja-rest';

export interface SetTaskBucketArgs {
  /** Id of the task to move. */
  id?: number;
  /** Id of the destination Kanban bucket. */
  bucketId?: number;
  /** Optional Kanban view id. Auto-resolved from the project when omitted. */
  viewId?: number;
  /** Optional project id. Auto-resolved from the task when omitted. */
  projectId?: number;
  /** Session id for response tracking. */
  sessionId?: string;
}

interface VikunjaTaskSummary {
  id: number;
  project_id: number;
  title?: string;
}

/**
 * Moves a task into a Kanban bucket.
 *
 * Resolution order when optional ids are omitted:
 *  - projectId: fetched from the task itself
 *  - viewId: resolved to the project's Kanban view
 *
 * @param args - Task id, destination bucket id, and optional view/project ids
 * @param authManager - Active auth manager holding session credentials
 * @returns MCP response describing the move
 */
export async function setTaskBucket(
  args: SetTaskBucketArgs,
  authManager: AuthManager,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.id) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for set-bucket operation');
  }
  if (args.bucketId === undefined || args.bucketId === null) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      'bucketId is required for set-bucket operation',
    );
  }
  validateId(args.id, 'id');
  validateId(args.bucketId, 'bucketId');
  if (args.viewId !== undefined) validateId(args.viewId, 'viewId');
  if (args.projectId !== undefined) validateId(args.projectId, 'projectId');

  // Resolve the project id from the task when the caller did not supply it.
  let projectId = args.projectId;
  if (projectId === undefined) {
    const task = await vikunjaRestRequest<VikunjaTaskSummary>(
      authManager,
      'GET',
      `/tasks/${args.id}`,
    );
    if (!task || typeof task.project_id !== 'number') {
      throw new MCPError(
        ErrorCode.NOT_FOUND,
        `Could not resolve the project of task ${args.id}`,
      );
    }
    projectId = task.project_id;
  }

  // Resolve the Kanban view id when the caller did not supply it.
  const viewId =
    args.viewId !== undefined ? args.viewId : await resolveKanbanViewId(authManager, projectId);

  // Place the task into the bucket. Vikunja's bucket-task endpoint expects the
  // TaskBucket payload; bucket_id is also part of the URL but is sent in the
  // body as the API model requires it.
  await vikunjaRestRequest(
    authManager,
    'POST',
    `/projects/${projectId}/views/${viewId}/buckets/${args.bucketId}/tasks`,
    { task_id: args.id, bucket_id: args.bucketId },
  );

  const response = createStandardResponse(
    'set-task-bucket',
    `Task ${args.id} moved to bucket ${args.bucketId}`,
    {
      taskId: args.id,
      bucketId: args.bucketId,
      viewId,
      projectId,
    },
    {
      timestamp: new Date().toISOString(),
      affectedFields: ['bucket_id'],
    },
    args.sessionId,
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: formatAorpAsMarkdown(response),
      },
    ],
  };
}
