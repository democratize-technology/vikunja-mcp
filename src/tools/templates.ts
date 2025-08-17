/**
 * Templates Tool
 * Handles project template operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import { MCPError, ErrorCode, createStandardResponse } from '../types/index';
import { getVikunjaClient } from '../client';
import type { Project, Task } from 'node-vikunja';
import { storageManager } from '../storage/FilterStorage';
import { logger } from '../utils/logger';

/**
 * Get session-scoped storage instance
 */
async function getSessionStorage(authManager: AuthManager): ReturnType<typeof storageManager.getStorage> {
  const session = authManager.getSession();
  const sessionId = `${session.apiUrl}:${session.apiToken?.substring(0, 8)}` || 'anonymous';
  return storageManager.getStorage(sessionId, session.userId, session.apiUrl);
}

interface TemplateData {
  id: string;
  name: string;
  description?: string;
  created: string;
  author?: string;
  tags: string[];
  projectData: {
    title: string;
    description?: string;
    hex_color?: string;
  };
  tasks: Array<{
    title: string;
    description?: string;
    labels?: number[];
    due_date?: string;
    priority?: number;
    position?: number;
  }>;
  variables?: Record<string, string>;
}

export function registerTemplatesTool(server: McpServer, authManager: AuthManager): void {
  server.tool(
    'vikunja_templates',
    {
      subcommand: z.enum(['create', 'list', 'get', 'update', 'delete', 'instantiate']),
      // Template fields
      id: z.string().optional(),
      projectId: z.number().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      // Instantiation fields
      projectName: z.string().optional(),
      parentProjectId: z.number().optional(),
      variables: z.record(z.string()).optional(),
    },
    async (args) => {
      try {
        // Check authentication
        if (!authManager.isAuthenticated()) {
          throw new MCPError(
            ErrorCode.AUTH_REQUIRED,
            'Authentication required. Please use vikunja_auth.connect first.',
          );
        }

        const client = await getVikunjaClient();
        const storage = await getSessionStorage(authManager);

        switch (args.subcommand) {
          case 'create': {
            if (!args.projectId || !args.name) {
              throw new MCPError(
                ErrorCode.VALIDATION_ERROR,
                'projectId and name are required for creating a template',
              );
            }

            try {
              // Get the source project
              const project = await client.projects.getProject(args.projectId);

              // Get all tasks in the project
              const tasks = await client.tasks.getProjectTasks(args.projectId);

              // Validate hex color if present
              if (project.hex_color && !/^#[0-9A-Fa-f]{6}$/.test(project.hex_color)) {
                logger.warn('Invalid hex color in source project, skipping', {
                  projectId: args.projectId,
                  color: project.hex_color,
                });
              }

              // Create template data
              const templateId = `template_${Date.now()}`;
              const templateData: TemplateData = {
                id: templateId,
                name: args.name,
                ...(args.description && { description: args.description }),
                created: new Date().toISOString(),
                tags: args.tags || [],
                projectData: {
                  title: project.title,
                  ...(project.description && { description: project.description }),
                  ...(project.hex_color &&
                    /^#[0-9A-Fa-f]{6}$/.test(project.hex_color) && {
                      hex_color: project.hex_color,
                    }),
                },
                tasks: tasks.map((task) => ({
                  title: task.title,
                  ...(task.description && { description: task.description }),
                  ...(task.labels &&
                    task.labels.length > 0 && {
                      labels: task.labels
                        .map((l) => l.id)
                        .filter((id): id is number => id !== undefined),
                    }),
                  ...(task.due_date && { due_date: task.due_date }),
                  ...(task.priority !== undefined && { priority: task.priority }),
                  ...(task.position !== undefined && { position: task.position }),
                })),
                variables: {},
              };

              // Save template as a saved filter
              await storage.create({
                name: templateId,
                filter: JSON.stringify(templateData),
                isGlobal: true,
              });

              const response = createStandardResponse(
                'create-template',
                `Template "${args.name}" created successfully`,
                { template: templateData },
                { sourceProjectId: args.projectId, taskCount: tasks.length },
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
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to create template: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            }
          }

          case 'list': {
            try {
              const savedFilters = await storage.list();
              // Convert saved filters back to templates
              const templates = savedFilters
                .filter((f) => f.name.startsWith('template_'))
                .map((f) => {
                  try {
                    return JSON.parse(f.filter) as TemplateData;
                  } catch {
                    return null;
                  }
                })
                .filter((t) => t !== null);

              const response = createStandardResponse(
                'list-templates',
                `Retrieved ${templates.length} template${templates.length !== 1 ? 's' : ''}`,
                { templates },
                { count: templates.length },
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
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to list templates: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            }
          }

          case 'get': {
            if (!args.id) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Template ID is required');
            }

            try {
              const savedFilter = await storage.findByName(args.id);
              if (!savedFilter) {
                throw new MCPError(ErrorCode.NOT_FOUND, `Template with ID ${args.id} not found`);
              }
              const template = JSON.parse(savedFilter.filter) as TemplateData;

              const response = createStandardResponse(
                'get-template',
                `Retrieved template "${template.name}"`,
                { template },
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
              if (error instanceof MCPError) throw error;
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to get template: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            }
          }

          case 'update': {
            if (!args.id) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Template ID is required');
            }

            try {
              const savedFilter = await storage.findByName(args.id);
              if (!savedFilter) {
                throw new MCPError(ErrorCode.NOT_FOUND, `Template with ID ${args.id} not found`);
              }
              const template = JSON.parse(savedFilter.filter) as TemplateData;

              // Update template fields
              if (args.name !== undefined) template.name = args.name;
              if (args.description !== undefined) template.description = args.description;
              if (args.tags !== undefined) template.tags = args.tags;

              // Update the saved filter by finding it first
              const existingFilter = await storage.findByName(args.id);
              if (existingFilter) {
                await storage.update(existingFilter.id, {
                  filter: JSON.stringify(template),
                });
              }

              const response = createStandardResponse(
                'update-template',
                `Template "${template.name}" updated successfully`,
                { template },
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
              if (error instanceof MCPError) throw error;
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to update template: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            }
          }

          case 'delete': {
            if (!args.id) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Template ID is required');
            }

            try {
              const savedFilter = await storage.findByName(args.id);
              if (!savedFilter) {
                throw new MCPError(ErrorCode.NOT_FOUND, `Template with ID ${args.id} not found`);
              }
              const template = JSON.parse(savedFilter.filter) as TemplateData;

              await storage.delete(savedFilter.id);

              const response = createStandardResponse(
                'delete-template',
                `Template "${template.name}" deleted successfully`,
                { deletedId: args.id },
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
              if (error instanceof MCPError) throw error;
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to delete template: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            }
          }

          case 'instantiate': {
            if (!args.id || !args.projectName) {
              throw new MCPError(
                ErrorCode.VALIDATION_ERROR,
                'id and projectName are required for instantiating a template',
              );
            }

            try {
              const savedFilter = await storage.findByName(args.id);
              if (!savedFilter) {
                throw new MCPError(ErrorCode.NOT_FOUND, `Template with ID ${args.id} not found`);
              }
              const template = JSON.parse(savedFilter.filter) as TemplateData;

              // Create new project from template
              const projectData: Partial<Project> = {
                title: applyVariables(args.projectName, args.variables || {}),
                ...(template.projectData.description && {
                  description: applyVariables(
                    template.projectData.description,
                    args.variables || {},
                  ),
                }),
                ...(args.parentProjectId && { parent_project_id: args.parentProjectId }),
              };

              if (template.projectData.hex_color) {
                projectData.hex_color = template.projectData.hex_color;
              }

              const newProject = await client.projects.createProject(projectData as Project);
              logger.info('Created project from template', {
                projectId: newProject.id,
                templateId: args.id,
              });

              // Create tasks from template
              const createdTasks: Task[] = [];
              for (const taskTemplate of template.tasks) {
                try {
                  const taskData: Partial<Task> = {
                    title: applyVariables(taskTemplate.title, args.variables || {}),
                    project_id: newProject.id ?? 0,
                    ...(taskTemplate.description && {
                      description: applyVariables(taskTemplate.description, args.variables || {}),
                    }),
                    ...(taskTemplate.due_date && { due_date: taskTemplate.due_date }),
                    ...(taskTemplate.priority !== undefined && { priority: taskTemplate.priority }),
                    ...(taskTemplate.position !== undefined && { position: taskTemplate.position }),
                  };

                  const createdTask = await client.tasks.createTask(
                    newProject.id ?? 0,
                    taskData as Task,
                  );
                  createdTasks.push(createdTask);

                  // Add labels if any
                  if (taskTemplate.labels && taskTemplate.labels.length > 0) {
                    try {
                      await client.tasks.updateTaskLabels(createdTask.id ?? 0, {
                        label_ids: taskTemplate.labels,
                      });
                    } catch (labelError) {
                      logger.warn('Failed to add labels to task', {
                        taskId: createdTask.id,
                        labels: taskTemplate.labels,
                        error: labelError,
                      });
                    }
                  }
                } catch (taskError) {
                  logger.warn('Failed to create task from template', {
                    taskTitle: taskTemplate.title,
                    error: taskError,
                  });
                }
              }

              const response = createStandardResponse(
                'instantiate-template',
                `Project "${newProject.title}" created from template "${template.name}"`,
                {
                  project: newProject,
                  createdTasks: createdTasks.length,
                  failedTasks: template.tasks.length - createdTasks.length,
                },
                { templateId: args.id, templateName: template.name },
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
              if (error instanceof MCPError) throw error;
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to instantiate template: ${error instanceof Error ? error.message : 'Unknown error'}`,
              );
            }
          }

          default:
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Unknown subcommand: ${String(args.subcommand)}`,
            );
        }
      } catch (error) {
        if (error instanceof MCPError) {
          throw error;
        }
        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  );
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply variable substitution to a string
 */
function applyVariables(text: string | undefined, variables: Record<string, string>): string {
  if (!text) return '';
  let result: string = text;

  // Apply custom variables
  for (const [key, value] of Object.entries(variables)) {
    const escaped = escapeRegex(key);
    const pattern = new RegExp(`{{${escaped}}}`, 'g');
    result = result.replace(pattern, value);
  }

  // Apply built-in variables
  const today = new Date().toISOString().split('T')[0] || '';
  const now = new Date().toISOString();
  result = result.replace(/{{TODAY}}/g, today);
  result = result.replace(/{{NOW}}/g, now);

  return result;
}
