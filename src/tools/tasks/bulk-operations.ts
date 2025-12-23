/**
 * Bulk operations for tasks with performance optimizations
 *
 * This file maintains backward compatibility while using the simplified implementation.
 */

export { bulkUpdateTasks, bulkDeleteTasks, bulkCreateTasks } from './bulk-operations-simplified';

// Re-export types for backward compatibility
export type {
  BulkUpdateArgs,
  BulkDeleteArgs,
  BulkCreateArgs,
  BulkCreateTaskData
} from './bulk-operations-simplified';
