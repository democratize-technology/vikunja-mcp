/**
 * Testable AuthManager Interface
 * Extends AuthManager with testing-specific functionality for secure test environments
 */

import type { AuthSession } from '../types/index';
import type { AuthManager } from './AuthManager';

/**
 * Interface defining testing-specific methods for AuthManager
 * This interface should only be used in test environments
 */
export interface ITestableAuthManager {
  /**
   * Set user ID for test scenarios
   * @param userId - User ID to set in the current session
   * @throws MCPError if not authenticated
   */
  setTestUserId(userId: string): void;

  /**
   * Set token expiry for test scenarios  
   * @param expiry - Token expiry date to set in the current session
   * @throws MCPError if not authenticated
   */
  setTestTokenExpiry(expiry: Date): void;

  /**
   * Get user ID from current session for testing
   * @returns User ID if set, undefined otherwise
   * @throws MCPError if not authenticated
   */
  getTestUserId(): string | undefined;

  /**
   * Get token expiry from current session for testing
   * @returns Token expiry if set, undefined otherwise
   * @throws MCPError if not authenticated
   */
  getTestTokenExpiry(): Date | undefined;

  /**
   * Update session properties in a controlled manner for testing
   * @param updates - Partial session updates (only userId and tokenExpiry allowed)
   * @throws MCPError if not authenticated or invalid property is provided
   */
  updateSessionProperty(updates: Pick<AuthSession, 'userId' | 'tokenExpiry'>): void;
}

/**
 * Combined interface for AuthManager with testing capabilities
 * Use this type in tests that need both production and testing methods
 */
export interface TestableAuthManager extends AuthManager, ITestableAuthManager {}