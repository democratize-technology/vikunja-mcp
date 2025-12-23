import { AuthManager } from '../../src/auth/AuthManager';

/**
 * Testable interface for AuthManager that exposes private methods for testing
 */
export interface TestableAuthManager {
  isAuthenticated(): boolean;
  getCredentials(): string | undefined;
  getAuthType(): 'api_token' | 'jwt' | 'unknown';
  hasJwtAuth(): boolean;
  // Test-only methods
  _validateCredentials(): boolean;
  _detectAuthType(): 'api_token' | 'jwt' | 'unknown';
  // Testing API methods
  setTestUserId(userId: string): void;
  setTestTokenExpiry(expiry: Date): void;
  getTestUserId(): string | undefined;
  getTestTokenExpiry(): Date | undefined;
  updateSessionProperty(properties: { userId?: string; tokenExpiry?: Date }): void;
}

/**
 * Creates a testable wrapper around AuthManager that exposes private methods for testing
 */
export function createTestableAuthManager(credentials?: string): TestableAuthManager {
  const authManager = new AuthManager(credentials);

  // Access private methods through type casting for testing
  const testableAuth = authManager as any;

  // Add testing API methods to the instance
  testableAuth.setTestUserId = function(userId: string): void {
    const { MCPError, ErrorCode } = require('../../src/types');

    if (!this.session) {
      throw new MCPError(ErrorCode.AUTH_REQUIRED, 'Authentication required. Please use vikunja_auth.connect first.');
    }

    // Directly set userId for testing
    this.session.userId = userId;
  };

  testableAuth.setTestTokenExpiry = function(expiry: Date): void {
    const { MCPError, ErrorCode } = require('../../src/types');

    if (!this.session) {
      throw new MCPError(ErrorCode.AUTH_REQUIRED, 'Authentication required. Please use vikunja_auth.connect first.');
    }

    // Directly set token expiry for testing
    this.session.tokenExpiry = expiry;
  };

  testableAuth.getTestUserId = function(): string | undefined {
    const { MCPError, ErrorCode } = require('../../src/types');

    if (!this.session) {
      throw new MCPError(ErrorCode.AUTH_REQUIRED, 'Authentication required. Please use vikunja_auth.connect first.');
    }

    return this.session.userId;
  };

  testableAuth.getTestTokenExpiry = function(): Date | undefined {
    const { MCPError, ErrorCode } = require('../../src/types');

    if (!this.session) {
      throw new MCPError(ErrorCode.AUTH_REQUIRED, 'Authentication required. Please use vikunja_auth.connect first.');
    }

    return this.session.tokenExpiry;
  };

  testableAuth.updateSessionProperty = function(properties: { userId?: string; tokenExpiry?: Date }): void {
    const { MCPError, ErrorCode } = require('../../src/types');

    if (!this.session) {
      throw new MCPError(ErrorCode.AUTH_REQUIRED, 'Authentication required. Please use vikunja_auth.connect first.');
    }

    const invalidKeys = Object.keys(properties).filter(key => !['userId', 'tokenExpiry'].includes(key));
    if (invalidKeys.length > 0) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, `Invalid session properties: ${invalidKeys.join(', ')}. Only userId and tokenExpiry are allowed.`);
    }

    // Update valid properties
    Object.assign(this.session, properties);
  };

  return testableAuth;
}

/**
 * Creates a mock AuthManager for testing with controllable behavior
 */
export function createMockTestableAuthManager(authenticated: boolean = true, token: string = 'test-token'): jest.Mocked<TestableAuthManager> {
  const mockAuthManager = {
    isAuthenticated: jest.fn().mockReturnValue(authenticated),
    getCredentials: jest.fn().mockReturnValue(token),
    getAuthType: jest.fn().mockReturnValue(token.startsWith('eyJ') ? 'jwt' : 'api_token'),
    hasJwtAuth: jest.fn().mockReturnValue(token.startsWith('eyJ')),
    getSession: jest.fn().mockReturnValue({
      apiUrl: 'https://api.vikunja.test',
      apiToken: token,
      authType: token.startsWith('eyJ') ? 'jwt' : 'api_token',
    }),
    _validateCredentials: jest.fn().mockReturnValue(authenticated),
    _detectAuthType: jest.fn().mockReturnValue(token.startsWith('eyJ') ? 'jwt' : 'api_token'),
  };

  return mockAuthManager as jest.Mocked<TestableAuthManager>;
}