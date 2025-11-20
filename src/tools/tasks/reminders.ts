/**
 * Reminder operations for tasks
 */

import type { StandardTaskResponse, MinimalTask } from '../../types/index';
import { MCPError, ErrorCode } from '../../types/index';
import { getClientFromContext } from '../../client';
import { validateId, validateDateString } from './validation';
import { formatAorpAsMarkdown } from '../../aorp/markdown';

/**
 * Add a reminder to a task
 */
export async function addReminder(args: {
  id?: number;
  reminderDate?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
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

    const client = await getClientFromContext();

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
          text: formatAorpAsMarkdown(response as any),
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

/**
 * Remove a reminder from a task
 */
export async function removeReminder(args: {
  id?: number;
  reminderId?: number;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
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

    const client = await getClientFromContext();

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
          text: formatAorpAsMarkdown(response as any),
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

/**
 * List all reminders for a task
 */
export async function listReminders(args: {
  id?: number;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.id) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Task id is required for list-reminders operation',
      );
    }
    validateId(args.id, 'id');

    const client = await getClientFromContext();

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
          text: formatAorpAsMarkdown(response as any),
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