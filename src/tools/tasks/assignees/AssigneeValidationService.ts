/**
 * Assignee validation service
 * Handles input validation for assignee operations
 */

import { MCPError, ErrorCode } from '../../../types/index';
import { validateId } from '../validation';

export interface AssigneeOperationInput {
  id?: number;
  assignees?: number[];
}

/**
 * Service for validating assignee operation inputs
 */
export class AssigneeValidationService {
  /**
   * Validate input for assign operations
   */
  static validateAssignInput(args: AssigneeOperationInput): { taskId: number; assigneeIds: number[] } {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for assign operation');
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

    return {
      taskId: args.id,
      assigneeIds: args.assignees,
    };
  }

  /**
   * Validate input for unassign operations
   */
  static validateUnassignInput(args: AssigneeOperationInput): { taskId: number; userIds: number[] } {
    if (!args.id) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Task id is required for unassign operation');
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

    return {
      taskId: args.id,
      userIds: args.assignees,
    };
  }

  /**
   * Validate input for list assignees operation
   */
  static validateListInput(args: { id?: number }): { taskId: number } {
    if (args.id === undefined) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Task id is required for list-assignees operation',
      );
    }
    validateId(args.id, 'id');

    return {
      taskId: args.id,
    };
  }
}