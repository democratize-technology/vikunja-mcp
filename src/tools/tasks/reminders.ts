/**
 * Reminder operations for tasks
 */

import type { MinimalTask } from '../../types';
import { MCPError, ErrorCode } from '../../types';
import { getClientFromContext } from '../../client';
import { validateId, validateDateString } from './validation';
import { formatAorpAsMarkdown, createAorpFromData } from '../../utils/response-factory';

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
    // Transform reminders to the expected API format
    const existingReminders = (currentTask.reminders || []).map((reminder: any) => ({
      id: typeof reminder.id === 'number' ? reminder.id : Number(reminder.id) || 0,
      reminder_date: reminder.reminder_date || '',
    }));

    const newReminderFormatted = {
      id: 0, // New reminder, ID will be assigned by API
      reminder_date: args.reminderDate,
    };

    const updatedReminders: Array<{ id: number; reminder_date: string }> = [
      ...existingReminders,
      newReminderFormatted,
    ];

    // Update task with new reminders array
    await client.tasks.updateTask(args.id, {
      ...currentTask,
      reminders: updatedReminders,
    });

    // Fetch updated task
    const updatedTask = await client.tasks.getTask(args.id);

    // Create proper AORP response
    const aorpResult = createAorpFromData(
      'add-reminder',
      `Reminder added successfully for ${args.reminderDate}`,
      true,
      `Reminder added successfully for ${args.reminderDate}`
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(aorpResult),
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
      (reminder: any) => reminder.id !== args.reminderId,
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

    // Create proper AORP response
    const aorpResult = createAorpFromData(
      'remove-reminder',
      `Reminder ${args.reminderId} removed successfully`,
      true,
      `Reminder ${args.reminderId} removed successfully`
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(aorpResult),
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

    // Create proper AORP response
    const aorpResult = createAorpFromData(
      'list-reminders',
      `Found ${reminders.length} reminder(s) for task "${task.title}"`,
      true,
      `Found ${reminders.length} reminder(s) for task "${task.title}"`
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(aorpResult),
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