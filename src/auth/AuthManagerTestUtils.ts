/**
 * Test utilities for AuthManager
 * Provides test-specific functionality and mocking capabilities
 */

import { AuthManager } from './AuthManager';
import { MCPError, ErrorCode } from '../types';
import type { AuthSession } from '../types';

export interface TestableAuthManager extends AuthManager {
  // Test-specific methods for manipulating session state
  setTestUserId(userId: string): void;
  getTestUserId(): string | undefined;
  setTestTokenExpiry(expiry: Date): void;
  getTestTokenExpiry(): Date | undefined;
  updateSessionProperty(updates: { userId?: string; tokenExpiry?: Date }): void;

  // Internal test utilities
  _testOnly?(): {
    clearCache(): void;
    getCredentials(): AuthSession | null;
    setCredentials(credentials: AuthSession | null): void;
  };
}

/**
 * Create a testable version of AuthManager with additional test utilities
 */
export function createTestableAuthManager(): TestableAuthManager {
  const authManager = new AuthManager() as TestableAuthManager;

  // Track test session state
  let testUserId: string | undefined;
  let testTokenExpiry: Date | undefined;

  // Add test methods
  authManager.setTestUserId = (userId: string) => {
    if (!authManager.isAuthenticated) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.'
      );
    }
    testUserId = userId;
  };

  authManager.getTestUserId = () => {
    if (!authManager.isAuthenticated) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.'
      );
    }
    return testUserId;
  };

  authManager.setTestTokenExpiry = (expiry: Date) => {
    if (!authManager.isAuthenticated) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.'
      );
    }
    testTokenExpiry = expiry;
  };

  authManager.getTestTokenExpiry = () => {
    if (!authManager.isAuthenticated) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.'
      );
    }
    return testTokenExpiry;
  };

  authManager.updateSessionProperty = (updates: { userId?: string; tokenExpiry?: Date }) => {
    if (!authManager.isAuthenticated) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.'
      );
    }

    // Validate that only allowed properties are provided
    const allowedKeys = ['userId', 'tokenExpiry'];
    const providedKeys = Object.keys(updates);
    const invalidKeys = providedKeys.filter(key => !allowedKeys.includes(key));

    if (invalidKeys.length > 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid properties provided: ${invalidKeys.join(', ')}. Only userId and tokenExpiry are allowed.`
      );
    }

    if (updates.userId !== undefined) {
      testUserId = updates.userId;
    }
    if (updates.tokenExpiry !== undefined) {
      testTokenExpiry = updates.tokenExpiry;
    }
  };

  // Add test-only internal methods
  authManager._testOnly = () => ({
    clearCache: () => {
      authManager.disconnect();
      testUserId = undefined;
      testTokenExpiry = undefined;
    },
    getCredentials: () => {
      if (!authManager.isAuthenticated()) {
        return null;
      }
      return authManager.getSession();
    },
    setCredentials: (credentials: AuthSession | null) => {
      if (credentials) {
        authManager.saveSession(credentials);
      } else {
        authManager.disconnect();
        testUserId = undefined;
        testTokenExpiry = undefined;
      }
    }
  });

  return authManager;
}

/**
 * Create a mock testable auth manager for testing
 */
export function createMockTestableAuthManager(): TestableAuthManager {
  return createTestableAuthManager();
}