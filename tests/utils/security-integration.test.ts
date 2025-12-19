/**
 * Integration tests for security fixes in index.ts
 * Verifies that credential exposure vulnerability is resolved
 */

import { createSecureConnectionMessage, createSecureLogConfig } from '../../src/utils/security';

describe('Security Integration Tests', () => {
  describe('Real-world credential scenarios', () => {
    it('should properly mask Vikunja API token in connection message', () => {
      const url = 'https://vikunja.example.com/api/v1';
      const token = 'tk_abc123def456ghi789jkl012mno345pqr';
      
      const message = createSecureConnectionMessage(url, token, 'API');
      
      expect(message).toBe('Connecting to https://vikunja.example.com/api/v1 with API token tk_a...');
      expect(message).not.toContain('abc123def456ghi789jkl012mno345pqr');
      expect(message).not.toContain(token);
    });

    it('should properly mask JWT token in connection message', () => {
      const url = 'https://vikunja.example.com/api/v1';
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      
      const message = createSecureConnectionMessage(url, jwt, 'JWT');
      
      expect(message).toBe('Connecting to https://vikunja.example.com/api/v1 with JWT token eyJh...');
      expect(message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(message).not.toContain(jwt);
    });

    it('should safely log configuration with environment variables', () => {
      const mockEnvConfig = {
        mode: 'production',
        debug: 'false',
        loggedIn: true,
        url: 'https://vikunja.example.com/api/v1',
        token: 'tk_supersecretapitoken123456789',
        database_password: 'db_secret_password_123',
        jwt_secret: 'very_long_jwt_secret_key_for_signing_tokens'
      };

      const secureConfig = createSecureLogConfig(mockEnvConfig);

      // Verify safe values are preserved
      expect(secureConfig.mode).toBe('production');
      expect(secureConfig.debug).toBe('false');
      expect(secureConfig.loggedIn).toBe(true);
      expect(secureConfig.url).toBe('[REDACTED]'); // Enhanced security: URLs are now considered sensitive

      // Verify sensitive values are masked (enhanced security is more comprehensive)
      expect(secureConfig.token).toBe('tk_s...');
      expect(secureConfig.database_password).toBe('[REDACTED]'); // Enhanced security: database and password keywords
      expect(secureConfig.jwt_secret).toBe('[REDACTED]'); // Enhanced security: jwt and secret keywords

      // Verify original sensitive values are not present
      expect(JSON.stringify(secureConfig)).not.toContain('supersecretapitoken123456789');
      expect(JSON.stringify(secureConfig)).not.toContain('db_secret_password_123');
      expect(JSON.stringify(secureConfig)).not.toContain('very_long_jwt_secret_key_for_signing_tokens');
    });

    it('should handle URLs with authentication parameters', () => {
      const sensitiveUrl = 'https://vikunja.example.com/auth/login?token=secret123&redirect=/dashboard';
      const message = createSecureConnectionMessage(sensitiveUrl, 'tk_token123', 'API');
      
      expect(message).toBe('Connecting to https://vikunja.example.com/auth/[REDACTED]?[REDACTED] with API token tk_t...');
      expect(message).not.toContain('secret123');
      expect(message).not.toContain('redirect=/dashboard');
    });
  });

  describe('Vulnerability verification', () => {
    it('should never log plaintext credentials', () => {
      const credentials = [
        'tk_abc123def456ghi789',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
        'very_secret_password_123',
        'api_key_abcdef123456789'
      ];

      credentials.forEach(credential => {
        const message = createSecureConnectionMessage('https://example.com', credential);
        expect(message).not.toContain(credential);
        expect(message).toMatch(/\w{4}\.\.\./ ); // Should contain masked format
      });
    });

    it('should never log sensitive URL components', () => {
      const sensitiveUrls = [
        'https://api.com/auth/secret123',
        'https://api.com/login/user456', 
        'https://api.com/key/private789',
        'https://api.com/api/v1/token/abc123'
      ];

      sensitiveUrls.forEach(url => {
        const message = createSecureConnectionMessage(url, 'tk_test');
        expect(message).toContain('[REDACTED]');
        expect(message).not.toContain('secret123');
        expect(message).not.toContain('user456');
        expect(message).not.toContain('private789');
        expect(message).not.toContain('abc123');
      });
    });

    it('should preserve debugging utility while ensuring security', () => {
      const config = {
        server_host: 'localhost',
        server_port: 3000,
        api_token: 'tk_secret123456789',
        features: ['auth', 'projects', 'tasks'],
        limits: { maxTasks: 1000, maxProjects: 50 }
      };

      const secureConfig = createSecureLogConfig(config);

      // Enhanced security: host and port information are now considered sensitive
      expect(secureConfig.server_host).toBe('[REDACTED]'); // Enhanced security: host info is sensitive
      expect(secureConfig.server_port).toBe('[REDACTED]'); // Enhanced security: port info is also sensitive
      expect(secureConfig.features).toEqual(['auth', 'projects', 'tasks']);
      expect(secureConfig.limits).toEqual({ maxTasks: 1000, maxProjects: 50 });

      // Sensitive info should be masked
      expect(secureConfig.api_token).toBe('tk_s...');
      expect(JSON.stringify(secureConfig)).not.toContain('secret123456789');
    });
  });
});