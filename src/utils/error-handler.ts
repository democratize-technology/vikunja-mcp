/**
 * Centralized Error Handling Utilities
 * 
 * This module provides standardized error transformation and handling utilities
 * to eliminate code duplication and ensure consistent error patterns across the codebase.
 */

import { MCPError, ErrorCode } from '../types/errors';

/**
 * Error message categories for security handling
 */
enum ErrorCategory {
  SAFE = 'safe',                    // Safe to expose to users
  INTERNAL = 'internal',            // Contains sensitive internal info
  NETWORK = 'network',              // Network/system details
  DATABASE = 'database',            // Database schema/connection info
  FILESYSTEM = 'filesystem',        // File paths and system details
  AUTHENTICATION = 'authentication', // Auth mechanism details
}

/**
 * Security-sensitive patterns that should be sanitized from error messages
 */
const SENSITIVE_PATTERNS = [
  // File paths (Unix and Windows)
  /\/[a-zA-Z0-9_\-/.]+\.(json|js|ts|yml|yaml|conf|config|env|key|pem|p12|jks)/g,
  /[A-Z]:\\[a-zA-Z0-9_\-\\]+\.(json|js|ts|yml|yaml|conf|config|env|key|pem|p12|jks)/g,
  /\/[a-zA-Z0-9_\-/]+\/(src|lib|bin|config|etc|var|tmp|home|users)/g,

  // Database connection strings and schema
  /mysql:\/\/[^@\s]+@[^/\s]+\/[a-zA-Z0-9_-]+/g,
  /postgresql:\/\/[^@\s]+@[^/\s]+\/[a-zA-Z0-9_-]+/g,
  /mongodb:\/\/[^@\s]+/g,
  /Table\s+[`'"]?[a-zA-Z0-9_-]+[`'"]?\.[`'"]?[a-zA-Z0-9_-]+[`'"]?/g,
  /ER_[A-Z_]+:/g,

  // Network details (IP addresses, ports)
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  /:\d{1,5}\b/g,
  /[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/g, // MAC addresses

  // Authentication and security details
  /JWT\s+validation\s+failed/gi,
  /signature\s+verification\s+error/gi,
  /token\s+(expired|invalid|revoked)/gi,
  /Bearer\s+[a-zA-Z0-9-_.]+/g,
  /tk_[a-zA-Z0-9]{32,}/g,

  // Stack traces and internal system details
  /at\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)/g,
  /:\d+:\d+\)/g,
  /\([^)]+\.js:\d+:\d+\)/g,
  /JSON\.parse/gi,
  /node_modules/g,

  // API endpoints and parameters
  /https?:\/\/[a-zA-Z0-9-.]+\/api\/[a-zA-Z0-9-/?=&.%]+/g,
  /\?[a-zA-Z0-9-_=&]+/g,
];

/**
 * Generic, security-safe error messages for different error types
 */
const SAFE_ERROR_MESSAGES = {
  [ErrorCategory.INTERNAL]: 'Internal system error',
  [ErrorCategory.NETWORK]: 'Network connection error',
  [ErrorCategory.DATABASE]: 'Database access error',
  [ErrorCategory.FILESYSTEM]: 'File system access error',
  [ErrorCategory.AUTHENTICATION]: 'Authentication system error',
  [ErrorCategory.SAFE]: '', // Use original message for safe errors
};

/**
 * Categorize an error message based on its content
 */
function categorizeError(errorMessage: string): ErrorCategory {
  const lowerMessage = errorMessage.toLowerCase();

  // Check for database errors first (most specific)
  if (lowerMessage.includes('database') ||
      lowerMessage.includes('mysql') ||
      lowerMessage.includes('postgresql') ||
      lowerMessage.includes('mongodb') ||
      lowerMessage.includes('table') ||
      lowerMessage.includes('column') ||
      lowerMessage.includes('er_') ||
      (lowerMessage.includes('connection') && lowerMessage.includes('database'))) {
    return ErrorCategory.DATABASE;
  }

  // Check for internal system errors before authentication (to catch parse errors)
  if (lowerMessage.includes('stack') ||
      lowerMessage.includes('parse') ||
      lowerMessage.includes('syntax') ||
      lowerMessage.includes('type error') ||
      lowerMessage.includes('reference error') ||
      lowerMessage.includes('unexpected token') ||
      errorMessage.includes('at ') ||
      errorMessage.includes('.js:')) {
    return ErrorCategory.INTERNAL;
  }

  // Check for authentication errors
  if (lowerMessage.includes('jwt') ||
      lowerMessage.includes('token') ||
      lowerMessage.includes('authentication') ||
      lowerMessage.includes('authorization') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('forbidden') ||
      lowerMessage.includes('signature')) {
    return ErrorCategory.AUTHENTICATION;
  }

  // Check for network errors
  if (lowerMessage.includes('timeout') ||
      lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('enotfound') ||
      lowerMessage.includes('etimedout') ||
      lowerMessage.includes('fetch failed') ||
      lowerMessage.includes('connect') ||
      errorMessage.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)) {
    return ErrorCategory.NETWORK;
  }

  
  // Check for file system related errors last (most generic)
  if (SENSITIVE_PATTERNS.some(pattern => pattern.test(errorMessage)) ||
      lowerMessage.includes('permission denied') ||
      lowerMessage.includes('no such file') ||
      lowerMessage.includes('file not found') ||
      lowerMessage.includes('directory')) {
    return ErrorCategory.FILESYSTEM;
  }

  // If no sensitive patterns detected, consider it safe
  return ErrorCategory.SAFE;
}

/**
 * Check if an error message actually contains sensitive information that needs sanitization
 */
function containsSensitiveInfo(errorMessage: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(errorMessage)) ||
         errorMessage.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/) !== null ||
         errorMessage.includes('/') && errorMessage.includes('\\') ||
         errorMessage.includes('mysql://') ||
         errorMessage.includes('postgresql://') ||
         errorMessage.includes('mongodb://') ||
         errorMessage.includes('jwt') ||
         errorMessage.includes('signature') ||
         errorMessage.includes('stack') ||
         errorMessage.includes('.js:');
}

/**
 * Sanitize an error message by removing sensitive information
 */
function sanitizeErrorMessage(errorMessage: string): string {
  const category = categorizeError(errorMessage);

  // If the message is safe, return it as-is
  if (category === ErrorCategory.SAFE) {
    return errorMessage;
  }

  // If it's categorized as sensitive but doesn't actually contain sensitive patterns, preserve it
  if (!containsSensitiveInfo(errorMessage)) {
    return errorMessage;
  }

  // For security-sensitive categories with actual sensitive info, return a generic safe message
  const safeMessage = SAFE_ERROR_MESSAGES[category];

  // Try to preserve some useful context while removing sensitive details
  let sanitized = errorMessage;

  // Remove sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // If after sanitization we still have sensitive content, use generic message
  if (sanitized !== errorMessage && sanitized.length > 0) {
    // Check if we can provide a slightly more specific safe message
    if (sanitized.includes('permission') || sanitized.includes('access')) {
      return 'Access denied';
    }
    if (sanitized.includes('not found')) {
      return 'Resource not found';
    }
    if (sanitized.includes('invalid')) {
      return 'Invalid data provided';
    }
  }

  return safeMessage;
}

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
  
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const sanitizedMessage = sanitizeErrorMessage(errorMessage);

  return new MCPError(
    ErrorCode.API_ERROR,
    `Failed to ${operation}: ${sanitizedMessage}`
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
  
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const sanitizedMessage = sanitizeErrorMessage(errorMessage);

  return new MCPError(
    ErrorCode.API_ERROR,
    `${context}: ${sanitizedMessage}`
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
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const sanitizedMessage = sanitizeErrorMessage(errorMessage);

  return new MCPError(
    ErrorCode.API_ERROR,
    `${toolName}.${operation} failed: ${sanitizedMessage}`
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
  if (originalError instanceof Error) {
    const sanitizedMessage = sanitizeErrorMessage(originalError.message);
    // If the sanitized message is just a generic category, prefer the provided message
    if (Object.values(SAFE_ERROR_MESSAGES).includes(sanitizedMessage)) {
      return new MCPError(ErrorCode.INTERNAL_ERROR, message);
    }
    return new MCPError(ErrorCode.INTERNAL_ERROR, `${message}: ${sanitizedMessage}`);
  }

  return new MCPError(ErrorCode.INTERNAL_ERROR, message);
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
  const sanitizedMessage = sanitizeErrorMessage(errorMessage);
  return new MCPError(
    ErrorCode.API_ERROR,
    `Failed to ${operation}: ${sanitizedMessage}`
  );
}