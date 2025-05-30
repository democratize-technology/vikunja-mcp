/**
 * Base operation types for consistent request/response handling across all operations
 */

/**
 * Base request interface that all operation requests extend
 */
export interface BaseOperationRequest {
  /** The operation being performed */
  operation: string;
  /** Optional timestamp for when the request was created */
  timestamp?: string;
}

/**
 * Base response interface that all operation responses extend
 * @template T The type of data returned by the operation
 */
export interface BaseOperationResponse<T = unknown> {
  /** Whether the operation was successful */
  success: boolean;
  /** The operation that was performed */
  operation: string;
  /** Human-readable message about the operation result */
  message: string;
  /** The actual data returned by the operation */
  data?: T;
  /** Metadata about the operation */
  metadata: OperationMetadata;
  /** Error details if the operation failed */
  error?: OperationError;
}

/**
 * Standard metadata included in all operation responses
 */
export interface OperationMetadata {
  /** ISO timestamp of when the operation completed */
  timestamp: string;
  /** Additional metadata fields specific to each operation */
  [key: string]: unknown;
}

/**
 * Standard error structure for failed operations
 */
export interface OperationError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: unknown;
}

/**
 * Metadata for paginated responses
 */
export interface PaginatedMetadata {
  /** Current page number (1-based) */
  page: number;
  /** Number of items per page */
  perPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Total number of items across all pages */
  totalItems: number;
  /** Whether there is a next page */
  hasNext: boolean;
  /** Whether there is a previous page */
  hasPrevious: boolean;
}

/**
 * Result structure for bulk operations
 * @template T The type of successfully processed items
 */
export interface BulkOperationResult<T> {
  /** Items that were successfully processed */
  successful: T[];
  /** Items that failed to process */
  failed: BulkOperationFailure[];
}

/**
 * Information about a failed item in a bulk operation
 */
export interface BulkOperationFailure {
  /** The item that failed to process */
  item: unknown;
  /** Error message explaining why it failed */
  error: string;
  /** Index of the item in the original request array */
  index?: number;
}