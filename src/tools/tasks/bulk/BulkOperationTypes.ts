/**
 * Type definitions for bulk operations
 */

import type { Task } from 'node-vikunja';

export interface BulkOperationResult {
  successful: Task[];
  failed: BulkOperationFailure[];
  totalCount: number;
  operation: string;
}

export interface BulkOperationFailure {
  originalItem: number | Task;
  error: Error;
  operation: string;
}

export interface BulkUpdateResult {
  updatedTasks: Task[];
  partiallyUpdatedTasks?: Task[];
  failedTaskIds: number[];
  totalCount: number;
}

export interface BulkDeleteResult {
  deletedTaskIds: number[];
  failedTaskIds: number[];
  totalCount: number;
}

export interface BulkCreateResult {
  createdTasks: Task[];
  failedTasks: BulkCreateFailure[];
  totalCount: number;
}

export interface BulkCreateFailure {
  originalTask: {
    title: string;
    description?: string;
    dueDate?: string;
    priority?: number;
    labels?: number[];
    assignees?: number[];
  };
  error: Error;
  operation: string;
}

export interface BatchProcessingResult<T> {
  successful: T[];
  failed: BulkOperationFailure[];
  totalCount: number;
  operation: string;
}