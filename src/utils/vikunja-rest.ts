/**
 * Direct REST helper for Vikunja API endpoints not covered by node-vikunja.
 *
 * node-vikunja (the typed client this MCP server wraps) does not expose the
 * Kanban view endpoints — listing the buckets of a view, or placing a task
 * into a bucket. Those operations therefore call the Vikunja REST API
 * directly, reusing the credentials of the active authenticated session.
 */

import type { AuthManager } from '../auth/AuthManager';
import { MCPError, ErrorCode } from '../types';

/**
 * Performs an authenticated request against the Vikunja REST API.
 *
 * @param authManager - Active auth manager holding the session credentials
 * @param method - HTTP method
 * @param path - API path relative to the configured apiUrl, must start with '/'
 *               (e.g. '/projects/4/views')
 * @param body - Optional value serialized as a JSON request body
 * @returns The parsed JSON response, or null when the response has no body
 * @throws MCPError when the network call fails or the response is not OK
 */
export async function vikunjaRestRequest<T = unknown>(
  authManager: AuthManager,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const session = authManager.getSession();
  // session.apiUrl may or may not already include the `/api/v1` prefix
  // depending on how VIKUNJA_URL was configured; normalize so REST paths
  // (which are relative to the API root) always resolve correctly.
  const trimmed = session.apiUrl.replace(/\/+$/, '');
  const baseUrl = /\/api\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
  const url = `${baseUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session.apiToken}`,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Vikunja REST request failed (${method} ${path}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 500);
    } catch {
      // Body could not be read — fall back to the status line only.
    }
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Vikunja REST request failed (${method} ${path}): HTTP ${response.status} ${
        response.statusText
      }${detail ? ` — ${detail}` : ''}`,
    );
  }

  const text = await response.text();
  if (!text) {
    return null as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    // A 2xx response with a non-JSON body (rare) is treated as an empty result.
    return null as T;
  }
}

/**
 * Minimal shape of a Vikunja project view as returned by `/projects/{id}/views`.
 */
export interface VikunjaView {
  id: number;
  title: string;
  project_id: number;
  view_kind: string;
}

/**
 * Resolves the Kanban view id for a project.
 *
 * Vikunja projects have several views (list, gantt, table, kanban). Bucket
 * operations only make sense against the Kanban view, so callers that do not
 * already know the view id can use this to find it.
 *
 * @param authManager - Active auth manager
 * @param projectId - Project whose Kanban view should be resolved
 * @returns The numeric id of the project's Kanban view
 * @throws MCPError when the project has no Kanban view
 */
export async function resolveKanbanViewId(
  authManager: AuthManager,
  projectId: number,
): Promise<number> {
  const views = await vikunjaRestRequest<VikunjaView[]>(
    authManager,
    'GET',
    `/projects/${projectId}/views`,
  );
  const kanban = Array.isArray(views)
    ? views.find((view) => view.view_kind === 'kanban')
    : undefined;
  if (!kanban) {
    throw new MCPError(
      ErrorCode.NOT_FOUND,
      `Project ${projectId} has no Kanban view, so it has no buckets`,
    );
  }
  return kanban.id;
}
