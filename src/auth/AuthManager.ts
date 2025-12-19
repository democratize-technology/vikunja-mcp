/**
 * Authentication Manager
 * Handles session management and token refresh for the MCP server
 */

import type { AuthSession } from '../types';
import { MCPError, ErrorCode } from '../types';
import { logger } from '../utils/logger';

export class AuthManager {
  private session: AuthSession | null = null;

  /**
   * Detect authentication type based on token format
   */
  static detectAuthType(token: string): 'api-token' | 'jwt' {
    // API tokens start with tk_
    if (token.startsWith('tk_')) {
      return 'api-token';
    }
    
    // JWTs have 3 parts separated by dots and start with eyJ (base64 for {"alg":)
    if (token.startsWith('eyJ') && token.split('.').length === 3) {
      return 'jwt';
    }
    
    // Default to API token for backward compatibility
    return 'api-token';
  }

  /**
   * Initialize a new auth session
   */
  connect(apiUrl: string, apiToken: string, authType?: 'api-token' | 'jwt'): void {
    // Auto-detect auth type if not provided
    const detectedAuthType = authType || AuthManager.detectAuthType(apiToken);
    logger.debug('AuthManager.connect - Creating session with authType: %s', detectedAuthType);
    this.session = {
      apiUrl,
      apiToken,
      authType: detectedAuthType,
      // tokenExpiry and userId are optional
    };
    logger.debug('AuthManager.connect - Session created successfully');
  }

  /**
   * Get current session
   * @throws MCPError if not authenticated
   */
  getSession(): AuthSession {
    if (!this.session) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    return this.session;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.session !== null;
  }

  /**
   * Clear session
   */
  disconnect(): void {
    this.session = null;
  }

  /**
   * Get auth status
   */
  getStatus(): { authenticated: boolean; apiUrl?: string; userId?: string; authType?: 'api-token' | 'jwt' } {
    if (!this.session) {
      return { authenticated: false };
    }
    const status: { authenticated: boolean; apiUrl?: string; userId?: string; authType?: 'api-token' | 'jwt' } = {
      authenticated: true,
      apiUrl: this.session.apiUrl,
      authType: this.session.authType,
    };
    if (this.session.userId !== undefined) {
      status.userId = this.session.userId;
    }
    return status;
  }

  /**
   * Get authentication type
   * @throws MCPError if not authenticated
   */
  getAuthType(): 'api-token' | 'jwt' {
    if (!this.session) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    return this.session.authType;
  }

  /**
   * Save session with auth type
   */
  saveSession(session: AuthSession): void {
    this.session = session;
  }

  // ==========================================
  // TEST-ONLY METHODS - Protected by environment checks
  // These methods are only available in test environments
  // ==========================================

  /**
   * Test-only method to set user ID
   * @throws Error if used in production
   */
  setTestUserId(userId: string): void {
    this.validateTestEnvironment();
    if (!this.session) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    this.session.userId = userId;
  }

  /**
   * Test-only method to set token expiry
   * @throws Error if used in production
   */
  setTestTokenExpiry(expiry: Date): void {
    this.validateTestEnvironment();
    if (!this.session) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    this.session.tokenExpiry = expiry;
  }

  /**
   * Validate test environment - prevents test methods from being used in production
   * @throws Error if not in test environment
   */
  private validateTestEnvironment(): void {
    const nodeEnv = process.env.NODE_ENV;
    const jestRunning = process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';

    if (!jestRunning && nodeEnv !== 'test' && nodeEnv !== 'development') {
      throw new Error(
        'AuthManager test methods can only be used in test environments. ' +
        'This is a security measure to prevent testing methods from being accessible in production.'
      );
    }
  }

}
