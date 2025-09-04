/**
 * Authentication Error Handler
 * Provides consistent handling of authentication errors across all tools
 */

import { MCPError, ErrorCode } from '../types/index';
import { logger } from './logger';

/**
 * Check if an error is authentication-related using structured error classification
 * This replaces unsafe string-based classification to prevent false positives
 */
export function isAuthenticationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Layer 1: Check structured error properties (most reliable)
  const errorWithStatus = error as Error & { status?: number; response?: { status?: number } };
  
  // Check for HTTP status codes as numbers (not strings)
  if (errorWithStatus.status === 401 || errorWithStatus.status === 403) {
    return true;
  }
  
  // Check for Axios-style errors with response.status
  if (errorWithStatus.response?.status === 401 || errorWithStatus.response?.status === 403) {
    return true;
  }

  // Layer 2: Precise pattern matching for error messages (avoid false positives)
  const errorMessage = error.message.toLowerCase();
  
  // Use regex patterns for exact matching instead of substring matching
  // Trim and normalize the message first
  const normalizedMessage = errorMessage.trim();
  
  const authErrorPatterns = [
    /^unauthorized[!.]*$/i,        // "unauthorized" with optional punctuation
    /^forbidden[!.]*$/i,          // "forbidden" with optional punctuation
    /^unauthorized\s+\w+[!.]*$/i, // "unauthorized" + single word with optional punctuation
    /^forbidden\s+\w+[!.]*$/i,    // "forbidden" + single word with optional punctuation
    /^\w+\s+forbidden[!.]*$/i,    // single word + "forbidden" with optional punctuation
    /^\w+\s+unauthorized[!.]*$/i, // single word + "unauthorized" with optional punctuation
    /\bauthentication\s+failed\b/i, // "authentication failed" as phrase
    /\bauthentication\s+required\b/i, // "authentication required" as phrase
    /\bnot\s+authenticated\b/i,   // "not authenticated" as phrase
    /\binvalid\s+token\b/i,       // "invalid token" as phrase
    /\btoken\s+invalid\b/i,       // "token invalid" as phrase
    /\btoken\s+expired\b/i,       // "token expired" as phrase (for auth detection)
    /\baccess\s+denied\b/i,       // "access denied" as phrase
    /\bauth\s+failed\b/i,         // "auth failed" as phrase
    /\bauth_required\b/i,         // "auth_required" pattern
    /\btoken_invalid\b/i,         // "token_invalid" pattern
    /^401\b/,                   // HTTP status at start of message
    /^403\b/,                   // HTTP status at start of message
    /\berror:\s*401\b/i,          // "Error: 401" pattern
    /\berror:\s*403\b/i           // "Error: 403" pattern
  ];
  
  return authErrorPatterns.some(pattern => pattern.test(normalizedMessage));
}

/**
 * Check if an error is specifically a JWT expiration error using precise pattern matching
 * This replaces unsafe substring matching to prevent false positives
 */
export function isJWTExpiredError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Check for known JWT library error codes or properties
  const errorWithCode = error as Error & { code?: string; name?: string };
  
  // Check for specific JWT library error codes
  if (errorWithCode.code === 'TokenExpiredError' || errorWithCode.name === 'TokenExpiredError') {
    return true;
  }

  // Use precise regex patterns for JWT expiration messages
  const errorMessage = error.message.toLowerCase();
  
  const jwtExpirationPatterns = [
    /\btoken\s+expired\b/,           // "token expired" as phrase
    /\bjwt\s+expired\b/,             // "jwt expired" as phrase
    /\bexp\s+claim\b/,               // "exp claim" for JWT exp validation
    /\btoken\s+has\s+expired\b/,     // "token has expired"
    /\bjwt\s+has\s+expired\b/,       // "jwt has expired"
    /\bexpired\s+token\b/,           // "expired token"
    /\bexpired\s+jwt\b/              // "expired jwt"
  ];
  
  return jwtExpirationPatterns.some(pattern => pattern.test(errorMessage));
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
