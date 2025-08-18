/**
 * AuthManager Test Utilities
 * Provides testing functionality for AuthManager in a secure, test-only environment
 */

import type { AuthSession } from '../types/index';
import { MCPError, ErrorCode } from '../types/index';
import { AuthManager } from './AuthManager';
import type { ITestableAuthManager, TestableAuthManager } from './TestableAuthManager';

/**
 * Test utility class that extends AuthManager with testing methods
 * This class should ONLY be used in test environments
 * 
 * Security Note: This class implements testing methods that allow direct
 * session manipulation. It should never be accessible in production builds.
 */
class AuthManagerTestUtilsImpl extends AuthManager implements ITestableAuthManager {
  /**
   * Set user ID for test scenarios
   * @param userId - User ID to set in the current session
   * @throws MCPError if not authenticated
   */
  setTestUserId(userId: string): void {
    if (!this.isAuthenticated()) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    const session = this.getSession();
    session.userId = userId;
    this.saveSession(session);
  }

  /**
   * Set token expiry for test scenarios  
   * @param expiry - Token expiry date to set in the current session
   * @throws MCPError if not authenticated
   */
  setTestTokenExpiry(expiry: Date): void {
    if (!this.isAuthenticated()) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    const session = this.getSession();
    session.tokenExpiry = expiry;
    this.saveSession(session);
  }

  /**
   * Get user ID from current session for testing
   * @returns User ID if set, undefined otherwise
   * @throws MCPError if not authenticated
   */
  getTestUserId(): string | undefined {
    if (!this.isAuthenticated()) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    return this.getSession().userId;
  }

  /**
   * Get token expiry from current session for testing
   * @returns Token expiry if set, undefined otherwise
   * @throws MCPError if not authenticated
   */
  getTestTokenExpiry(): Date | undefined {
    if (!this.isAuthenticated()) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    return this.getSession().tokenExpiry;
  }

  /**
   * Update session properties in a controlled manner for testing
   * @param updates - Partial session updates (only userId and tokenExpiry allowed)
   * @throws MCPError if not authenticated or invalid property is provided
   */
  updateSessionProperty(updates: Pick<AuthSession, 'userId' | 'tokenExpiry'>): void {
    if (!this.isAuthenticated()) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }

    // Validate that only allowed properties are being updated
    const allowedKeys = new Set(['userId', 'tokenExpiry']);
    const providedKeys = Object.keys(updates);
    const invalidKeys = providedKeys.filter(key => !allowedKeys.has(key));
    
    if (invalidKeys.length > 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid session properties: ${invalidKeys.join(', ')}. Only userId and tokenExpiry are allowed.`,
      );
    }

    const session = this.getSession();
    
    // Apply updates
    if (updates.userId !== undefined) {
      session.userId = updates.userId;
    }
    if (updates.tokenExpiry !== undefined) {
      session.tokenExpiry = updates.tokenExpiry;
    }
    
    this.saveSession(session);
  }
}

/**
 * Environment check to ensure this utility is only used in test environments
 * @throws Error if used in production environment
 */
function validateTestEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV;
  const jestRunning = process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';
  
  if (!jestRunning && nodeEnv !== 'test' && nodeEnv !== 'development') {
    throw new Error(
      'AuthManagerTestUtils can only be used in test environments. ' +
      'This is a security measure to prevent testing methods from being accessible in production.'
    );
  }
}

/**
 * Factory function to create a testable AuthManager instance
 * This function enforces environment checks and provides a clean interface for tests
 * 
 * @returns TestableAuthManager instance with both production and testing methods
 * @throws Error if used in production environment
 */
export function createTestableAuthManager(): TestableAuthManager {
  validateTestEnvironment();
  return new AuthManagerTestUtilsImpl() as TestableAuthManager;
}

/**
 * Factory function to create a mock testable AuthManager for unit tests
 * This provides a fully mocked instance suitable for isolated testing
 * 
 * @returns Mocked TestableAuthManager with jest.fn() implementations
 * @throws Error if used in production environment
 */
export function createMockTestableAuthManager(): jest.Mocked<TestableAuthManager> {
  validateTestEnvironment();
  
  return {
    // Production AuthManager methods
    connect: jest.fn(),
    getSession: jest.fn(),
    isAuthenticated: jest.fn(),
    disconnect: jest.fn(),
    getStatus: jest.fn(),
    getAuthType: jest.fn(),
    saveSession: jest.fn(),
    
    // Testing methods
    setTestUserId: jest.fn(),
    setTestTokenExpiry: jest.fn(),
    getTestUserId: jest.fn(),
    getTestTokenExpiry: jest.fn(),
    updateSessionProperty: jest.fn(),
  } as jest.Mocked<TestableAuthManager>;
}

/**
 * Type guard to check if an AuthManager instance has testing capabilities
 * @param manager - AuthManager instance to check
 * @returns True if the manager has testing methods
 */
export function isTestableAuthManager(manager: AuthManager): manager is TestableAuthManager {
  return 'setTestUserId' in manager && 
         'getTestUserId' in manager && 
         'setTestTokenExpiry' in manager && 
         'getTestTokenExpiry' in manager &&
         'updateSessionProperty' in manager;
}

// Export types for use in tests
export type { ITestableAuthManager, TestableAuthManager };