/**
 * Tests for security utilities
 * Ensures comprehensive coverage of credential masking functionality
 */

import {
  maskCredential,
  maskUrl,
  sanitizeLogData,
  createSecureLogConfig,
  createSecureConnectionMessage
} from '../../src/utils/security';

describe('Security Utilities', () => {
  describe('maskCredential', () => {
    it('should mask long credentials showing only first 4 characters', () => {
      const token = 'tk_1234567890abcdef';
      expect(maskCredential(token)).toBe('tk_1...');
    });

    it('should mask JWT tokens correctly', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      expect(maskCredential(jwt)).toBe('eyJh...');
    });

    it('should return "***" for short credentials', () => {
      expect(maskCredential('abc')).toBe('***');
      expect(maskCredential('a')).toBe('***');
      expect(maskCredential('')).toBe('');
    });

    it('should handle null and undefined inputs', () => {
      expect(maskCredential(null)).toBe('');
      expect(maskCredential(undefined)).toBe('');
    });

    it('should handle non-string inputs', () => {
      expect(maskCredential(123 as any)).toBe('');
      expect(maskCredential({} as any)).toBe('');
      expect(maskCredential([] as any)).toBe('');
    });

    it('should mask exactly 4 character credentials', () => {
      expect(maskCredential('abcd')).toBe('***');
    });

    it('should mask 5 character credentials correctly', () => {
      expect(maskCredential('abcde')).toBe('abcd...');
    });
  });

  describe('maskUrl', () => {
    it('should mask query parameters', () => {
      const url = 'https://vikunja.example.com/api/v1/tasks?token=secret123&user=admin';
      const masked = maskUrl(url);
      expect(masked).toBe('https://vikunja.example.com/api/v1/tasks?[REDACTED]');
    });

    it('should mask sensitive path components', () => {
      const url = 'https://api.example.com/api/v1/token/abc123';
      const masked = maskUrl(url);
      expect(masked).toBe('https://api.example.com/api/v1/token/[REDACTED]');
    });

    it('should mask auth endpoints', () => {
      expect(maskUrl('https://example.com/auth/login')).toBe('https://example.com/auth/[REDACTED]');
      expect(maskUrl('https://example.com/login/user123')).toBe('https://example.com/login/[REDACTED]');
      expect(maskUrl('https://example.com/key/secret')).toBe('https://example.com/key/[REDACTED]');
    });

    it('should handle URLs without sensitive components', () => {
      const url = 'https://vikunja.example.com/api/v1/tasks';
      expect(maskUrl(url)).toBe(url);
    });

    it('should handle malformed URLs gracefully', () => {
      const malformed = 'not-a-url/with/path';
      const masked = maskUrl(malformed);
      expect(masked).toBe('not-a-url/[REDACTED]');
    });

    it('should handle URLs with ports', () => {
      const url = 'https://localhost:3000/api/v1/token/secret?key=value';
      const masked = maskUrl(url);
      expect(masked).toBe('https://localhost:3000/api/v1/token/[REDACTED]?[REDACTED]');
    });

    it('should handle null and undefined inputs', () => {
      expect(maskUrl(null)).toBe('');
      expect(maskUrl(undefined)).toBe('');
    });

    it('should handle non-string inputs', () => {
      expect(maskUrl(123 as any)).toBe('');
      expect(maskUrl({} as any)).toBe('');
    });

    it('should handle URLs without paths after protocol', () => {
      expect(maskUrl('https://example.com')).toBe('https://example.com/');
    });

    it('should handle protocol-relative URLs', () => {
      const url = '//example.com/auth/token';
      const masked = maskUrl(url);
      expect(masked).toBe('//example.com/[REDACTED]');
    });
  });

  describe('sanitizeLogData', () => {
    it('should mask sensitive string fields in objects', () => {
      const data = {
        username: 'john',
        password: 'secret123',
        api_token: 'tk_abcdef123456',
        normal_field: 'safe_value'
      };

      const sanitized = sanitizeLogData(data);
      expect(sanitized).toEqual({
        username: 'john',
        password: '[REDACTED]', // Short password gets redacted, not masked
        api_token: 'tk_a...',   // Long credential-like token gets masked
        normal_field: 'safe_value'
      });
    });

    it('should handle nested objects', () => {
      const data = {
        config: {
          database: {
            password: 'db_secret',
            host: 'localhost'
          },
          jwt_secret: 'very_secret_key'
        },
        public_info: 'visible'
      };

      const sanitized = sanitizeLogData(data);
      expect(sanitized).toEqual({
        config: {
          database: {
            password: '[REDACTED]', // Short password gets redacted
            host: 'localhost'
          },
          jwt_secret: 'very...' // Medium length credential-like secret gets masked
        },
        public_info: 'visible'
      });
    });

    it('should handle arrays', () => {
      const data = [
        { token: 'secret1', value: 'public1' },
        { token: 'secret2', value: 'public2' }
      ];

      const sanitized = sanitizeLogData(data);
      expect(sanitized).toEqual([
        { token: '[REDACTED]', value: 'public1' }, // Short token gets redacted
        { token: '[REDACTED]', value: 'public2' }  // Short token gets redacted
      ]);
    });

    it('should detect credential-like strings', () => {
      const longToken = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const shortString = 'hello';
      
      expect(sanitizeLogData(longToken)).toBe('abcd...');
      expect(sanitizeLogData(shortString)).toBe('hello');
    });

    it('should handle primitive values', () => {
      expect(sanitizeLogData(null)).toBe(null);
      expect(sanitizeLogData(undefined)).toBe(undefined);
      expect(sanitizeLogData(123)).toBe(123);
      expect(sanitizeLogData(true)).toBe(true);
    });

    it('should handle all sensitive key variations', () => {
      const data = {
        TOKEN: 'secret1',
        apiToken: 'secret2',
        private_key: 'secret3',
        authorization: 'secret4',
        bearer: 'secret5',
        credentials: 'secret6',
        jwt: 'secret7'
      };

      const sanitized = sanitizeLogData(data);
      expect(Object.values(sanitized)).toEqual([
        '[REDACTED]', '[REDACTED]', '[REDACTED]', 
        '[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]'
      ]); // All short secrets get redacted
    });

    it('should handle non-string sensitive values', () => {
      const data = {
        token: 123,
        password: { nested: 'value' },
        api_key: ['array', 'value']
      };

      const sanitized = sanitizeLogData(data);
      expect(sanitized).toEqual({
        token: '[REDACTED]',
        password: '[REDACTED]',
        api_key: '[REDACTED]'
      });
    });
  });

  describe('createSecureLogConfig', () => {
    it('should create secure configuration for logging', () => {
      const config = {
        mode: 'production',
        debug: false,
        apiToken: 'tk_secret123',
        database: {
          host: 'localhost',
          password: 'db_secret'
        }
      };

      const secure = createSecureLogConfig(config);
      expect(secure).toEqual({
        mode: 'production',
        debug: false,
        apiToken: 'tk_s...', // Long credential-like token gets masked
        database: {
          host: 'localhost',
          password: '[REDACTED]' // Short password gets redacted
        }
      });
    });
  });

  describe('createSecureConnectionMessage', () => {
    it('should create secure connection message with auth type', () => {
      const url = 'https://vikunja.example.com/api';
      const token = 'tk_1234567890abcdef';
      const authType = 'API';

      const message = createSecureConnectionMessage(url, token, authType);
      expect(message).toBe('Connecting to https://vikunja.example.com/api with API token tk_1...');
    });

    it('should create secure connection message without auth type', () => {
      const url = 'https://vikunja.example.com/api';
      const token = 'tk_1234567890abcdef';

      const message = createSecureConnectionMessage(url, token);
      expect(message).toBe('Connecting to https://vikunja.example.com/api with token tk_1...');
    });

    it('should handle undefined values', () => {
      const message = createSecureConnectionMessage(undefined, undefined, 'JWT');
      expect(message).toBe('Connecting to  with JWT token ');
    });

    it('should mask URLs with sensitive components', () => {
      const url = 'https://vikunja.example.com/auth/token?secret=abc';
      const token = 'eyJhbGciOiJIUzI1NiJ9';

      const message = createSecureConnectionMessage(url, token, 'JWT');
      expect(message).toBe('Connecting to https://vikunja.example.com/auth/[REDACTED]?[REDACTED] with JWT token eyJh...');
    });
  });
});