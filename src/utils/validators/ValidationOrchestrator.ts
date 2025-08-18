/**
 * Central orchestrator for all validation concerns
 */

import { SecurityValidator } from './SecurityValidator';
import { ConditionValidator } from './ConditionValidator';
import type {
  FilterExpression,
  FilterGroup,
  FilterValidationResult,
  FilterValidationConfig,
  FilterCondition,
} from '../../types/filters';

/**
 * Orchestrates all validation concerns for filter expressions
 */
export const ValidationOrchestrator = {
  /**
   * Validates a complete filter expression
   */
  validateFilterExpression(
    expression: FilterExpression,
    config: FilterValidationConfig = {},
  ): FilterValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const performanceThreshold = config.performanceWarningThreshold ?? 10;

    // Basic structure validation
    if (!expression.groups || expression.groups.length === 0) {
      errors.push('Filter expression must contain at least one group');
    } else {
      // Validate each group
      expression.groups.forEach((group, groupIndex) => {
        const groupErrors = this.validateGroup(group, groupIndex);
        errors.push(...groupErrors);
      });

      // Performance warnings
      const performanceWarnings = this.generatePerformanceWarnings(expression, performanceThreshold);
      warnings.push(...performanceWarnings);
    }

    const result: FilterValidationResult = {
      valid: errors.length === 0,
      errors,
    };

    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  },

  /**
   * Validates a filter condition using the specialized validator
   */
  validateCondition(condition: FilterCondition): string[] {
    return ConditionValidator.validate(condition);
  },

  /**
   * Validates a filter group
   */
  validateGroup(group: FilterGroup, groupIndex: number): string[] {
    const errors: string[] = [];

    if (!group.conditions || group.conditions.length === 0) {
      errors.push(`Group ${groupIndex + 1} must contain at least one condition`);
      return errors;
    }

    group.conditions.forEach((condition: FilterCondition, conditionIndex: number) => {
      const conditionErrors = this.validateCondition(condition);
      conditionErrors.forEach((errorMessage) => {
        errors.push(`Group ${groupIndex + 1}, Condition ${conditionIndex + 1}: ${errorMessage}`);
      });
    });

    return errors;
  },

  /**
   * Generates performance warnings for complex filters
   */
  generatePerformanceWarnings(expression: FilterExpression, threshold: number): string[] {
    const warnings: string[] = [];
    
    const totalConditions = expression.groups.reduce(
      (sum, group) => sum + group.conditions.length,
      0,
    );

    if (totalConditions > threshold) {
      warnings.push(
        `Complex filters with many conditions (${totalConditions}) may impact performance`,
      );
    }

    return warnings;
  },

  /**
   * Validates input security with centralized security validation
   */
  validateInputSecurity(input: string): { isValid: boolean; error?: string } {
    try {
      SecurityValidator.validateFilterStringLength(input);
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Filter string validation failed'
      };
    }

    const { isValid } = SecurityValidator.sanitizeFilterInput(input);
    if (!isValid) {
      return {
        isValid: false,
        error: 'Filter string contains invalid characters'
      };
    }

    return { isValid: true };
  }
} as const;