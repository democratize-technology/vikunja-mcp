/**
 * Task Response Formatter
 * Centralizes AORP response formatting logic for task operations
 */

import { type TaskResponseData, type TaskResponseMetadata, type AorpBuilderConfig, type AorpVerbosityLevel } from '../../../types';
import { createAorpResponse, createTaskAorpResponse, createAorpErrorResponse } from '../../../utils/response-factory';
import type { AorpFactoryResult } from '../../../types';
import type { Task } from '../../../types/vikunja';
import type { ResponseData } from '../../../utils/simple-response';

/**
 * AORP configuration generator for different operations
 * Creates optimized AORP configurations based on operation type
 */
function generateAorpConfig(
  _operation: string,
  _data: TaskResponseData,
  _verbosity: string
): AorpBuilderConfig {
  // Base configuration
  const baseConfig: AorpBuilderConfig = {
    confidenceMethod: 'adaptive',
    // Next steps and quality indicators are always enabled
    confidenceWeights: {
      success: 0.4,
      dataSize: 0.2,
      responseTime: 0.2,
      completeness: 0.2
    }
  };

  // Operation-specific adjustments
  switch (_operation) {
    case 'create-task':
      return {
        ...baseConfig,
        confidenceWeights: {
          success: 0.5,
          dataSize: 0.1,
          responseTime: 0.2,
          completeness: 0.2
        }
      };

    case 'bulk-create-tasks':
    case 'bulk-update-tasks':
    case 'bulk-delete-tasks':
      return {
        ...baseConfig,
        confidenceWeights: {
          success: 0.6,
          dataSize: 0.3,
          responseTime: 0.1,
          completeness: 0.0
        }
      };

    case 'list-tasks':
      return {
        ...baseConfig,
        confidenceWeights: {
          success: 0.3,
          dataSize: 0.4,
          responseTime: 0.2,
          completeness: 0.1
        }
      };

    default:
      return baseConfig;
  }
}


/**
 * Creates an AORP response for task operations with optimized configuration
 */
export function createTaskResponse(
  operation: string,
  message: string,
  _data: TaskResponseData,
  _metadata: TaskResponseMetadata = {
    timestamp: new Date().toISOString()
  },
  _verbosity?: string, // Parameter kept for backward compatibility but ignored
  _useOptimizedFormat?: boolean, // Parameter kept for backward compatibility but ignored
  _useAorp?: boolean, // Parameter kept for backward compatibility but ignored
  _aorpConfig?: AorpBuilderConfig,
  _sessionId?: string
): AorpFactoryResult {
  // Use standard AORP configuration - no more verbosity options
  generateAorpConfig(operation, _data, 'standard');

  // For task operations, use specialized task AORP response
  const taskData = _data.task || _data.tasks;
  if (taskData) {
    // Convert Task | Task[] to proper ResponseData format
    const formattedTaskData = Array.isArray(taskData) ? { tasks: taskData as ResponseData[] } : taskData as ResponseData;
    const taskResult = createTaskAorpResponse(operation, message, formattedTaskData, _metadata);

    // Add transformation property for compatibility
    const mockOptimizedResponse = {
      success: true,
      operation,
      message,
      data: taskData,
      metadata: {
        timestamp: new Date().toISOString(),
      }
    };

    return {
      response: taskResult,
      transformation: {
        originalResponse: mockOptimizedResponse,
        context: {
          operation,
          success: true,
          dataSize: JSON.stringify(taskData).length,
          processingTime: 0,
          verbosity: 'standard',
          verbosityLevel: 'simple' as AorpVerbosityLevel,
          complexityFactors: {
            dataSize: JSON.stringify(taskData).length >= 1024,
            hasWarnings: false,
            hasErrors: false,
            isBulkOperation: false,
            isPartialSuccess: false,
            custom: {}
          }
        },
        metrics: {
          aorpProcessingTime: 0,
          totalTime: 0
        }
      }
    };
  }

  // Fallback for non-task data - convert TaskResponseData to ResponseData
  const responseData: ResponseData = {};

  // Copy task data if present
  if (_data.task) {
    responseData.tasks = [_data.task as Task]; // Convert from node-vikunja Task to our Task interface
  } else if (_data.tasks) {
    responseData.tasks = _data.tasks as Task[]; // Convert from node-vikunja Task[] to our Task[] interface
  }

  // Copy other properties
  Object.entries(_data).forEach(([key, value]) => {
    if (key !== 'task' && key !== 'tasks') {
      responseData[key] = value;
    }
  });

  const fallbackResult = createAorpResponse(operation, message, responseData, { success: true, metadata: _metadata });

  // Add transformation property for compatibility
  const mockOptimizedResponse = {
    success: true,
    operation,
    message,
    data: responseData,
    metadata: {
      timestamp: new Date().toISOString(),
    }
  };

  return {
    response: fallbackResult,
    transformation: {
      originalResponse: mockOptimizedResponse,
      context: {
        operation,
        success: true,
        dataSize: JSON.stringify(_data).length,
        processingTime: 0,
        verbosity: 'standard',
        verbosityLevel: 'simple' as AorpVerbosityLevel,
        complexityFactors: {
          dataSize: JSON.stringify(_data).length >= 1024,
          hasWarnings: false,
          hasErrors: false,
          isBulkOperation: false,
          isPartialSuccess: false,
          custom: {}
        }
      },
      metrics: {
        aorpProcessingTime: 0,
        totalTime: 0
      }
    }
  };
}

/**
 * Creates an AORP error response for task operations
 */
export function createTaskErrorResponse(
  operation: string,
  error: Error | Record<string, unknown>,
  metadata: TaskResponseMetadata = {
    timestamp: new Date().toISOString()
  }
): AorpFactoryResult {
  // Extract error message
  const errorMessage = error instanceof Error ? error.message :
    (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
      ? error.message
      : 'Unknown error occurred';
  const errorCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'UNKNOWN_ERROR';

  // Create simple error response
  const rawErrorResult = createAorpErrorResponse(operation, errorMessage, errorCode, {
    ...(metadata.sessionId && { sessionId: metadata.sessionId }),
    timestamp: metadata.timestamp,
  });

  // Convert to SimpleAorpResponse format
  const errorResult = {
    content: rawErrorResult.content,
    immediate: {
      status: 'error' as const,
      key_insight: errorMessage,
      confidence: 0.0
    },
    summary: errorMessage,
    metadata: {
      timestamp: rawErrorResult.metadata?.timestamp || new Date().toISOString(),
      operation,
      success: false,
      ...(rawErrorResult.metadata || {})
    }
  };

  // Add transformation property for compatibility
  const mockOptimizedResponse = {
    success: false,
    operation,
    message: errorMessage,
    data: { error: errorMessage },
    metadata: {
      timestamp: new Date().toISOString(),
    }
  };

  return {
    response: errorResult,
    transformation: {
      originalResponse: mockOptimizedResponse,
      context: {
        operation,
        success: false,
        dataSize: errorMessage.length,
        processingTime: 0,
        verbosity: 'standard',
        verbosityLevel: 'simple' as AorpVerbosityLevel,
        complexityFactors: {
          dataSize: errorMessage.length >= 1024,
          hasWarnings: false,
          hasErrors: true,
          isBulkOperation: false,
          isPartialSuccess: false,
          custom: {}
        },
        error: errorMessage
      },
      metrics: {
        aorpProcessingTime: 0,
        totalTime: 0
      }
    }
  };
}