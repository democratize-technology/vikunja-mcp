/**
 * Bucket operations for tasks
 * Handles assigning tasks to Kanban buckets and listing buckets
 */

import type { AuthManager } from '../../auth/AuthManager';
import { MCPError, ErrorCode } from '../../types';
import { validateId } from './validation';

interface BucketTask {
  task_id: number;
}

interface Bucket {
  id: number;
  title: string;
  project_view_id: number;
  limit: number;
  count: number;
  position: number;
  created: string;
  updated: string;
  created_by: unknown;
}

/**
 * Make an authenticated request to the Vikunja API
 */
async function vikunjaFetch<T>(
  authManager: AuthManager,
  endpoint: string,
  method: string = 'GET',
  body?: unknown,
): Promise<T> {
  const session = authManager.getSession();
  const url = `${session.apiUrl}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.apiToken}`,
  };

  const requestInit: RequestInit = {
    method,
    headers,
  };
  if (body) {
    requestInit.body = JSON.stringify(body);
  }

  const response = await fetch(url, requestInit);

  if (!response.ok) {
    let errorMessage: string;
    try {
      const errorData = (await response.json()) as { message?: string };
      errorMessage = errorData.message || `API request failed with status ${response.status}`;
    } catch {
      errorMessage = `API request failed with status ${response.status}`;
    }
    throw new MCPError(ErrorCode.API_ERROR, errorMessage);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return {} as T;
  }

  return (await response.json()) as T;
}

/**
 * List all buckets for a project view
 */
export async function listBuckets(
  args: { projectId?: number; viewId?: number },
  authManager: AuthManager,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.projectId) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'projectId is required for list-buckets');
  }
  if (!args.viewId) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'viewId is required for list-buckets');
  }
  validateId(args.projectId, 'projectId');
  validateId(args.viewId, 'viewId');

  const buckets = await vikunjaFetch<Bucket[]>(
    authManager,
    `/projects/${args.projectId}/views/${args.viewId}/buckets`,
  );

  const response = {
    success: true,
    operation: 'list-buckets',
    message: `Found ${buckets.length} bucket(s)`,
    buckets: buckets.map((b) => ({
      id: b.id,
      title: b.title,
      limit: b.limit,
      count: b.count,
      position: b.position,
    })),
    metadata: {
      timestamp: new Date().toISOString(),
      count: buckets.length,
    },
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
  };
}

/**
 * Assign a task to a bucket in a project view
 */
export async function assignBucket(
  args: { id?: number; projectId?: number; viewId?: number; bucketId?: number },
  authManager: AuthManager,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.id) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for assign-bucket');
  }
  if (!args.projectId) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'projectId is required for assign-bucket');
  }
  if (!args.viewId) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'viewId is required for assign-bucket');
  }
  if (!args.bucketId) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'bucketId is required for assign-bucket');
  }
  validateId(args.id, 'id');
  validateId(args.projectId, 'projectId');
  validateId(args.viewId, 'viewId');
  validateId(args.bucketId, 'bucketId');

  await vikunjaFetch<BucketTask>(
    authManager,
    `/projects/${args.projectId}/views/${args.viewId}/buckets/${args.bucketId}/tasks`,
    'POST',
    { task_id: args.id },
  );

  const response = {
    success: true,
    operation: 'assign-bucket',
    message: `Task ${args.id} assigned to bucket ${args.bucketId}`,
    task: {
      id: args.id,
      bucketId: args.bucketId,
      projectId: args.projectId,
      viewId: args.viewId,
    },
    metadata: {
      timestamp: new Date().toISOString(),
      affectedFields: ['bucket_id'],
    },
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
  };
}
