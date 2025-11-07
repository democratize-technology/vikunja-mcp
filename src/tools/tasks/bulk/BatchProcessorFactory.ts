/**
 * Factory for creating and managing batch processors for bulk operations
 */

import { BatchProcessor, type BatchResult } from '../../../utils/performance/batch-processor';

// Batch processors with optimized settings for different operation types
const updateBatchProcessor = new BatchProcessor({
  maxConcurrency: 5,
  batchSize: 10,
  enableMetrics: true,
  batchDelay: 0,
});

const deleteBatchProcessor = new BatchProcessor({
  maxConcurrency: 3,
  batchSize: 5,
  enableMetrics: true,
  batchDelay: 100,
});

const createBatchProcessor = new BatchProcessor({
  maxConcurrency: 8,
  batchSize: 15,
  enableMetrics: true,
  batchDelay: 0,
});

/**
 * Factory for selecting appropriate batch processor based on operation type
 */
export class BatchProcessorFactory {
  /**
   * Get the appropriate batch processor for an operation type
   */
  static getProcessor(operationType: string): BatchProcessor {
    if (operationType.includes('delete')) {
      return deleteBatchProcessor;
    }
    if (operationType.includes('create')) {
      return createBatchProcessor;
    }
    return updateBatchProcessor;
  }

  /**
   * Process items in batches using the appropriate processor
   */
  static async processBatches<T>(
    items: number[],
    processor: (item: number, index: number) => Promise<T>,
    operationType: string
  ): Promise<BatchResult<T>> {
    const batchProcessor = this.getProcessor(operationType);
    return await batchProcessor.processBatches(items, processor);
  }

  /**
   * Get the create batch processor specifically
   */
  static getCreateProcessor(): BatchProcessor {
    return createBatchProcessor;
  }

  /**
   * Get the update batch processor specifically
   */
  static getUpdateProcessor(): BatchProcessor {
    return updateBatchProcessor;
  }

  /**
   * Get the delete batch processor specifically
   */
  static getDeleteProcessor(): BatchProcessor {
    return deleteBatchProcessor;
  }
}