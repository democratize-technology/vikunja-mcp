/**
 * Centralized Error Handling Utilities
 * 
 * This module provides standardized error transformation and handling utilities
 * to eliminate code duplication and ensure consistent error patterns across the codebase.
 */

import { MCPError, ErrorCode } from '../types/errors';

/**
 * Type guard to check if an object has a statusCode property
 */
function hasStatusCode(error: unknown): error is { statusCode: number } {
  return error !== null && typeof error === 'object' && 'statusCode' in error;
}

/**
 * Standardized status code error handler
 * 
 * This utility handles the common pattern of checking statusCode and converting
 * 404 errors to NOT_FOUND, while passing other errors as API_ERROR.
 * 
 * @param error - The error object to check
 * @param operation - Description of the operation that failed (e.g., "get project", "delete task")
 * @param resourceId - Optional resource identifier for more specific error messages
 * @param customNotFoundMessage - Optional custom message for 404 errors (overrides auto-generation)
 * @returns MCPError with appropriate error code and message
 */
export function handleStatusCodeError(
  error: unknown,
  operation: string,
  resourceId?: string | number,
  customNotFoundMessage?: string
): MCPError {
  if (hasStatusCode(error) && error.statusCode === 404) {
    if (customNotFoundMessage) {
      return new MCPError(ErrorCode.NOT_FOUND, customNotFoundMessage);
    }
    
    const resourceInfo = resourceId ? ` with ID ${resourceId}` : '';
    // Extract resource type by removing common action verbs
    let resourceType = operation.replace(/^(get|update|delete|archive|unarchive|create|list)\s+/, '');
    
    // If the operation didn't have a space-separated resource type, use a default mapping
    if (resourceType === operation) {
      // Handle cases where operation is just the verb (like "get", "update")
      if (operation.includes('project')) {
        resourceType = 'project';
      } else if (operation.includes('task')) {
        resourceType = 'task';
      } else if (operation.includes('share')) {
        resourceType = 'share';
      } else if (operation.includes('label')) {
        resourceType = 'label';
      } else {
        // Fallback to generic resource
        resourceType = 'resource';
      }
    }
    
    return new MCPError(
      ErrorCode.NOT_FOUND,
      `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}${resourceInfo} not found`
    );
  }
  
  return new MCPError(
    ErrorCode.API_ERROR,
    `Failed to ${operation}: ${error instanceof Error ? error.message : 'Unknown error'}`
  );
}

/**
 * Transform any API error to a standardized MCPError
 * 
 * This utility provides consistent error transformation for all API operations.
 * It preserves MCPError instances and converts other errors to API_ERROR.
 * 
 * @param error - The error to transform
 * @param context - Context information about where the error occurred
 * @returns MCPError instance
 */
export function transformApiError(error: unknown, context: string): MCPError {
  // Re-throw existing MCPError instances to preserve their specific error codes
  if (error instanceof MCPError) {
    return error;
  }
  
  return new MCPError(
    ErrorCode.API_ERROR,
    `${context}: ${error instanceof Error ? error.message : 'Unknown error'}`
  );
}

/**
 * Wrap tool operation errors with consistent error handling
 * 
 * This utility provides a standard way to wrap tool operations with error handling,
 * ensuring authentication checks and consistent error transformation.
 * 
 * @param error - The error that occurred
 * @param toolName - Name of the tool (e.g., "vikunja_projects")
 * @param operation - Specific operation (e.g., "create project", "update task", "delete")
 * @param resourceId - Optional resource identifier
 * @param customNotFoundMessage - Optional custom message for 404 errors
 * @returns MCPError with appropriate context
 */
export function wrapToolError(
  error: unknown,
  toolName: string,
  operation: string,
  resourceId?: string | number,
  customNotFoundMessage?: string
): MCPError {
  // Preserve MCPError instances (validation errors, auth errors, etc.)
  if (error instanceof MCPError) {
    return error;
  }
  
  // Use status code handler for API errors with status codes
  if (hasStatusCode(error)) {
    return handleStatusCodeError(error, operation, resourceId, customNotFoundMessage);
  }
  
  // Generic API error for other cases
  return new MCPError(
    ErrorCode.API_ERROR,
    `${toolName}.${operation} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
  );
}

/**
 * Create a standardized error for authentication requirements
 *
 * @param operation - Optional context about what operation required authentication
 * @returns MCPError for authentication required scenarios with helpful next steps
 */
export function createAuthRequiredError(operation?: string): MCPError {
  const context = operation ? ` to ${operation}` : '';
  return new MCPError(
    ErrorCode.AUTH_REQUIRED,
    `Authentication required${context}. Please connect first:\n` +
    `vikunja_auth.connect({\n` +
    `  apiUrl: 'https://your-vikunja.com/api/v1',\n` +
    `  apiToken: 'your-api-token'\n` +
    `})\n\n` +
    `Get your API token from Vikunja Settings > API Access.`
  );
}

/**
 * Create a standardized error for validation failures
 * 
 * @param message - The validation error message
 * @returns MCPError for validation scenarios
 */
export function createValidationError(message: string): MCPError {
  return new MCPError(ErrorCode.VALIDATION_ERROR, message);
}

/**
 * Create a standardized error for internal server errors
 *
 * @param message - The error message
 * @param originalError - Optional original error for context
 * @returns MCPError for internal errors
 */
export function createInternalError(message: string, originalError?: unknown): MCPError {
  const errorMessage = originalError instanceof Error
    ? `${message}: ${originalError.message}`
    : message;

  return new MCPError(ErrorCode.INTERNAL_ERROR, errorMessage);
}

/**
 * Transform generic fetch errors into helpful authentication guidance
 *
 * This function catches common "fetch failed" errors that usually indicate
 * authentication or connectivity issues and provides actionable guidance.
 *
 * @param error - The original error
 * @param operation - Context about what operation failed
 * @returns MCPError with helpful authentication guidance
 */
export function handleFetchError(error: unknown, operation: string): MCPError {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Detect common authentication-related fetch failures
  if (
    errorMessage.includes('fetch failed') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('401') ||
    errorMessage.includes('403')
  ) {
    return new MCPError(
      ErrorCode.AUTH_REQUIRED,
      `Failed to ${operation}. This usually means authentication is needed.\n\n` +
      `Please check:\n` +
      `1. You're connected: vikunja_auth.connect({ apiUrl: '...', apiToken: '...' })\n` +
      `2. Your API token is valid and has permissions\n` +
      `3. The API URL is correct and accessible\n\n` +
      `Get help: vikunja_auth.status()`
    );
  }

  // For other fetch errors, provide network troubleshooting
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('TIMEOUT') ||
    errorMessage.includes('ETIMEDOUT')
  ) {
    return new MCPError(
      ErrorCode.API_ERROR,
      `Request timeout while trying to ${operation}. Please check:\n` +
      `1. Network connection is stable\n` +
      `2. Vikunja server is accessible\n` +
      `3. Try again in a few moments`
    );
  }

  // Default error transformation
  return new MCPError(
    ErrorCode.API_ERROR,
    `Failed to ${operation}: ${errorMessage}`
  );
}