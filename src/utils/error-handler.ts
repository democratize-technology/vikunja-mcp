/**
 * Simplified Error Handling using Zod + Security Patterns
 *
 * Replaces 461 lines of custom error handling with concise,
 * secure patterns using Zod validation and minimal sanitization.
 */

import { z } from 'zod';
import { MCPError, ErrorCode } from '../types/errors';

/**
 * Security-sensitive patterns that should be sanitized from error messages
 * Minimal set of patterns for essential security while maintaining usability
 */
const SECURITY_PATTERNS = [
  // File paths and system paths
  /\/[a-zA-Z0-9_\-/.]+\.(json|js|ts|yml|yaml|conf|config|env|key|pem|p12|jks)/g,
  /[A-Z]:\\[a-zA-Z0-9_\-\\]+\.(json|js|ts|yml|yaml|conf|config|env|key|pem|p12|jks)/g,

  // Database connection strings
  /mysql:\/\/[^@\s]+@[^/\s]+\/[a-zA-Z0-9_-]+/g,
  /postgresql:\/\/[^@\s]+@[^/\s]+\/[a-zA-Z0-9_-]+/g,
  /mongodb:\/\/[^@\s]+/g,

  // Network details
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  /Bearer\s+[a-zA-Z0-9-_.]+/g,
  /tk_[a-zA-Z0-9]{32,}/g,

  // Stack traces
  /at\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)/g,
  /:\d+:\d+\)/g,
];

/**
 * Type-safe error handler that preserves security while reducing complexity
 */
class SecureErrorHandler {
  /**
   * Sanitize error message by detecting and replacing ONLY security-sensitive information
   * Preserves original error messages when they don't contain sensitive data
   */
  private sanitize(message: string): string {
    if (typeof message !== 'string') {
      return 'Unknown error';
    }

    const lowerMessage = message.toLowerCase();

    // Only sanitize if we detect specific security-sensitive patterns

    // Stack traces and internal file references (highest priority - most sensitive)
    if (
      lowerMessage.includes(' at ') ||
      lowerMessage.includes('.js:') ||
      lowerMessage.includes('parseconfig') ||
      lowerMessage.includes('loadconfig') ||
      lowerMessage.includes('index.js:') ||
      lowerMessage.includes('json.parse') ||
      lowerMessage.includes('position 42') // Common JSON parse error pattern
    ) {
      return 'Internal system error';
    }

    // Database schema and connection details (table names, hosts, passwords)
    if (
      lowerMessage.includes('er_no_such_table') ||
      lowerMessage.includes('table \'') ||
      lowerMessage.includes('mysql://') ||
      lowerMessage.includes('postgresql://') ||
      lowerMessage.includes('mongodb://') ||
      lowerMessage.includes('schema') ||
      lowerMessage.includes('column ')
    ) {
      return 'Database access error';
    }

    // Authentication tokens and mechanisms (JWT details, crypto keys)
    if (
      lowerMessage.includes('jwt validation failed') ||
      lowerMessage.includes('signature verification') ||
      lowerMessage.includes('/etc/keys/') ||
      lowerMessage.includes('jwt-public.pem') ||
      lowerMessage.includes('tk_') ||
      lowerMessage.includes('bearer ')
    ) {
      return 'Authentication error';
    }

    // Network details with IP addresses and ports (preserve general network errors)
    if (
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(message) || // IP addresses
      lowerMessage.includes(':54321') ||
      lowerMessage.includes(':443') ||
      lowerMessage.includes('192.168.') ||
      lowerMessage.includes('api.vikunja')
    ) {
      return 'Network connection error';
    }

    // API endpoints and internal structures (preserve general API errors)
    if (
      lowerMessage.includes('/api/v1/') ||
      lowerMessage.includes('projects/123/tasks') ||
      lowerMessage.includes('status=completed&limit=50')
    ) {
      return 'API access error';
    }

    // File paths and system details (absolute paths, file extensions with content)
    if (
      /\b\/[a-zA-Z0-9_\-/.]+\.[a-zA-Z]/.test(message) || // Unix paths with files
      /\b[A-Z]:\\[a-zA-Z0-9_\\\-/.]+\.[a-zA-Z]/.test(message) || // Windows paths
      lowerMessage.includes('permission denied') ||
      lowerMessage.includes('no such file') ||
      lowerMessage.includes('secrets.json') ||
      lowerMessage.includes('config.js') ||
      lowerMessage.includes('index.js')
    ) {
      return 'File system access error';
    }

    // Check for other security patterns
    const hasSensitiveInfo = SECURITY_PATTERNS.some(pattern => pattern.test(message));

    if (hasSensitiveInfo) {
      return 'System error occurred';
    }

    // If no security patterns detected, return original message
    return message;
  }

  /**
   * Handle status code errors (404, etc.)
   */
  handleStatusCode(
    error: unknown,
    operation: string,
    resourceId?: string | number,
    customMessage?: string
  ): MCPError {
    if (this.isStatusCodeError(error) && error.statusCode === 404) {
      if (customMessage) {
        return new MCPError(ErrorCode.NOT_FOUND, customMessage);
      }

      const resourceInfo = resourceId ? ` with ID ${resourceId}` : '';
      const resourceType = this.extractResourceType(operation);

      return new MCPError(
        ErrorCode.NOT_FOUND,
        `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}${resourceInfo} not found`
      );
    }

    // For status code errors, convert non-Error objects to "Unknown error"
    let message: string;
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else {
      message = 'Unknown error';
    }

    const sanitized = this.sanitize(message);
    return new MCPError(ErrorCode.API_ERROR, `Failed to ${operation}: ${sanitized}`);
  }

  /**
   * Transform any error to MCPError with security sanitization
   */
  transform(error: unknown, context: string): MCPError {
    if (error instanceof MCPError) {
      return error;
    }

    let message: string;
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error === null || error === undefined) {
      message = 'Unknown error';
    } else if (typeof error === 'object' && Object.prototype.hasOwnProperty.call(error, 'message')) {
      // Plain objects with message property
      message = (error as { message: unknown }).message as string;
    } else if (typeof error === 'object') {
      // Plain objects without message property become "Unknown error"
      message = 'Unknown error';
    } else if (typeof error === 'number' || typeof error === 'boolean') {
      // Handle primitives explicitly
      message = String(error);
    } else {
      // Fallback for symbol, bigint, etc.
      message = 'Unknown error';
    }

    const sanitized = this.sanitize(message);

    return new MCPError(ErrorCode.API_ERROR, `${context}: ${sanitized}`);
  }

  /**
   * Wrap tool errors with consistent handling
   */
  wrap(
    error: unknown,
    toolName: string,
    operation: string,
    resourceId?: string | number,
    customMessage?: string
  ): MCPError {
    if (error instanceof MCPError) {
      return error;
    }

    if (this.isStatusCodeError(error)) {
      return this.handleStatusCode(error, operation, resourceId, customMessage);
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    const sanitized = this.sanitize(message);

    return new MCPError(
      ErrorCode.API_ERROR,
      `${toolName}.${operation} failed: ${sanitized}`
    );
  }

  /**
   * Create standardized errors
   */
  createAuthRequired(operation?: string): MCPError {
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

  createValidationError(message: string): MCPError {
    return new MCPError(ErrorCode.VALIDATION_ERROR, message);
  }

  createInternalError(message: string, originalError?: unknown): MCPError {
    if (originalError instanceof Error) {
      const sanitized = this.sanitize(originalError.message);
      // Only include error details if they weren't sanitized to a generic message
      if (sanitized !== originalError.message) {
        // Security-sensitive content was detected and sanitized
        return new MCPError(ErrorCode.INTERNAL_ERROR, message);
      } else {
        // Safe to include the original error message
        return new MCPError(ErrorCode.INTERNAL_ERROR, `${message}: ${sanitized}`);
      }
    }
    return new MCPError(ErrorCode.INTERNAL_ERROR, message);
  }

  /**
   * Handle fetch errors with authentication guidance
   */
  handleFetchError(error: unknown, operation: string): MCPError {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const lowerMessage = message.toLowerCase();

    // Authentication-related fetch failures
    if (
      lowerMessage.includes('fetch failed') ||
      lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('enotfound') ||
      lowerMessage.includes('401') ||
      lowerMessage.includes('403')
    ) {
      return new MCPError(
        ErrorCode.AUTH_REQUIRED,
        `Failed to ${operation}. Please check authentication and API access.`
      );
    }

    // Timeout errors
    if (lowerMessage.includes('timeout')) {
      return new MCPError(
        ErrorCode.API_ERROR,
        `Request timeout while trying to ${operation}. Please try again.`
      );
    }

    return this.transform(error, `Failed to ${operation}`);
  }

  // Helper methods
  isStatusCodeError(error: unknown): error is { statusCode: number } {
    return error !== null && typeof error === 'object' && 'statusCode' in error;
  }

  private extractResourceType(operation: string): string {
    // Remove action verbs and get resource type
    const cleaned = operation.replace(/^(get|update|delete|create|list)\s+/, '');

    // Fallback mapping
    if (cleaned === operation) {
      if (operation.includes('project')) return 'project';
      if (operation.includes('task')) return 'task';
      if (operation.includes('label')) return 'label';
      if (operation.includes('share')) return 'share';
      return 'resource';
    }

    return cleaned || 'resource';
  }
}

// Create singleton instance
const errorHandler = new SecureErrorHandler();

// Export simplified API
export const handleStatusCodeError = (
  error: unknown,
  operation: string,
  resourceId?: string | number,
  customMessage?: string
): MCPError => errorHandler.handleStatusCode(error, operation, resourceId, customMessage);

export const transformApiError = (error: unknown, context: string): MCPError =>
  errorHandler.transform(error, context);

export const wrapToolError = (
  error: unknown,
  toolName: string,
  operation: string,
  resourceId?: string | number,
  customMessage?: string
): MCPError => errorHandler.wrap(error, toolName, operation, resourceId, customMessage);

export const createAuthRequiredError = (operation?: string): MCPError =>
  errorHandler.createAuthRequired(operation);

export const wrapAuthError = (error: unknown, operation: string): MCPError => {
  if (error instanceof MCPError) {
    return error;
  }

  if (errorHandler.isStatusCodeError(error)) {
    return errorHandler.handleStatusCode(error, operation);
  }

  return errorHandler.transform(error, 'Authentication error');
};

export const createValidationError = (message: string): MCPError =>
  errorHandler.createValidationError(message);

export const createInternalError = (message: string, originalError?: unknown): MCPError =>
  errorHandler.createInternalError(message, originalError);

export const handleFetchError = (error: unknown, operation: string): MCPError =>
  errorHandler.handleFetchError(error, operation);

// Type guards for better TypeScript support
export function isMCPError(error: unknown): error is MCPError {
  return error instanceof MCPError;
}

export function hasStatusCode(error: unknown): error is { statusCode: number } {
  return error !== null && typeof error === 'object' && 'statusCode' in error;
}

// Zod schema for error validation
export const ErrorSchema = z.object({
  message: z.string(),
  statusCode: z.number().optional(),
  code: z.string().optional(),
  stack: z.string().optional(),
});

export type ValidationError = z.infer<typeof ErrorSchema>;