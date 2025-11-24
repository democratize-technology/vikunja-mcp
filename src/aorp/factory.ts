/**
 * AORP Response Factory
 * Integrates AI-Optimized Response Protocol with the existing transformation system
 */

import type { OptimizedResponse } from '../transforms/base';
import type {
  AorpResponse,
  AorpFactoryResult,
  AorpFactoryOptions,
  AorpTransformationContext,
  AorpVerbosityLevel,
  ComplexityFactors,
  SimpleAorpResponse
} from './types';
import { AorpBuilder } from './builder';

/**
 * Operation types that should default to simple AORP
 */
const SIMPLE_OPERATIONS = new Set([
  'get-task',
  'delete-task',
  'get-project',
  'delete-project',
  'update-project',
  'get-label',
  'delete-label',
  'update-label'
]);

/**
 * Operation types that should always use full AORP
 */
const COMPLEX_OPERATIONS = new Set([
  'bulk-create-tasks',
  'bulk-update-tasks',
  'bulk-delete-tasks',
  'list-tasks',
  'list-projects',
  'tasks-export',
  'projects-export',
  'create-task',
  'update-task'
]);

/**
 * AORP Response Factory class
 */
export class AorpResponseFactory {
  private defaultOptions: AorpFactoryOptions;

  constructor(defaultOptions: AorpFactoryOptions = {}) {
    this.defaultOptions = {
      builderConfig: {
        confidenceMethod: 'adaptive',
        // Next steps and quality indicators are always enabled - no configuration option
        confidenceWeights: {
          success: 0.4,
          dataSize: 0.2,
          responseTime: 0.2,
          completeness: 0.2
        },
        ...defaultOptions.builderConfig
      },
      nextStepsConfig: {
        maxSteps: 5,
        // Contextual next steps are always enabled - no configuration option
        ...defaultOptions.nextStepsConfig
      },
      qualityConfig: {
        completenessWeight: 0.5,
        reliabilityWeight: 0.5,
        ...defaultOptions.qualityConfig
      },
      // Debug information is always included - no configuration option
      ...defaultOptions
    };
  }

  /**
   * Convert an OptimizedResponse to AORP format
   */
  fromOptimizedResponse(
    optimizedResponse: OptimizedResponse,
    options: AorpFactoryOptions = {}
  ): AorpFactoryResult {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    // Create transformation context
    const context = this.createTransformationContext(optimizedResponse, undefined, mergedOptions);

    // Create AORP response
    const response = this.createAorpResponse(optimizedResponse, context, mergedOptions);

    // Calculate processing metrics
    const aorpProcessingTime = Date.now() - startTime;
    const totalTime = (optimizedResponse.metadata.optimization?.performance.totalTimeMs || 0) + aorpProcessingTime;

    return {
      response,
      transformation: {
        originalResponse: optimizedResponse,
        context,
        metrics: {
          aorpProcessingTime,
          totalTime
        }
      }
    };
  }

  /**
   * Create AORP response directly from summary
   */
  fromData(
    operation: string,
    summary: string,
    success: boolean = true,
    message: string = '',
    options: AorpFactoryOptions = {}
  ): AorpFactoryResult {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    // Create a mock optimized response for consistency
    const mockOptimizedResponse: OptimizedResponse = {
      success,
      operation,
      message: message || (success ? 'Operation completed successfully' : 'Operation failed'),
      data: summary,
      metadata: {
        timestamp: new Date().toISOString(),
        count: 1
      }
    };

    // Create transformation context
    const context = this.createTransformationContext(mockOptimizedResponse, undefined, mergedOptions);

    // Create AORP response
    const response = this.createAorpResponse(mockOptimizedResponse, context, mergedOptions);

    // Calculate processing metrics
    const aorpProcessingTime = Date.now() - startTime;
    const totalTime = aorpProcessingTime;

    return {
      response,
      transformation: {
        originalResponse: mockOptimizedResponse,
        context,
        metrics: {
          aorpProcessingTime,
          totalTime
        }
      }
    };
  }

  /**
   * Create AORP response from error
   */
  fromError(
    operation: string,
    error: Error | Record<string, unknown>,
    options: AorpFactoryOptions = {}
  ): AorpFactoryResult {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    // Extract error information
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object' && error && 'message' in error) {
      errorMessage = String((error as { message: unknown }).message);
    } else {
      errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
    }

    // Create mock optimized response for error
    const mockOptimizedResponse: OptimizedResponse = {
      success: false,
      operation,
      message: errorMessage,
      data: errorMessage,
      metadata: {
        timestamp: new Date().toISOString(),
        count: 0
      }
    };

    // Create transformation context with error information
    const context = this.createTransformationContext(mockOptimizedResponse, [errorMessage], mergedOptions);

    // Create AORP response
    const response = this.createAorpResponse(mockOptimizedResponse, context, mergedOptions);

    // Calculate processing metrics
    const aorpProcessingTime = Date.now() - startTime;
    const totalTime = aorpProcessingTime;

    return {
      response,
      transformation: {
        originalResponse: mockOptimizedResponse,
        context,
        metrics: {
          aorpProcessingTime,
          totalTime
        }
      }
    };
  }

  /**
   * Detect appropriate verbosity level based on operation and data
   */
  private detectVerbosityLevel(
    operation: string,
    dataSize: number,
    errors?: string[],
    data?: unknown,
    options?: AorpFactoryOptions
  ): { verbosityLevel: AorpVerbosityLevel; complexityFactors: ComplexityFactors } {
    // Handle user override for verbosity level
    if (options?.verbosityLevel) {
      return {
        verbosityLevel: options.verbosityLevel,
        complexityFactors: this.createComplexityFactors(operation, dataSize, errors, data)
      };
    }

    // Handle user override for useAorp flag
    if (options?.useAorp === false) {
      return {
        verbosityLevel: 'simple',
        complexityFactors: this.createComplexityFactors(operation, dataSize, errors, data)
      };
    }

    if (options?.useAorp === true) {
      return {
        verbosityLevel: 'full',
        complexityFactors: this.createComplexityFactors(operation, dataSize, errors, data)
      };
    }

    // Auto-detect based on operation and data complexity
    return this.autoDetectVerbosityLevel(operation, dataSize, errors, data);
  }

  /**
   * Create complexity factors object
   */
  private createComplexityFactors(
    operation: string,
    dataSize: number,
    errors?: string[],
    data?: unknown
  ): ComplexityFactors {
    const complexityFactors: ComplexityFactors = {
      dataSize: dataSize > 10,
      hasWarnings: false,
      hasErrors: !!(errors && errors.length > 0),
      isBulkOperation: operation.includes('bulk-') || operation.includes('-bulk'),
      isPartialSuccess: false,
      custom: {}
    };

    // Detect warnings in data
    if (data && typeof data === 'object') {
      const dataObj = data as Record<string, unknown>;
      complexityFactors.hasWarnings = !!(
        dataObj.warnings ||
        dataObj.failed ||
        dataObj.errors ||
        (dataObj.created && dataObj.failed && (dataObj.created as number) > 0 && (dataObj.failed as number) > 0)
      );

      complexityFactors.isPartialSuccess = !!(
        (dataObj.created && dataObj.total && (dataObj.created as number) < (dataObj.total as number)) ||
        (dataObj.success === true && dataObj.partial === true)
      );
    }

    return complexityFactors;
  }

  /**
   * Auto-detect verbosity level based on operation and data
   */
  private autoDetectVerbosityLevel(
    operation: string,
    dataSize: number,
    errors?: string[],
    data?: unknown
  ): { verbosityLevel: AorpVerbosityLevel; complexityFactors: ComplexityFactors } {
    const complexityFactors = this.createComplexityFactors(operation, dataSize, errors, data);

    // Operation-based detection
    if (SIMPLE_OPERATIONS.has(operation)) {
      return { verbosityLevel: 'simple', complexityFactors };
    }

    if (COMPLEX_OPERATIONS.has(operation)) {
      return { verbosityLevel: 'full', complexityFactors };
    }

    // Complexity-based detection
    if (
      complexityFactors.hasErrors ||
      complexityFactors.hasWarnings ||
      complexityFactors.isBulkOperation ||
      complexityFactors.isPartialSuccess ||
      dataSize > 20
    ) {
      return { verbosityLevel: 'full', complexityFactors };
    }

    // Default to full for unrecognized operations (backward compatibility)
    return { verbosityLevel: 'full', complexityFactors };
  }

  /**
   * Create transformation context from optimized response
   */
  private createTransformationContext(
    optimizedResponse: OptimizedResponse,
    errors?: string[],
    options: AorpFactoryOptions = {}
  ): AorpTransformationContext {
    const dataSize = this.estimateDataSize(optimizedResponse.data);
    const processingTime = optimizedResponse.metadata.optimization?.performance.transformationTimeMs || 0;
    const verbosity = optimizedResponse.metadata.optimization?.verbosity || 'standard';

    // Detect verbosity level based on operation and data complexity
    const { verbosityLevel, complexityFactors } = this.detectVerbosityLevel(
      optimizedResponse.operation,
      dataSize,
      errors,
      optimizedResponse.data,
      options
    );

    const context: AorpTransformationContext = {
      operation: optimizedResponse.operation,
      success: optimizedResponse.success,
      dataSize,
      processingTime,
      verbosity: verbosity.toString(),
      verbosityLevel: options.verbosityLevel || verbosityLevel,
      complexityFactors,
      ...(errors && { errors }),
      // Include any additional metadata
      ...(optimizedResponse.metadata.optimization && {
        sizeMetrics: optimizedResponse.metadata.optimization.sizeMetrics,
        fieldMetrics: optimizedResponse.metadata.optimization.fieldMetrics,
        categoriesIncluded: optimizedResponse.metadata.optimization.categoriesIncluded
      })
    };

    // Include operation-specific data for tool recommendations
    if (optimizedResponse.data && typeof optimizedResponse.data === 'object') {
      // Add task data for single task operations
      if (this.isTaskOperation(optimizedResponse.operation) && !Array.isArray(optimizedResponse.data)) {
        context.task = optimizedResponse.data;
      }
      // Add tasks array for list operations
      else if (Array.isArray(optimizedResponse.data)) {
        context.tasks = optimizedResponse.data;
      }
      // Add results data for bulk operations
      else if (this.isBulkOperation(optimizedResponse.operation) &&
               typeof optimizedResponse.data === 'object' &&
               !Array.isArray(optimizedResponse.data) &&
               'successful' in optimizedResponse.data) {
        context.results = optimizedResponse.data;
      }
    }

    return context;
  }

  /**
   * Create AORP response using builder
   */
  private createAorpResponse(
    optimizedResponse: OptimizedResponse,
    context: AorpTransformationContext,
    options: AorpFactoryOptions
  ): AorpResponse | SimpleAorpResponse {
    // Check if we should return a simple response
    if (context.verbosityLevel === 'simple' && options.useAorp !== true) {
      return this.createSimpleAorpResponse(optimizedResponse, context, options);
    }

    // Create full AORP response using existing logic
    return this.createFullAorpResponse(optimizedResponse, context, options);
  }

  /**
   * Create simple AORP response for basic operations
   */
  private createSimpleAorpResponse(
    optimizedResponse: OptimizedResponse,
    context: AorpTransformationContext,
    options: AorpFactoryOptions
  ): SimpleAorpResponse {
    const keyInsight = this.generateKeyInsight(optimizedResponse);
    const summary = typeof optimizedResponse.data === 'string'
      ? optimizedResponse.data
      : optimizedResponse.message;

    return {
      immediate: {
        status: optimizedResponse.success ? 'success' : 'error',
        key_insight: keyInsight,
        confidence: 0.95, // High confidence for simple operations
        ...(options.sessionId && { session_id: options.sessionId })
      },
      summary,
      metadata: {
        timestamp: new Date().toISOString(),
        operation: optimizedResponse.operation,
        success: optimizedResponse.success
      }
    };
  }

  /**
   * Create full AORP response using builder
   */
  private createFullAorpResponse(
    optimizedResponse: OptimizedResponse,
    context: AorpTransformationContext,
    options: AorpFactoryOptions
  ): AorpResponse {
    const builder = new AorpBuilder(context, options.builderConfig);

    if (optimizedResponse.success) {
      // Successful operation
      const keyInsight = this.generateKeyInsight(optimizedResponse);
      const summary = typeof optimizedResponse.data === 'string'
        ? optimizedResponse.data
        : optimizedResponse.message;

      const responseBuilder = builder
        .status('success', keyInsight)
        .summary(summary)
        .data(this.extractDataForResponse(optimizedResponse));

      if (options.sessionId) {
        responseBuilder.sessionId(options.sessionId);
      }

      // Debug information is always included for AORP resilience
      responseBuilder.debug({
        originalResponse: optimizedResponse,
        processingTime: Date.now(),
        factoryOptions: options
      });

      return responseBuilder
        .addMetadata('operation', optimizedResponse.operation)
        .addMetadata('originalMessage', optimizedResponse.message)
        .addMetadata('responseCount', optimizedResponse.metadata.count || 0)
        .addMetadata('aorpGeneratedAt', new Date().toISOString())
        .buildWithAutogeneration(options.nextStepsConfig, options.qualityConfig);
    } else {
      // Failed operation
      const keyInsight = `Operation failed: ${optimizedResponse.message}`;
      const summary = typeof optimizedResponse.data === 'string'
        ? optimizedResponse.data
        : optimizedResponse.message;

      const responseBuilder = builder
        .status('error', keyInsight)
        .summary(summary)
        .data(this.extractDataForResponse(optimizedResponse));

      if (options.sessionId) {
        responseBuilder.sessionId(options.sessionId);
      }

      // Debug information is always included for AORP resilience
      responseBuilder.debug({
        originalResponse: optimizedResponse,
        processingTime: Date.now(),
        factoryOptions: options,
        error: true
      });

      return responseBuilder
        .addMetadata('operation', optimizedResponse.operation)
        .addMetadata('originalMessage', optimizedResponse.message)
        .addMetadata('responseCount', optimizedResponse.metadata.count || 0)
        .addMetadata('aorpGeneratedAt', new Date().toISOString())
        .buildWithAutogeneration(options.nextStepsConfig, options.qualityConfig);
    }
  }

  /**
   * Generate key insight based on operation and context
   */
  private generateKeyInsight(optimizedResponse: OptimizedResponse): string {
    const { operation, data } = optimizedResponse;
    const count = optimizedResponse.metadata.count || 0;

    switch (operation) {
      case 'create':
        return `Successfully created new resource with ID ${this.extractId(data)}`;

      case 'update':
        return `Successfully updated resource ${this.extractId(data)}`;

      case 'delete':
        return `Successfully deleted resource`;

      case 'list':
        if (count === 0) {
          return `No resources found matching the criteria`;
        } else if (count === 1) {
          return `Found 1 resource`;
        } else {
          return `Found ${count} resources`;
        }

      case 'get':
        return `Successfully retrieved resource details`;

      default:
        return `Operation completed successfully`;
    }
  }

  /**
   * Extract ID from data object
   */
  private extractId(data: unknown): string | number {
    if (data && typeof data === 'object') {
      const dataObj = data as Record<string, unknown>;
      const id = dataObj.id ?? dataObj.ID;
      return (typeof id === 'string' || typeof id === 'number') ? id : 'unknown';
    }
    return 'unknown';
  }

  /**
   * Extract and format actual data for AORP response details.data field
   * This preserves the original API response data as required by AORP spec
   */
  private extractDataForResponse(optimizedResponse: OptimizedResponse): Record<string, unknown> {
    const data = optimizedResponse.data;
    const operation = optimizedResponse.operation;

    // Initialize result object
    const result: Record<string, unknown> = {};

    // Handle array data (list operations)
    if (Array.isArray(data)) {
      if (operation.includes('project')) {
        result.projects = data;
      } else if (operation.includes('task')) {
        result.tasks = data;
      } else {
        // Generic array data - include under operation-specific key
        const key = operation.replace(/-/g, '_').replace('bulk_', '');
        result[key] = data;
      }
    }
    // Handle object data
    else if (data && typeof data === 'object') {
      const dataObj = data as Record<string, unknown>;

      // Check if this is already in the correct format (has projects/tasks)
      if ('projects' in dataObj || 'tasks' in dataObj) {
        return dataObj as Record<string, unknown>;
      }

      // Single object - categorize by operation
      if (operation.includes('project')) {
        result.projects = [data]; // Wrap in array for consistency
      } else if (operation.includes('task')) {
        result.tasks = [data]; // Wrap in array for consistency
      } else {
        // Generic object data
        const key = operation.replace(/-/g, '_').replace('bulk_', '');
        result[key] = data;
      }
    }
    // Handle primitive/string data
    else {
      // For non-object data, include as summary info
      result.summary = data;
    }

    return result;
  }

  /**
   * Estimate data size for context
   */
  private estimateDataSize(data: unknown): number {
    if (data === null || data === undefined) {
      return 0;
    }

    if (Array.isArray(data)) {
      return data.length;
    }

    if (typeof data === 'object') {
      return Object.keys(data as Record<string, unknown>).length;
    }

    return 1; // Primitive type
  }

  /**
   * Check if operation is a single task operation
   */
  private isTaskOperation(operation: string): boolean {
    return operation === 'create-task' ||
           operation === 'update-task' ||
           operation === 'delete-task' ||
           operation === 'get-task';
  }

  /**
   * Check if operation is a bulk operation
   */
  private isBulkOperation(operation: string): boolean {
    return operation.startsWith('bulk-') ||
           operation.includes('-bulk') ||
           operation === 'bulk-create-tasks' ||
           operation === 'bulk-update-tasks' ||
           operation === 'bulk-delete-tasks';
  }

  /**
   * Update default options
   */
  updateDefaultOptions(newOptions: Partial<AorpFactoryOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...newOptions };
  }

  /**
   * Get current default options
   */
  getDefaultOptions(): AorpFactoryOptions {
    return { ...this.defaultOptions };
  }

  /**
   * Create a specialized factory for specific operation types
   */
  static forOperations(operations: string[]): AorpResponseFactory {
    // Create operation-specific next steps templates
    const templates: Record<string, string[]> = {};

    operations.forEach(op => {
      switch (op) {
        case 'tasks_create':
        case 'projects_create':
          templates[op] = [
            "Verify the created item appears in listings",
            "Check related entities were updated correctly",
            "Test any automated triggers or workflows",
            "Set up reminders or notifications if needed"
          ];
          break;

        case 'tasks_update':
        case 'projects_update':
          templates[op] = [
            "Confirm changes are reflected in the UI",
            "Validate dependent data remains consistent",
            "Check if notifications were sent to assignees",
            "Update any related documentation"
          ];
          break;

        case 'tasks_list':
        case 'projects_list':
          templates[op] = [
            "Review the returned items for completeness",
            "Apply filters or pagination if needed",
            "Consider sorting by priority or due date",
            "Check for any overdue items requiring attention"
          ];
          break;

        default:
          templates[op] = [
            "Verify the operation completed successfully",
            "Check related data for consistency",
            "Consider next actions based on the result"
          ];
      }
    });

    return new AorpResponseFactory({
      nextStepsConfig: {
        templates
        // Contextual next steps are always enabled - no configuration option
      }
    });
  }
}

/**
 * Default AORP factory instance
 */
export const defaultAorpFactory = new AorpResponseFactory();

/**
 * Utility functions for quick AORP response creation
 */
export function createAorpResponse(
  optimizedResponse: OptimizedResponse,
  options?: AorpFactoryOptions
): AorpFactoryResult {
  return defaultAorpFactory.fromOptimizedResponse(optimizedResponse, options);
}

export function createAorpFromData(
  operation: string,
  summary: string,
  success?: boolean,
  message?: string,
  options?: AorpFactoryOptions
): AorpFactoryResult {
  return defaultAorpFactory.fromData(operation, summary, success, message, options);
}

export function createAorpFromError(
  operation: string,
  error: Error | Record<string, unknown>,
  options?: AorpFactoryOptions
): AorpFactoryResult {
  return defaultAorpFactory.fromError(operation, error, options);
}