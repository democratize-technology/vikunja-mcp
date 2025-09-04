/**
 * Date validation utilities for filter values
 */

const MAX_DATE_INPUT_LENGTH = 30;

const VALID_TIME_UNITS = new Set(['s', 'm', 'h', 'd', 'w', 'M', 'y']);
const VALID_PERIOD_UNITS = new Set(['d', 'w', 'M', 'y']);

/**
 * Date format validator for filter values
 */
export const DateValidator = {
  /**
   * Validates if a date value is in an acceptable format without using vulnerable regex
   * Replaces the ReDoS-vulnerable regex pattern for secure date validation
   */
  isValidDateValue(value: string): boolean {
    // Early security check: limit input length to prevent DoS
    if (value.length > MAX_DATE_INPUT_LENGTH) {
      return false;
    }

    // Validate 'now' patterns
    if (value.startsWith('now')) {
      return this.validateNowPattern(value);
    }
    
    // Validate ISO date format: YYYY-MM-DD (basic check)
    if (this.isIsoDateFormat(value)) {
      return this.validateIsoDate(value);
    }
    
    return false;
  },

  /**
   * Validates 'now' date patterns (now, now+5d, now-2w, now/d)
   */
  validateNowPattern(value: string): boolean {
    // Exact 'now'
    if (value === 'now') {
      return true;
    }
    
    // Relative dates: now+5d, now-2w, etc.
    if (this.isRelativeNowPattern(value)) {
      return this.validateRelativeNowPattern(value);
    }
    
    // Start of period: now/d, now/w, now/M
    if (this.isPeriodNowPattern(value)) {
      return this.validatePeriodNowPattern(value);
    }
    
    return false;
  },

  /**
   * Validates relative now patterns (now+5d, now-2w)
   */
  validateRelativeNowPattern(value: string): boolean {
    const remainder = value.slice(4);
    // Must have at least one digit followed by a time unit
    if (remainder.length < 2) return false;
    
    // Extract digits and unit
    let digitEnd = 0;
    while (digitEnd < remainder.length) {
      const char = remainder[digitEnd];
      if (!char || !/\d/.test(char)) break;
      digitEnd++;
    }
    
    if (digitEnd === 0) return false; // No digits found
    if (digitEnd !== remainder.length - 1) return false; // Must end with exactly one unit char
    
    const unit = remainder[remainder.length - 1];
    return unit ? VALID_TIME_UNITS.has(unit) : false;
  },

  /**
   * Validates period now patterns (now/d, now/w)
   */
  validatePeriodNowPattern(value: string): boolean {
    const unit = value[4];
    return unit ? VALID_PERIOD_UNITS.has(unit) : false;
  },

  /**
   * Checks if value matches relative now pattern structure
   */
  isRelativeNowPattern(value: string): boolean {
    return value.length >= 4 && (value[3] === '+' || value[3] === '-');
  },

  /**
   * Checks if value matches period now pattern structure
   */
  isPeriodNowPattern(value: string): boolean {
    return value.length === 5 && value[3] === '/';
  },

  /**
   * Checks if value matches ISO date format structure
   */
  isIsoDateFormat(value: string): boolean {
    return value.length === 10 && value[4] === '-' && value[7] === '-';
  },

  /**
   * Validates ISO date format components
   */
  validateIsoDate(value: string): boolean {
    const year = value.slice(0, 4);
    const month = value.slice(5, 7);
    const day = value.slice(8, 10);
    
    // Check all parts are digits
    if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
      return false;
    }
    
    // Basic range validation
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    return monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31;
  }
} as const;