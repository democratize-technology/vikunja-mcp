/**
 * AuthManager Tests
 */

import { AuthManager } from '../../src/auth/AuthManager';
import { MCPError, ErrorCode } from '../../src/types';

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    authManager = new AuthManager();
  });

  describe('detectAuthType', () => {
    it('should detect API token starting with tk_', () => {
      expect(AuthManager.detectAuthType('tk_abcd1234')).toBe('api-token');
      expect(AuthManager.detectAuthType('tk_1234567890abcdef')).toBe('api-token');
    });

    it('should detect JWT token with eyJ prefix and 3 parts', () => {
      const validJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(AuthManager.detectAuthType(validJWT)).toBe('jwt');
    });

    it('should default to api-token for unknown formats', () => {
      expect(AuthManager.detectAuthType('random-token')).toBe('api-token');
      expect(AuthManager.detectAuthType('12345')).toBe('api-token');
      expect(AuthManager.detectAuthType('')).toBe('api-token');
    });

    it('should handle edge cases for JWT detection', () => {
      // Valid JWT format (3 parts starting with eyJ)
      expect(AuthManager.detectAuthType('eyJ.only.two')).toBe('jwt');
      // Not enough parts (only 2)
      expect(AuthManager.detectAuthType('eyJ.onlytwo')).toBe('api-token');
      // Too many parts (4 parts)
      expect(AuthManager.detectAuthType('eyJ.has.four.parts')).toBe('api-token');
      // Doesn't start with eyJ
      expect(AuthManager.detectAuthType('abc.def.ghi')).toBe('api-token');
      // Starts with eyJ but not enough parts
      expect(AuthManager.detectAuthType('eyJtest')).toBe('api-token');
    });
  });

  describe('connect', () => {
    it('should store session information', () => {
      const apiUrl = 'https://vikunja.example.com/api/v1';
      const apiToken = 'test-token-123';

      authManager.connect(apiUrl, apiToken);

      const session = authManager.getSession();
      expect(session.apiUrl).toBe(apiUrl);
      expect(session.apiToken).toBe(apiToken);
      expect(session.authType).toBe('api-token');
      expect(session.tokenExpiry).toBeUndefined();
      expect(session.userId).toBeUndefined();
    });

    it('should store session with JWT auth type', () => {
      const apiUrl = 'https://vikunja.example.com/api/v1';
      const apiToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      authManager.connect(apiUrl, apiToken, 'jwt');

      const session = authManager.getSession();
      expect(session.apiUrl).toBe(apiUrl);
      expect(session.apiToken).toBe(apiToken);
      expect(session.authType).toBe('jwt');
      expect(session.tokenExpiry).toBeUndefined();
      expect(session.userId).toBeUndefined();
    });

    it('should auto-detect API token when no authType provided', () => {
      const apiUrl = 'https://vikunja.example.com/api/v1';
      const apiToken = 'tk_1234567890';

      authManager.connect(apiUrl, apiToken);

      const session = authManager.getSession();
      expect(session.authType).toBe('api-token');
    });

    it('should auto-detect JWT token when no authType provided', () => {
      const apiUrl = 'https://vikunja.example.com/api/v1';
      const apiToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      authManager.connect(apiUrl, apiToken);

      const session = authManager.getSession();
      expect(session.authType).toBe('jwt');
    });

    it('should use provided authType over auto-detection', () => {
      const apiUrl = 'https://vikunja.example.com/api/v1';
      const apiToken = 'tk_1234567890'; // API token format

      // Explicitly set to jwt even though token looks like API token
      authManager.connect(apiUrl, apiToken, 'jwt');

      const session = authManager.getSession();
      expect(session.authType).toBe('jwt');
    });
  });

  describe('getSession', () => {
    it('should throw AUTH_REQUIRED error when not authenticated', () => {
      expect(() => authManager.getSession()).toThrow(MCPError);
      expect(() => authManager.getSession()).toThrow(
        'Authentication required. Please use vikunja_auth.connect first.',
      );

      try {
        authManager.getSession();
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.AUTH_REQUIRED);
      }
    });

    it('should return session when authenticated', () => {
      const apiUrl = 'https://vikunja.example.com/api/v1';
      const apiToken = 'test-token-123';

      authManager.connect(apiUrl, apiToken);
      const session = authManager.getSession();

      expect(session).toBeDefined();
      expect(session.apiUrl).toBe(apiUrl);
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when not authenticated', () => {
      expect(authManager.isAuthenticated()).toBe(false);
    });

    it('should return true when authenticated', () => {
      authManager.connect('https://vikunja.example.com/api/v1', 'test-token');
      expect(authManager.isAuthenticated()).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should clear session', () => {
      authManager.connect('https://vikunja.example.com/api/v1', 'test-token');
      expect(authManager.isAuthenticated()).toBe(true);

      authManager.disconnect();
      expect(authManager.isAuthenticated()).toBe(false);
      expect(() => authManager.getSession()).toThrow(MCPError);
    });
  });

  describe('getStatus', () => {
    it('should return not authenticated status', () => {
      const status = authManager.getStatus();
      expect(status.authenticated).toBe(false);
      expect(status.apiUrl).toBeUndefined();
      expect(status.userId).toBeUndefined();
    });

    it('should return authenticated status', () => {
      const apiUrl = 'https://vikunja.example.com/api/v1';
      authManager.connect(apiUrl, 'test-token');

      const status = authManager.getStatus();
      expect(status.authenticated).toBe(true);
      expect(status.apiUrl).toBe(apiUrl);
      expect(status.userId).toBeUndefined();
    });

    it('should return authenticated status with userId when available', () => {
      const apiUrl = 'https://vikunja.example.com/api/v1';
      authManager.connect(apiUrl, 'test-token');

      // Use proper testing API to set userId
      authManager.setTestUserId('user-123');

      const status = authManager.getStatus();
      expect(status.authenticated).toBe(true);
      expect(status.apiUrl).toBe(apiUrl);
      expect(status.userId).toBe('user-123');
    });

    it('should return authenticated status with authType', () => {
      const apiUrl = 'https://vikunja.example.com/api/v1';
      authManager.connect(apiUrl, 'test-token', 'jwt');

      const status = authManager.getStatus();
      expect(status.authenticated).toBe(true);
      expect(status.apiUrl).toBe(apiUrl);
      expect(status.authType).toBe('jwt');
    });
  });

  describe('getAuthType', () => {
    it('should throw AUTH_REQUIRED error when not authenticated', () => {
      expect(() => authManager.getAuthType()).toThrow(MCPError);
      expect(() => authManager.getAuthType()).toThrow(
        'Authentication required. Please use vikunja_auth.connect first.',
      );

      try {
        authManager.getAuthType();
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(ErrorCode.AUTH_REQUIRED);
      }
    });

    it('should return api-token auth type', () => {
      authManager.connect('https://vikunja.example.com/api/v1', 'test-token');
      expect(authManager.getAuthType()).toBe('api-token');
    });

    it('should return jwt auth type', () => {
      authManager.connect('https://vikunja.example.com/api/v1', 'jwt-token', 'jwt');
      expect(authManager.getAuthType()).toBe('jwt');
    });
  });

  describe('saveSession', () => {
    it('should save a session with JWT auth type', () => {
      const session = {
        apiUrl: 'https://vikunja.example.com/api/v1',
        apiToken: 'jwt-token-123',
        authType: 'jwt' as const,
      };

      authManager.saveSession(session);
      expect(authManager.isAuthenticated()).toBe(true);
      expect(authManager.getAuthType()).toBe('jwt');
      expect(authManager.getSession()).toEqual(session);
    });

    it('should save a session with API token auth type', () => {
      const session = {
        apiUrl: 'https://vikunja.example.com/api/v1',
        apiToken: 'tk_api-token-123',
        authType: 'api-token' as const,
      };

      authManager.saveSession(session);
      expect(authManager.isAuthenticated()).toBe(true);
      expect(authManager.getAuthType()).toBe('api-token');
      expect(authManager.getSession()).toEqual(session);
    });
  });

  describe('Testing API Methods', () => {
    beforeEach(() => {
      authManager.connect('https://vikunja.example.com/api/v1', 'test-token');
    });

    describe('setTestUserId', () => {
      it('should set userId in authenticated session', () => {
        authManager.setTestUserId('user-123');
        expect(authManager.getTestUserId()).toBe('user-123');
        
        const status = authManager.getStatus();
        expect(status.userId).toBe('user-123');
      });

      it('should throw AUTH_REQUIRED error when not authenticated', () => {
        const unauthenticatedManager = new AuthManager();
        
        expect(() => unauthenticatedManager.setTestUserId('user-123')).toThrow(MCPError);
        expect(() => unauthenticatedManager.setTestUserId('user-123')).toThrow(
          'Authentication required. Please use vikunja_auth.connect first.',
        );

        try {
          unauthenticatedManager.setTestUserId('user-123');
        } catch (error) {
          expect(error).toBeInstanceOf(MCPError);
          expect((error as MCPError).code).toBe(ErrorCode.AUTH_REQUIRED);
        }
      });

      it('should update existing userId', () => {
        authManager.setTestUserId('user-123');
        expect(authManager.getTestUserId()).toBe('user-123');
        
        authManager.setTestUserId('user-456');
        expect(authManager.getTestUserId()).toBe('user-456');
      });
    });

    describe('setTestTokenExpiry', () => {
      it('should set token expiry in authenticated session', () => {
        const expiry = new Date('2024-12-31T23:59:59Z');
        authManager.setTestTokenExpiry(expiry);
        expect(authManager.getTestTokenExpiry()).toEqual(expiry);
      });

      it('should throw AUTH_REQUIRED error when not authenticated', () => {
        const unauthenticatedManager = new AuthManager();
        const expiry = new Date('2024-12-31T23:59:59Z');
        
        expect(() => unauthenticatedManager.setTestTokenExpiry(expiry)).toThrow(MCPError);
        expect(() => unauthenticatedManager.setTestTokenExpiry(expiry)).toThrow(
          'Authentication required. Please use vikunja_auth.connect first.',
        );

        try {
          unauthenticatedManager.setTestTokenExpiry(expiry);
        } catch (error) {
          expect(error).toBeInstanceOf(MCPError);
          expect((error as MCPError).code).toBe(ErrorCode.AUTH_REQUIRED);
        }
      });

      it('should update existing token expiry', () => {
        const expiry1 = new Date('2024-12-31T23:59:59Z');
        const expiry2 = new Date('2025-06-30T12:00:00Z');
        
        authManager.setTestTokenExpiry(expiry1);
        expect(authManager.getTestTokenExpiry()).toEqual(expiry1);
        
        authManager.setTestTokenExpiry(expiry2);
        expect(authManager.getTestTokenExpiry()).toEqual(expiry2);
      });
    });

    describe('getTestUserId', () => {
      it('should return undefined when userId is not set', () => {
        expect(authManager.getTestUserId()).toBeUndefined();
      });

      it('should return userId when set', () => {
        authManager.setTestUserId('user-123');
        expect(authManager.getTestUserId()).toBe('user-123');
      });

      it('should throw AUTH_REQUIRED error when not authenticated', () => {
        const unauthenticatedManager = new AuthManager();
        
        expect(() => unauthenticatedManager.getTestUserId()).toThrow(MCPError);
        expect(() => unauthenticatedManager.getTestUserId()).toThrow(
          'Authentication required. Please use vikunja_auth.connect first.',
        );

        try {
          unauthenticatedManager.getTestUserId();
        } catch (error) {
          expect(error).toBeInstanceOf(MCPError);
          expect((error as MCPError).code).toBe(ErrorCode.AUTH_REQUIRED);
        }
      });
    });

    describe('getTestTokenExpiry', () => {
      it('should return undefined when token expiry is not set', () => {
        expect(authManager.getTestTokenExpiry()).toBeUndefined();
      });

      it('should return token expiry when set', () => {
        const expiry = new Date('2024-12-31T23:59:59Z');
        authManager.setTestTokenExpiry(expiry);
        expect(authManager.getTestTokenExpiry()).toEqual(expiry);
      });

      it('should throw AUTH_REQUIRED error when not authenticated', () => {
        const unauthenticatedManager = new AuthManager();
        
        expect(() => unauthenticatedManager.getTestTokenExpiry()).toThrow(MCPError);
        expect(() => unauthenticatedManager.getTestTokenExpiry()).toThrow(
          'Authentication required. Please use vikunja_auth.connect first.',
        );

        try {
          unauthenticatedManager.getTestTokenExpiry();
        } catch (error) {
          expect(error).toBeInstanceOf(MCPError);
          expect((error as MCPError).code).toBe(ErrorCode.AUTH_REQUIRED);
        }
      });
    });

    describe('updateSessionProperty', () => {
      it('should update userId only', () => {
        authManager.updateSessionProperty({ userId: 'user-123' });
        expect(authManager.getTestUserId()).toBe('user-123');
        expect(authManager.getTestTokenExpiry()).toBeUndefined();
      });

      it('should update tokenExpiry only', () => {
        const expiry = new Date('2024-12-31T23:59:59Z');
        authManager.updateSessionProperty({ tokenExpiry: expiry });
        expect(authManager.getTestTokenExpiry()).toEqual(expiry);
        expect(authManager.getTestUserId()).toBeUndefined();
      });

      it('should update both userId and tokenExpiry', () => {
        const expiry = new Date('2024-12-31T23:59:59Z');
        authManager.updateSessionProperty({ userId: 'user-123', tokenExpiry: expiry });
        expect(authManager.getTestUserId()).toBe('user-123');
        expect(authManager.getTestTokenExpiry()).toEqual(expiry);
      });

      it('should handle undefined values correctly', () => {
        // First set some values
        authManager.setTestUserId('user-123');
        const expiry = new Date('2024-12-31T23:59:59Z');
        authManager.setTestTokenExpiry(expiry);
        
        // Update with undefined values (should not change existing values)
        authManager.updateSessionProperty({});
        expect(authManager.getTestUserId()).toBe('user-123');
        expect(authManager.getTestTokenExpiry()).toEqual(expiry);
      });

      it('should throw AUTH_REQUIRED error when not authenticated', () => {
        const unauthenticatedManager = new AuthManager();
        
        expect(() => unauthenticatedManager.updateSessionProperty({ userId: 'user-123' })).toThrow(MCPError);
        expect(() => unauthenticatedManager.updateSessionProperty({ userId: 'user-123' })).toThrow(
          'Authentication required. Please use vikunja_auth.connect first.',
        );

        try {
          unauthenticatedManager.updateSessionProperty({ userId: 'user-123' });
        } catch (error) {
          expect(error).toBeInstanceOf(MCPError);
          expect((error as MCPError).code).toBe(ErrorCode.AUTH_REQUIRED);
        }
      });

      it('should throw VALIDATION_ERROR for invalid property keys', () => {
        // The updateSessionProperty method is typed to only accept userId and tokenExpiry
        // But for testing security, we can try to bypass TypeScript with an invalid object
        const invalidUpdates = { apiUrl: 'new-url', apiToken: 'new-token' } as any;
        
        expect(() => authManager.updateSessionProperty(invalidUpdates)).toThrow(MCPError);
        expect(() => authManager.updateSessionProperty(invalidUpdates)).toThrow(
          'Invalid session properties: apiUrl, apiToken. Only userId and tokenExpiry are allowed.',
        );

        try {
          authManager.updateSessionProperty(invalidUpdates);
        } catch (error) {
          expect(error).toBeInstanceOf(MCPError);
          expect((error as MCPError).code).toBe(ErrorCode.VALIDATION_ERROR);
        }
      });
    });
  });
});
