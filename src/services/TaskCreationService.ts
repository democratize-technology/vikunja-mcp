import { logger } from '../utils/logger';
import type { TaskCreationData } from '../types';
import { MCPError, ErrorCode } from '../types';
import { isAuthenticationError } from '../utils/auth-error-handler';
import type { Task, Label, User } from 'node-vikunja';
import type { TypedVikunjaClient } from '../types/node-vikunja-extended';
import type { ImportedTask } from '../parsers/InputParserFactory';
import type { EntityResolutionResult } from './EntityResolver';

/**
 * Converts TaskCreationData to a Task object compatible with node-vikunja API
 * This ensures type safety by properly mapping fields and handling optional properties
 */
function convertTaskCreationDataToTask(taskData: TaskCreationData): Task {
  // TaskCreationData is a subset of Task with all the required fields for API creation
  // The node-vikunja Task interface accepts these fields, making them compatible
  const convertedTask: Task = {
    title: taskData.title,
    project_id: taskData.project_id,
  };

  // Only include optional fields if they are provided (undefined values are excluded)
  if (taskData.done !== undefined) {
    convertedTask.done = taskData.done;
  }
  if (taskData.priority !== undefined) {
    convertedTask.priority = taskData.priority;
  }
  if (taskData.percent_done !== undefined) {
    convertedTask.percent_done = taskData.percent_done;
  }
  if (taskData.description !== undefined) {
    convertedTask.description = taskData.description;
  }
  if (taskData.due_date !== undefined) {
    convertedTask.due_date = taskData.due_date;
  }
  if (taskData.start_date !== undefined) {
    convertedTask.start_date = taskData.start_date;
  }
  if (taskData.end_date !== undefined) {
    convertedTask.end_date = taskData.end_date;
  }
  if (taskData.hex_color !== undefined) {
    convertedTask.hex_color = taskData.hex_color;
  }
  if (taskData.repeat_after !== undefined) {
    convertedTask.repeat_after = taskData.repeat_after;
  }
  if (taskData.repeat_mode !== undefined) {
    // Only assign if it's a valid repeat_mode value
    const validMode = taskData.repeat_mode;
    if (['day', 'week', 'month', 'year'].includes(validMode)) {
      convertedTask.repeat_mode = validMode as 'day' | 'week' | 'month' | 'year';
    }
  }

  return convertedTask;
}

/**
 * Result of a task creation operation
 */
export interface TaskCreationResult {
  success: boolean;
  taskId?: number;
  title: string;
  error?: string;
  warnings?: string[];
}

/**
 * Service responsible for creating individual tasks with all associated entities
 * Handles complex API interactions, error handling, and field transformations
 */
export class TaskCreationService {
  /**
   * Creates a single task with all associated labels, assignees, and other properties
   *
   * @param task - The task data to create
   * @param projectId - The project ID to create the task in
   * @param client - The Vikunja client instance
   * @param entityMaps - Resolved entity mappings for labels and users
   * @param catchErrors - Whether to catch errors and return them in TaskCreationResult (default: true)
   * @returns Promise<TaskCreationResult> - Result of the task creation operation
   */
  async createTask(
    task: ImportedTask,
    projectId: number,
    client: TypedVikunjaClient,
    entityMaps: EntityResolutionResult,
    catchErrors: boolean = true
  ): Promise<TaskCreationResult> {
    const warnings: string[] = [];

    try {
      // Prepare task data for API
      const taskData = this.prepareTaskData(task, projectId);

      // Create the base task
      const createdTask = await this.createBaseTask(client, taskData, task.title);

      // Handle label assignment
      const labelWarnings = await this.handleLabelAssignment(
        client,
        createdTask,
        task,
        entityMaps.labelMap
      );
      warnings.push(...labelWarnings);

      // Handle user assignment
      const assigneeWarnings = await this.handleUserAssignment(
        client,
        createdTask,
        task,
        entityMaps.userMap,
        entityMaps.projectUsers
      );
      warnings.push(...assigneeWarnings);

      // Handle reminders (API limitation)
      if (task.reminders && task.reminders.length > 0) {
        warnings.push(this.handleReminders(createdTask.id, task.reminders as Array<{ reminder_date?: string; reminder?: string }>));
      }

      const result: TaskCreationResult = {
        success: true,
        taskId: createdTask.id ?? 0,
        title: createdTask.title,
      };

      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      return result;
    } catch (error) {
      // Let MCPErrors bubble up to be handled at the batch level
      if (error instanceof MCPError) {
        throw error;
      }

      // If catchErrors is true, return error in result; otherwise, let it bubble up
      if (catchErrors) {
        return {
          success: false,
          title: task.title,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      } else {
        throw error;
      }
    }
  }

  /**
   * Prepares task data for API submission
   *
   * @param task - The imported task
   * @param projectId - The target project ID
   * @returns Formatted task data for the API
   */
  private prepareTaskData(task: ImportedTask, projectId: number): TaskCreationData {
    const taskData: TaskCreationData = {
      project_id: projectId,
      title: task.title,
      done: task.done || false,
      priority: task.priority || 0,
      percent_done: task.percentDone || 0,
    };

    // Only add description if it's not undefined
    if (task.description !== undefined) {
      taskData.description = task.description;
    }

    // Handle dates
    if (task.dueDate) taskData.due_date = task.dueDate;
    if (task.startDate) taskData.start_date = task.startDate;
    if (task.endDate) taskData.end_date = task.endDate;

    // Handle color
    if (task.hexColor) taskData.hex_color = task.hexColor;

    // Handle repeat settings
    if (task.repeatAfter) taskData.repeat_after = task.repeatAfter;
    if (task.repeatMode !== undefined) {
      // Convert numeric repeat mode to string
      const repeatModes = ['day', 'week', 'month', 'year'];
      if (task.repeatMode >= 0 && task.repeatMode < repeatModes.length) {
        const repeatMode = repeatModes[task.repeatMode];
        if (repeatMode) {
          taskData.repeat_mode = repeatMode;
        }
      }
    }

    return taskData;
  }

  /**
   * Creates the base task in Vikunja
   *
   * @param client - The Vikunja client
   * @param taskData - Prepared task data
   * @param taskTitle - Task title for error reporting
   * @returns Created task
   * @throws MCPError if creation fails or authentication error occurs
   */
  private async createBaseTask(
    client: TypedVikunjaClient,
    taskData: TaskCreationData,
    taskTitle: string
  ): Promise<Task> {
    try {
      // Safely convert TaskCreationData to Task interface expected by node-vikunja
      const taskForApi = convertTaskCreationDataToTask(taskData);
      return await client.tasks.createTask(taskData.project_id, taskForApi);
    } catch (error) {
      // Check if it's an authentication error
      if (isAuthenticationError(error)) {
        throw new MCPError(
          ErrorCode.API_ERROR,
          `Authentication error while creating task "${taskTitle}". The token works for other endpoints but may have issues with batch operations. Original error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw error;
    }
  }

  /**
   * Handles label assignment for a created task
   *
   * @param client - The Vikunja client
   * @param createdTask - The task that was created
   * @param task - Original task data with labels
   * @param labelMap - Mapping of label names to IDs
   * @returns Array of warnings from label assignment
   */
  private async handleLabelAssignment(
    client: TypedVikunjaClient,
    createdTask: Task,
    task: ImportedTask,
    labelMap: Map<string, number>
  ): Promise<string[]> {
    const warnings: string[] = [];

    if (!task.labels || task.labels.length === 0) {
      return warnings;
    }

    // First, check for labels that are not found
    const notFoundLabels = task.labels.filter(
      (labelName) => !labelMap.has(labelName.toLowerCase()),
    );

    if (notFoundLabels.length > 0) {
      logger.warn('Some labels not found in project', {
        taskId: createdTask.id || 'unknown',
        requestedLabels: task.labels,
        notFoundLabels,
        availableLabels: Array.from(labelMap.keys()),
      });
      if (createdTask.id) {
        warnings.push(`Labels not found: ${notFoundLabels.join(', ')}`);
      }
    }

    // Get the label IDs that were found
    const labelIds = task.labels
      .map((labelName) => labelMap.get(labelName.toLowerCase()))
      .filter((id): id is number => id !== undefined);

    if (labelIds.length > 0 && createdTask.id) {
      try {
        // Try to update labels
        const updateResult = await client.tasks.updateTaskLabels(createdTask.id, {
          label_ids: labelIds,
        });

        // Verify the labels were actually assigned (API tokens may silently fail)
        const labelsActuallyAssigned = await this.verifyLabelAssignment(client, createdTask.id, labelIds);

        if (!labelsActuallyAssigned) {
          // Label assignment silently failed (common with API tokens)
          logger.warn('Label assignment may have failed silently', {
            taskId: createdTask.id,
            labelIds,
            labelNames: task.labels,
            updateResult,
          });
          warnings.push(`Labels specified but not assigned (API token limitation). Consider using JWT authentication for label support.`);
        } else {
          logger.debug('Labels assigned and verified successfully', {
            taskId: createdTask.id,
            labelIds,
            labelNames: task.labels,
          });
        }
      } catch (labelError) {
        const warning = this.handleLabelAssignmentError(labelError as Error | { code?: string; message?: string }, createdTask.id, task.labels);
        warnings.push(warning);
      }
    }

    return warnings;
  }

  /**
   * Verifies that labels were actually assigned to a task
   *
   * @param client - The Vikunja client
   * @param taskId - The task ID to verify
   * @param expectedLabelIds - Labels that should be assigned
   * @returns True if labels are actually assigned, false otherwise
   */
  private async verifyLabelAssignment(
    client: TypedVikunjaClient,
    taskId: number,
    expectedLabelIds: number[]
  ): Promise<boolean> {
    try {
      const updatedTask = await client.tasks.getTask(taskId);
      if (updatedTask && updatedTask.labels && Array.isArray(updatedTask.labels)) {
        const assignedLabelIds = updatedTask.labels.map((l: Label) => l.id);
        return expectedLabelIds.every((id) => assignedLabelIds.includes(id));
      }
      return false;
    } catch (verifyError) {
      // If we can't verify, assume it didn't work
      logger.debug('Could not verify label assignment', {
        taskId,
        error: verifyError instanceof Error ? verifyError.message : String(verifyError),
      });
      return false;
    }
  }

  /**
   * Handles errors during label assignment
   *
   * @param labelError - The error that occurred
   * @param taskId - The task ID
   * @param labelNames - The label names that were being assigned
   * @returns Warning message
   */
  private handleLabelAssignmentError(labelError: Error | { code?: string; message?: string }, taskId: number | undefined, labelNames: string[]): string {
    // Check if this is an authentication error
    if (isAuthenticationError(labelError)) {
      logger.warn('Label assignment failed due to authentication issue', {
        taskId,
        labelNames,
        error: labelError instanceof Error ? labelError.message : (labelError?.message ?? 'Unknown error'),
      });
      return `Label assignment requires JWT authentication. Labels were not assigned.`;
    } else {
      logger.error('Failed to assign labels to task', {
        taskId,
        labelNames,
        error: labelError instanceof Error ? labelError.message : (labelError?.message ?? 'Unknown error'),
      });
      return `Failed to assign labels: ${labelError instanceof Error ? labelError.message : 'Unknown error'}`;
    }
  }

  /**
   * Handles user assignment for a created task
   *
   * @param client - The Vikunja client
   * @param createdTask - The task that was created
   * @param task - Original task data with assignees
   * @param userMap - Mapping of usernames to IDs
   * @param projectUsers - List of available project users
   * @returns Array of warnings from user assignment
   */
  private async handleUserAssignment(
    client: TypedVikunjaClient,
    createdTask: Task,
    task: ImportedTask,
    userMap: Map<string, number>,
    projectUsers: User[]
  ): Promise<string[]> {
    const warnings: string[] = [];

    if (!task.assignees || task.assignees.length === 0) {
      return warnings;
    }

    // Check if we have any users mapped (might be empty due to API issue)
    if (projectUsers.length === 0) {
      logger.warn('Skipping assignees due to user fetch failure', {
        taskId: createdTask.id || 'unknown',
        assignees: task.assignees,
      });
      warnings.push('Assignees skipped due to user fetch failure (possible API authentication issue)');
      return warnings;
    }

    // Check for users that are not found first
    const notFoundUsers = task.assignees.filter(
      (username) => !userMap.has(username.toLowerCase()),
    );

    if (notFoundUsers.length > 0) {
      warnings.push(`Users not found: ${notFoundUsers.join(', ')}`);
    }

    // Get the user IDs that were found
    const userIds = task.assignees
      .map((username) => userMap.get(username.toLowerCase()))
      .filter((id): id is number => id !== undefined);

    if (userIds.length > 0 && createdTask.id) {
      try {
        await client.tasks.bulkAssignUsersToTask(createdTask.id, {
          user_ids: userIds,
        });
      } catch (assignError) {
        logger.error('Failed to assign users to task', {
          taskId: createdTask.id,
          userIds,
          assignees: task.assignees,
          error: assignError instanceof Error ? assignError.message : String(assignError),
        });
        warnings.push(`Failed to assign users: ${assignError instanceof Error ? assignError.message : 'Unknown error'}`);
      }
    }

    return warnings;
  }

  /**
   * Handles reminders for a task (API limitation)
   *
   * @param taskId - The task ID
   * @param reminders - Array of reminder data
   * @returns Warning message about API limitation
   */
  private handleReminders(taskId: number | undefined, reminders: Array<{ reminder_date?: string; reminder?: string }>): string {
    // Note: The API doesn't support adding reminders separately,
    // they need to be added during task creation
    // This is a limitation of the current implementation
    logger.warn('Reminders cannot be added after task creation', {
      taskId: taskId || 'unknown',
      reminders,
    });
    return 'Reminders cannot be added after task creation (API limitation). Include them in the initial task data.';
  }
}