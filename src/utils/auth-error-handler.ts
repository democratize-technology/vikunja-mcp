/**
 * Authentication Error Handler
 * Provides consistent handling of authentication errors across all tools
 */

import { MCPError, ErrorCode } from '../types/index';
import { logger } from './logger';

/**
 * Check if an error is authentication-related
 */
export function isAuthenticationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();
  return (
    errorMessage.includes('token') ||
    errorMessage.includes('auth') ||
    errorMessage.includes('401') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('forbidden') ||
    errorMessage.includes('403')
  );
}

/**
 * Check if an error is specifically a JWT expiration error
 */
export function isJWTExpiredError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();
  return (
    errorMessage.includes('token expired') ||
    errorMessage.includes('jwt expired') ||
    errorMessage.includes('exp claim') ||
    (errorMessage.includes('token') && errorMessage.includes('expired'))
  );
}

/**
 * Create a detailed authentication error message based on the operation
 */
export function createAuthErrorMessage(operation: string, originalError: string): string {
  const knownIssues: Record<string, string> = {
    user:
      'User endpoint authentication error. This is a known Vikunja API limitation. ' +
      'User endpoints require JWT authentication instead of API tokens. ' +
      'To use user operations, connect with a JWT token (starting with eyJ).',
    bulk:
      'Bulk operations may have authentication issues with certain Vikunja API versions. ' +
      'This is a known limitation. Consider using individual operations instead.',
    labels:
      'Label operations may have authentication issues with certain Vikunja API versions. ' +
      'This is a known limitation. Try updating the task without labels first.',
    assignees:
      'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
      'This is a known limitation. Try updating the task without assignees first.',
  };

  // Determine the type of operation
  let operationType = 'default';
  if (operation.includes('user')) {
    operationType = 'user';
  } else if (operation.includes('bulk')) {
    operationType = 'bulk';
  } else if (operation.includes('label')) {
    operationType = 'labels';
  } else if (operation.includes('assignee')) {
    operationType = 'assignees';
  }

  return (
    knownIssues[operationType] ||
    `Authentication error during ${operation}: ${originalError}. ` +
      'Please verify your API token is valid and has the necessary permissions.'
  );
}

/**
 * Handle authentication errors consistently
 */
export function handleAuthError(
  error: unknown,
  operation: string,
  fallbackMessage?: string,
): never {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  logger.debug('Auth error detected during %s: %s', operation, errorMessage);

  // Check for JWT expiration first (more specific error)
  if (isJWTExpiredError(error)) {
    logger.warn('JWT token expired during %s operation', operation);
    throw new MCPError(
      ErrorCode.AUTH_REQUIRED,
      `JWT token has expired. Please reconnect with a fresh JWT token:\n` +
      `1. Log into Vikunja in your browser\n` +
      `2. Open DevTools → Application → Local Storage\n` +
      `3. Copy the new JWT token\n` +
      `4. Run: vikunja_auth.connect with the new token`,
    );
  }

  if (isAuthenticationError(error)) {
    logger.warn('Authentication error during %s: %s', operation, errorMessage);
    throw new MCPError(ErrorCode.API_ERROR, createAuthErrorMessage(operation, errorMessage));
  }

  // If not an auth error, throw the original error
  logger.debug('Non-auth error during %s: %s', operation, errorMessage);
  throw new MCPError(
    ErrorCode.API_ERROR,
    fallbackMessage || `${operation} failed: ${errorMessage}`,
  );
}
