/**
 * Validation utilities for task operations
 */

import type { Task } from 'node-vikunja';
import { MCPError, ErrorCode } from '../../types';
import { validateId as validateSharedId } from '../../utils/validation';

/**
 * Validates that a date string is in valid ISO 8601 format
 */
export function validateDateString(date: string, fieldName: string): void {
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
 * @deprecated Use validateSharedId from '../../../utils/validation' instead
 */
export const validateId = validateSharedId;

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
export function convertRepeatConfiguration(
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
export async function processBatches<T, R>(
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

/**
 * Apply field update to a task object for bulk operations
 * Maps field names to their corresponding task properties
 *
 * @param task - The task object to update (will be mutated)
 * @param field - The field name to update (optional, will be checked)
 * @param value - The new value
 * @returns The same task object with the field applied
 */
export function applyFieldUpdate(task: Task, field: string | undefined, value: unknown): Task {
  if (!field) return task;

  switch (field) {
    case 'done':
      task.done = value as boolean;
      break;
    case 'priority':
      task.priority = value as number;
      break;
    case 'due_date':
      task.due_date = value as string;
      break;
    case 'project_id':
      task.project_id = value as number;
      break;
    case 'repeat_after':
      task.repeat_after = value as number;
      break;
    case 'repeat_mode':
      (task as Record<string, unknown>).repeat_mode = value;
      break;
    case 'assignees':
    case 'labels':
      // These are handled separately with special API calls
      break;
    default:
      // Unknown field - leave task unchanged
      break;
  }
  return task;
}
