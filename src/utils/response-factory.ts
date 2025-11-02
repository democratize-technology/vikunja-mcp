/**
 * Response Factory with performance tracking
 * Centralized response creation with transformation and optimization
 */

import type { StandardResponse, ResponseMetadata } from '../types/responses';
import type {
  OptimizedResponse,
  Verbosity,
  TransformerConfig,
  TransformationResult,
  OptimizedTask
} from '../transforms/index';
import {
  defaultTaskTransformer,
  defaultSizeCalculator,
  Verbosity as TransformVerbosity
} from '../transforms/index';
import { createStandardResponse } from '../types/responses';
import type {
  AorpFactoryResult,
  AorpFactoryOptions
} from '../aorp/types';
import { AorpResponseFactory } from '../aorp/factory';

/**
 * Response factory configuration
 */
export interface ResponseFactoryConfig {
  /** Default verbosity level for responses */
  defaultVerbosity?: Verbosity;
  /** Whether to enable optimization by default */
  enableOptimization?: boolean;
  /** Whether to track performance metrics */
  trackPerformance?: boolean;
  /** Custom transformer configurations */
  customTransformers?: Record<string, unknown>;
  /** Whether to enable AORP responses */
  enableAorp?: boolean;
  /** Default AORP factory options */
  defaultAorpOptions?: AorpFactoryOptions;
}

/**
 * Enhanced response metadata with optimization info
 */
export interface EnhancedResponseMetadata extends ResponseMetadata {
  /** Optimization metrics if enabled */
  optimization?: {
    /** Verbosity level used */
    verbosity: Verbosity;
    /** Size reduction metrics */
    sizeMetrics: {
      originalSize: number;
      optimizedSize: number;
      reductionPercentage: number;
    };
    /** Field metrics */
    fieldMetrics: {
      fieldsIncluded: number;
      totalFields: number;
      inclusionPercentage: number;
    };
    /** Performance metrics */
    performance: {
      transformationTimeMs: number;
      totalTimeMs: number;
    };
    /** Categories included */
    categoriesIncluded: string[];
  };
}

/**
 * Response factory class
 */
export class ResponseFactory {
  private config: ResponseFactoryConfig;
  private performanceHistory: Array<{
    timestamp: string;
    operation: string;
    transformationTime: number;
    totalTime: number;
    sizeReduction: number;
  }> = [];
  private aorpFactory: AorpResponseFactory;

  constructor(config: ResponseFactoryConfig = {}) {
    this.config = {
      defaultVerbosity: TransformVerbosity.STANDARD,
      enableOptimization: true,
      trackPerformance: true,
      enableAorp: false,
      ...config
    };

    // Initialize AORP factory if enabled
    this.aorpFactory = new AorpResponseFactory(this.config.defaultAorpOptions);
  }

  /**
   * Create a standard response with optional optimization
   */
  createStandardResponse<T>(
    operation: string,
    message: string,
    data: T,
    metadata: Partial<ResponseMetadata> = {},
    options: {
      verbosity?: Verbosity;
      useOptimization?: boolean;
      transformFields?: string[];
    } = {}
  ): StandardResponse<T> | OptimizedResponse<T> {
    const startTime = Date.now();

    // Determine if optimization should be used
    const useOptimization = options.useOptimization ?? this.config.enableOptimization;
    const verbosity = options.verbosity ?? this.config.defaultVerbosity;

    if (!useOptimization) {
      // Create standard response without optimization
      return createStandardResponse(operation, message, data, metadata);
    }

    // Apply optimization
    const optimizedResult = this.transformData(data, verbosity, options.transformFields);
    const totalTime = Date.now() - startTime;

    // Create optimized response
    const optimizedResponse: OptimizedResponse<T> = {
      success: true,
      operation,
      message,
      data: optimizedResult.data,
      metadata: {
        timestamp: new Date().toISOString(),
        count: Array.isArray(optimizedResult.data) ? optimizedResult.data.length : 1,
        ...metadata,
        optimization: {
          verbosity,
          sizeMetrics: {
            originalSize: optimizedResult.metrics.originalSize,
            optimizedSize: optimizedResult.metrics.optimizedSize,
            reductionPercentage: optimizedResult.metrics.reductionPercentage
          },
          fieldMetrics: {
            fieldsIncluded: optimizedResult.metrics.fieldsIncluded,
            totalFields: optimizedResult.metrics.totalFields,
            inclusionPercentage: optimizedResult.metrics.fieldInclusionPercentage
          },
          performance: {
            transformationTimeMs: optimizedResult.metadata.processingTimeMs,
            totalTimeMs: totalTime
          },
          categoriesIncluded: optimizedResult.metadata.categoriesIncluded
        }
      }
    };

    // Track performance if enabled
    if (this.config.trackPerformance) {
      this.trackPerformance(operation, optimizedResult.metadata.processingTimeMs, totalTime, optimizedResult.metrics.reductionPercentage);
    }

    return optimizedResponse;
  }

  /**
   * Create optimized response for task data
   */
  createTaskResponse(
    operation: string,
    message: string,
    tasks: unknown | unknown[],
    metadata: Partial<ResponseMetadata> = {},
    verbosity: Verbosity = this.config.defaultVerbosity
  ): OptimizedResponse<OptimizedTask | OptimizedTask[]> {
    const startTime = Date.now();

    // Transform task data
    const transformerConfig: TransformerConfig = {
      verbosity,
      trackMetrics: this.config.trackPerformance ?? false
    };

    let transformationResult: TransformationResult;

    if (Array.isArray(tasks)) {
      transformationResult = defaultTaskTransformer.transformTasks(tasks, transformerConfig);
    } else {
      transformationResult = defaultTaskTransformer.transformTask(tasks, transformerConfig);
    }

    const totalTime = Date.now() - startTime;

    // Calculate size metrics
    const sizeMetrics = defaultSizeCalculator.calculateMetrics(transformationResult);

    const response: OptimizedResponse<OptimizedTask | OptimizedTask[]> = {
      success: true,
      operation,
      message,
      data: transformationResult.data,
      metadata: {
        timestamp: new Date().toISOString(),
        count: Array.isArray(transformationResult.data) ? transformationResult.data.length : 1,
        ...metadata,
        optimization: {
          verbosity,
          sizeMetrics: {
            originalSize: sizeMetrics.metrics.originalSize,
            optimizedSize: sizeMetrics.metrics.optimizedSize,
            reductionPercentage: sizeMetrics.metrics.reductionPercentage
          },
          fieldMetrics: {
            fieldsIncluded: transformationResult.metrics.fieldsIncluded,
            totalFields: transformationResult.metrics.totalFields,
            inclusionPercentage: transformationResult.metrics.fieldInclusionPercentage
          },
          performance: {
            transformationTimeMs: transformationResult.metadata.processingTimeMs,
            totalTimeMs: totalTime
          },
          categoriesIncluded: transformationResult.metadata.categoriesIncluded
        }
      }
    };

    // Track performance
    if (this.config.trackPerformance) {
      this.trackPerformance(operation, transformationResult.metadata.processingTimeMs, totalTime, transformationResult.metrics.reductionPercentage);
    }

    return response;
  }

  /**
   * Transform data with the specified verbosity
   */
  private transformData(data: unknown, verbosity: Verbosity, transformFields?: string[]): TransformationResult {
    // For now, we'll handle task data specifically
    // This can be extended to handle other data types
    const transformerConfig: TransformerConfig = {
      verbosity,
      trackMetrics: this.config.trackPerformance ?? false,
      ...(transformFields && { fieldOverrides: { include: transformFields } })
    };

    if (Array.isArray(data)) {
      // Assume it's an array of tasks
      return defaultTaskTransformer.transformTasks(data, transformerConfig);
    } else if (data && typeof data === 'object' && 'id' in data && 'title' in data) {
      // Assume it's a single task
      return defaultTaskTransformer.transformTask(data, transformerConfig);
    } else {
      // For other data types, return as-is with basic metrics
      const originalSize = JSON.stringify(data).length;
      const optimizedSize = originalSize; // No transformation applied
      const startTime = Date.now();
      const dataObj = data as Record<string, unknown>;

      return {
        data,
        metrics: {
          originalSize,
          optimizedSize,
          reductionPercentage: 0,
          fieldsIncluded: Object.keys(dataObj || {}).length,
          totalFields: Object.keys(dataObj || {}).length,
          fieldInclusionPercentage: 100
        },
        metadata: {
          verbosity,
          categoriesIncluded: [],
          timestamp: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Track performance metrics
   */
  private trackPerformance(operation: string, transformationTime: number, totalTime: number, sizeReduction: number): void {
    this.performanceHistory.push({
      timestamp: new Date().toISOString(),
      operation,
      transformationTime,
      totalTime,
      sizeReduction
    });

    // Keep only last 1000 entries
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-1000);
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    totalOperations: number;
    averageTransformationTime: number;
    averageTotalTime: number;
    averageSizeReduction: number;
    recentOperations: Array<{
      timestamp: string;
      operation: string;
      transformationTime: number;
      totalTime: number;
      sizeReduction: number;
    }>;
  } {
    if (this.performanceHistory.length === 0) {
      return {
        totalOperations: 0,
        averageTransformationTime: 0,
        averageTotalTime: 0,
        averageSizeReduction: 0,
        recentOperations: []
      };
    }

    const totalTransformationTime = this.performanceHistory.reduce((sum, entry) => sum + entry.transformationTime, 0);
    const totalTime = this.performanceHistory.reduce((sum, entry) => sum + entry.totalTime, 0);
    const totalSizeReduction = this.performanceHistory.reduce((sum, entry) => sum + entry.sizeReduction, 0);

    return {
      totalOperations: this.performanceHistory.length,
      averageTransformationTime: totalTransformationTime / this.performanceHistory.length,
      averageTotalTime: totalTime / this.performanceHistory.length,
      averageSizeReduction: totalSizeReduction / this.performanceHistory.length,
      recentOperations: this.performanceHistory.slice(-10)
    };
  }

  /**
   * Clear performance history
   */
  clearPerformanceHistory(): void {
    this.performanceHistory = [];
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ResponseFactoryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): ResponseFactoryConfig {
    return { ...this.config };
  }

  /**
   * Create an AORP response from optimized response
   */
  createAorpResponse<T>(
    optimizedResponse: OptimizedResponse<T>,
    options: AorpFactoryOptions = {}
  ): AorpFactoryResult<T> {
    if (!this.config.enableAorp) {
      throw new Error('AORP is not enabled in this factory configuration');
    }

    const mergedOptions = { ...this.config.defaultAorpOptions, ...options };
    return this.aorpFactory.fromOptimizedResponse(optimizedResponse, mergedOptions);
  }

  /**
   * Create an AORP response from data
   */
  createAorpFromData<T>(
    operation: string,
    data: T,
    success: boolean = true,
    message: string = '',
    options: AorpFactoryOptions = {}
  ): AorpFactoryResult<T> {
    if (!this.config.enableAorp) {
      throw new Error('AORP is not enabled in this factory configuration');
    }

    const mergedOptions = { ...this.config.defaultAorpOptions, ...options };
    return this.aorpFactory.fromData(operation, data, success, message, mergedOptions);
  }

  /**
   * Create an AORP response from error
   */
  createAorpFromError(
    operation: string,
    error: Error | Record<string, unknown>,
    options: AorpFactoryOptions = {}
  ): AorpFactoryResult<null> {
    if (!this.config.enableAorp) {
      throw new Error('AORP is not enabled in this factory configuration');
    }

    const mergedOptions = { ...this.config.defaultAorpOptions, ...options };
    return this.aorpFactory.fromError(operation, error, mergedOptions);
  }

  /**
   * Create a response with AORP support (unified method)
   */
  createResponse<T>(
    operation: string,
    message: string,
    data: T,
    metadata: Partial<ResponseMetadata> = {},
    options: {
      verbosity?: Verbosity;
      useOptimization?: boolean;
      useAorp?: boolean;
      transformFields?: string[];
      aorpOptions?: AorpFactoryOptions;
    } = {}
  ): StandardResponse<T> | OptimizedResponse<T> | AorpFactoryResult<T> {
    const {
      useAorp = this.config.enableAorp,
      aorpOptions = {},
      ...otherOptions
    } = options;

    if (useAorp) {
      // First create optimized response, then convert to AORP
      const optimizedResponse = this.createStandardResponse(
        operation,
        message,
        data,
        metadata,
        { ...otherOptions, useOptimization: true }
      ) as OptimizedResponse<T>;

      return this.createAorpResponse(optimizedResponse, aorpOptions);
    }

    // Create standard or optimized response
    return this.createStandardResponse(operation, message, data, metadata, otherOptions);
  }

  /**
   * Update AORP factory configuration
   */
  updateAorpConfig(newOptions: Partial<AorpFactoryOptions>): void {
    this.aorpFactory.updateDefaultOptions(newOptions);
    this.config.defaultAorpOptions = { ...this.config.defaultAorpOptions, ...newOptions };
  }

  /**
   * Get AORP factory configuration
   */
  getAorpConfig(): AorpFactoryOptions {
    return { ...this.config.defaultAorpOptions };
  }
}

/**
 * Default response factory instance
 */
export const defaultResponseFactory = new ResponseFactory();

/**
 * Utility functions for quick response creation
 */
export function createOptimizedResponse<T>(
  operation: string,
  message: string,
  data: T,
  metadata: Partial<ResponseMetadata> = {},
  verbosity: Verbosity = TransformVerbosity.STANDARD
): OptimizedResponse<T> {
  return defaultResponseFactory.createStandardResponse(operation, message, data, metadata, {
    verbosity,
    useOptimization: true
  }) as OptimizedResponse<T>;
}

export function createTaskResponse(
  operation: string,
  message: string,
  tasks: unknown | unknown[],
  metadata: Partial<ResponseMetadata> = {},
  verbosity: Verbosity = TransformVerbosity.STANDARD
): OptimizedResponse<OptimizedTask | OptimizedTask[]> {
  return defaultResponseFactory.createTaskResponse(operation, message, tasks, metadata, verbosity);
}

/**
 * Create a minimal response (no optimization)
 */
export function createMinimalResponse<T>(
  operation: string,
  message: string,
  data: T,
  metadata: Partial<ResponseMetadata> = {}
): StandardResponse<T> {
  return createStandardResponse(operation, message, data, metadata);
}

/**
 * Create AORP-enabled response factory
 */
export function createAorpEnabledFactory(config: ResponseFactoryConfig = {}): ResponseFactory {
  return new ResponseFactory({
    ...config,
    enableAorp: true,
    defaultAorpOptions: {
      builderConfig: {
        confidenceMethod: 'adaptive',
        enableNextSteps: true,
        enableQualityIndicators: true
      },
      nextStepsConfig: {
        maxSteps: 5,
        enableContextual: true
      },
      qualityConfig: {
        completenessWeight: 0.5,
        reliabilityWeight: 0.5
      },
      includeDebug: false,
      ...config.defaultAorpOptions
    }
  });
}

/**
 * Quick AORP response creation functions
 */
export function createAorpResponse<T>(
  operation: string,
  message: string,
  data: T,
  options: {
    verbosity?: Verbosity;
    aorpOptions?: AorpFactoryOptions;
  } = {}
): AorpFactoryResult<T> {
  const aorpFactory = createAorpEnabledFactory();
  return aorpFactory.createResponse(operation, message, data, {}, {
    useAorp: true,
    ...options
  }) as AorpFactoryResult<T>;
}

export function createAorpFromError(
  operation: string,
  error: Error | Record<string, unknown>,
  options: AorpFactoryOptions = {}
): AorpFactoryResult<null> {
  const aorpFactory = createAorpEnabledFactory();
  return aorpFactory.createAorpFromError(operation, error, options);
}

/**
 * Check if response is an AORP result
 */
export function isAorpResult<T>(response: unknown): response is AorpFactoryResult<T> {
  return response !== null &&
         typeof response === 'object' &&
         'response' in response &&
         'transformation' in response &&
         'immediate' in (response as { response: { immediate?: unknown } }).response;
}