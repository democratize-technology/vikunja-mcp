/**
 * Bulk operations module exports
 */

export { BulkOperationProcessor } from './BulkOperationProcessor';
export { bulkOperationValidator as BulkOperationValidator } from './BulkOperationValidator';
export { bulkOperationErrorHandler as BulkOperationErrorHandler } from './BulkOperationErrorHandler';
export { batchProcessorFactory as BatchProcessorFactory } from './BatchProcessorFactory';

export type {
  BulkUpdateArgs,
  BulkDeleteArgs,
  BulkCreateArgs,
  BulkCreateTaskData,
} from './BulkOperationValidator';