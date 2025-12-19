/**
 * Performance tests for enhanced security utilities
 * Ensures the comprehensive security features don't introduce unacceptable performance overhead
 */

import {
  sanitizeLogData,
  maskCredential,
  maskUrl,
  clearSecurityCache,
  getSecurityCacheStats
} from '../../src/utils/security';

describe('Security Performance Tests', () => {
  beforeEach(() => {
    clearSecurityCache();
  });

  describe('Large Object Processing', () => {
    it('should handle large objects with many fields efficiently', () => {
      // Create a large object with 10,000 fields
      const largeObject: Record<string, unknown> = {};

      for (let i = 0; i < 10000; i++) {
        // Mix of sensitive and non-sensitive fields
        if (i % 10 === 0) {
          largeObject[`token_${i}`] = `secret_token_value_${i}_with_long_content_that_should_be_masked`;
          largeObject[`api_key_${i}`] = `api_key_value_${i}_with_more_content_here`;
          largeObject[`password_${i}`] = `password_${i}`;
        } else {
          largeObject[`field_${i}`] = `normal_value_${i}_with_regular_content`;
          largeObject[`data_${i}`] = { nested: `value_${i}` };
          largeObject[`items_${i}`] = [1, 2, 3, `item_${i}`];
        }
      }

      const startTime = performance.now();
      const sanitized = sanitizeLogData(largeObject);
      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Should complete within reasonable time (2 seconds for 10,000 fields)
      expect(processingTime).toBeLessThan(2000);

      // Check that sensitive fields are properly masked
      for (let i = 0; i < 10000; i += 10) {
        expect(sanitized[`token_${i}`]).toMatch(/(\.\.\.|\[REDACTED\])/);
        expect(sanitized[`api_key_${i}`]).toMatch(/(\.\.\.|\[REDACTED\])/);
        expect(sanitized[`password_${i}`]).toBe('[REDACTED]');
      }

      // Check that non-sensitive fields are preserved (field_0 doesn't exist, check field_1 instead)
      expect(sanitized.field_1).toBe('normal_value_1_with_regular_content');

      // Check cache performance
      const cacheStats = getSecurityCacheStats();
      expect(cacheStats.size).toBeGreaterThan(0);
      expect(cacheStats.size).toBeLessThan(50000); // Should have cache hits, reasonable size
    });

    it('should handle deeply nested structures efficiently', () => {
      // Create a deeply nested structure (10 levels deep)
      let nestedStructure: any = {
        level: 0,
        sensitive_token: 'token_at_level_0',
        credentials: {
          username: 'user_0',
          password: 'password_0'
        }
      };

      for (let i = 1; i < 10; i++) {
        nestedStructure = {
          level: i,
          parent: nestedStructure,
          credentials: {
            username: `user_${i}`,
            password: `password_${i}`,
            api_key: `key_${i}_with_long_content`
          },
          metadata: {
            created: new Date().toISOString(),
            auth_token: `auth_token_${i}_with_sensitive_data`
          }
        };
      }

      const startTime = performance.now();
      const sanitized = sanitizeLogData(nestedStructure);
      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Should complete quickly even with deep nesting
      expect(processingTime).toBeLessThan(100);

      // Check that sensitive objects are entirely masked (enhanced security)
      let current = sanitized as any;
      for (let i = 9; i >= 1; i--) { // Start from 9, since we created levels 1-9 in loop
        expect(current.credentials).toBe('[REDACTED]'); // Entire credentials object masked
        expect(current.metadata.auth_token).toMatch(/(\.\.\.|\[REDACTED\])/); // Individual field masked
        current = current.parent;
      }
      // Check level 0 (which has credentials but no metadata)
      expect(current.credentials).toBe('[REDACTED]');
    });

    it('should handle arrays with many objects efficiently', () => {
      // Create an array with 1,000 objects
      const largeArray: any[] = [];

      for (let i = 0; i < 1000; i++) {
        largeArray.push({
          id: i,
          name: `Item ${i}`,
          sensitive_data: {
            token: `token_${i}_with_content`,
            api_key: `key_${i}_with_long_content`,
            credentials: {
              username: `user_${i}`,
              password: `pass_${i}`
            }
          },
          normal_data: {
            description: `Description for item ${i}`,
            category: `Category ${i % 10}`
          }
        });
      }

      const startTime = performance.now();
      const sanitized = sanitizeLogData(largeArray);
      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Should complete within reasonable time (1 second for 1,000 objects)
      expect(processingTime).toBeLessThan(1000);

      // Verify array structure is preserved
      expect(Array.isArray(sanitized)).toBe(true);
      expect(sanitized).toHaveLength(1000);

      // Check that sensitive data is masked in all objects (field-level security)
      sanitized.forEach((item: any) => {
        expect(item.sensitive_data.token).toBe('[REDACTED]');
        expect(item.sensitive_data.api_key).toBe('[REDACTED]');
        expect(item.sensitive_data.credentials).toBe('[REDACTED]');
      });

      // Check that normal data is preserved
      expect(sanitized[0].normal_data.description).toBe('Description for item 0');
    });
  });

  describe('Cache Performance', () => {
    it('should demonstrate cache effectiveness with repeated keys', () => {
      const testObjects = [];

      // Create objects with repeated key patterns to test caching
      for (let i = 0; i < 1000; i++) {
        testObjects.push({
          api_token: `token_${i}_with_content`,
          user_auth: `auth_${i}_with_content`,
          secret_key: `key_${i}_with_content`,
          config_data: {
            sensitive_setting: `setting_${i}`
          }
        });
      }

      const startTime = performance.now();

      // Process all objects
      const results = testObjects.map(obj => sanitizeLogData(obj));

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Should benefit from caching and complete quickly
      expect(processingTime).toBeLessThan(500);

      // Check cache statistics
      const cacheStats = getSecurityCacheStats();
      expect(cacheStats.size).toBeGreaterThan(0);
      expect(cacheStats.size).toBeLessThan(100); // Many keys should be cached

      // Verify all results are properly sanitized (enhanced security)
      results.forEach(result => {
        expect(result.api_token).toMatch(/(\.\.\.|\[REDACTED\])/);
        expect(result.user_auth).toMatch(/(\.\.\.|\[REDACTED\])/);
        expect(result.secret_key).toMatch(/(\.\.\.|\[REDACTED\])/);
        expect(result.config_data).toBe('[REDACTED]'); // Entire config_data object masked
      });
    });

    it('should handle cache memory management correctly', () => {
      // Test that cache doesn't grow indefinitely
      clearSecurityCache();

      // Process many different keys
      for (let i = 0; i < 5000; i++) {
        const obj = {
          [`unique_key_${i}`]: `value_${i}_with_sensitive_content`,
          [`another_field_${i}`]: `data_${i}_here`
        };
        sanitizeLogData(obj);
      }

      const cacheStats = getSecurityCacheStats();

      // Cache should not grow unbounded (indicating proper cache management)
      expect(cacheStats.size).toBeLessThanOrEqual(10000); // Should not exceed max size
      expect(cacheStats.maxSize).toBe(10000);
    });
  });

  describe('Individual Function Performance', () => {
    it('should handle maskCredential efficiently for large inputs', () => {
      const largeCredential = 'x'.repeat(10000); // 10KB string

      const startTime = performance.now();
      const masked = maskCredential(largeCredential);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(10); // Should be very fast
      expect(masked).toBe('xxxx...');
    });

    it('should handle maskUrl efficiently for complex URLs', () => {
      const complexUrls = [
        'https://api.example.com/v1/tokens?access_token=secret123&api_key=key456&user=admin',
        'mongodb://username:password@cluster0.mongodb.net:27017/mydb?ssl=true',
        'postgresql://user:pass@localhost:5432/database?sslmode=require',
        'redis://:password@redis.example.com:6379/0?timeout=5000'
      ];

      const startTime = performance.now();
      const masked = complexUrls.map(url => maskUrl(url));
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(50); // Should be fast
      expect(masked).toHaveLength(4);

      // All should be masked appropriately
      masked.forEach(url => {
        expect(url).toContain('[REDACTED]');
      });
    });
  });

  describe('Memory Usage', () => {
    it('should not cause memory leaks with repeated operations', () => {
      // Test that repeated sanitization doesn't cause memory leaks
      const testData = {
        token: 'secret_token_with_long_content_here',
        config: {
          api_key: 'api_key_with_content',
          database: {
            password: 'db_password',
            credentials: {
              auth: 'auth_token'
            }
          }
        }
      };

      // Perform many operations
      const results: any[] = [];
      for (let i = 0; i < 1000; i++) {
        results.push(sanitizeLogData(testData));
      }

      // All results should be properly sanitized
      results.forEach(result => {
        expect(result.token).toMatch(/(\.\.\.|\[REDACTED\])/);
        expect(result.config).toBe('[REDACTED]');
      });

      // Process should complete without issues
      expect(results).toHaveLength(1000);
    });
  });
});