/**
 * High-performance batch processor with controlled concurrency
 * Optimizes bulk operations by managing parallel execution with intelligent backpressure
 */

import { logger } from '../logger';

export interface BatchOptions {
  /**
   * Maximum number of concurrent operations (default: 5)
   * Higher values increase throughput but may overwhelm the API
   */
  maxConcurrency: number;
  
  /**
   * Batch size for each processing chunk (default: 10)
   * Balances memory usage with processing efficiency
   */
  batchSize: number;
  
  /**
   * Enable performance metrics collection (default: true)
   */
  enableMetrics: boolean;
  
  /**
   * Delay between batches in milliseconds (default: 0)
   * Useful for rate limiting or API throttling
   */
  batchDelay: number;
}

export interface BatchMetrics {
  totalItems: number;
  totalBatches: number;
  totalDuration: number;
  averageBatchDuration: number;
  successfulOperations: number;
  failedOperations: number;
  operationsPerSecond: number;
  concurrencyUtilization: number;
}

export interface BatchResult<T> {
  successful: T[];
  failed: Array<{ index: number; error: unknown; originalItem: unknown }>;
  metrics: BatchMetrics;
}

const DEFAULT_OPTIONS: BatchOptions = {
  maxConcurrency: 5,
  batchSize: 10,
  enableMetrics: true,
  batchDelay: 0,
};

export class BatchProcessor {
  private readonly options: BatchOptions;
  private activeOperations = 0;
  private metrics: Partial<BatchMetrics> = {};

  constructor(options: Partial<BatchOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Process items in optimized batches with controlled concurrency
   */
  async processBatches<TInput, TOutput>(
    items: TInput[],
    processor: (item: TInput, index: number) => Promise<TOutput>,
    options: Partial<BatchOptions> = {}
  ): Promise<BatchResult<TOutput>> {
    const opts = { ...this.options, ...options };
    const startTime = Date.now();
    
    if (opts.enableMetrics) {
      this.metrics = {
        totalItems: items.length,
        totalBatches: Math.ceil(items.length / opts.batchSize),
        successfulOperations: 0,
        failedOperations: 0,
      };
    }

    const successful: TOutput[] = [];
    const failed: Array<{ index: number; error: unknown; originalItem: TInput }> = [];
    const batchDurations: number[] = [];

    // Split items into batches
    const batches = this.createBatches(items, opts.batchSize);
    
    logger.debug('Starting batch processing', {
      totalItems: items.length,
      batchCount: batches.length,
      batchSize: opts.batchSize,
      maxConcurrency: opts.maxConcurrency,
    });

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      if (!batch) {
        throw new Error(`Batch at index ${batchIndex} is undefined`);
      }
      const batchStartTime = Date.now();

      // Process batch with controlled concurrency
      const batchResults = await this.processBatchConcurrently(
        batch,
        processor,
        opts.maxConcurrency,
        batchIndex * opts.batchSize // base index for this batch
      );

      // Collect results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          successful.push(result.value);
          if (opts.enableMetrics) this.metrics.successfulOperations = (this.metrics.successfulOperations || 0) + 1;
        } else {
          failed.push(result.error);
          if (opts.enableMetrics) this.metrics.failedOperations = (this.metrics.failedOperations || 0) + 1;
        }
      }

      const batchDuration = Date.now() - batchStartTime;
      batchDurations.push(batchDuration);

      logger.debug('Batch completed', {
        batchIndex,
        batchSize: batch.length,
        duration: batchDuration,
        successful: batchResults.filter(r => r.status === 'fulfilled').length,
        failed: batchResults.filter(r => r.status === 'rejected').length,
      });

      // Apply inter-batch delay if configured
      if (opts.batchDelay > 0 && batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, opts.batchDelay));
      }
    }

    const totalDuration = Date.now() - startTime;

    // Calculate final metrics
    const finalMetrics: BatchMetrics = {
      totalItems: items.length,
      totalBatches: batches.length,
      totalDuration,
      averageBatchDuration: batchDurations.length > 0 
        ? batchDurations.reduce((a, b) => a + b, 0) / batchDurations.length 
        : 0,
      successfulOperations: successful.length,
      failedOperations: failed.length,
      operationsPerSecond: totalDuration > 0 ? (successful.length + failed.length) / (totalDuration / 1000) : 0,
      concurrencyUtilization: this.calculateConcurrencyUtilization(batchDurations, opts.maxConcurrency),
    };

    if (opts.enableMetrics) {
      logger.info('Batch processing completed', finalMetrics);
    }

    return {
      successful,
      failed,
      metrics: finalMetrics,
    };
  }

  /**
   * Process a single batch with controlled concurrency using semaphore pattern
   */
  private async processBatchConcurrently<TInput, TOutput>(
    batch: Array<{ item: TInput; originalIndex: number }>,
    processor: (item: TInput, index: number) => Promise<TOutput>,
    maxConcurrency: number,
    _baseIndex: number
  ): Promise<Array<
    | { status: 'fulfilled'; value: TOutput }
    | { status: 'rejected'; error: { index: number; error: unknown; originalItem: TInput } }
  >> {
    const semaphore = new Semaphore(maxConcurrency);
    
    const promises = batch.map(async ({ item, originalIndex }) => {
      await semaphore.acquire();
      this.activeOperations++;
      
      try {
        const result = await processor(item, originalIndex);
        return { status: 'fulfilled' as const, value: result };
      } catch (error) {
        return {
          status: 'rejected' as const,
          error: { index: originalIndex, error, originalItem: item },
        };
      } finally {
        this.activeOperations--;
        semaphore.release();
      }
    });

    return Promise.all(promises);
  }

  /**
   * Split items into batches with original indices preserved
   */
  private createBatches<T>(
    items: T[], 
    batchSize: number
  ): Array<Array<{ item: T; originalIndex: number }>> {
    const batches: Array<Array<{ item: T; originalIndex: number }>> = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batchItems = items.slice(i, i + batchSize).map((item, localIndex) => ({
        item,
        originalIndex: i + localIndex,
      }));
      batches.push(batchItems);
    }
    
    return batches;
  }

  /**
   * Calculate how efficiently concurrency was utilized
   */
  private calculateConcurrencyUtilization(
    batchDurations: number[], 
    maxConcurrency: number
  ): number {
    if (batchDurations.length === 0) return 0;
    
    // Simple heuristic: if batches complete quickly relative to max concurrency,
    // we're likely utilizing concurrency well
    const avgDuration = batchDurations.reduce((a, b) => a + b, 0) / batchDurations.length;
    const idealDuration = avgDuration / maxConcurrency;
    
    return Math.min(1, idealDuration / avgDuration);
  }

  /**
   * Get current processing statistics
   */
  getMetrics(): Partial<BatchMetrics> & { activeOperations: number } {
    return {
      ...this.metrics,
      activeOperations: this.activeOperations,
    };
  }
}

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    
    if (this.waitQueue.length > 0) {
      this.permits--;
      const resolve = this.waitQueue.shift();
      if (resolve) {
        resolve();
      }
    }
  }
}

// Export convenience functions for common patterns
export const createOptimizedBatchProcessor = (options?: Partial<BatchOptions>): BatchProcessor => 
  new BatchProcessor(options);

export const HIGH_THROUGHPUT_CONFIG: Partial<BatchOptions> = {
  maxConcurrency: 8,
  batchSize: 15,
  enableMetrics: true,
  batchDelay: 0,
};

export const RATE_LIMITED_CONFIG: Partial<BatchOptions> = {
  maxConcurrency: 3,
  batchSize: 5,
  enableMetrics: true,
  batchDelay: 100,
};

export const MEMORY_OPTIMIZED_CONFIG: Partial<BatchOptions> = {
  maxConcurrency: 4,
  batchSize: 8,
  enableMetrics: true,
  batchDelay: 50,
};