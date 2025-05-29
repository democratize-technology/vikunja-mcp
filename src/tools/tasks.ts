/**
 * Tasks Tool
 * Handles task operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import { MCPError, ErrorCode } from '../types/index';
import type { StandardTaskResponse, MinimalTask } from '../types/index';
import { getVikunjaClient } from '../client';
import type { GetTasksParams, Task } from 'node-vikunja';
import { logger } from '../utils/logger';
import { filterStorage } from '../storage/FilterStorage';
import { relationSchema, handleRelationSubcommands } from './tasks-relations';
import { isAuthenticationError } from '../utils/auth-error-handler';
import { parseFilterString } from '../utils/filters';
import type { FilterCondition, FilterGroup, FilterExpression } from '../types/filters';

// TODO: Remove this interface once node-vikunja adds the 'filter' property to GetTasksParams
// See: https://github.com/your-org/node-vikunja/issues/XXX (create issue)
interface FilterParams extends GetTasksParams {
  filter?: string;
}

// Error message constants
const AUTH_ERROR_MESSAGES = {
  ASSIGNEE_CREATE:
    'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation. The task was created but assignees could not be added.',
  ASSIGNEE_UPDATE:
    'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation. Other task fields were updated but assignees could not be changed.',
  ASSIGNEE_ASSIGN:
    'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation that prevents assigning users to tasks.',
  ASSIGNEE_REMOVE:
    'Assignee removal operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation that prevents removing users from tasks.',
  ASSIGNEE_REMOVE_PARTIAL:
    'Assignee removal operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation. New assignees were added but old assignees could not be removed.',
  ASSIGNEE_BULK_UPDATE:
    'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation that prevents bulk updating assignees.',
  LABEL_CREATE:
    'Label operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation. The task was created but labels could not be added.',
  LABEL_UPDATE:
    'Label operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation. Other task fields were updated but labels could not be changed.',
};

/**
 * Validates that a date string is in valid ISO 8601 format
 */
function validateDateString(date: string, fieldName: string): void {
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      `${fieldName} must be a valid ISO 8601 date string (e.g., 2024-05-24T10:00:00Z)`,
    );
  }
}

/**
 * Validates that an ID is a positive integer
 */
function validateId(id: number, fieldName: string): void {
  if (id <= 0 || !Number.isInteger(id)) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `${fieldName} must be a positive integer`);
  }
}

/**
 * Convert repeat configuration from user-friendly format to Vikunja API format
 *
 * Vikunja API expects:
 * - repeat_after: time in seconds
 * - repeat_mode: 0 = default (use repeat_after), 1 = monthly, 2 = from current date
 *
 * We accept:
 * - repeatAfter: number (interpreted based on repeatMode)
 * - repeatMode: 'day' | 'week' | 'month' | 'year'
 */
function convertRepeatConfiguration(
  repeatAfter?: number,
  repeatMode?: 'day' | 'week' | 'month' | 'year',
): { repeat_after?: number; repeat_mode?: number } {
  const result: { repeat_after?: number; repeat_mode?: number } = {};

  if (repeatMode === 'month') {
    // For monthly repeat, use repeat_mode = 1 (ignores repeat_after)
    result.repeat_mode = 1;
    // Still set repeat_after for consistency, though it will be ignored
    if (repeatAfter !== undefined) {
      result.repeat_after = repeatAfter * 30 * 24 * 60 * 60; // Approximate month in seconds
    }
  } else if (repeatAfter !== undefined) {
    // For other modes, use repeat_mode = 0 and convert to seconds
    result.repeat_mode = 0;

    switch (repeatMode) {
      case 'day':
        result.repeat_after = repeatAfter * 24 * 60 * 60; // Days to seconds
        break;
      case 'week':
        result.repeat_after = repeatAfter * 7 * 24 * 60 * 60; // Weeks to seconds
        break;
      case 'year':
        result.repeat_after = repeatAfter * 365 * 24 * 60 * 60; // Years to seconds (approximate)
        break;
      default:
        // If no mode specified, assume the value is already in seconds
        result.repeat_after = repeatAfter;
    }
  }

  return result;
}

/**
 * Process an array in batches
 */
async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }
  return results;
}

const BULK_OPERATION_BATCH_SIZE = 10;
const MAX_BULK_OPERATION_TASKS = 100;

/**
 * Evaluates a filter condition against a task
 */
function evaluateCondition(task: Task, condition: FilterCondition): boolean {
  const { field, operator, value } = condition;

  switch (field) {
    case 'done':
      return evaluateComparison(task.done, operator, value === true || value === 'true');

    case 'priority':
      return evaluateComparison(task.priority || 0, operator, Number(value));

    case 'percentDone':
      return evaluateComparison(task.percent_done || 0, operator, Number(value));

    case 'dueDate':
      if (!task.due_date) {
        // Null due dates are only matched by != operator
        return operator === '!=';
      }
      return evaluateDateComparison(task.due_date, operator, String(value));

    case 'created':
      if (!task.created) return false;
      return evaluateDateComparison(task.created, operator, String(value));

    case 'updated':
      if (!task.updated) return false;
      return evaluateDateComparison(task.updated, operator, String(value));

    case 'title':
      return evaluateStringComparison(task.title, operator, String(value));

    case 'description':
      return evaluateStringComparison(task.description || '', operator, String(value));

    case 'assignees':
      return evaluateArrayComparison(
        task.assignees?.map((a) => a.id) || [],
        operator,
        Array.isArray(value) ? value.map((v) => Number(v)) : [Number(value)],
      );

    case 'labels':
      return evaluateArrayComparison(
        task.labels?.map((l) => l.id).filter((id): id is number => id !== undefined) || [],
        operator,
        Array.isArray(value) ? value.map((v) => Number(v)) : [Number(value)],
      );

    default:
      return false;
  }
}

/**
 * Evaluates comparison operators
 */
function evaluateComparison(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case '=':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
      return Number(actual) > Number(expected);
    case '>=':
      return Number(actual) >= Number(expected);
    case '<':
      return Number(actual) < Number(expected);
    case '<=':
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
}

/**
 * Evaluates date comparisons (supports relative dates like "now+7d")
 */
function evaluateDateComparison(actual: string, operator: string, expected: string): boolean {
  const actualDate = new Date(actual);
  const expectedDate = parseRelativeDate(expected);

  if (!expectedDate) return false;

  switch (operator) {
    case '=':
      // For date equality, compare only the date part
      return actualDate.toDateString() === expectedDate.toDateString();
    case '!=':
      return actualDate.toDateString() !== expectedDate.toDateString();
    case '>':
      return actualDate > expectedDate;
    case '>=':
      return actualDate >= expectedDate;
    case '<':
      return actualDate < expectedDate;
    case '<=':
      return actualDate <= expectedDate;
    default:
      return false;
  }
}

/**
 * Parses relative date strings (e.g., "now+7d", "now-1w")
 */
function parseRelativeDate(dateStr: string): Date | null {
  // ISO date format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return new Date(dateStr);
  }

  // Relative date format
  const relativeMatch = dateStr.match(/^now([+-]\d+)([smhdwMy])?$/);
  if (relativeMatch && relativeMatch[1]) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2] || 'd';
    const now = new Date();

    switch (unit) {
      case 's':
        now.setSeconds(now.getSeconds() + amount);
        break;
      case 'm':
        now.setMinutes(now.getMinutes() + amount);
        break;
      case 'h':
        now.setHours(now.getHours() + amount);
        break;
      case 'd':
        now.setDate(now.getDate() + amount);
        break;
      case 'w':
        now.setDate(now.getDate() + amount * 7);
        break;
      case 'M':
        now.setMonth(now.getMonth() + amount);
        break;
      case 'y':
        now.setFullYear(now.getFullYear() + amount);
        break;
    }

    return now;
  }

  // "now" without offset
  if (dateStr === 'now') {
    return new Date();
  }

  return null;
}

/**
 * Evaluates string comparisons
 */
function evaluateStringComparison(actual: string, operator: string, expected: string): boolean {
  switch (operator) {
    case '=':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case 'like':
      // Simple pattern matching - case insensitive
      return actual.toLowerCase().includes(expected.toLowerCase());
    default:
      return false;
  }
}

/**
 * Evaluates array comparisons (for assignees and labels)
 */
function evaluateArrayComparison(actual: number[], operator: string, expected: number[]): boolean {
  switch (operator) {
    case 'in':
      // Check if any expected value is in the actual array
      return expected.some((e) => actual.includes(e));
    case 'not in':
      // Check if none of the expected values are in the actual array
      return !expected.some((e) => actual.includes(e));
    default:
      return false;
  }
}

/**
 * Evaluates a filter group against a task
 */
function evaluateGroup(task: Task, group: FilterGroup): boolean {
  if (group.operator === '&&') {
    return group.conditions.every((condition) => evaluateCondition(task, condition));
  } else {
    return group.conditions.some((condition) => evaluateCondition(task, condition));
  }
}

/**
 * Applies a filter expression to a list of tasks
 */
function applyFilter(tasks: Task[], expression: FilterExpression): Task[] {
  return tasks.filter((task) => {
    const groupOperator = expression.operator || '&&';

    if (groupOperator === '&&') {
      return expression.groups.every((group) => evaluateGroup(task, group));
    } else {
      return expression.groups.some((group) => evaluateGroup(task, group));
    }
  });
}

export function registerTasksTool(server: McpServer, authManager: AuthManager): void {
  server.tool(
    'vikunja_tasks',
    {
      subcommand: z.enum([
        'create',
        'get',
        'update',
        'delete',
        'list',
        'assign',
        'unassign',
        'list-assignees',
        'attach',
        'comment',
        'bulk-create',
        'bulk-update',
        'bulk-delete',
        'relate',
        'unrelate',
        'relations',
        'add-reminder',
        'remove-reminder',
        'list-reminders',
      ]),
      // Task creation/update fields
      title: z.string().optional(),
      description: z.string().optional(),
      projectId: z.number().optional(),
      dueDate: z.string().optional(),
      priority: z.number().min(0).max(5).optional(),
      labels: z.array(z.number()).optional(),
      assignees: z.array(z.number()).optional(),
      // Recurring task fields
      repeatAfter: z.number().min(0).optional(),
      repeatMode: z.enum(['day', 'week', 'month', 'year']).optional(),
      // Query fields
      id: z.number().optional(),
      filter: z.string().optional(),
      filterId: z.string().optional(),
      page: z.number().optional(),
      perPage: z.number().optional(),
      sort: z.string().optional(),
      search: z.string().optional(),
      // List specific filters
      allProjects: z.boolean().optional(),
      done: z.boolean().optional(),
      // Comment fields
      comment: z.string().optional(),
      commentId: z.number().optional(),
      // Bulk operation fields
      taskIds: z.array(z.number()).optional(),
      field: z.string().optional(),
      value: z.unknown().optional(),
      tasks: z
        .array(
          z.object({
            title: z.string(),
            description: z.string().optional(),
            dueDate: z.string().optional(),
            priority: z.number().min(0).max(5).optional(),
            labels: z.array(z.number()).optional(),
            assignees: z.array(z.number()).optional(),
            repeatAfter: z.number().min(0).optional(),
            repeatMode: z.enum(['day', 'week', 'month', 'year']).optional(),
          }),
        )
        .optional(),
      // Reminder fields
      reminderDate: z.string().optional(),
      reminderId: z.number().optional(),
      // Add relation schema
      ...relationSchema,
    },
    async (args) => {
      try {
        logger.debug('Executing tasks tool', { subcommand: args.subcommand, args });

        // Check authentication
        if (!authManager.isAuthenticated()) {
          throw new MCPError(
            ErrorCode.AUTH_REQUIRED,
            'Authentication required. Please use vikunja_auth.connect first.',
          );
        }

        const client = await getVikunjaClient();

        switch (args.subcommand) {
          case 'list': {
            const params: FilterParams = {};

            try {
              let tasks;
              let filterExpression: FilterExpression | null = null;
              let filterString: string | undefined;

              // Build query parameters
              if (args.page !== undefined) params.page = args.page;
              if (args.perPage !== undefined) params.per_page = args.perPage;
              if (args.search !== undefined) params.s = args.search;
              if (args.sort !== undefined) params.sort_by = args.sort;

              // Handle filter - either direct filter string or saved filter ID
              if (args.filterId) {
                const savedFilter = await filterStorage.get(args.filterId);
                if (!savedFilter) {
                  throw new MCPError(
                    ErrorCode.VALIDATION_ERROR,
                    `Filter with id ${args.filterId} not found`,
                  );
                }
                filterString = savedFilter.filter;
              } else if (args.filter !== undefined) {
                filterString = args.filter;
              }

              // Parse the filter string for client-side filtering
              if (filterString) {
                const parseResult = parseFilterString(filterString);
                if (parseResult.error) {
                  throw new MCPError(
                    ErrorCode.VALIDATION_ERROR,
                    `Invalid filter syntax: ${parseResult.error.message}${parseResult.error.context ? `\n${parseResult.error.context}` : ''}`,
                  );
                }
                filterExpression = parseResult.expression;

                // Log that we're using client-side filtering due to known issue
                logger.info(
                  'Using client-side filtering due to Vikunja API filter parameter being ignored',
                  {
                    filter: filterString,
                  },
                );
              }

              // Determine which endpoint to use
              // Don't pass the filter parameter to the API since it's ignored
              if (args.projectId && !args.allProjects) {
                // Validate project ID
                validateId(args.projectId, 'projectId');
                // Get tasks for specific project
                tasks = await client.tasks.getProjectTasks(args.projectId, params);
              } else {
                // Get all tasks across all projects
                tasks = await client.tasks.getAllTasks(params);
              }

              // Apply client-side filtering if we have a filter expression
              if (filterExpression) {
                const originalCount = tasks.length;
                tasks = applyFilter(tasks, filterExpression);
                logger.debug('Applied client-side filter', {
                  originalCount,
                  filteredCount: tasks.length,
                  filter: filterString,
                });
              }

              // Filter by done status if specified (this is a simpler filter that works)
              if (args.done !== undefined) {
                tasks = tasks.filter((task) => task.done === args.done);
              }

              const response: StandardTaskResponse = {
                success: true,
                operation: 'list',
                message: `Found ${tasks.length} tasks${filterString ? ' (filtered client-side)' : ''}`,
                tasks: tasks,
                metadata: {
                  timestamp: new Date().toISOString(),
                  count: tasks.length,
                  ...(filterString && {
                    filter: filterString,
                    clientSideFiltering: true,
                    filteringNote: 'Client-side filtering applied due to Vikunja API limitation',
                  }),
                },
              };

              logger.debug('Tasks tool response', { subcommand: 'list', itemCount: tasks.length });

              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              if (error instanceof MCPError) {
                throw error;
              }

              // Log the full error for debugging filter issues
              logger.error('Task list error:', {
                error: error instanceof Error ? error.message : String(error),
                params: params,
                filter: args.filter,
                filterId: args.filterId,
              });

              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'create': {
            try {
              if (!args.projectId) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'projectId is required to create a task',
                );
              }
              validateId(args.projectId, 'projectId');

              if (!args.title) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'title is required to create a task',
                );
              }

              // Validate optional date fields
              if (args.dueDate) {
                validateDateString(args.dueDate, 'dueDate');
              }

              // Validate assignee IDs upfront
              if (args.assignees && args.assignees.length > 0) {
                args.assignees.forEach((id) => validateId(id, 'assignee ID'));
              }

              const newTask: Task = {
                title: args.title,
                project_id: args.projectId,
              };
              if (args.description !== undefined) newTask.description = args.description;
              if (args.dueDate !== undefined) newTask.due_date = args.dueDate;
              if (args.priority !== undefined) newTask.priority = args.priority;
              // Handle repeat configuration
              if (args.repeatAfter !== undefined || args.repeatMode !== undefined) {
                const repeatConfig = convertRepeatConfiguration(args.repeatAfter, args.repeatMode);
                if (repeatConfig.repeat_after !== undefined)
                  newTask.repeat_after = repeatConfig.repeat_after;
                if (repeatConfig.repeat_mode !== undefined) {
                  // Use index signature to bypass type mismatch - API expects number but node-vikunja types expect string
                  (newTask as Record<string, unknown>).repeat_mode = repeatConfig.repeat_mode;
                }
              }

              const createdTask = await client.tasks.createTask(args.projectId, newTask);

              // Track whether labels were successfully added for error context
              let labelsAdded = false;

              try {
                // If labels were provided, add them
                if (args.labels && args.labels.length > 0 && createdTask.id) {
                  try {
                    await client.tasks.updateTaskLabels(createdTask.id, {
                      label_ids: args.labels,
                    });
                    labelsAdded = true;
                  } catch (labelError) {
                    // Check if it's an auth error
                    if (isAuthenticationError(labelError)) {
                      throw new MCPError(
                        ErrorCode.API_ERROR,
                        AUTH_ERROR_MESSAGES.LABEL_CREATE + ` Task ID: ${createdTask.id}`,
                      );
                    }
                    throw labelError;
                  }
                }

                // If assignees were provided, assign them
                if (args.assignees && args.assignees.length > 0 && createdTask.id) {
                  try {
                    await client.tasks.bulkAssignUsersToTask(createdTask.id, {
                      user_ids: args.assignees,
                    });
                  } catch (assigneeError) {
                    // Check if it's an auth error
                    if (isAuthenticationError(assigneeError)) {
                      throw new MCPError(
                        ErrorCode.API_ERROR,
                        AUTH_ERROR_MESSAGES.ASSIGNEE_CREATE + ` Task ID: ${createdTask.id}`,
                      );
                    }
                    throw assigneeError;
                  }
                }
              } catch (updateError) {
                // Attempt to clean up the partially created task
                let rollbackSucceeded = false;
                if (createdTask.id) {
                  try {
                    await client.tasks.deleteTask(createdTask.id);
                    rollbackSucceeded = true;
                  } catch (deleteError) {
                    // Log the cleanup failure but throw the original error
                    logger.error('Failed to clean up partially created task:', deleteError);
                  }
                }

                // Re-throw the original error with context
                const errorMessage = `Failed to complete task creation: ${updateError instanceof Error ? updateError.message : String(updateError)}. ${
                  rollbackSucceeded
                    ? 'Task was successfully rolled back.'
                    : 'Task rollback also failed - manual cleanup may be required.'
                }`;

                throw new MCPError(ErrorCode.API_ERROR, errorMessage, {
                  vikunjaError: {
                    taskId: createdTask.id,
                    partiallyCreated: true,
                    labelsAdded,
                    assigneesAdded: false,
                    rollbackSucceeded,
                  },
                });
              }

              // Fetch the complete task with labels and assignees
              const completeTask = createdTask.id
                ? await client.tasks.getTask(createdTask.id)
                : createdTask;

              const response: StandardTaskResponse = {
                success: true,
                operation: 'create',
                message: 'Task created successfully',
                task: completeTask,
                metadata: {
                  timestamp: new Date().toISOString(),
                },
              };

              logger.debug('Tasks tool response', {
                subcommand: 'create',
                taskId: completeTask.id,
              });

              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              if (error instanceof MCPError) {
                throw error;
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'get': {
            try {
              if (!args.id) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'Task id is required for get operation',
                );
              }
              validateId(args.id, 'id');

              const task = await client.tasks.getTask(args.id);

              const response: StandardTaskResponse = {
                success: true,
                operation: 'get',
                message: `Retrieved task "${task.title}"`,
                task: task,
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
                `Failed to get task: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'update': {
            try {
              if (!args.id) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'Task id is required for update operation',
                );
              }
              validateId(args.id, 'id');

              // Validate date if provided
              if (args.dueDate) {
                validateDateString(args.dueDate, 'dueDate');
              }

              // Fetch the current task to preserve all fields and track changes
              const currentTask = await client.tasks.getTask(args.id);
              const previousState = {
                title: currentTask.title,
                description: currentTask.description,
                due_date: currentTask.due_date,
                priority: currentTask.priority,
                done: currentTask.done,
                repeat_after: currentTask.repeat_after,
                repeat_mode: currentTask.repeat_mode,
              };

              // Track which fields are being updated
              const affectedFields: string[] = [];
              if (args.title !== undefined && args.title !== currentTask.title)
                affectedFields.push('title');
              if (args.description !== undefined && args.description !== currentTask.description)
                affectedFields.push('description');
              if (args.dueDate !== undefined && args.dueDate !== currentTask.due_date)
                affectedFields.push('dueDate');
              if (args.priority !== undefined && args.priority !== currentTask.priority)
                affectedFields.push('priority');
              if (args.done !== undefined && args.done !== currentTask.done)
                affectedFields.push('done');
              if (args.repeatAfter !== undefined && args.repeatAfter !== currentTask.repeat_after)
                affectedFields.push('repeatAfter');
              if (args.repeatMode !== undefined && args.repeatMode !== currentTask.repeat_mode)
                affectedFields.push('repeatMode');
              if (args.labels !== undefined) affectedFields.push('labels');
              if (args.assignees !== undefined) affectedFields.push('assignees');

              // Build update object by merging current task data with updates
              // This prevents the API from clearing fields that aren't explicitly updated
              const updateData: Task = {
                ...currentTask,
                // Override with any provided updates
                ...(args.title !== undefined && { title: args.title }),
                ...(args.description !== undefined && { description: args.description }),
                ...(args.dueDate !== undefined && { due_date: args.dueDate }),
                ...(args.priority !== undefined && { priority: args.priority }),
                ...(args.done !== undefined && { done: args.done }),
                // Handle repeat configuration for updates
                ...(args.repeatAfter !== undefined || args.repeatMode !== undefined
                  ? ((): Record<string, unknown> => {
                      const repeatConfig = convertRepeatConfiguration(
                        args.repeatAfter !== undefined
                          ? args.repeatAfter
                          : currentTask.repeat_after,
                        args.repeatMode !== undefined ? args.repeatMode : undefined,
                      );
                      const updates: Record<string, unknown> = {};
                      if (repeatConfig.repeat_after !== undefined)
                        updates.repeat_after = repeatConfig.repeat_after;
                      if (repeatConfig.repeat_mode !== undefined)
                        updates.repeat_mode = repeatConfig.repeat_mode;
                      return updates;
                    })()
                  : {}),
              };

              await client.tasks.updateTask(args.id, updateData);

              // Update labels if provided
              if (args.labels !== undefined) {
                try {
                  await client.tasks.updateTaskLabels(args.id, {
                    label_ids: args.labels,
                  });
                } catch (labelError) {
                  // Check if it's an auth error
                  if (isAuthenticationError(labelError)) {
                    throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.LABEL_UPDATE);
                  }
                  throw labelError;
                }
              }

              // Update assignees if provided
              if (args.assignees !== undefined) {
                try {
                  // Get current assignees to calculate diff
                  const currentTask = await client.tasks.getTask(args.id);
                  const currentAssigneeIds = currentTask.assignees?.map((a) => a.id) || [];
                  const newAssigneeIds = args.assignees;

                  // Calculate which assignees to add and remove
                  const toAdd = newAssigneeIds.filter((id) => !currentAssigneeIds.includes(id));
                  const toRemove = currentAssigneeIds.filter((id) => !newAssigneeIds.includes(id));

                  // Add new assignees first to avoid leaving task unassigned if removal fails
                  if (toAdd.length > 0) {
                    await client.tasks.bulkAssignUsersToTask(args.id, {
                      user_ids: toAdd,
                    });
                  }

                  // Remove old assignees only after new ones are successfully added
                  for (const userId of toRemove) {
                    try {
                      await client.tasks.removeUserFromTask(args.id, userId);
                    } catch (removeError) {
                      // Check if it's an auth error on remove
                      if (isAuthenticationError(removeError)) {
                        throw new MCPError(
                          ErrorCode.API_ERROR,
                          AUTH_ERROR_MESSAGES.ASSIGNEE_REMOVE_PARTIAL,
                        );
                      }
                      throw removeError;
                    }
                  }
                } catch (assigneeError) {
                  // Check if it's an auth error
                  if (isAuthenticationError(assigneeError)) {
                    throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.ASSIGNEE_UPDATE);
                  }
                  throw assigneeError;
                }
              }

              // Fetch the complete updated task
              const completeTask = await client.tasks.getTask(args.id);

              const response: StandardTaskResponse = {
                success: true,
                operation: 'update',
                message: 'Task updated successfully',
                task: completeTask,
                metadata: {
                  timestamp: new Date().toISOString(),
                  affectedFields,
                  previousState: previousState as Partial<Task>,
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
              if (error instanceof MCPError) {
                throw error;
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to update task: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'delete': {
            try {
              if (!args.id) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'Task id is required for delete operation',
                );
              }
              validateId(args.id, 'id');

              // Try to get task before deletion for response, but handle failure gracefully
              let taskToDelete: Task | undefined;
              try {
                taskToDelete = await client.tasks.getTask(args.id);
              } catch {
                // If we can't get the task, proceed with deletion anyway
                taskToDelete = undefined;
              }

              await client.tasks.deleteTask(args.id);

              const response: StandardTaskResponse = {
                success: true,
                operation: 'delete',
                message: taskToDelete
                  ? `Task "${taskToDelete.title}" deleted successfully`
                  : `Task ${args.id} deleted successfully`,
                ...(taskToDelete && { task: taskToDelete }),
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
                `Failed to delete task: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'assign': {
            try {
              if (!args.id) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'Task id is required for assign operation',
                );
              }
              validateId(args.id, 'id');

              if (!args.assignees || args.assignees.length === 0) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'At least one assignee (user id) is required',
                );
              }

              // Validate assignee IDs
              args.assignees.forEach((id) => validateId(id, 'assignee ID'));

              // Assign users to the task
              try {
                await client.tasks.bulkAssignUsersToTask(args.id, {
                  user_ids: args.assignees,
                });
              } catch (assigneeError) {
                // Check if it's an auth error
                if (isAuthenticationError(assigneeError)) {
                  throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.ASSIGNEE_ASSIGN);
                }
                throw assigneeError;
              }

              // Fetch the updated task to show current assignees
              const task = await client.tasks.getTask(args.id);

              const response: StandardTaskResponse = {
                success: true,
                operation: 'assign',
                message: 'Users assigned to task successfully',
                task: task,
                metadata: {
                  timestamp: new Date().toISOString(),
                  affectedFields: ['assignees'],
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
                `Failed to assign users to task: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'unassign': {
            try {
              if (!args.id) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'Task id is required for unassign operation',
                );
              }
              validateId(args.id, 'id');

              if (!args.assignees || args.assignees.length === 0) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'At least one assignee (user id) is required to unassign',
                );
              }

              // Validate assignee IDs
              args.assignees.forEach((id) => validateId(id, 'assignee ID'));

              // Remove users from the task
              for (const userId of args.assignees) {
                try {
                  await client.tasks.removeUserFromTask(args.id, userId);
                } catch (removeError) {
                  // Check if it's an auth error
                  if (isAuthenticationError(removeError)) {
                    throw new MCPError(ErrorCode.API_ERROR, AUTH_ERROR_MESSAGES.ASSIGNEE_REMOVE);
                  }
                  throw removeError;
                }
              }

              // Fetch the updated task to show current assignees
              const task = await client.tasks.getTask(args.id);

              const response: StandardTaskResponse = {
                success: true,
                operation: 'unassign',
                message: 'Users removed from task successfully',
                task: task,
                metadata: {
                  timestamp: new Date().toISOString(),
                  affectedFields: ['assignees'],
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
                `Failed to remove users from task: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'list-assignees': {
            try {
              if (args.id === undefined) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'Task id is required for list-assignees operation',
                );
              }
              validateId(args.id, 'id');

              // Fetch the task to get current assignees
              const task = await client.tasks.getTask(args.id);

              const assignees = task.assignees || [];

              const minimalTask: MinimalTask = {
                ...(task.id !== undefined && { id: task.id }),
                title: task.title,
                assignees: assignees,
              };

              const response: StandardTaskResponse = {
                success: true,
                operation: 'list',
                message: `Task has ${assignees.length} assignee(s)`,
                task: minimalTask,
                metadata: {
                  timestamp: new Date().toISOString(),
                  count: assignees.length,
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
              if (error instanceof MCPError) {
                throw error;
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to list task assignees: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'comment': {
            try {
              if (!args.id) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'Task id is required for comment operation',
                );
              }
              validateId(args.id, 'id');

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

          case 'attach': {
            // Attachment handling would require file upload capabilities
            // which are not available in the current MCP context
            throw new MCPError(
              ErrorCode.NOT_IMPLEMENTED,
              'File attachments are not supported in the current MCP context',
            );
          }

          case 'bulk-update': {
            try {
              if (!args.taskIds || args.taskIds.length === 0) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'taskIds array is required for bulk update operation',
                );
              }

              if (!args.field) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'field is required for bulk update operation',
                );
              }

              if (args.value === undefined) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'value is required for bulk update operation',
                );
              }

              // Check max tasks limit
              if (args.taskIds.length > MAX_BULK_OPERATION_TASKS) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  `Too many tasks for bulk operation. Maximum allowed: ${MAX_BULK_OPERATION_TASKS}. Consider breaking into smaller batches.`,
                );
              }

              // Validate all task IDs
              args.taskIds.forEach((id) => validateId(id, 'task ID'));

              // Store taskIds in const after validation for TypeScript
              const taskIds = args.taskIds;

              // Preprocess value to handle common type coercion issues
              // MCP might pass boolean values as strings
              if (args.field === 'done' && typeof args.value === 'string') {
                const originalValue = args.value;
                if (args.value === 'true') {
                  args.value = true;
                } else if (args.value === 'false') {
                  args.value = false;
                }
                logger.debug('Preprocessed done field value', {
                  originalValue: originalValue,
                  processedValue: args.value,
                });
              }

              // Handle numeric fields that might come as strings
              if ((args.field === 'priority' || args.field === 'project_id' || args.field === 'repeat_after') && 
                  typeof args.value === 'string') {
                const originalValue = args.value;
                const numValue = Number(args.value);
                if (!isNaN(numValue)) {
                  args.value = numValue;
                  logger.debug(`Preprocessed ${args.field} field value`, {
                    originalValue: originalValue,
                    processedValue: args.value,
                  });
                }
              }

              // Validate the field and value based on allowed fields
              const allowedFields = [
                'done',
                'priority',
                'due_date',
                'project_id',
                'assignees',
                'labels',
                'repeat_after',
                'repeat_mode',
              ];
              if (!allowedFields.includes(args.field)) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  `Invalid field: ${args.field}. Allowed fields: ${allowedFields.join(', ')}`,
                );
              }

              // Additional validation based on field type
              if (args.field === 'priority' && typeof args.value === 'number') {
                if (args.value < 0 || args.value > 5) {
                  throw new MCPError(
                    ErrorCode.VALIDATION_ERROR,
                    'Priority must be between 0 and 5',
                  );
                }
              }

              if (args.field === 'due_date' && typeof args.value === 'string') {
                validateDateString(args.value, 'due_date');
              }

              if (args.field === 'project_id' && typeof args.value === 'number') {
                validateId(args.value, 'project_id');
              }

              // Type validation for array fields
              if (args.field === 'assignees' || args.field === 'labels') {
                if (!Array.isArray(args.value)) {
                  throw new MCPError(
                    ErrorCode.VALIDATION_ERROR,
                    `${args.field} must be an array of numbers`,
                  );
                }
                const valueArray = args.value as number[];
                valueArray.forEach((id) => validateId(id, `${args.field} ID`));
              }

              // Type validation for boolean field
              if (args.field === 'done') {
                logger.debug('Bulk update done field validation', {
                  value: args.value,
                  typeOfValue: typeof args.value,
                  isBoolean: typeof args.value === 'boolean',
                });
                if (typeof args.value !== 'boolean') {
                  throw new MCPError(
                    ErrorCode.VALIDATION_ERROR,
                    'done field must be a boolean value (true or false)',
                  );
                }
              }

              // Validation for recurring fields
              if (args.field === 'repeat_after' && typeof args.value === 'number') {
                if (args.value < 0) {
                  throw new MCPError(
                    ErrorCode.VALIDATION_ERROR,
                    'repeat_after must be a non-negative number',
                  );
                }
              }

              if (args.field === 'repeat_mode' && typeof args.value === 'string') {
                const validModes = ['day', 'week', 'month', 'year'];
                if (!validModes.includes(args.value)) {
                  throw new MCPError(
                    ErrorCode.VALIDATION_ERROR,
                    `Invalid repeat_mode: ${args.value}. Valid modes: ${validModes.join(', ')}`,
                  );
                }
              }

              // Use the proper bulk update API endpoint
              try {
                // Build the bulk update operation using TaskBulkOperation interface
                const bulkOperation = {
                  task_ids: taskIds,
                  field: args.field,
                  value: args.value,
                };

                // Special handling for repeat_mode conversion
                if (args.field === 'repeat_mode' && typeof args.value === 'string') {
                  const modeMap: Record<string, number> = {
                    default: 0,
                    month: 1,
                    from_current: 2,
                  };
                  bulkOperation.value = modeMap[args.value] ?? args.value;
                }

                // Call the proper bulk update API
                logger.debug('Calling bulkUpdateTasks API', { bulkOperation });
                const bulkUpdateResult = await client.tasks.bulkUpdateTasks(bulkOperation);

                // Handle inconsistent return types from the bulk update API
                // Sometimes it returns Message object, sometimes Task[] array
                let updatedTasks: Task[] = [];
                let bulkUpdateSuccessful = false;

                if (Array.isArray(bulkUpdateResult)) {
                  // API returned Task[] array - verify the updates were actually applied
                  if (bulkUpdateResult.length > 0) {
                    bulkUpdateSuccessful = true;
                    
                    // Check if the returned tasks have the expected values
                    for (const task of bulkUpdateResult) {
                      switch (args.field) {
                        case 'priority':
                          if (task.priority !== args.value) {
                            logger.warn('Bulk update API returned task with unchanged priority', {
                              taskId: task.id,
                              expectedPriority: args.value,
                              actualPriority: task.priority,
                            });
                            bulkUpdateSuccessful = false;
                          }
                          break;
                        case 'done':
                          if (task.done !== args.value) {
                            logger.warn('Bulk update API returned task with unchanged done status', {
                              taskId: task.id,
                              expectedDone: args.value,
                              actualDone: task.done,
                            });
                            bulkUpdateSuccessful = false;
                          }
                          break;
                        case 'due_date':
                          if (task.due_date !== args.value) {
                            logger.warn('Bulk update API returned task with unchanged due date', {
                              taskId: task.id,
                              expectedDueDate: args.value,
                              actualDueDate: task.due_date,
                            });
                            bulkUpdateSuccessful = false;
                          }
                          break;
                        case 'project_id':
                          if (task.project_id !== args.value) {
                            logger.warn('Bulk update API returned task with unchanged project ID', {
                              taskId: task.id,
                              expectedProjectId: args.value,
                              actualProjectId: task.project_id,
                            });
                            bulkUpdateSuccessful = false;
                          }
                          break;
                      }
                      if (!bulkUpdateSuccessful) break;
                    }
                    
                    if (bulkUpdateSuccessful) {
                      updatedTasks = bulkUpdateResult;
                    }
                  }
                } else if (bulkUpdateResult && typeof bulkUpdateResult === 'object' && 'message' in bulkUpdateResult) {
                  // API returned Message object - treat as success but need to fetch updated tasks
                  logger.debug('Bulk update API returned message object', { result: bulkUpdateResult });
                  bulkUpdateSuccessful = true;
                }

                if (!bulkUpdateSuccessful) {
                  // Bulk update didn't actually update the values, throw an error to trigger fallback
                  throw new Error('Bulk update API reported success but did not update task values');
                }

                // If we don't have the updated tasks yet (Message response), fetch them
                if (updatedTasks.length === 0) {
                  const fetchResults = await processBatches(
                    taskIds,
                    BULK_OPERATION_BATCH_SIZE,
                    async (batch) => {
                      const results = await Promise.allSettled(
                        batch.map((id) => client.tasks.getTask(id)),
                      );
                      return results;
                    },
                  );

                  updatedTasks = fetchResults
                    .filter(
                      (result): result is PromiseFulfilledResult<Task> =>
                        result.status === 'fulfilled',
                    )
                    .map((result) => result.value);
                }

                const response: StandardTaskResponse = {
                  success: true,
                  operation: 'update',
                  message: `Successfully updated ${taskIds.length} tasks`,
                  tasks: updatedTasks,
                  metadata: {
                    timestamp: new Date().toISOString(),
                    count: taskIds.length,
                    affectedFields: [args.field],
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
              } catch (bulkError) {
                // If bulk update fails, fall back to individual updates
                logger.warn('Bulk update API failed, falling back to individual updates', {
                  error: bulkError instanceof Error ? bulkError.message : String(bulkError),
                  field: args.field,
                  value: args.value,
                  valueType: typeof args.value,
                  taskIds: taskIds,
                });

                // Perform bulk update using individual task updates as fallback
                const updateResults = await processBatches(
                  taskIds,
                  BULK_OPERATION_BATCH_SIZE,
                  async (batch) => {
                    const results = await Promise.allSettled(
                      batch.map(async (taskId) => {
                        // Fetch current task to preserve required fields
                        const currentTask = await client.tasks.getTask(taskId);

                        // Build update object based on field, preserving existing data
                        const updateData: Task = { ...currentTask };

                        switch (args.field) {
                          case 'done':
                            updateData.done = args.value as boolean;
                            break;
                          case 'priority':
                            updateData.priority = args.value as number;
                            break;
                          case 'due_date':
                            updateData.due_date = args.value as string;
                            break;
                          case 'project_id':
                            updateData.project_id = args.value as number;
                            break;
                          case 'assignees':
                            // For assignees, we need to handle the user assignment separately
                            // This is a limitation of the current API
                            break;
                          case 'labels':
                            // For labels, we need to handle the label assignment separately
                            // This is a limitation of the current API
                            break;
                          case 'repeat_after':
                            updateData.repeat_after = args.value as number;
                            break;
                          case 'repeat_mode':
                            // The repeat_mode field in the API expects a number
                            // But TypeScript types might be out of sync
                            Object.assign(updateData, { repeat_mode: args.value });
                            break;
                        }

                        // Update the task
                        const updatedTask = await client.tasks.updateTask(taskId, updateData);

                        // Handle assignees and labels separately if needed
                        if (args.field === 'assignees' && Array.isArray(args.value)) {
                          try {
                            // Replace all assignees with the new list
                            const currentTaskWithAssignees = await client.tasks.getTask(taskId);
                            const currentAssigneeIds =
                              currentTaskWithAssignees.assignees?.map((a) => a.id) || [];
                            const newAssigneeIds = args.value as number[];

                            // Add new assignees first to avoid leaving task unassigned
                            if (newAssigneeIds.length > 0) {
                              await client.tasks.bulkAssignUsersToTask(taskId, {
                                user_ids: newAssigneeIds,
                              });
                            }

                            // Remove old assignees only after new ones are successfully added
                            for (const userId of currentAssigneeIds) {
                              try {
                                await client.tasks.removeUserFromTask(taskId, userId);
                              } catch (removeError) {
                                // Check if it's an auth error on remove
                                if (isAuthenticationError(removeError)) {
                                  throw new MCPError(
                                    ErrorCode.API_ERROR,
                                    AUTH_ERROR_MESSAGES.ASSIGNEE_REMOVE_PARTIAL,
                                  );
                                }
                                throw removeError;
                              }
                            }
                          } catch (assigneeError) {
                            // Check if it's an auth error
                            if (isAuthenticationError(assigneeError)) {
                              throw new MCPError(
                                ErrorCode.API_ERROR,
                                AUTH_ERROR_MESSAGES.ASSIGNEE_BULK_UPDATE,
                              );
                            }
                            throw assigneeError;
                          }
                        }
                        if (args.field === 'labels' && Array.isArray(args.value)) {
                          await client.tasks.updateTaskLabels(taskId, {
                            label_ids: args.value as number[],
                          });
                        }

                        return updatedTask;
                      }),
                    );
                    return results;
                  },
                );

                // Check for any failures
                const failures = updateResults
                  .map((result, index) => ({ result, id: taskIds[index] }))
                  .filter(({ result }) => result.status === 'rejected');

                if (failures.length > 0) {
                  const failedIds = failures.map((f) => f.id);
                  const successCount = taskIds.length - failures.length;

                  // Check if all failures are due to assignee auth errors
                  if (args.field === 'assignees') {
                    const authFailures = failures.filter(({ result }) => {
                      const reason = (result as PromiseRejectedResult).reason as unknown;
                      return (
                        reason instanceof MCPError &&
                        reason.message.includes(
                          'Assignee operations may have authentication issues',
                        )
                      );
                    });

                    if (authFailures.length === failures.length) {
                      // All failures are auth-related
                      throw new MCPError(
                        ErrorCode.API_ERROR,
                        'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
                          'This is a known limitation that prevents bulk updating assignees.',
                      );
                    }
                  }

                  // If some succeeded, report partial success
                  if (successCount > 0) {
                    logger.warn('Bulk update partially failed', {
                      successCount,
                      failedCount: failures.length,
                      failedIds,
                    });
                  } else {
                    // All failed
                    throw new MCPError(
                      ErrorCode.API_ERROR,
                      `Bulk update failed. Could not update any tasks. Failed IDs: ${failedIds.join(', ')}`,
                    );
                  }
                }

                // Fetch updated tasks to show results using batching and allSettled
                const fetchResults = await processBatches(
                  taskIds,
                  BULK_OPERATION_BATCH_SIZE,
                  async (batch) => {
                    const results = await Promise.allSettled(
                      batch.map((id) => client.tasks.getTask(id)),
                    );
                    return results;
                  },
                );

                const updatedTasks = fetchResults
                  .filter(
                    (result): result is PromiseFulfilledResult<Task> =>
                      result.status === 'fulfilled',
                  )
                  .map((result) => result.value);

                const failedFetches = fetchResults.filter(
                  (result): result is PromiseRejectedResult => result.status === 'rejected',
                ).length;

                const response: StandardTaskResponse = {
                  success: true,
                  operation: 'update',
                  message: `Successfully updated ${taskIds.length} tasks${failedFetches > 0 ? ` (${failedFetches} tasks could not be fetched after update)` : ''}`,
                  tasks: updatedTasks,
                  metadata: {
                    timestamp: new Date().toISOString(),
                    affectedFields: [args.field],
                    count: taskIds.length,
                    ...(failedFetches > 0 && { fetchErrors: failedFetches }),
                  },
                };

                logger.debug('Bulk update completed', {
                  taskCount: taskIds.length,
                  field: args.field,
                  fetchErrors: failedFetches,
                });

                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: JSON.stringify(response, null, 2),
                    },
                  ],
                };
              }
            } catch (error) {
              if (error instanceof MCPError) {
                throw error;
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to bulk update tasks: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'bulk-delete': {
            try {
              if (!args.taskIds || args.taskIds.length === 0) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'taskIds array is required for bulk delete operation',
                );
              }

              // Store taskIds in a const for TypeScript
              const taskIds = args.taskIds;

              // Check max tasks limit
              if (taskIds.length > MAX_BULK_OPERATION_TASKS) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  `Too many tasks for bulk operation. Maximum allowed: ${MAX_BULK_OPERATION_TASKS}. Consider breaking into smaller batches.`,
                );
              }

              // Validate all task IDs
              taskIds.forEach((id) => validateId(id, 'task ID'));

              // Fetch tasks before deletion for response metadata using batching
              const fetchResults = await processBatches(
                taskIds,
                BULK_OPERATION_BATCH_SIZE,
                async (batch) => {
                  const results = await Promise.allSettled(
                    batch.map((id) => client.tasks.getTask(id)),
                  );
                  return results;
                },
              );

              const tasksToDelete = fetchResults
                .filter(
                  (result): result is PromiseFulfilledResult<Task> => result.status === 'fulfilled',
                )
                .map((result) => result.value);

              // Delete tasks in batches
              const deletionResults = await processBatches(
                taskIds,
                BULK_OPERATION_BATCH_SIZE,
                async (batch) => {
                  const results = await Promise.allSettled(
                    batch.map((id) => client.tasks.deleteTask(id)),
                  );
                  return results;
                },
              );

              // Check for any failures
              const failures = deletionResults
                .map((result, index) => ({ result, id: taskIds[index] }))
                .filter(({ result }) => result.status === 'rejected');

              if (failures.length > 0) {
                const failedIds = failures.map((f) => f.id);
                const successCount = taskIds.length - failures.length;

                // If some succeeded, report partial success
                if (successCount > 0) {
                  const response: StandardTaskResponse = {
                    success: false,
                    operation: 'delete',
                    message: `Bulk delete partially completed. Successfully deleted ${successCount} tasks. Failed to delete task IDs: ${failedIds.join(', ')}`,
                    metadata: {
                      timestamp: new Date().toISOString(),
                      count: successCount,
                      failedCount: failures.length,
                      failedIds: failedIds.filter((id): id is number => id !== undefined),
                      previousState: tasksToDelete,
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
                } else {
                  // All failed
                  throw new MCPError(
                    ErrorCode.API_ERROR,
                    `Bulk delete failed. Could not delete any tasks. Failed IDs: ${failedIds.join(', ')}`,
                  );
                }
              }

              const response: StandardTaskResponse = {
                success: true,
                operation: 'delete',
                message: `Successfully deleted ${taskIds.length} tasks`,
                metadata: {
                  timestamp: new Date().toISOString(),
                  count: taskIds.length,
                  previousState: tasksToDelete,
                },
              };

              logger.debug('Bulk delete completed', {
                taskCount: taskIds.length,
              });

              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              if (error instanceof MCPError) {
                throw error;
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to bulk delete tasks: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'bulk-create': {
            try {
              if (!args.projectId) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'projectId is required for bulk create operation',
                );
              }
              validateId(args.projectId, 'projectId');

              if (!args.tasks || args.tasks.length === 0) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'tasks array is required and must contain at least one task',
                );
              }

              // Check max tasks limit
              if (args.tasks.length > MAX_BULK_OPERATION_TASKS) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  `Too many tasks for bulk operation. Maximum allowed: ${MAX_BULK_OPERATION_TASKS}. Consider breaking into smaller batches.`,
                );
              }

              // Validate all tasks have required fields
              args.tasks.forEach((task, index) => {
                if (!task.title || task.title.trim() === '') {
                  throw new MCPError(
                    ErrorCode.VALIDATION_ERROR,
                    `Task at index ${index} must have a non-empty title`,
                  );
                }

                // Validate optional fields
                if (task.dueDate) {
                  validateDateString(task.dueDate, `tasks[${index}].dueDate`);
                }

                if (task.assignees) {
                  task.assignees.forEach((id) => validateId(id, `tasks[${index}].assignee ID`));
                }

                if (task.labels) {
                  task.labels.forEach((id) => validateId(id, `tasks[${index}].label ID`));
                }
              });

              // Create tasks in batches
              const projectId = args.projectId; // TypeScript knows this is defined due to earlier check
              const creationResults = await processBatches(
                args.tasks,
                BULK_OPERATION_BATCH_SIZE,
                async (batch) => {
                  const results = await Promise.allSettled(
                    batch.map(async (taskData) => {
                      // Create the base task
                      const newTask: Task = {
                        title: taskData.title,
                        project_id: projectId,
                      };

                      if (taskData.description !== undefined)
                        newTask.description = taskData.description;
                      if (taskData.dueDate !== undefined) newTask.due_date = taskData.dueDate;
                      if (taskData.priority !== undefined) newTask.priority = taskData.priority;
                      // Handle repeat configuration for bulk create
                      if (taskData.repeatAfter !== undefined || taskData.repeatMode !== undefined) {
                        const repeatConfig = convertRepeatConfiguration(
                          taskData.repeatAfter,
                          taskData.repeatMode,
                        );
                        if (repeatConfig.repeat_after !== undefined)
                          newTask.repeat_after = repeatConfig.repeat_after;
                        if (repeatConfig.repeat_mode !== undefined) {
                          // Use index signature to bypass type mismatch - API expects number but node-vikunja types expect string
                          (newTask as Record<string, unknown>).repeat_mode =
                            repeatConfig.repeat_mode;
                        }
                      }

                      // Create the task
                      const createdTask = await client.tasks.createTask(projectId, newTask);

                      // Add labels and assignees if provided
                      if (createdTask.id) {
                        try {
                          if (taskData.labels && taskData.labels.length > 0) {
                            await client.tasks.updateTaskLabels(createdTask.id, {
                              label_ids: taskData.labels,
                            });
                          }

                          if (taskData.assignees && taskData.assignees.length > 0) {
                            try {
                              await client.tasks.bulkAssignUsersToTask(createdTask.id, {
                                user_ids: taskData.assignees,
                              });
                            } catch (assigneeError) {
                              // Check if it's an auth error
                              if (isAuthenticationError(assigneeError)) {
                                throw new MCPError(
                                  ErrorCode.API_ERROR,
                                  'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
                                    'This is a known limitation. The task was created but assignees could not be added. ' +
                                    `Task ID: ${createdTask.id}`,
                                );
                              }
                              throw assigneeError;
                            }
                          }

                          // Fetch the complete task with labels and assignees
                          return await client.tasks.getTask(createdTask.id);
                        } catch (updateError) {
                          // If updating labels/assignees fails, try to clean up
                          try {
                            await client.tasks.deleteTask(createdTask.id);
                          } catch (deleteError) {
                            logger.error('Failed to clean up partially created task:', deleteError);
                          }
                          throw updateError;
                        }
                      }

                      return createdTask;
                    }),
                  );
                  return results;
                },
              );

              // Process results
              const successfulTasks = creationResults
                .filter(
                  (result): result is PromiseFulfilledResult<Task> => result.status === 'fulfilled',
                )
                .map((result) => result.value);

              const failedTasks = creationResults
                .map((result, index) => ({ result, index }))
                .filter(({ result }) => result.status === 'rejected')
                .map(({ result, index }) => {
                  const rejectedResult = result as PromiseRejectedResult;
                  const reason = rejectedResult.reason as unknown;
                  return {
                    index,
                    error: reason instanceof Error ? reason.message : String(reason),
                  };
                });

              if (failedTasks.length > 0 && successfulTasks.length === 0) {
                // All failed
                throw new MCPError(
                  ErrorCode.API_ERROR,
                  `Bulk create failed. Could not create any tasks. Errors: ${JSON.stringify(failedTasks)}`,
                );
              }

              const response: StandardTaskResponse = {
                success: failedTasks.length === 0,
                operation: 'create',
                message:
                  failedTasks.length > 0
                    ? `Bulk create partially completed. Successfully created ${successfulTasks.length} tasks, ${failedTasks.length} failed.`
                    : `Successfully created ${successfulTasks.length} tasks`,
                tasks: successfulTasks,
                metadata: {
                  timestamp: new Date().toISOString(),
                  count: successfulTasks.length,
                  ...(failedTasks.length > 0 && {
                    failedCount: failedTasks.length,
                    failures: failedTasks,
                  }),
                },
              };

              logger.debug('Bulk create completed', {
                successCount: successfulTasks.length,
                failedCount: failedTasks.length,
              });

              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              if (error instanceof MCPError) {
                throw error;
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to bulk create tasks: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          // Handle relation subcommands
          case 'relate':
          case 'unrelate':
          case 'relations':
            return handleRelationSubcommands({
              subcommand: args.subcommand,
              id: args.id,
              otherTaskId: args.otherTaskId,
              relationKind: args.relationKind,
            });

          // Handle reminder operations
          case 'add-reminder': {
            try {
              if (!args.id) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'Task id is required for add-reminder operation',
                );
              }
              validateId(args.id, 'id');

              if (!args.reminderDate) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'reminderDate is required for add-reminder operation',
                );
              }
              validateDateString(args.reminderDate, 'reminderDate');

              // Get current task to preserve existing reminders
              const currentTask = await client.tasks.getTask(args.id);

              // Create new reminder object
              // The API expects 'reminder' field, not 'reminder_date'
              const newReminder = {
                reminder: args.reminderDate,
              };

              // Combine existing reminders with new one
              // We need to cast the array due to API field inconsistency
              const updatedReminders = [
                ...(currentTask.reminders || []),
                newReminder,
              ] as unknown as { id: number; reminder_date: string }[];

              // Update task with new reminders array
              await client.tasks.updateTask(args.id, {
                ...currentTask,
                reminders: updatedReminders,
              });

              // Fetch updated task
              const updatedTask = await client.tasks.getTask(args.id);

              const response: StandardTaskResponse = {
                success: true,
                operation: 'add-reminder',
                message: `Reminder added successfully for ${args.reminderDate}`,
                task: updatedTask,
                metadata: {
                  timestamp: new Date().toISOString(),
                  affectedFields: ['reminders'],
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
              if (error instanceof MCPError) {
                throw error;
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to add reminder: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'remove-reminder': {
            try {
              if (!args.id) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'Task id is required for remove-reminder operation',
                );
              }
              validateId(args.id, 'id');

              if (!args.reminderId) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'reminderId is required for remove-reminder operation',
                );
              }
              validateId(args.reminderId, 'reminderId');

              // Get current task
              const currentTask = await client.tasks.getTask(args.id);

              if (!currentTask.reminders || currentTask.reminders.length === 0) {
                throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task has no reminders to remove');
              }

              // Filter out the reminder to be removed
              const updatedReminders = currentTask.reminders.filter(
                (reminder) => reminder.id !== args.reminderId,
              );

              if (updatedReminders.length === currentTask.reminders.length) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  `Reminder with id ${args.reminderId} not found in task`,
                );
              }

              // Update task with filtered reminders
              await client.tasks.updateTask(args.id, {
                ...currentTask,
                reminders: updatedReminders,
              });

              // Fetch updated task
              const updatedTask = await client.tasks.getTask(args.id);

              const response: StandardTaskResponse = {
                success: true,
                operation: 'remove-reminder',
                message: `Reminder ${args.reminderId} removed successfully`,
                task: updatedTask,
                metadata: {
                  timestamp: new Date().toISOString(),
                  affectedFields: ['reminders'],
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
              if (error instanceof MCPError) {
                throw error;
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to remove reminder: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          case 'list-reminders': {
            try {
              if (!args.id) {
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  'Task id is required for list-reminders operation',
                );
              }
              validateId(args.id, 'id');

              // Get task with reminders
              const task = await client.tasks.getTask(args.id);
              const reminders = task.reminders || [];

              const response: StandardTaskResponse = {
                success: true,
                operation: 'list-reminders',
                message: `Found ${reminders.length} reminder(s) for task "${task.title}"`,
                task: {
                  id: task.id,
                  title: task.title,
                  assignees: [],
                } as MinimalTask,
                reminders: reminders.map((r) => ({
                  id: r.id,
                  reminder_date: r.reminder_date,
                })),
                metadata: {
                  timestamp: new Date().toISOString(),
                  count: reminders.length,
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
              if (error instanceof MCPError) {
                throw error;
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                `Failed to list reminders: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          default:
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Unknown subcommand: ${args.subcommand as string}`,
            );
        }
      } catch (error) {
        if (error instanceof MCPError) {
          throw error;
        }
        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          `Task operation error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
