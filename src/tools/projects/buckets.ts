/**
 * Project Kanban bucket operations
 *
 * Implements `list-buckets`, which returns the buckets (columns) of a
 * project's Kanban view. This lets callers resolve a bucket by name (e.g.
 * "Doing") instead of hard-coding numeric bucket ids.
 *
 * node-vikunja does not expose the Kanban view endpoints, so this calls the
 * Vikunja REST API directly via the shared `vikunja-rest` helper.
 */

import type { AuthManager } from '../../auth/AuthManager';
import { MCPError, ErrorCode } from '../../types';
import { validateId } from '../../utils/validation';
import { createStandardResponse, formatAorpAsMarkdown } from '../../utils/response-factory';
import { vikunjaRestRequest, resolveKanbanViewId } from '../../utils/vikunja-rest';

export interface ListBucketsArgs {
  /** Project whose Kanban buckets should be listed. */
  id?: number;
  /** Optional Kanban view id. Auto-resolved from the project when omitted. */
  viewId?: number;
  /** Session id for response tracking. */
  sessionId?: string;
}

interface VikunjaBucket {
  id: number;
  title: string;
  project_view_id?: number;
  position?: number;
  limit?: number;
  is_done_bucket?: boolean;
}

/**
 * Lists the Kanban buckets of a project.
 *
 * @param args - Project id and optional view id
 * @param authManager - Active auth manager holding session credentials
 * @returns MCP response containing the project's Kanban buckets
 */
export async function listBuckets(
  args: ListBucketsArgs,
  authManager: AuthManager,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.id) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      'Project id is required for list-buckets operation',
    );
  }
  validateId(args.id, 'id');
  if (args.viewId !== undefined) validateId(args.viewId, 'viewId');

  const viewId =
    args.viewId !== undefined ? args.viewId : await resolveKanbanViewId(authManager, args.id);

  const buckets = await vikunjaRestRequest<VikunjaBucket[]>(
    authManager,
    'GET',
    `/projects/${args.id}/views/${viewId}/buckets`,
  );
  const bucketList = Array.isArray(buckets) ? buckets : [];

  const response = createStandardResponse(
    'list-buckets',
    `Found ${bucketList.length} buckets in the Kanban view of project ${args.id}`,
    {
      projectId: args.id,
      viewId,
      buckets: bucketList.map((bucket) => ({
        id: bucket.id,
        title: bucket.title,
        position: bucket.position,
        limit: bucket.limit,
        isDoneBucket: bucket.is_done_bucket ?? false,
      })),
    },
    {
      timestamp: new Date().toISOString(),
      count: bucketList.length,
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
