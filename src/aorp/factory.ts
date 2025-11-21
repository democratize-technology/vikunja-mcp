/**
 * AORP Response Factory
 * Integrates AI-Optimized Response Protocol with the existing transformation system
 */

import type { OptimizedResponse } from '../transforms/base';
import type {
  AorpResponse,
  AorpFactoryResult,
  AorpFactoryOptions,
  AorpTransformationContext
} from './types';
import { AorpBuilder } from './builder';

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
    const context = this.createTransformationContext(optimizedResponse);

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
    const context = this.createTransformationContext(mockOptimizedResponse);

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
    const context = this.createTransformationContext(mockOptimizedResponse, [errorMessage]);

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
   * Create transformation context from optimized response
   */
  private createTransformationContext(
    optimizedResponse: OptimizedResponse,
    errors?: string[]
  ): AorpTransformationContext {
    const dataSize = this.estimateDataSize(optimizedResponse.data);
    const processingTime = optimizedResponse.metadata.optimization?.performance.transformationTimeMs || 0;
    const verbosity = optimizedResponse.metadata.optimization?.verbosity || 'standard';

    return {
      operation: optimizedResponse.operation,
      success: optimizedResponse.success,
      dataSize,
      processingTime,
      verbosity: verbosity.toString(),
      ...(errors && { errors }),
      // Include any additional metadata
      ...(optimizedResponse.metadata.optimization && {
        sizeMetrics: optimizedResponse.metadata.optimization.sizeMetrics,
        fieldMetrics: optimizedResponse.metadata.optimization.fieldMetrics,
        categoriesIncluded: optimizedResponse.metadata.optimization.categoriesIncluded
      })
    };
  }

  /**
   * Create AORP response using builder
   */
  private createAorpResponse(
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
        .summary(summary);

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
        .summary(summary);

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