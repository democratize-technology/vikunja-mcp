import { describe, it, expect } from '@jest/globals';
import {
  isAuthenticationError,
  isJWTExpiredError,
  createAuthErrorMessage,
  handleAuthError,
} from '../../src/utils/auth-error-handler';
import { MCPError, ErrorCode } from '../../src/types';

describe('Auth Error Handler', () => {
  describe('isJWTExpiredError', () => {
    it('should identify JWT expiration errors', () => {
      expect(isJWTExpiredError(new Error('token expired'))).toBe(true);
      expect(isJWTExpiredError(new Error('Token Expired'))).toBe(true);
      expect(isJWTExpiredError(new Error('jwt expired'))).toBe(true);
      expect(isJWTExpiredError(new Error('JWT EXPIRED'))).toBe(true);
      expect(isJWTExpiredError(new Error('exp claim validation failed'))).toBe(true);
    });

    it('should return false for non-expiration errors', () => {
      expect(isJWTExpiredError(new Error('Invalid token'))).toBe(false);
      expect(isJWTExpiredError(new Error('Authentication failed'))).toBe(false);
      expect(isJWTExpiredError(new Error('401 Unauthorized'))).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isJWTExpiredError('string error')).toBe(false);
      expect(isJWTExpiredError(null)).toBe(false);
      expect(isJWTExpiredError(undefined)).toBe(false);
      expect(isJWTExpiredError({})).toBe(false);
    });
  });

  describe('isAuthenticationError', () => {
    it('should identify token errors', () => {
      expect(isAuthenticationError(new Error('Invalid token'))).toBe(true);
      expect(isAuthenticationError(new Error('Token expired'))).toBe(true);
      expect(isAuthenticationError(new Error('TOKEN_INVALID'))).toBe(true);
    });

    it('should identify auth errors', () => {
      expect(isAuthenticationError(new Error('Authentication failed'))).toBe(true);
      expect(isAuthenticationError(new Error('Not authenticated'))).toBe(true);
      expect(isAuthenticationError(new Error('AUTH_REQUIRED'))).toBe(true);
    });

    it('should identify HTTP status code errors', () => {
      expect(isAuthenticationError(new Error('401 Unauthorized'))).toBe(true);
      expect(isAuthenticationError(new Error('Error: 401'))).toBe(true);
      expect(isAuthenticationError(new Error('403 Forbidden'))).toBe(true);
    });

    it('should identify unauthorized/forbidden errors', () => {
      expect(isAuthenticationError(new Error('Unauthorized access'))).toBe(true);
      expect(isAuthenticationError(new Error('Access forbidden'))).toBe(true);
    });

    it('should return false for non-auth errors', () => {
      expect(isAuthenticationError(new Error('Network timeout'))).toBe(false);
      expect(isAuthenticationError(new Error('Server error'))).toBe(false);
      expect(isAuthenticationError(new Error('Invalid input'))).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isAuthenticationError('string error')).toBe(false);
      expect(isAuthenticationError(null)).toBe(false);
      expect(isAuthenticationError(undefined)).toBe(false);
      expect(isAuthenticationError({})).toBe(false);
    });
  });

  describe('createAuthErrorMessage', () => {
    it('should create user-specific error message', () => {
      const message = createAuthErrorMessage('user.current', 'Token invalid');
      expect(message).toContain('User endpoint authentication error');
      expect(message).toContain('known Vikunja API limitation');
      expect(message).toContain('JWT authentication');
      expect(message).toContain('connect with a JWT token (starting with eyJ)');
    });

    it('should create bulk operation error message', () => {
      const message = createAuthErrorMessage('bulk-update', 'Auth failed');
      expect(message).toContain('Bulk operations may have authentication issues');
      expect(message).toContain('Consider using individual operations');
    });

    it('should create label operation error message', () => {
      const message = createAuthErrorMessage('update-labels', 'Forbidden');
      expect(message).toContain('Label operations may have authentication issues');
      expect(message).toContain('Try updating the task without labels');
    });

    it('should create assignee operation error message', () => {
      const message = createAuthErrorMessage('update-assignees', 'Forbidden');
      expect(message).toContain('Assignee operations may have authentication issues');
      expect(message).toContain('Try updating the task without assignees');
    });

    it('should create default error message for unknown operations', () => {
      const message = createAuthErrorMessage('unknown-op', 'Auth error');
      expect(message).toContain('Authentication error during unknown-op');
      expect(message).toContain('Auth error');
      expect(message).toContain('verify your API token');
    });
  });

  describe('handleAuthError', () => {
    it('should throw JWT expiration error for expired token errors', () => {
      const error = new Error('token expired');

      expect(() => handleAuthError(error, 'user.update')).toThrow(MCPError);

      try {
        handleAuthError(error, 'user.update');
      } catch (e) {
        expect(e).toBeInstanceOf(MCPError);
        expect((e as MCPError).code).toBe(ErrorCode.AUTH_REQUIRED);
        expect((e as MCPError).message).toContain('JWT token has expired');
        expect((e as MCPError).message).toContain('vikunja_auth.connect with the new token');
      }
    });

    it('should throw auth-specific error for authentication errors', () => {
      const error = new Error('401 Unauthorized');

      expect(() => handleAuthError(error, 'user.current')).toThrow(MCPError);

      try {
        handleAuthError(error, 'user.current');
      } catch (e) {
        expect(e).toBeInstanceOf(MCPError);
        expect((e as MCPError).code).toBe(ErrorCode.API_ERROR);
        expect((e as MCPError).message).toContain('User endpoint authentication error');
      }
    });

    it('should throw with fallback message for non-auth errors', () => {
      const error = new Error('Network timeout');

      expect(() => handleAuthError(error, 'test-op', 'Custom fallback')).toThrow(MCPError);

      try {
        handleAuthError(error, 'test-op', 'Custom fallback');
      } catch (e) {
        expect(e).toBeInstanceOf(MCPError);
        expect((e as MCPError).code).toBe(ErrorCode.API_ERROR);
        expect((e as MCPError).message).toBe('Custom fallback');
      }
    });

    it('should use default fallback message when not provided', () => {
      const error = new Error('Random error');

      try {
        handleAuthError(error, 'test-op');
      } catch (e) {
        expect(e).toBeInstanceOf(MCPError);
        expect((e as MCPError).message).toBe('test-op failed: Random error');
      }
    });

    it('should handle non-Error objects', () => {
      const error = 'String error';

      try {
        handleAuthError(error, 'test-op');
      } catch (e) {
        expect(e).toBeInstanceOf(MCPError);
        expect((e as MCPError).message).toBe('test-op failed: String error');
      }
    });
  });
});
