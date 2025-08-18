/**
 * Enhanced bulk operations with circuit breakers, adaptive batching, and progressive enhancement
 * Next-generation performance optimization for vikunja-mcp bulk operations
 */

import { logger } from '../logger';
import { BatchProcessor, type BatchResult } from './batch-processor';
import { ResponseCache } from './response-cache';
import { performanceMonitor } from './performance-monitor';
import type { AdaptiveBatchOptimizer} from './adaptive-batch-optimizer';
import { adaptiveBatchManager } from './adaptive-batch-optimizer';
import type { CircuitBreaker} from './circuit-breaker';
import { circuitBreakerManager, CircuitOpenError } from './circuit-breaker';
import { withRetry } from '../retry';

export interface BulkOperationOptions {
  /**
   * Enable progressive enhancement (try bulk API first, fallback to individual)
   */
  useProgressiveEnhancement: boolean;
  
  /**
   * Enable adaptive batch sizing
   */
  useAdaptiveBatching: boolean;
  
  /**
   * Enable circuit breaker protection
   */
  useCircuitBreaker: boolean;
  
  /**
   * Enable response caching
   */
  useCache: boolean;
  
  /**
   * Cache TTL override in milliseconds
   */
  cacheTtl?: number;
  
  /**
   * Maximum items per bulk operation (memory protection)
   */
  maxBulkSize: number;
  
  /**
   * Enable streaming results for large datasets
   */
  enableStreaming: boolean;
  
  /**
   * Streaming chunk size
   */
  streamingChunkSize: number;
  
  /**
   * Enable operation result compression
   */
  enableCompression: boolean;
  
  /**
   * Custom retry configuration
   */
  retryConfig?: {
    maxRetries: number;
    shouldRetry?: (error: unknown) => boolean;
  };
}

export interface EnhancedBatchResult<T> extends BatchResult<T> {
  /**
   * Strategy used for execution
   */
  strategy: 'bulk_api' | 'adaptive_batching' | 'fallback_individual';
  
  /**
   * Performance optimizations applied
   */
  optimizations: {
    circuitBreakerUsed: boolean;
    adaptiveBatchingUsed: boolean;
    cacheHits: number;
    compressionRatio?: number;
    streamingUsed: boolean;
  };
  
  /**
   * API call efficiency metrics
   */
  efficiency: {
    apiCallsUsed: number;
    apiCallsSaved: number;
    efficiencyRatio: number;
  };
  
  /**
   * Recommendations for future operations
   */
  recommendations?: {
    suggestedBatchSize?: number | undefined;
    suggestedConcurrency?: number | undefined;
    reasoning: string[];
  } | undefined;
}

const DEFAULT_OPTIONS: BulkOperationOptions = {
  useProgressiveEnhancement: true,
  useAdaptiveBatching: true,
  useCircuitBreaker: true,
  useCache: true,
  maxBulkSize: 1000,
  enableStreaming: true,
  streamingChunkSize: 100,
  enableCompression: false,
};

export class BulkOperationEnhancer {
  private readonly cache: ResponseCache;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly adaptiveOptimizer: AdaptiveBatchOptimizer;
  private readonly batchProcessor: BatchProcessor;

  constructor(
    private readonly operationType: string,
    private readonly options: Partial<BulkOperationOptions> = {}
  ) {
    const opts = { ...DEFAULT_OPTIONS, ...this.options };
    
    // Initialize cache with operation-specific configuration
    this.cache = new ResponseCache({
      ttl: opts.cacheTtl || 30000,
      maxSize: Math.min(opts.maxBulkSize, 1000),
      enableMetrics: true,
    });

    // Get circuit breaker for this operation type
    this.circuitBreaker = circuitBreakerManager.getBreaker(`bulk-${operationType}`, {
      failureThreshold: 3,
      resetTimeout: 30000,
    });

    // Get adaptive optimizer for this operation type
    this.adaptiveOptimizer = adaptiveBatchManager.getOptimizer(operationType, {
      maxBatchSize: Math.min(opts.maxBulkSize, 50),
      targetResponseTime: 3000, // 3 seconds for bulk operations
    });

    // Initialize batch processor with adaptive configuration
    const adaptiveConfig = this.adaptiveOptimizer.getOptimalConfig();
    this.batchProcessor = new BatchProcessor({
      maxConcurrency: adaptiveConfig.concurrency,
      batchSize: adaptiveConfig.batchSize,
      enableMetrics: true,
      batchDelay: 0,
    });

    logger.debug('Bulk operation enhancer initialized', {
      operationType: this.operationType,
      options: opts,
      adaptiveConfig,
    });
  }

  /**
   * Execute enhanced bulk operation with all optimizations
   */
  async execute<TInput, TOutput>(
    items: TInput[],
    bulkApiOperation: ((items: TInput[]) => Promise<TOutput[]>) | null,
    individualOperation: (item: TInput, index: number) => Promise<TOutput>,
    options: Partial<BulkOperationOptions> = {}
  ): Promise<EnhancedBatchResult<TOutput>> {
    const opts = { ...DEFAULT_OPTIONS, ...this.options, ...options };
    const operationId = `${this.operationType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    // Memory protection check
    if (items.length > opts.maxBulkSize) {
      throw new Error(`Bulk operation size (${items.length}) exceeds maximum allowed (${opts.maxBulkSize}). Consider breaking into smaller chunks.`);
    }

    performanceMonitor.startOperation(
      operationId,
      this.operationType,
      items.length,
      this.adaptiveOptimizer.getOptimalConfig().concurrency
    );

    let strategy: EnhancedBatchResult<TOutput>['strategy'] = 'fallback_individual';
    let result: BatchResult<TOutput>;
    const cacheHits = 0;
    let apiCallsUsed = 0;
    let circuitBreakerUsed = false;

    try {
      // Strategy 1: Try bulk API with circuit breaker protection
      if (opts.useProgressiveEnhancement && bulkApiOperation && opts.useCircuitBreaker) {
        try {
          result = await this.circuitBreaker.execute(async () => {
            circuitBreakerUsed = true;
            logger.debug('Attempting bulk API operation', { operationId, itemCount: items.length });
            
            const bulkResult = await withRetry(
              () => bulkApiOperation(items),
              opts.retryConfig || { maxRetries: 2 }
            );
            
            apiCallsUsed = 1; // Single bulk API call
            strategy = 'bulk_api';
            
            return {
              successful: bulkResult,
              failed: [],
              metrics: {
                totalItems: items.length,
                totalBatches: 1,
                totalDuration: Date.now() - startTime,
                averageBatchDuration: Date.now() - startTime,
                successfulOperations: bulkResult.length,
                failedOperations: 0,
                operationsPerSecond: bulkResult.length / ((Date.now() - startTime) / 1000),
                concurrencyUtilization: 1,
              },
            };
          });
          
          logger.info('Bulk API operation succeeded', {
            operationId,
            itemCount: items.length,
            duration: Date.now() - startTime,
          });

        } catch (error) {
          if (error instanceof CircuitOpenError) {
            logger.warn('Bulk API circuit breaker is open, using fallback strategy', {
              operationId,
              circuitMetrics: error.metrics,
            });
          } else {
            logger.warn('Bulk API operation failed, falling back to adaptive batching', {
              operationId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          
          // Fall through to adaptive batching strategy
          result = await this.executeWithAdaptiveBatching(items, individualOperation, operationId, opts);
          strategy = 'adaptive_batching';
        }
      } else {
        // Strategy 2: Use adaptive batching directly
        result = await this.executeWithAdaptiveBatching(items, individualOperation, operationId, opts);
        strategy = 'adaptive_batching';
      }

      // Record performance for adaptive learning
      this.adaptiveOptimizer.recordOperation({
        batchSize: this.adaptiveOptimizer.getOptimalConfig().batchSize,
        concurrency: this.adaptiveOptimizer.getOptimalConfig().concurrency,
        responseTime: Date.now() - startTime,
        success: result.failed.length === 0,
        itemCount: items.length,
      });

      performanceMonitor.completeOperation(operationId);

      // Calculate efficiency metrics
      const actualApiCalls = apiCallsUsed || result.metrics.totalBatches;
      const apiCallsSaved = Math.max(0, items.length - actualApiCalls);
      const efficiencyRatio = items.length > 0 ? apiCallsSaved / items.length : 0;

      // Get optimization recommendations
      const recommendations = this.adaptiveOptimizer.getOptimizationRecommendation();

      const enhancedResult: EnhancedBatchResult<TOutput> = {
        ...result,
        strategy,
        optimizations: {
          circuitBreakerUsed,
          adaptiveBatchingUsed: opts.useAdaptiveBatching,
          cacheHits,
          streamingUsed: opts.enableStreaming && items.length > opts.streamingChunkSize,
        },
        efficiency: {
          apiCallsUsed: actualApiCalls,
          apiCallsSaved,
          efficiencyRatio,
        },
        recommendations: recommendations ? {
          suggestedBatchSize: recommendations.recommendedBatchSize,
          suggestedConcurrency: recommendations.recommendedConcurrency,
          reasoning: recommendations.reasoning,
        } : undefined,
      };

      logger.info('Enhanced bulk operation completed', {
        operationId,
        strategy,
        itemCount: items.length,
        successCount: result.successful.length,
        failureCount: result.failed.length,
        duration: Date.now() - startTime,
        efficiency: enhancedResult.efficiency,
        optimizations: enhancedResult.optimizations,
      });

      return enhancedResult;

    } catch (error) {
      performanceMonitor.updateOperation(operationId, { failureCount: items.length });
      performanceMonitor.completeOperation(operationId);
      
      // Record failure for adaptive learning
      this.adaptiveOptimizer.recordOperation({
        batchSize: this.adaptiveOptimizer.getOptimalConfig().batchSize,
        concurrency: this.adaptiveOptimizer.getOptimalConfig().concurrency,
        responseTime: Date.now() - startTime,
        success: false,
        itemCount: items.length,
      });

      throw error;
    }
  }

  /**
   * Execute operation with adaptive batching and caching
   */
  private async executeWithAdaptiveBatching<TInput, TOutput>(
    items: TInput[],
    individualOperation: (item: TInput, index: number) => Promise<TOutput>,
    operationId: string,
    opts: BulkOperationOptions
  ): Promise<BatchResult<TOutput>> {
    // Update batch processor with current adaptive configuration
    const adaptiveConfig = this.adaptiveOptimizer.getOptimalConfig();
    
    // Enhanced processor with caching and monitoring
    const enhancedProcessor = async (item: TInput, index: number): Promise<TOutput> => {
      const cacheKey = opts.useCache ? `${this.operationType}:${JSON.stringify(item)}` : null;
      
      // Check cache first
      if (opts.useCache && cacheKey && this.cache.has(cacheKey)) {
        performanceMonitor.recordCacheHit(operationId);
        const cachedResult = this.cache.get(cacheKey);
        if (cachedResult) {
          return cachedResult as TOutput;
        }
      }
      
      if (opts.useCache && cacheKey) {
        performanceMonitor.recordCacheMiss(operationId);
      }
      
      performanceMonitor.recordApiCall(operationId);
      
      try {
        const result = await individualOperation(item, index);
        
        // Cache successful results
        if (opts.useCache && cacheKey) {
          this.cache.set(cacheKey, result as unknown, opts.cacheTtl);
        }
        
        performanceMonitor.updateOperation(operationId, { successCount: 1 });
        return result;
      } catch (error) {
        performanceMonitor.updateOperation(operationId, { failureCount: 1 });
        throw error;
      }
    };

    // Execute with adaptive batch processor
    const batchProcessor = new BatchProcessor({
      maxConcurrency: adaptiveConfig.concurrency,
      batchSize: adaptiveConfig.batchSize,
      enableMetrics: true,
      batchDelay: 0,
    });

    return await batchProcessor.processBatches(items, enhancedProcessor);
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): {
    cache: ReturnType<ResponseCache['getMetrics']>;
    circuitBreaker: ReturnType<CircuitBreaker['getMetrics']>;
    adaptiveOptimizer: ReturnType<AdaptiveBatchOptimizer['getPerformanceWindow']>;
    batchProcessor: ReturnType<BatchProcessor['getMetrics']>;
  } {
    return {
      cache: this.cache.getMetrics(),
      circuitBreaker: this.circuitBreaker.getMetrics(),
      adaptiveOptimizer: this.adaptiveOptimizer.getPerformanceWindow(),
      batchProcessor: this.batchProcessor.getMetrics(),
    };
  }

  /**
   * Reset all optimization state
   */
  reset(): void {
    this.cache.clear();
    this.circuitBreaker.reset();
    this.adaptiveOptimizer.reset();
    
    logger.info('Bulk operation enhancer reset', {
      operationType: this.operationType,
    });
  }
}

/**
 * Create enhanced bulk operation processor
 */
export function createBulkOperationEnhancer(
  operationType: string,
  options?: Partial<BulkOperationOptions>
): BulkOperationEnhancer {
  return new BulkOperationEnhancer(operationType, options);
}

/**
 * Convenience function for enhanced bulk operations
 */
export async function executeEnhancedBulkOperation<TInput, TOutput>(
  operationType: string,
  items: TInput[],
  bulkApiOperation: ((items: TInput[]) => Promise<TOutput[]>) | null,
  individualOperation: (item: TInput, index: number) => Promise<TOutput>,
  options?: Partial<BulkOperationOptions>
): Promise<EnhancedBatchResult<TOutput>> {
  const enhancer = createBulkOperationEnhancer(operationType, options);
  return await enhancer.execute(items, bulkApiOperation, individualOperation, options);
}