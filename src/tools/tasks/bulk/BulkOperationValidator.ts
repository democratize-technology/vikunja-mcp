/**
 * Validation and preprocessing utilities for bulk operations
 */

import { MCPError, ErrorCode } from '../../../types/index';
import { validateDateString, validateId } from '../validation';
import { MAX_BULK_OPERATION_TASKS } from '../constants';

export interface BulkUpdateArgs {
  taskIds?: number[];
  field?: string;
  value?: unknown;
}

export interface BulkDeleteArgs {
  taskIds?: number[];
}

export interface BulkCreateTaskData {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: number;
  labels?: number[];
  assignees?: number[];
  repeatAfter?: number;
  repeatMode?: 'day' | 'week' | 'month' | 'year';
}

export interface BulkCreateArgs {
  projectId?: number;
  tasks?: BulkCreateTaskData[];
}

/**
 * Validator for bulk update operations
 */
export class BulkOperationValidator {
  /**
   * Validate bulk update arguments
   */
  static validateBulkUpdate(args: BulkUpdateArgs): void {
    if (!args.taskIds || args.taskIds.length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'taskIds array is required for bulk update operation',
      );
    }

    if (!args.field) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'field is required for bulk update operation');
    }

    if (args.value === undefined) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'value is required for bulk update operation');
    }

    if (args.taskIds.length > MAX_BULK_OPERATION_TASKS) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Too many tasks for bulk operation. Maximum allowed: ${MAX_BULK_OPERATION_TASKS}. Consider breaking into smaller batches.`,
      );
    }

    args.taskIds.forEach((id) => validateId(id, 'task ID'));
  }

  /**
   * Validate and preprocess field value for bulk update
   */
  static preprocessFieldValue(args: BulkUpdateArgs): void {
    // Preprocess value to handle type coercion from MCP
    if (args.field === 'done' && typeof args.value === 'string') {
      const originalValue = args.value;
      if (args.value === 'true') {
        args.value = true;
      } else if (args.value === 'false') {
        args.value = false;
      }
    }

    // Handle numeric fields that come as strings
    if (['priority', 'project_id', 'repeat_after'].includes(args.field) && typeof args.value === 'string') {
      const numValue = Number(args.value);
      if (!isNaN(numValue)) {
        args.value = numValue;
      }
    }
  }

  /**
   * Validate field and value constraints
   */
  static validateFieldConstraints(args: BulkUpdateArgs): void {
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

    // Field-specific validation
    if (args.field === 'priority' && typeof args.value === 'number') {
      if (args.value < 0 || args.value > 5) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Priority must be between 0 and 5');
      }
    }

    if (args.field === 'due_date' && typeof args.value === 'string') {
      validateDateString(args.value, 'due_date');
    }

    if (args.field === 'project_id' && typeof args.value === 'number') {
      validateId(args.value, 'project_id');
    }

    if (['assignees', 'labels'].includes(args.field)) {
      if (!Array.isArray(args.value)) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, `${args.field} must be an array of numbers`);
      }
      const valueArray = args.value as number[];
      valueArray.forEach((id) => validateId(id, `${args.field} ID`));
    }

    if (args.field === 'done') {
      if (typeof args.value !== 'boolean') {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'done field must be a boolean value (true or false)',
        );
      }
    }

    // Recurring field validation
    if (args.field === 'repeat_after' && typeof args.value === 'number' && args.value < 0) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'repeat_after must be a non-negative number');
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
  }

  /**
   * Validate bulk delete arguments
   */
  static validateBulkDelete(args: BulkDeleteArgs): void {
    if (!args.taskIds || args.taskIds.length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'taskIds array is required for bulk delete operation',
      );
    }

    if (args.taskIds.length > MAX_BULK_OPERATION_TASKS) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Too many tasks for bulk operation. Maximum allowed: ${MAX_BULK_OPERATION_TASKS}. Consider breaking into smaller batches.`,
      );
    }

    args.taskIds.forEach((id) => validateId(id, 'task ID'));
  }

  /**
   * Validate bulk create arguments
   */
  static validateBulkCreate(args: BulkCreateArgs): void {
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
  }
}