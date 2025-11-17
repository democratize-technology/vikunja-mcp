/**
 * FilterSerializer - Handles serialization and deserialization of filter expressions
 *
 * This service provides methods to convert filter expressions between different
 * formats (string, JSON, etc.) with proper error handling and validation.
 */

import type { FilterExpression, ParseResult } from '../../types/filters';

/**
 * Filter serialization result
 */
export interface FilterSerializationResult {
  success: boolean;
  data?: string | object;
  error?: string;
}

/**
 * FilterSerializer provides serialization and deserialization for filter expressions
 */
export class FilterSerializer {
  /**
   * Serialize a filter expression to JSON string
   */
  serialize(expression: FilterExpression): FilterSerializationResult {
    try {
      const serialized = JSON.stringify(expression, null, 2);
      return {
        success: true,
        data: serialized,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown serialization error',
      };
    }
  }

  /**
   * Deserialize a JSON string to filter expression
   */
  deserialize(jsonString: string): FilterSerializationResult {
    try {
      const parsed = JSON.parse(jsonString) as FilterExpression;

      // Basic validation of the structure
      if (!this.isValidExpression(parsed)) {
        return {
          success: false,
          error: 'Invalid filter expression structure',
        };
      }

      return {
        success: true,
        data: parsed,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown deserialization error',
      };
    }
  }

  /**
   * Convert filter expression to compact string representation
   */
  toCompactString(expression: FilterExpression): FilterSerializationResult {
    try {
      const compact = JSON.stringify(expression);
      return {
        success: true,
        data: compact,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown serialization error',
      };
    }
  }

  /**
   * Parse compact string representation back to filter expression
   */
  fromCompactString(compactString: string): FilterSerializationResult {
    return this.deserialize(compactString);
  }

  /**
   * Validate that the parsed object has the correct structure for a filter expression
   */
  private isValidExpression(obj: any): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    // Must have groups array
    if (!Array.isArray(obj.groups)) {
      return false;
    }

    // Each group must have conditions array and operator
    for (const group of obj.groups) {
      if (!group || typeof group !== 'object') {
        return false;
      }

      if (!Array.isArray(group.conditions) || !group.operator) {
        return false;
      }

      // Each condition must have field, operator, and value
      for (const condition of group.conditions) {
        if (!condition || typeof condition !== 'object') {
          return false;
        }

        if (!condition.field || !condition.operator || condition.value === undefined) {
          return false;
        }
      }
    }

    return true;
  }
}