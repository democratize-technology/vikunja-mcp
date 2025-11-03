/**
 * Simple response creation utilities
 * Clean, lightweight response formatting without over-engineering
 */

import type { StandardResponse, ResponseMetadata } from '../types/responses';
import type {
  OptimizedResponse,
  Verbosity,
  TransformerConfig,
  TransformationResult,
  OptimizedTask,
  Task
} from '../transforms/index';
import {
  defaultTaskTransformer,
  defaultSizeCalculator,
  Verbosity as TransformVerbosity
} from '../transforms/index';
import { createStandardResponse as createBaseStandardResponse } from '../types/responses';

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
 * Validate that unknown data conforms to Task interface
 * Accepts both node-vikunja Task and transformer Task formats
 */
function validateTask(data: unknown): data is Task {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const task = data as Record<string, unknown>;
  // More lenient validation - check for basic structure but allow missing fields
  return (
    // Must have at least some basic structure
    typeof task.id === 'number' ||
    typeof task.title === 'string' ||
    typeof task.done === 'boolean' ||
    Object.keys(task).length > 0
  );
}

/**
 * Convert unknown task data to transformer Task format
 */
function convertToTask(data: unknown): Task {
  if (validateTask(data)) {
    // The data matches a reasonable structure
    const taskData = data as Record<string, unknown>;

    const task: Record<string, unknown> = {
      id: (taskData.id as number) || 0,
      title: (taskData.title as string) || 'Untitled Task',
      done: (taskData.done as boolean) || false,
      priority: (taskData.priority as number) || 0,
      created_at: (taskData.created_at as string) || new Date().toISOString(),
      updated_at: (taskData.updated_at as string) || new Date().toISOString(),
    };

    // Only include optional fields if they exist
    const optionalFields: Array<keyof Task> = [
      'description', 'due_date', 'start_date', 'end_date', 'completed_at',
      'project_id', 'hex_color', 'position', 'identifier', 'index',
      'parent_task_id', 'repeat_after'
    ];

    optionalFields.forEach(field => {
      if (taskData[field] !== undefined && taskData[field] !== null) {
        task[field] = taskData[field];
      }
    });

    // Include any additional properties
    Object.entries(taskData).forEach(([key, value]) => {
      if (!['id', 'title', 'done', 'priority', 'created_at', 'updated_at', ...optionalFields].includes(key)) {
        task[key] = value;
      }
    });

    return task as Task;
  }

  // For empty or minimal data, create a basic task structure
  if (data && typeof data === 'object' && Object.keys(data as Record<string, unknown>).length === 0) {
    return {
      id: 0,
      title: 'Untitled Task',
      done: false,
      priority: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Task;
  }

  throw new Error('Invalid task data structure');
}

/**
 * Transform data with the specified verbosity
 */
function transformData(data: unknown, verbosity: Verbosity, transformFields?: string[]): TransformationResult {
  // For now, we'll handle task data specifically
  // This can be extended to handle other data types
  const transformerConfig: TransformerConfig = {
    verbosity,
    trackMetrics: false,
    ...(transformFields && { fieldOverrides: { include: transformFields } })
  };

  if (Array.isArray(data)) {
    // Validate and transform array of tasks
    const validTasks = data.filter(item => validateTask(item)).map(item => convertToTask(item));
    if (validTasks.length !== data.length) {
      console.warn(`Some items in array are not valid tasks and were filtered out`);
    }
    return defaultTaskTransformer.transformTasks(validTasks, transformerConfig);
  } else if (validateTask(data)) {
    // Validate and transform single task
    return defaultTaskTransformer.transformTask(convertToTask(data), transformerConfig);
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
 * Create a standard response with optional optimization
 */
export function createStandardResponse<T>(
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
  const useOptimization = options.useOptimization ?? true;
  const verbosity = options.verbosity ?? TransformVerbosity.STANDARD;

  if (!useOptimization) {
    // Create standard response without optimization
    return createBaseStandardResponse(operation, message, data, metadata);
  }

  // Apply optimization
  const optimizedResult = transformData(data, verbosity, options.transformFields);
  const totalTime = Date.now() - startTime;

  // Create optimized response
  const optimizedResponse: OptimizedResponse<T> = {
    success: true,
    operation,
    message,
    data: optimizedResult.data as T,
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

  return optimizedResponse;
}

/**
 * Create optimized response for task data
 */
export function createTaskResponse(
  operation: string,
  message: string,
  tasks: unknown,
  metadata: Partial<ResponseMetadata> = {},
  verbosity: Verbosity = TransformVerbosity.STANDARD
): OptimizedResponse<OptimizedTask | OptimizedTask[]> {
  const startTime = Date.now();

  // Transform task data
  const transformerConfig: TransformerConfig = {
    verbosity,
    trackMetrics: false
  };

  let transformationResult: TransformationResult;

  if (Array.isArray(tasks)) {
    // Convert and validate array of tasks
    const convertedTasks = tasks.map(item => convertToTask(item));
    transformationResult = defaultTaskTransformer.transformTasks(convertedTasks, transformerConfig);
  } else {
    // Convert and validate single task
    const convertedTask = convertToTask(tasks);
    transformationResult = defaultTaskTransformer.transformTask(convertedTask, transformerConfig);
  }

  const totalTime = Date.now() - startTime;

  // Calculate size metrics
  const sizeMetrics = defaultSizeCalculator.calculateMetrics(transformationResult);

  const response: OptimizedResponse<OptimizedTask | OptimizedTask[]> = {
    success: true,
    operation,
    message,
    data: transformationResult.data as OptimizedTask | OptimizedTask[],
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

  return response;
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
  return createBaseStandardResponse(operation, message, data, metadata);
}

/**
 * Create an optimized response with default verbosity
 */
export function createOptimizedResponse<T>(
  operation: string,
  message: string,
  data: T,
  metadata: Partial<ResponseMetadata> = {},
  verbosity: Verbosity = TransformVerbosity.STANDARD
): OptimizedResponse<T> {
  return createStandardResponse(operation, message, data, metadata, {
    verbosity,
    useOptimization: true
  }) as OptimizedResponse<T>;
}

/**
 * Stub function to replace AORP functionality
 * Returns a standard optimized response instead of AORP response
 */
export function createAorpEnabledFactory(config: any = {}): any {
  return {
    createResponse: (operation: string, message: string, data: any, metadata: any = {}, options: any = {}) => {
      // Ignore AORP options and return standard optimized response
      return createStandardResponse(operation, message, data, metadata, {
        useOptimization: true,
        verbosity: options.verbosity || TransformVerbosity.STANDARD
      });
    }
  };
}
