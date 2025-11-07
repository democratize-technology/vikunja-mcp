/**
 * Bulk operations for tasks with performance optimizations
 *
 * This file maintains backward compatibility while delegating to the new modular structure.
 */

import { BulkOperationProcessor } from './bulk';

// Re-export functions for backward compatibility
export const bulkUpdateTasks = BulkOperationProcessor.bulkUpdateTasks.bind(BulkOperationProcessor);
export const bulkDeleteTasks = BulkOperationProcessor.bulkDeleteTasks.bind(BulkOperationProcessor);
export const bulkCreateTasks = BulkOperationProcessor.bulkCreateTasks.bind(BulkOperationProcessor);

// Re-export types for backward compatibility
export type {
  BulkUpdateArgs,
  BulkDeleteArgs,
  BulkCreateArgs,
  BulkCreateTaskData
} from './bulk';