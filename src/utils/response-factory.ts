/**
 * Simple Response Factory
 * Replaces 2,925-line AORP system with clean, direct response formatting
 */

import { createSuccessResponse, createErrorResponse, formatMcpResponse, type SimpleResponse } from './simple-response';
import type { ResponseMetadata } from '../types/responses';
import type { ResponseData } from '../types/index';

/**
 * Simple response metadata
 */
export interface SimpleResponseMetadata {
  /** Processing information */
  processing?: {
    /** Processing time in ms */
    processingTimeMs?: number;
    /** Operation context */
    operation?: string;
  };
  /** Timestamp */
  timestamp?: string;
  /** Success flag */
  success?: boolean;
  /** Error information */
  error?: {
    code: string;
    message: string;
  };
  /** Session ID */
  sessionId?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Create a simple response (replaces createAorpResponse)
 * Direct replacement for AORP factory functions
 */
export function createSimpleResponse(
  operation: string,
  message: string,
  data?: ResponseData,
  options?: {
    success?: boolean;
    metadata?: ResponseMetadata;
    processingTimeMs?: number;
  }
): SimpleResponse {
  const { success = true, metadata, processingTimeMs } = options || {};

  if (success) {
    return createSuccessResponse(operation, message, data, {
      timestamp: new Date().toISOString(),
      success,
      operation,
      ...metadata,
    });
  } else {
    return createErrorResponse(operation, message, 'OPERATION_FAILED', {
      timestamp: new Date().toISOString(),
      success: false,
      operation,
      ...metadata,
    });
  }
}

/**
 * Format response for MCP (replaces AORP formatting)
 */
export function formatResponseForMcp(response: SimpleResponse): string {
  return response.content;
}

/**
 * Create task response (replaces createTaskResponse)
 * Now handles flexible data for backward compatibility
 */
export function createTaskResponse(
  operation: string,
  message: string,
  data: { tasks?: ResponseData[] } | ResponseData,
  metadata?: ResponseMetadata,
  sessionId?: string
): SimpleResponse {
  // Handle both task data structure and arbitrary data objects
  const responseData = data && typeof data === 'object' && 'tasks' in data ? data.tasks : data;

  const responseMetadata: ResponseMetadata = {
    timestamp: new Date().toISOString(),
    success: true,
    operation,
    ...metadata,
  };

  if (sessionId !== undefined) {
    responseMetadata.sessionId = sessionId;
  }

  return createSuccessResponse(operation, message, responseData as ResponseData, responseMetadata);
}

/**
 * Create error response (replaces createAorpErrorResponse)
 */
export function createSimpleErrorResponse(
  operation: string,
  message: string,
  errorCode: string = 'UNKNOWN_ERROR',
  metadata?: ResponseMetadata
) {
  return createErrorResponse(operation, message, errorCode, metadata);
}

// Legacy exports for backward compatibility
export { createTaskResponse as createStandardResponse };
export { createTaskResponse as createTaskAorpResponse };
export { createSimpleErrorResponse as createAorpErrorResponse };
export { formatResponseForMcp as formatAorpAsMarkdown };

// Additional AORP compatibility exports
export { createSimpleResponse as createAorpResponse };

// Export SimpleResponse type for external use
export type { SimpleResponse } from './simple-response';

/**
 * Create AORP response from data (compatibility function)
 * Simple replacement for createAorpFromData
 */
export function createAorpFromData(
  operation: string,
  message: string,
  success: boolean = true,
  details?: string
) {
  return createSimpleResponse(operation, details || message, undefined, { success });
}

// AORP compatibility types (inline to avoid external dependencies)
export interface AorpBuilderConfig {
  confidenceMethod?: string;
  enableCaching?: boolean;
  maxCacheSize?: number;
  [key: string]: unknown;
}

export type AorpVerbosityLevel = 'minimal' | 'standard' | 'detailed';

export interface ComplexityFactors {
  dataComplexity: number;
  nestingLevel: number;
  itemCount: number;
  hasNestedArrays: boolean;
}