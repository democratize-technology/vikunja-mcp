/**
 * AORP Response Factory
 * AI-Optimized Response Protocol - provides structured, AI-friendly responses
 * with confidence scoring, next steps generation, and quality indicators.
 */

import type { ResponseMetadata } from '../types/responses';
import type {
  Verbosity,
  OptimizedTask,
  Task,
  TransformerConfig,
  TransformationResult
} from '../transforms/index';
import {
  defaultTaskTransformer,
  Verbosity as TransformVerbosity
} from '../transforms/index';
import { AorpResponseFactory } from '../aorp/factory';
import type { AorpFactoryOptions, AorpResponse, AorpFactoryResult } from '../types/index';
import { createErrorResponse } from '../types/responses';

/**
 * AORP-enabled response metadata
 */
export interface AorpResponseMetadata extends ResponseMetadata {
  /** AORP processing information */
  aorp?: {
    /** Processing time in ms */
    processingTimeMs: number;
    /** Transformation context */
    operation: string;
    /** Verbosity level used */
    verbosity: string;
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
 * Create an AORP response - the primary response creation function
 */
export function createAorpResponse<T>(
  operation: string,
  message: string,
  data: T,
  metadata: Partial<ResponseMetadata> = {},
  options: {
    verbosity?: Verbosity;
    transformFields?: string[];
    aorpOptions?: AorpFactoryOptions;
  } = {}
): AorpFactoryResult<T> {
  const startTime = Date.now();

  // Create AORP factory instance
  const factory = new AorpResponseFactory(options.aorpOptions);

  // Create AORP response directly from data
  const result = factory.fromData(operation, data, true, message, {
    includeDebug: false,
    sessionId: metadata.sessionId as string,
    ...options.aorpOptions
  });

  // Add additional metadata to the response
  if (metadata && Object.keys(metadata).length > 0) {
    Object.entries(metadata).forEach(([key, value]) => {
      result.response.details.metadata[key] = value;
    });
  }

  return result;
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
 * Create AORP response for task data with specialized configuration
 */
export function createTaskAorpResponse(
  operation: string,
  message: string,
  tasks: unknown,
  metadata: Partial<ResponseMetadata> = {},
  options: {
    verbosity?: Verbosity;
    aorpOptions?: AorpFactoryOptions;
  } = {}
): AorpFactoryResult<OptimizedTask | OptimizedTask[]> {
  // Transform task data using the existing transformer
  const transformerConfig = {
    verbosity: options.verbosity || TransformVerbosity.STANDARD,
    trackMetrics: false
  };

  let transformedData: OptimizedTask | OptimizedTask[];

  if (Array.isArray(tasks)) {
    const convertedTasks = tasks.map(item => convertToTask(item));
    const result = defaultTaskTransformer.transformTasks(convertedTasks, transformerConfig);
    transformedData = result.data as OptimizedTask[];
  } else {
    const convertedTask = convertToTask(tasks);
    const result = defaultTaskTransformer.transformTask(convertedTask, transformerConfig);
    transformedData = result.data as OptimizedTask;
  }

  // Create AORP response with transformed data
  return createAorpResponse(operation, message, transformedData, metadata, {
    verbosity: options.verbosity || TransformVerbosity.STANDARD,
    aorpOptions: {
      ...options.aorpOptions,
      builderConfig: {
        confidenceMethod: 'adaptive',
        enableNextSteps: true,
        enableQualityIndicators: true,
        ...options.aorpOptions?.builderConfig
      }
    }
  });
}

/**
 * Create AORP error response
 */
export function createAorpErrorResponse(
  operation: string,
  error: Error | Record<string, unknown>,
  options: AorpFactoryOptions = {}
): AorpFactoryResult<null> {
  const factory = new AorpResponseFactory(options);
  return factory.fromError(operation, error, options);
}

/**
 * Get default AORP factory instance
 */
export function getDefaultAorpFactory(): AorpResponseFactory {
  return new AorpResponseFactory();
}

/**
 * Create AORP response factory with custom configuration
 */
export function createAorpResponseFactory(options: AorpFactoryOptions = {}): AorpResponseFactory {
  return new AorpResponseFactory(options);
}

// ============================================================================
// LEGACY BACKWARD COMPATIBILITY FUNCTIONS - DEPRECATED
// These functions are maintained for backward compatibility during transition
// They now return AORP responses under the hood
// ============================================================================

/**
 * Legacy createAorpEnabledFactory - DEPRECATED
 * Returns a factory that creates AORP responses
 */
export function createAorpEnabledFactory() {
  return {
    createResponse: <T>(
      operation: string,
      message: string,
      data: T,
      metadata: Partial<ResponseMetadata> = {},
      _options: any = {}
    ) => {
      return createAorpResponse(operation, message, data, metadata).response;
    }
  };
}

/**
 * Legacy createOptimizedResponse - DEPRECATED
 * Now returns AORP response
 */
export function createOptimizedResponse<T>(
  operation: string,
  message: string,
  data: T,
  metadata: Partial<ResponseMetadata> = {},
  verbosity: Verbosity = TransformVerbosity.STANDARD
) {
  return createAorpResponse(operation, message, data, metadata, {
    verbosity
  }).response;
}

/**
 * Legacy createTaskResponse - DEPRECATED
 * Now returns AORP response
 */
export function createTaskResponse(
  operation: string,
  message: string,
  tasks: unknown,
  metadata: Partial<ResponseMetadata> = {},
  verbosity: Verbosity = TransformVerbosity.STANDARD
) {
  return createTaskAorpResponse(operation, message, tasks, metadata, {
    verbosity
  }).response;
}

/**
 * Legacy createMinimalResponse - DEPRECATED
 * Now returns AORP response
 */
export function createMinimalResponse<T>(
  operation: string,
  message: string,
  data: T,
  metadata: Partial<ResponseMetadata> = {}
) {
  return createAorpResponse(operation, message, data, metadata).response;
}

/**
 * Legacy createStandardResponse - DEPRECATED
 * Now returns AORP response (maintains old API shape)
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
) {
  // Always use AORP now
  return createAorpResponse(operation, message, data, metadata, {
    verbosity: options.verbosity || TransformVerbosity.STANDARD
  }).response;
}
