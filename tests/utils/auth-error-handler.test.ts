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
    it('should identify JWT expiration errors with structured error codes', () => {
      // Test structured error with code property
      const tokenExpiredError = new Error('Token expired') as Error & { code: string };
      tokenExpiredError.code = 'TokenExpiredError';
      expect(isJWTExpiredError(tokenExpiredError)).toBe(true);
      
      // Test structured error with name property
      const namedExpiredError = new Error('JWT expired') as Error & { name: string };
      namedExpiredError.name = 'TokenExpiredError';
      expect(isJWTExpiredError(namedExpiredError)).toBe(true);
    });

    it('should identify JWT expiration errors with precise message patterns', () => {
      expect(isJWTExpiredError(new Error('token expired'))).toBe(true);
      expect(isJWTExpiredError(new Error('Token Expired'))).toBe(true);
      expect(isJWTExpiredError(new Error('jwt expired'))).toBe(true);
      expect(isJWTExpiredError(new Error('JWT EXPIRED'))).toBe(true);
      expect(isJWTExpiredError(new Error('exp claim validation failed'))).toBe(true);
      expect(isJWTExpiredError(new Error('token has expired'))).toBe(true);
      expect(isJWTExpiredError(new Error('jwt has expired'))).toBe(true);
      expect(isJWTExpiredError(new Error('expired token detected'))).toBe(true);
      expect(isJWTExpiredError(new Error('expired jwt found'))).toBe(true);
    });

    it('should return false for non-expiration errors', () => {
      expect(isJWTExpiredError(new Error('Invalid token'))).toBe(false);
      expect(isJWTExpiredError(new Error('Authentication failed'))).toBe(false);
      expect(isJWTExpiredError(new Error('401 Unauthorized'))).toBe(false);
    });

    it('should prevent false positives from substring matching', () => {
      // These should NOT be detected as JWT expiration errors
      expect(isJWTExpiredError(new Error('cannot tokenize input'))).toBe(false);
      expect(isJWTExpiredError(new Error('token ring network expired'))).toBe(false);
      expect(isJWTExpiredError(new Error('database connection expired'))).toBe(false);
      expect(isJWTExpiredError(new Error('session timeout expired'))).toBe(false);
      expect(isJWTExpiredError(new Error('expired license key'))).toBe(false);
      expect(isJWTExpiredError(new Error('jwt-malformed but not expired'))).toBe(false);
      expect(isJWTExpiredError(new Error('token validation failed'))).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isJWTExpiredError('string error')).toBe(false);
      expect(isJWTExpiredError(null)).toBe(false);
      expect(isJWTExpiredError(undefined)).toBe(false);
      expect(isJWTExpiredError({})).toBe(false);
    });
  });

  describe('isAuthenticationError', () => {
    it('should identify authentication errors with structured HTTP status codes', () => {
      // Test error objects with numeric status properties
      const error401 = new Error('Unauthorized') as Error & { status: number };
      error401.status = 401;
      expect(isAuthenticationError(error401)).toBe(true);
      
      const error403 = new Error('Forbidden') as Error & { status: number };
      error403.status = 403;
      expect(isAuthenticationError(error403)).toBe(true);
      
      // Test Axios-style errors with response.status
      const axiosError = new Error('Request failed') as Error & { response: { status: number } };
      axiosError.response = { status: 401 };
      expect(isAuthenticationError(axiosError)).toBe(true);
      
      const axiosForbidden = new Error('Access denied') as Error & { response: { status: number } };
      axiosForbidden.response = { status: 403 };
      expect(isAuthenticationError(axiosForbidden)).toBe(true);
    });

    it('should identify token errors with precise patterns', () => {
      expect(isAuthenticationError(new Error('invalid token'))).toBe(true);
      expect(isAuthenticationError(new Error('token invalid'))).toBe(true);
      expect(isAuthenticationError(new Error('Invalid Token'))).toBe(true);
      expect(isAuthenticationError(new Error('TOKEN_INVALID'))).toBe(true);
      expect(isAuthenticationError(new Error('token expired'))).toBe(true);
    });

    it('should identify authentication errors with precise patterns', () => {
      expect(isAuthenticationError(new Error('authentication failed'))).toBe(true);
      expect(isAuthenticationError(new Error('Authentication Failed'))).toBe(true);
      expect(isAuthenticationError(new Error('authentication required'))).toBe(true);
      expect(isAuthenticationError(new Error('not authenticated'))).toBe(true);
      expect(isAuthenticationError(new Error('AUTH_REQUIRED'))).toBe(true);
      expect(isAuthenticationError(new Error('auth failed'))).toBe(true);
    });

    it('should identify HTTP status code errors at message start', () => {
      expect(isAuthenticationError(new Error('401 Unauthorized'))).toBe(true);
      expect(isAuthenticationError(new Error('403 Forbidden'))).toBe(true);
      expect(isAuthenticationError(new Error('Error: 401 details'))).toBe(true);
      expect(isAuthenticationError(new Error('Error: 403 forbidden'))).toBe(true);
    });

    it('should identify unauthorized/forbidden errors with word boundaries', () => {
      expect(isAuthenticationError(new Error('unauthorized access'))).toBe(true);
      expect(isAuthenticationError(new Error('Unauthorized Access'))).toBe(true);
      expect(isAuthenticationError(new Error('access forbidden'))).toBe(true);
      expect(isAuthenticationError(new Error('forbidden resource'))).toBe(true);
      expect(isAuthenticationError(new Error('access denied'))).toBe(true);
    });

    it('should prevent false positives from unsafe substring matching', () => {
      // These should NOT be detected as authentication errors
      expect(isAuthenticationError(new Error('cannot tokenize input'))).toBe(false);
      expect(isAuthenticationError(new Error('token ring network'))).toBe(false);
      expect(isAuthenticationError(new Error('author name missing'))).toBe(false);
      expect(isAuthenticationError(new Error('authorization header'))).toBe(false);
      expect(isAuthenticationError(new Error('section 401k plan'))).toBe(false);
      expect(isAuthenticationError(new Error('room 403 not found'))).toBe(false);
      expect(isAuthenticationError(new Error('HTTP 401 status in logs'))).toBe(false);
      expect(isAuthenticationError(new Error('this unauthorized action'))).toBe(false);
      expect(isAuthenticationError(new Error('unforbidden access'))).toBe(false);
      expect(isAuthenticationError(new Error('token-like string'))).toBe(false);
      expect(isAuthenticationError(new Error('authentication-aware system'))).toBe(false);
    });

    it('should return false for non-auth errors', () => {
      expect(isAuthenticationError(new Error('Network timeout'))).toBe(false);
      expect(isAuthenticationError(new Error('Server error'))).toBe(false);
      expect(isAuthenticationError(new Error('Invalid input'))).toBe(false);
      expect(isAuthenticationError(new Error('Database connection failed'))).toBe(false);
      expect(isAuthenticationError(new Error('Validation error'))).toBe(false);
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

    it('should properly handle structured HTTP errors', () => {
      const httpError = new Error('Unauthorized') as Error & { status: number };
      httpError.status = 401;

      expect(() => handleAuthError(httpError, 'test-operation')).toThrow(MCPError);

      try {
        handleAuthError(httpError, 'test-operation');
      } catch (e) {
        expect(e).toBeInstanceOf(MCPError);
        expect((e as MCPError).code).toBe(ErrorCode.API_ERROR);
        expect((e as MCPError).message).toContain('Authentication error during test-operation');
      }
    });

    it('should handle Axios-style error responses', () => {
      const axiosError = new Error('Request failed') as Error & { response: { status: number } };
      axiosError.response = { status: 403 };

      expect(() => handleAuthError(axiosError, 'forbidden-op')).toThrow(MCPError);

      try {
        handleAuthError(axiosError, 'forbidden-op');
      } catch (e) {
        expect(e).toBeInstanceOf(MCPError);
        expect((e as MCPError).code).toBe(ErrorCode.API_ERROR);
        expect((e as MCPError).message).toContain('Authentication error during forbidden-op');
      }
    });

    it('should handle JWT library errors with proper error codes', () => {
      const jwtError = new Error('jwt expired') as Error & { code: string };
      jwtError.code = 'TokenExpiredError';

      expect(() => handleAuthError(jwtError, 'jwt-test')).toThrow(MCPError);

      try {
        handleAuthError(jwtError, 'jwt-test');
      } catch (e) {
        expect(e).toBeInstanceOf(MCPError);
        expect((e as MCPError).code).toBe(ErrorCode.AUTH_REQUIRED);
        expect((e as MCPError).message).toContain('JWT token has expired');
      }
    });

    it('should NOT misclassify false positive errors', () => {
      const falsePositiveError = new Error('cannot tokenize the author\'s 401k document');

      expect(() => handleAuthError(falsePositiveError, 'parse-document')).toThrow(MCPError);

      try {
        handleAuthError(falsePositiveError, 'parse-document');
      } catch (e) {
        expect(e).toBeInstanceOf(MCPError);
        expect((e as MCPError).code).toBe(ErrorCode.API_ERROR);
        // Should use default error message, not auth-specific message
        expect((e as MCPError).message).toBe('parse-document failed: cannot tokenize the author\'s 401k document');
        expect((e as MCPError).message).not.toContain('Authentication error');
        expect((e as MCPError).message).not.toContain('JWT token');
      }
    });
  });

  describe('Security: False Positive Prevention', () => {
    it('should not classify non-auth errors as auth errors', () => {
      const testCases = [
        'cannot tokenize the input string',
        'the author field is required',
        'section 401k benefits expired',
        'room 403 is forbidden to enter',
        'unauthorized autobiography published',
        'token ring network topology',
        'authentication-aware but not authentication error',
        'HTTP 401 appears in log message'
      ];

      testCases.forEach(message => {
        expect(isAuthenticationError(new Error(message))).toBe(false);
        expect(isJWTExpiredError(new Error(message))).toBe(false);
      });
    });

    it('should maintain precision in error classification', () => {
      // These SHOULD be classified as auth errors
      const authErrors = [
        'unauthorized',
        'forbidden',
        'authentication failed',
        'invalid token',
        'token invalid',
        'access denied',
        '401 Unauthorized',
        'Error: 403'
      ];

      authErrors.forEach(message => {
        expect(isAuthenticationError(new Error(message))).toBe(true);
      });

      // These SHOULD be classified as JWT expiration errors
      const jwtErrors = [
        'token expired',
        'jwt expired',
        'exp claim failed',
        'expired token',
        'token has expired'
      ];

      jwtErrors.forEach(message => {
        expect(isJWTExpiredError(new Error(message))).toBe(true);
      });
    });

    it('should handle edge cases in error message formats', () => {
      // Test case sensitivity
      expect(isAuthenticationError(new Error('UNAUTHORIZED'))).toBe(true);
      expect(isAuthenticationError(new Error('Authentication Failed'))).toBe(true);
      
      // Test with extra whitespace
      expect(isAuthenticationError(new Error('  unauthorized  '))).toBe(true);
      expect(isJWTExpiredError(new Error('  token expired  '))).toBe(true);
      
      // Test with punctuation
      expect(isAuthenticationError(new Error('unauthorized!'))).toBe(true);
      expect(isAuthenticationError(new Error('forbidden.'))).toBe(true);
    });
  });
});