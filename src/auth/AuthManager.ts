/**
 * Authentication Manager
 * Handles session management and token refresh for the MCP server
 */

import type { AuthSession } from '../types/index';
import { MCPError, ErrorCode } from '../types/index';
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

  /**
   * Testing API: Set user ID for test scenarios
   * This method is intended for testing only and should not be used in production
   * @param userId - User ID to set in the current session
   * @throws MCPError if not authenticated
   */
  setTestUserId(userId: string): void {
    if (!this.session) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    this.session.userId = userId;
  }

  /**
   * Testing API: Set token expiry for test scenarios
   * This method is intended for testing only and should not be used in production
   * @param expiry - Token expiry date to set in the current session
   * @throws MCPError if not authenticated
   */
  setTestTokenExpiry(expiry: Date): void {
    if (!this.session) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    this.session.tokenExpiry = expiry;
  }

  /**
   * Testing API: Get user ID from current session
   * This method provides controlled access to session properties for testing
   * @returns User ID if set, undefined otherwise
   * @throws MCPError if not authenticated
   */
  getTestUserId(): string | undefined {
    if (!this.session) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    return this.session.userId;
  }

  /**
   * Testing API: Get token expiry from current session
   * This method provides controlled access to session properties for testing
   * @returns Token expiry if set, undefined otherwise
   * @throws MCPError if not authenticated
   */
  getTestTokenExpiry(): Date | undefined {
    if (!this.session) {
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required. Please use vikunja_auth.connect first.',
      );
    }
    return this.session.tokenExpiry;
  }

  /**
   * Testing API: Update session properties in a controlled manner
   * This method provides safe access to update specific session properties for testing
   * @param updates - Partial session updates (only userId and tokenExpiry allowed)
   * @throws MCPError if not authenticated or invalid property is provided
   */
  updateSessionProperty(updates: Pick<AuthSession, 'userId' | 'tokenExpiry'>): void {
    if (!this.session) {
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

    // Apply updates
    if (updates.userId !== undefined) {
      this.session.userId = updates.userId;
    }
    if (updates.tokenExpiry !== undefined) {
      this.session.tokenExpiry = updates.tokenExpiry;
    }
  }
}
