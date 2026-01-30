/**
 * Bulk operations for tasks with performance optimizations
 *
 * This file maintains backward compatibility while using the simplified implementation.
 */

export { bulkUpdateTasks, bulkDeleteTasks, bulkCreateTasks } from './bulk-operations-simplified';

// Re-export types from canonical location (BulkOperationValidator)
export type {
  BulkUpdateArgs,
  BulkDeleteArgs,
  BulkCreateArgs,
  BulkCreateTaskData
} from './bulk/BulkOperationValidator';
