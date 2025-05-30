import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../auth/AuthManager';
import { getVikunjaClient } from '../client';
import { logger } from '../utils/logger';
import { MCPError, ErrorCode } from '../types/index';
import { isAuthenticationError } from '../utils/auth-error-handler';
import type { Task, Label, User } from 'node-vikunja';

// Define the structure for imported tasks
const importedTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  done: z.boolean().optional(),
  dueDate: z.string().optional(),
  priority: z.number().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  hexColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  percentDone: z.number().min(0).max(100).optional(),
  repeatAfter: z.number().optional(),
  repeatMode: z.number().optional(),
  reminders: z.array(z.string()).optional(),
});

type ImportedTask = z.infer<typeof importedTaskSchema>;

interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{
    index: number;
    title: string;
    error: string;
  }>;
  createdTasks: Array<{
    id: number;
    title: string;
  }>;
  warnings?: Array<{
    taskId: number;
    title: string;
    warning: string;
  }>;
}

export function registerBatchImportTool(server: McpServer, authManager: AuthManager): void {
  server.tool(
    'vikunja_batch_import',
    {
      projectId: z.number(),
      format: z.enum(['csv', 'json']),
      data: z.string(),
      skipErrors: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    },
    async (args) => {
      try {
        logger.debug('Executing batch import tool', {
          projectId: args.projectId,
          format: args.format,
          skipErrors: args.skipErrors,
          dryRun: args.dryRun,
        });

        // Check authentication
        if (!authManager.isAuthenticated()) {
          throw new MCPError(
            ErrorCode.AUTH_REQUIRED,
            'Authentication required. Please use vikunja_auth.connect first.',
          );
        }

        const client = await getVikunjaClient();
        const tasks: ImportedTask[] = [];

        // Parse the input data based on format
        if (args.format === 'json') {
          try {
            const parsed = JSON.parse(args.data) as unknown;
            const taskArray = Array.isArray(parsed) ? parsed : [parsed];

            for (const task of taskArray) {
              const validatedTask = importedTaskSchema.parse(task);
              tasks.push(validatedTask);
            }
          } catch (error) {
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Invalid JSON data: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        } else if (args.format === 'csv') {
          // Parse CSV data - simple parser that handles quoted values
          const parseCSVLine = (line: string): string[] => {
            const result: string[] = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              const nextChar = line[i + 1];

              if (char === '"') {
                if (inQuotes && nextChar === '"') {
                  // Escaped quote
                  current += '"';
                  i++; // Skip next quote
                } else {
                  // Toggle quote mode
                  inQuotes = !inQuotes;
                }
              } else if (char === ',' && !inQuotes) {
                // End of field
                result.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }

            // Don't forget the last field
            result.push(current.trim());
            return result;
          };

          const lines = args.data.split('\n').filter((line) => line.trim());
          if (lines.length < 2) {
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              'CSV must have at least a header row and one data row',
            );
          }

          // Parse header
          const headers = parseCSVLine(lines[0] || '');
          const requiredHeaders = ['title'];
          const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

          if (missingHeaders.length > 0) {
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Missing required CSV headers: ${missingHeaders.join(', ')}`,
            );
          }

          // Parse data rows
          for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i] || '');
            interface TaskDataInput {
              title?: string;
              description?: string;
              done?: boolean;
              dueDate?: string;
              priority?: number;
              labels?: string[];
              assignees?: string[];
              startDate?: string;
              endDate?: string;
              hexColor?: string;
              percentDone?: number;
            }
            const taskData: TaskDataInput = {};

            headers.forEach((header, index) => {
              const value = values[index];
              if (value) {
                switch (header) {
                  case 'title':
                    taskData.title = value;
                    break;
                  case 'description':
                    taskData.description = value;
                    break;
                  case 'done':
                    taskData.done = value.toLowerCase() === 'true';
                    break;
                  case 'dueDate':
                    taskData.dueDate = value;
                    break;
                  case 'priority':
                    taskData.priority = parseInt(value);
                    break;
                  case 'labels':
                    taskData.labels = value ? value.split(';').map((l) => l.trim()) : [];
                    logger.debug('Parsed labels from CSV', {
                      rawValue: value,
                      parsedLabels: taskData.labels,
                    });
                    break;
                  case 'assignees':
                    taskData.assignees = value ? value.split(';').map((a) => a.trim()) : [];
                    break;
                  case 'startDate':
                    taskData.startDate = value;
                    break;
                  case 'endDate':
                    taskData.endDate = value;
                    break;
                  case 'hexColor':
                    taskData.hexColor = value;
                    break;
                  case 'percentDone':
                    taskData.percentDone = parseInt(value);
                    break;
                }
              }
            });

            try {
              const validatedTask = importedTaskSchema.parse(taskData);
              tasks.push(validatedTask);
            } catch (error) {
              if (!args.skipErrors) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  `Invalid task data at row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                );
              }
              // Will be handled in the import loop
            }
          }
        }

        // Validate we have tasks to import
        if (tasks.length === 0) {
          throw new MCPError(ErrorCode.VALIDATION_ERROR, 'No valid tasks found to import');
        }

        // Check batch size limit
        const MAX_BATCH_SIZE = 100;
        if (tasks.length > MAX_BATCH_SIZE) {
          throw new MCPError(
            ErrorCode.VALIDATION_ERROR,
            `Batch size exceeds maximum limit of ${MAX_BATCH_SIZE} tasks. Please split your import into smaller batches.`,
          );
        }

        // If dry run, just return validation results
        if (args.dryRun) {
          return {
            content: [
              {
                type: 'text',
                text: `Validation successful. ${tasks.length} tasks ready to import.`,
              },
            ],
          };
        }

        // Import tasks
        const result: ImportResult = {
          success: 0,
          failed: 0,
          errors: [],
          createdTasks: [],
        };

        // First, get all labels and users for the project to map names to IDs
        let projectLabels: Label[] = [];
        let projectUsers: User[] = [];
        let userFetchFailedDueToAuth = false;

        // Get labels - this should work
        try {
          const labelsResponse = await client.labels.getLabels({});
          // Handle potential null/undefined response
          if (!labelsResponse) {
            logger.warn('Labels response is null/undefined');
            projectLabels = [];
          } else if (!Array.isArray(labelsResponse)) {
            logger.warn('Labels response is not an array', {
              responseType: typeof labelsResponse,
              response: labelsResponse,
            });
            projectLabels = [];
          } else {
            projectLabels = labelsResponse;
            logger.debug('Labels fetched', {
              count: projectLabels.length,
              labels: projectLabels.map((l) => ({ id: l.id, title: l.title })),
            });
          }
        } catch (error) {
          logger.error('Failed to fetch labels', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          projectLabels = [];
          // Continue without labels mapping
        }

        // Try to get users, but handle the known authentication issue
        try {
          const usersResponse = await client.users.getUsers({});
          projectUsers = usersResponse || [];
          logger.debug('Users fetched', { count: projectUsers.length });
        } catch (error) {
          // This is a known limitation with Vikunja API authentication
          if (isAuthenticationError(error)) {
            logger.warn(
              'Cannot fetch users due to known Vikunja API authentication issue. Assignees will be skipped.',
              {
                error: error instanceof Error ? error.message : String(error),
              },
            );
            userFetchFailedDueToAuth = true;
            // Continue without user mapping - assignees will be ignored
          } else {
            // Some other error - log but continue
            logger.warn('Failed to fetch users', { error });
          }
          projectUsers = [];
        }

        const labelMap = new Map((projectLabels || []).map((l) => [l.title.toLowerCase(), l.id]));
        const userMap = new Map((projectUsers || []).map((u) => [u.username.toLowerCase(), u.id]));

        logger.debug('Label and user maps created', {
          labelMapSize: labelMap.size,
          labelMapEntries: Array.from(labelMap.entries()),
          userMapSize: userMap.size,
        });

        // Create tasks one by one
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          if (!task) continue;

          try {
            // Prepare task data for API
            const taskData: Record<string, unknown> = {
              title: task.title,
              description: task.description,
              done: task.done || false,
              priority: task.priority || 0,
              percent_done: task.percentDone || 0,
            };

            // Handle dates
            if (task.dueDate) taskData['due_date'] = task.dueDate;
            if (task.startDate) taskData['start_date'] = task.startDate;
            if (task.endDate) taskData['end_date'] = task.endDate;

            // Handle color
            if (task.hexColor) taskData['hex_color'] = task.hexColor;

            // Handle repeat settings
            if (task.repeatAfter) taskData['repeat_after'] = task.repeatAfter;
            if (task.repeatMode !== undefined) taskData['repeat_mode'] = task.repeatMode;

            // Create the task
            let createdTask: Task;
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
              createdTask = await client.tasks.createTask(args.projectId, taskData as any);
            } catch (error) {
              // Check if it's an authentication error
              if (isAuthenticationError(error)) {
                throw new MCPError(
                  ErrorCode.API_ERROR,
                  `Authentication error while creating task "${task.title}". The token works for other endpoints but may have issues with batch operations. Original error: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
              throw error;
            }

            // Handle labels
            if (task.labels && task.labels.length > 0) {
              const labelIds = (task.labels || [])
                .map((labelName) => labelMap.get(labelName.toLowerCase()))
                .filter((id): id is number => id !== undefined);

              if (labelIds.length > 0 && createdTask.id) {
                try {
                  // Try to update labels
                  const updateResult = await client.tasks.updateTaskLabels(createdTask.id, {
                    label_ids: labelIds,
                  });

                  // Verify the labels were actually assigned by fetching the task
                  // This is necessary because updateTaskLabels might silently fail with API tokens
                  let labelsActuallyAssigned = false;
                  try {
                    const updatedTask = await client.tasks.getTask(createdTask.id);
                    if (updatedTask && updatedTask.labels && Array.isArray(updatedTask.labels)) {
                      const assignedLabelIds = updatedTask.labels.map((l) => l.id);
                      labelsActuallyAssigned = labelIds.every((id) =>
                        assignedLabelIds.includes(id),
                      );
                    }
                  } catch (verifyError) {
                    // If we can't verify, assume it didn't work
                    logger.debug('Could not verify label assignment', {
                      taskId: createdTask.id,
                      error:
                        verifyError instanceof Error ? verifyError.message : String(verifyError),
                    });
                  }

                  if (!labelsActuallyAssigned) {
                    // Label assignment silently failed (common with API tokens)
                    logger.warn('Label assignment may have failed silently', {
                      taskId: createdTask.id,
                      labelIds,
                      labelNames: task.labels,
                      updateResult,
                    });
                    if (!result.warnings) {
                      result.warnings = [];
                    }
                    result.warnings.push({
                      taskId: createdTask.id,
                      title: task.title,
                      warning: `Labels specified but not assigned (API token limitation). Consider using JWT authentication for label support.`,
                    });
                  } else {
                    logger.debug('Labels assigned and verified successfully', {
                      taskId: createdTask.id,
                      labelIds,
                      labelNames: task.labels,
                    });
                  }
                } catch (labelError) {
                  // Check if this is an authentication error
                  if (isAuthenticationError(labelError)) {
                    logger.warn('Label assignment failed due to authentication issue', {
                      taskId: createdTask.id,
                      labelIds,
                      labelNames: task.labels,
                      error: labelError instanceof Error ? labelError.message : String(labelError),
                    });
                    if (!result.warnings) {
                      result.warnings = [];
                    }
                    result.warnings.push({
                      taskId: createdTask.id,
                      title: task.title,
                      warning: `Label assignment requires JWT authentication. Labels were not assigned.`,
                    });
                  } else {
                    logger.error('Failed to assign labels to task', {
                      taskId: createdTask.id,
                      labelIds,
                      labelNames: task.labels,
                      error: labelError instanceof Error ? labelError.message : String(labelError),
                    });
                    // Don't fail the entire task creation if label assignment fails
                    // but include it in the warnings
                    if (!result.warnings) {
                      result.warnings = [];
                    }
                    result.warnings.push({
                      taskId: createdTask.id,
                      title: task.title,
                      warning: `Failed to assign labels: ${labelError instanceof Error ? labelError.message : 'Unknown error'}`,
                    });
                  }
                }
              } else if (task.labels.length > 0) {
                // Some labels were not found
                const notFoundLabels = task.labels.filter(
                  (labelName) => !labelMap.has(labelName.toLowerCase()),
                );
                logger.warn('Some labels not found in project', {
                  taskId: createdTask.id || 'unknown',
                  requestedLabels: task.labels,
                  foundLabels: labelIds,
                  notFoundLabels,
                  availableLabels: Array.from(labelMap.keys()),
                });
                if (!result.warnings) {
                  result.warnings = [];
                }
                if (createdTask.id) {
                  result.warnings.push({
                    taskId: createdTask.id,
                    title: task.title,
                    warning: `Labels not found: ${notFoundLabels.join(', ')}`,
                  });
                }
              }
            }

            // Handle assignees
            if (task.assignees && task.assignees.length > 0) {
              // Check if we have any users mapped (might be empty due to API issue)
              if (projectUsers.length === 0) {
                logger.warn('Skipping assignees due to user fetch failure', {
                  taskId: createdTask.id || 'unknown',
                  assignees: task.assignees,
                });
              } else {
                const userIds = (task.assignees || [])
                  .map((username) => userMap.get(username.toLowerCase()))
                  .filter((id): id is number => id !== undefined);

                if (userIds.length > 0 && createdTask.id) {
                  await client.tasks.bulkAssignUsersToTask(createdTask.id, {
                    user_ids: userIds,
                  });
                }
              }
            }

            // Handle reminders
            if (task.reminders && task.reminders.length > 0) {
              // Note: The API doesn't support adding reminders separately,
              // they need to be added during task creation
              // This is a limitation of the current implementation
              logger.warn('Reminders cannot be added after task creation', {
                taskId: createdTask.id || 'unknown',
                reminders: task.reminders,
              });
            }

            result.success++;
            if (createdTask.id) {
              result.createdTasks.push({
                id: createdTask.id,
                title: createdTask.title,
              });
            }
          } catch (error) {
            result.failed++;
            result.errors.push({
              index: i,
              title: task.title,
              error: error instanceof Error ? error.message : 'Unknown error',
            });

            if (!args.skipErrors) {
              throw error;
            }
          }
        }

        // Format the result
        let responseText = `Import completed:\n`;
        responseText += `- Successfully imported: ${result.success} tasks\n`;
        responseText += `- Failed: ${result.failed} tasks\n`;

        // Add warning if users couldn't be fetched due to auth issue
        if (userFetchFailedDueToAuth && tasks.some((t) => t.assignees && t.assignees.length > 0)) {
          responseText += `\n⚠️  Warning: Could not fetch users due to Vikunja API authentication issue.\n`;
          responseText += `   Assignees were skipped for all tasks.\n`;
        }

        if (result.createdTasks.length > 0) {
          responseText += `\nCreated tasks:\n`;
          result.createdTasks.forEach((task) => {
            responseText += `- #${task.id}: ${task.title}\n`;
          });
        }

        if (result.warnings && result.warnings.length > 0) {
          responseText += `\n⚠️  Warnings:\n`;
          result.warnings.forEach((warning) => {
            responseText += `- Task #${warning.taskId} (${warning.title}): ${warning.warning}\n`;
          });
        }

        if (result.errors.length > 0) {
          responseText += `\nErrors:\n`;
          result.errors.forEach((error) => {
            responseText += `- Row ${error.index + 1} (${error.title}): ${error.error}\n`;
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      } catch (error) {
        if (error instanceof MCPError) {
          return {
            content: [
              {
                type: 'text',
                text: error.message,
              },
            ],
          };
        }

        logger.error('Batch import error', {
          error: error instanceof Error ? error.stack : String(error),
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to import tasks: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );
}
