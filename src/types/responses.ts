/**
 * Standardized response formats for all MCP tools
 * Ensures consistency across all operations
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
  /** Additional context-specific metadata */
  [key: string]: unknown;
}

/**
 * Base response structure for all MCP tool operations
 */
export interface StandardResponse<T = unknown> {
  /** Whether the operation was successful */
  success: boolean;
  /** The operation that was performed */
  operation: string;
  /** Human-readable message about the operation result */
  message: string;
  /** The actual data returned by the operation */
  data: T;
  /** Metadata about the operation */
  metadata: ResponseMetadata;
}

/**
 * Standard error response structure
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
 * Helper function to create a standard response
 */
export function createStandardResponse<T>(
  operation: string,
  message: string,
  data: T,
  metadata: Partial<ResponseMetadata> = {},
): StandardResponse<T> {
  return {
    success: true,
    operation,
    message,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  };
}

/**
 * Helper function to create a standard error response
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
