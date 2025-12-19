/**
 * Tests for security utilities
 * Ensures comprehensive coverage of credential masking functionality
 */

import {
  maskCredential,
  maskUrl,
  sanitizeLogData,
  createSecureLogConfig,
  createSecureConnectionMessage,
  clearSecurityCache,
  getSecurityCacheStats
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
        username: '[REDACTED]', // Enhanced security: username is now considered sensitive
        password: '[REDACTED]', // Short password gets redacted
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
        config: '[REDACTED]', // Enhanced security: config key is now considered sensitive
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

      // Enhanced security: long hex-like strings are now detected as credentials
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
      ]); // All secrets get redacted (enhanced security)
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
        database: '[REDACTED]' // Enhanced security: database key is now sensitive
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

  describe('Security Cache Management', () => {
    beforeEach(() => {
      clearSecurityCache();
    });

    it('should clear the security cache', () => {
      // First call should populate cache
      sanitizeLogData({ secret_key: 'value' });
      let stats = getSecurityCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      // Clear cache
      clearSecurityCache();
      stats = getSecurityCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should return cache statistics', () => {
      const stats = getSecurityCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.maxSize).toBe('number');
      expect(stats.maxSize).toBe(10000);
    });

    it('should populate cache with normalized keys', () => {
      const data = { 'Secret-Key': 'value', 'api_token': 'token_value' };
      sanitizeLogData(data);

      const stats = getSecurityCacheStats();
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('Edge Case Coverage Tests', () => {
    it('should mask URL fragments with sensitive keys (line 245)', () => {
      const url = 'https://example.com/api#token_secret';
      const masked = maskUrl(url);
      expect(masked).toBe('https://example.com/api#[REDACTED]');
    });

    it('should return original URL when parsing fails and no slash found (line 255)', () => {
      const url = 'not-a-url';
      const masked = maskUrl(url);
      expect(masked).toBe('not-a-url');
    });

    it('should handle circular references in arrays (line 298)', () => {
      const arr: any[] = [{ token: 'secret' }];
      arr.push(arr); // Create circular reference
      const sanitized = sanitizeLogData(arr);
      expect(sanitized).toEqual([{ token: '[REDACTED]' }, '[Circular Reference]']);
    });

    it('should handle circular references in objects (line 307)', () => {
      const obj: any = { token: 'secret' };
      obj.self = obj; // Create circular reference
      const sanitized = sanitizeLogData(obj);
      expect(sanitized).toEqual({ token: '[REDACTED]', self: '[Circular Reference]' });
    });

    it('should mask long strings in sensitive keys (line 322)', () => {
      // Line 322 is hit when: sensitive key + string + NOT credential format + > 50 chars
      // Use characters that break the alphanumeric credential pattern
      const longNonCredentialString = 'a'.repeat(25) + '@#$%^&*()!' + 'b'.repeat(25); // 60+ chars with special chars
      const data = { api_key: longNonCredentialString };
      const sanitized = sanitizeLogData(data);
      expect(sanitized).toEqual({ api_key: 'aaaa...' });
    });

    it('should handle unsupported types in sanitization (line 340)', () => {
      const func = function() { return 'test'; };
      const symbol = Symbol('test');

      const sanitizedFunc = sanitizeLogData(func);
      const sanitizedSymbol = sanitizeLogData(symbol);

      expect(sanitizedFunc).toBe('[Unsupported Type]');
      expect(sanitizedSymbol).toBe('[Unsupported Type]');
    });
  });
});