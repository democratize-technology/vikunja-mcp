/**
 * Filter utilities for validation and query building
 * Refactored to use secure Zod-based validation instead of custom parsers
 */

// Re-export from the new Zod-based implementation
export {
  parseFilterString,
  validateCondition,
  validateFilterExpression,
  conditionToString,
  groupToString,
  expressionToString,
  FilterBuilder,
  SecurityValidator,
} from './filters-zod';

// Re-export types for backward compatibility
import type {
  FilterCondition,
  FilterExpression,
  FilterField,
  FilterGroup,
  FilterOperator,
  FilterValidationResult,
  FilterValidationConfig,
  LogicalOperator,
  ParseResult,
} from '../types/filters';

export type {
  FilterCondition,
  FilterExpression,
  FilterField,
  FilterGroup,
  FilterOperator,
  FilterValidationResult,
  FilterValidationConfig,
  LogicalOperator,
  ParseResult,
};

// Legacy implementation removed - now using secure Zod-based validation
// All functionality is now provided by ./filters-zod.ts
