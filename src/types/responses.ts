/**
 * AORP-Compatible Response Types
 * All responses now use the AI-Optimized Response Protocol (AORP)
 */

import type { Task } from 'node-vikunja';
import type { AorpTransformationContext } from '../aorp/types';

/**
 * Task-specific response data structure
 * Provides type safety for task operation responses
 */
export interface TaskResponseData {
  /** Single task object (for create, get, update operations) */
  task?: Task;
  /** Array of tasks (for list operations) */
  tasks?: Task[];
  /** Deleted task ID (for delete operations when task not found) */
  deletedTaskId?: number;
  /** Additional operation-specific data */
  [key: string]: unknown;
}

/**
 * Task-specific response metadata
 * Extends standard metadata with task-specific fields
 */
export interface TaskResponseMetadata {
  /** ISO timestamp of when the operation was performed */
  timestamp: string;
  /** Number of items affected/returned */
  count?: number;
  /** Project ID for task operations */
  projectId?: number;
  /** Task ID for single task operations */
  taskId?: number;
  /** Fields that were modified (for update operations) */
  affectedFields?: string[];
  /** Previous state before update (for update operations) */
  previousState?: Partial<Task>;
  /** Whether labels were successfully added */
  labelsAdded?: boolean;
  /** Whether assignees were successfully added */
  assigneesAdded?: boolean;
  /** Task title for reference */
  taskTitle?: string;
  /** Session ID for AORP tracking */
  sessionId?: string;
  /** Additional context-specific metadata */
  [key: string]: unknown;
}

/**
 * Quality indicator data structure
 * Used by AORP quality assessment functions
 */
export interface QualityIndicatorData {
  /** Task object for quality assessment */
  task?: Task;
  /** Additional data for quality calculations */
  [key: string]: unknown;
}

/**
 * Quality indicator function type
 * Functions that calculate quality scores from task data
 */
export type QualityIndicatorFunction = (data: unknown, context: AorpTransformationContext) => number;

/**
 * Standard metadata included in all responses
 * Now AORP-compatible
 */
export interface ResponseMetadata {
  /** ISO timestamp of when the operation was performed */
  timestamp: string;
  /** Number of items affected/returned */
  count?: number;
  /** Fields that were modified (for update operations) */
  affectedFields?: string[];
  /** Previous state (for update operations) */
  previousState?: Record<string, unknown>;
  /** Session ID for AORP tracking */
  sessionId?: string;
  /** Additional context-specific metadata */
  [key: string]: unknown;
}

/**
 * Standard error response structure (kept for compatibility with error handling)
 */
export interface StandardErrorResponse {
  /** Always false for errors */
  success: false;
  /** The operation that failed */
  operation: string;
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Helper function to create a standard error response
 * Kept for error handling compatibility
 */
export function createErrorResponse(
  operation: string,
  message: string,
  code?: string,
  details?: Record<string, unknown>,
): StandardErrorResponse {
  const response: StandardErrorResponse = {
    success: false,
    operation,
    message,
  };

  if (code !== undefined) {
    response.code = code;
  }

  if (details !== undefined) {
    response.details = details;
  }

  return response;
}
