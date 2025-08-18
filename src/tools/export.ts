/**
 * Export Tool
 * Handles exporting project data from Vikunja
 *
 * @warning Memory Usage: The export functionality loads entire project hierarchies
 * into memory. For very large projects with thousands of tasks or deeply nested
 * child projects, this could consume significant memory. Consider implementing
 * pagination or streaming for production use with large datasets.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { MCPError, ErrorCode, createStandardResponse } from '../types/index';
import { getClientFromContext } from '../client';
import type { Project, Task, Label, User, VikunjaClient } from 'node-vikunja';
import type { TypedVikunjaClient } from '../types/node-vikunja-extended';
import { logger } from '../utils/logger';

/**
 * Validates that an ID is a positive integer
 */
function validateId(id: number, fieldName: string): void {
  if (id <= 0 || !Number.isInteger(id)) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `${fieldName} must be a positive integer`);
  }
}

/**
 * Export format for project data
 */
interface ProjectExportData {
  project: Project;
  tasks: Task[];
  labels: Label[];
  team_members?: User[];
  child_projects?: ProjectExportData[];
  exported_at: string;
  version: string;
}

/**
 * Recursively exports a project and its children
 */
async function exportProjectRecursive(
  client: VikunjaClient,
  projectId: number,
  includeChildren: boolean = false,
  visitedIds: Set<number> = new Set(),
): Promise<ProjectExportData> {
  const vikunjaClient = client as TypedVikunjaClient;
  // Prevent infinite recursion
  if (visitedIds.has(projectId)) {
    throw new MCPError(
      ErrorCode.INTERNAL_ERROR,
      'Circular reference detected in project hierarchy',
    );
  }
  visitedIds.add(projectId);

  // Get project details
  const project = await vikunjaClient.projects.getProject(projectId);
  if (!project) {
    throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${projectId} not found`);
  }

  // Get all tasks for the project
  const tasks = await vikunjaClient.tasks.getProjectTasks(projectId);

  // Get all labels used in the project
  const labelIds = new Set<number>();
  tasks.forEach((task: Task) => {
    if (task.labels && Array.isArray(task.labels)) {
      task.labels.forEach((label: Label) => {
        if (label.id) {
          labelIds.add(label.id);
        }
      });
    }
  });

  // Fetch full label details
  const labels: Label[] = [];
  for (const labelId of labelIds) {
    try {
      const label = await vikunjaClient.labels.getLabel(labelId);
      if (label) {
        labels.push(label);
      }
    } catch (error) {
      // Label might have been deleted, skip it
      logger.warn(`Failed to fetch label ${labelId}:`, error);
    }
  }

  // Build export data
  const exportData: ProjectExportData = {
    project,
    tasks,
    labels,
    exported_at: new Date().toISOString(),
    version: '1.0.0',
  };

  // Export child projects if requested
  if (includeChildren && project.id) {
    const allProjects = await vikunjaClient.projects.getProjects({});
    const childProjects = allProjects.filter((p: Project) => p.parent_project_id === project.id);

    if (childProjects.length > 0) {
      exportData.child_projects = [];
      for (const child of childProjects) {
        if (child.id) {
          const childExport = await exportProjectRecursive(
            client,
            child.id,
            true,
            new Set(visitedIds),
          );
          exportData.child_projects.push(childExport);
        }
      }
    }
  }

  return exportData;
}

// Schema definitions

export function registerExportTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
  // Export project data
  server.tool(
    'vikunja_export_project',
    {
      projectId: z.number().int().positive(),
      includeChildren: z.boolean().optional().default(false),
    },
    async (args) => {
      if (!authManager.isAuthenticated()) {
        throw new MCPError(
          ErrorCode.AUTH_REQUIRED,
          'Authentication required. Please use vikunja_auth.connect first.',
        );
      }

      // Export operations require JWT authentication
      if (authManager.getAuthType() !== 'jwt') {
        throw new MCPError(
          ErrorCode.PERMISSION_DENIED,
          'Export operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.',
        );
      }

      try {
        const { projectId, includeChildren } = args;

        validateId(projectId, 'projectId');

        const client = await getClientFromContext();

        // Export the project data
        const exportData = await exportProjectRecursive(client, projectId, includeChildren);

        // Format the output as JSON
        const formattedData = JSON.stringify(exportData, null, 2);

        const response = createStandardResponse('success', 'Project exported successfully', {
          project_id: projectId,
          project_title: exportData.project.title,
          task_count: exportData.tasks.length,
          label_count: exportData.labels.length,
          child_project_count: exportData.child_projects?.length || 0,
          export_size_bytes: Buffer.byteLength(formattedData, 'utf8'),
          exported_at: exportData.exported_at,
          data: exportData,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        // MCP validates schema before calling handler, so this is unreachable
        /* istanbul ignore if */
        if (error instanceof z.ZodError) {
          /* istanbul ignore next 4 */
          throw new MCPError(
            ErrorCode.VALIDATION_ERROR,
            `Invalid parameters: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          );
        }
        throw error;
      }
    },
  );

  // Request user data export
  server.tool(
    'vikunja_request_user_export',
    {
      password: z.string().min(1),
    },
    async (args) => {
      try {
        const { password } = args;

        await getClientFromContext();

        // The node-vikunja client might not have this endpoint, so we'll make a direct API call
        const session = authManager.getSession();
        const baseUrl = session.apiUrl;
        const token = session.apiToken;

        if (!token) {
          throw new MCPError(ErrorCode.AUTH_REQUIRED, 'No authentication token available');
        }

        const httpResponse = await fetch(`${baseUrl}/user/export/request`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password }),
        });

        if (!httpResponse.ok) {
          const errorData = (await httpResponse.json().catch(() => ({ message: null }))) as {
            message?: string;
          };
          throw new MCPError(
            ErrorCode.API_ERROR,
            errorData.message || `Failed to request export: ${httpResponse.statusText}`,
          );
        }

        const result = (await httpResponse.json()) as Record<string, unknown>;

        const response = createStandardResponse(
          'success',
          'User data export requested successfully. You will receive an email when the export is ready.',
          result,
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        // MCP validates schema before calling handler, so this is unreachable
        /* istanbul ignore if */
        if (error instanceof z.ZodError) {
          /* istanbul ignore next 4 */
          throw new MCPError(
            ErrorCode.VALIDATION_ERROR,
            `Invalid parameters: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          );
        }
        throw error;
      }
    },
  );

  // Download user data export
  server.tool(
    'vikunja_download_user_export',
    {
      password: z.string().min(1),
    },
    async (args) => {
      try {
        const { password } = args;

        await getClientFromContext();

        // The node-vikunja client might not have this endpoint, so we'll make a direct API call
        const session = authManager.getSession();
        const baseUrl = session.apiUrl;
        const token = session.apiToken;

        if (!token) {
          throw new MCPError(ErrorCode.AUTH_REQUIRED, 'No authentication token available');
        }

        const httpResponse = await fetch(`${baseUrl}/user/export/download`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password }),
        });

        if (!httpResponse.ok) {
          const errorData = (await httpResponse.json().catch(() => ({ message: null }))) as {
            message?: string;
          };
          throw new MCPError(
            ErrorCode.API_ERROR,
            errorData.message || `Failed to download export: ${httpResponse.statusText}`,
          );
        }

        // The response should contain the export data
        const exportData = (await httpResponse.json()) as Record<string, unknown>;

        const response = createStandardResponse(
          'success',
          'User data export downloaded successfully',
          exportData,
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        // MCP validates schema before calling handler, so this is unreachable
        /* istanbul ignore if */
        if (error instanceof z.ZodError) {
          /* istanbul ignore next 4 */
          throw new MCPError(
            ErrorCode.VALIDATION_ERROR,
            `Invalid parameters: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          );
        }
        throw error;
      }
    },
  );
}
