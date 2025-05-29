/**
 * Standardized response formats for all MCP tools
 * Ensures consistency across all operations
 */

/**
 * Standard metadata included in all responses
 */
export interface ResponseMetadata {
  /** ISO timestamp of when the operation was performed */
  timestamp: string;
  /** Number of items affected/returned */
  count?: number;
  /** Fields that were modified (for update operations) */
  affectedFields?: string[];
  /** Previous state (for update operations) */
  previousState?: Record<string, unknown>;
  /** Additional context-specific metadata */
  [key: string]: unknown;
}

/**
 * Base response structure for all MCP tool operations
 */
export interface StandardResponse<T = unknown> {
  /** Whether the operation was successful */
  success: boolean;
  /** The operation that was performed */
  operation: string;
  /** Human-readable message about the operation result */
  message: string;
  /** The actual data returned by the operation */
  data: T;
  /** Metadata about the operation */
  metadata: ResponseMetadata;
}

/**
 * Standard error response structure
 */
export interface StandardErrorResponse {
  /** Always false for errors */
  success: false;
  /** The operation that failed */
  operation: string;
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Helper function to create a standard response
 */
export function createStandardResponse<T>(
  operation: string,
  message: string,
  data: T,
  metadata: Partial<ResponseMetadata> = {},
): StandardResponse<T> {
  return {
    success: true,
    operation,
    message,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  };
}

/**
 * Helper function to create a standard error response
 */
export function createErrorResponse(
  operation: string,
  message: string,
  code?: string,
  details?: Record<string, unknown>,
): StandardErrorResponse {
  const response: StandardErrorResponse = {
    success: false,
    operation,
    message,
  };

  if (code !== undefined) {
    response.code = code;
  }

  if (details !== undefined) {
    response.details = details;
  }

  return response;
}
