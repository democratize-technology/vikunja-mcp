/**
 * Simple security validator edge case tests
 * Focus on uncovered lines 33 and 83
 */

import { SecurityValidator, type SecurityValidationError } from '../../../src/utils/validators/SecurityValidator';

describe('SecurityValidator - Simple Edge Cases', () => {
  describe('sanitizeFilterInput - Defensive programming', () => {
    it('should handle null and undefined inputs', () => {
      const result1 = SecurityValidator.sanitizeFilterInput(null as any);
      expect(result1).toEqual({ sanitized: '', isValid: false });

      const result2 = SecurityValidator.sanitizeFilterInput(undefined as any);
      expect(result2).toEqual({ sanitized: '', isValid: false });
    });

    it('should handle non-string inputs', () => {
      const result1 = SecurityValidator.sanitizeFilterInput(123 as any);
      expect(result1).toEqual({ sanitized: '', isValid: false });
    });
  });

  describe('validateQuotedValue - Edge cases', () => {
    it('should handle boundary length validation', () => {
      const boundaryValue = 'a'.repeat(200);
      expect(SecurityValidator.validateQuotedValue(boundaryValue)).toBe(true);

      const overBoundaryValue = 'a'.repeat(201);
      expect(SecurityValidator.validateQuotedValue(overBoundaryValue)).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(SecurityValidator.validateQuotedValue('')).toBe(true);
    });
  });

  describe('Security error handling', () => {
    it('should create properly typed security errors', () => {
      try {
        SecurityValidator.validateFilterStringLength('a'.repeat(1001));
      } catch (error) {
        const securityError = error as SecurityValidationError;
        expect(securityError.code).toBe('TOO_LONG');
      }
    });
  });
});
