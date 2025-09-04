/**
 * Security-focused input validation for filter strings
 */

/**
 * Security constants for input validation
 */
const MAX_FILTER_LENGTH = 1000;
const SAFE_VALUE_PATTERN = /^[a-zA-Z0-9_\-+.:/%"'\s\\\u00C0-\u017F\u4E00-\u9FFF]+$/;
// Strict allowlist - only characters absolutely necessary for filter syntax
// Excludes: control chars (including DEL), dangerous punctuation like {}, [], $, ~, ^, #, backticks  
const ALLOWED_CHARS = /^[\t\n\r\u0020-\u007D\u00C0-\u017F\u4E00-\u9FFF]*$/;
const MAX_VALUE_LENGTH = 200;

export interface SecurityValidationResult {
  sanitized: string;
  isValid: boolean;
}

export interface SecurityValidationError extends Error {
  code: 'INVALID_CHARACTERS' | 'TOO_LONG' | 'UNSAFE_VALUE';
}

/**
 * Security validator for filter inputs
 */
export const SecurityValidator = {
  /**
   * Sanitizes filter input to prevent injection attacks
   */
  sanitizeFilterInput(input: string): SecurityValidationResult {
    if (!input || typeof input !== 'string') {
      return { sanitized: '', isValid: false };
    }

    // Check if input contains only allowed characters
    const isValid = ALLOWED_CHARS.test(input);
    
    // If invalid, return original with validation flag
    if (!isValid) {
      return { sanitized: input, isValid: false };
    }

    // If valid, return sanitized version (trimmed)
    return { sanitized: input.trim(), isValid: true };
  },

  /**
   * Validates filter string length
   */
  validateFilterStringLength(input: string): void {
    if (input.length > MAX_FILTER_LENGTH) {
      const error = new Error(`Filter string too long. Maximum length is ${MAX_FILTER_LENGTH} characters, got ${input.length}`) as SecurityValidationError;
      error.code = 'TOO_LONG';
      throw error;
    }
  },

  /**
   * Validates if a value is safe for tokenization
   */
  isSafeValue(value: string): boolean {
    // Allow empty strings
    if (value.length === 0) {
      return true;
    }
    
    // Check for reasonable length (prevents DoS)
    if (value.length > MAX_VALUE_LENGTH) {
      return false;
    }

    // Use allowlist approach - only allow safe characters for values
    // More restrictive than the general filter pattern
    return SAFE_VALUE_PATTERN.test(value);
  },

  /**
   * Validates security constraints for quoted values during tokenization
   */
  validateQuotedValue(value: string): boolean {
    if (value.length > MAX_VALUE_LENGTH) {
      return false; // Reject overly long quoted strings
    }

    return this.isSafeValue(value);
  }
} as const;