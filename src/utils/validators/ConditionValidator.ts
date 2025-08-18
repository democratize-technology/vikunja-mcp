/**
 * Condition validation for individual filter conditions
 */

import { DateValidator } from './DateValidator';
import type {
  FilterCondition,
  FilterField,
  FilterOperator,
} from '../../types/filters';

/**
 * Valid field types for validation
 */
const FIELD_TYPES: Record<FilterField, 'boolean' | 'number' | 'date' | 'string' | 'array'> = {
  done: 'boolean',
  priority: 'number',
  percentDone: 'number',
  dueDate: 'date',
  assignees: 'array',
  labels: 'array',
  created: 'date',
  updated: 'date',
  title: 'string',
  description: 'string',
};

/**
 * Valid operators for each field type
 */
const VALID_OPERATORS: Record<string, FilterOperator[]> = {
  boolean: ['=', '!='],
  number: ['=', '!=', '>', '>=', '<', '<='],
  date: ['=', '!=', '>', '>=', '<', '<='],
  string: ['=', '!=', 'like'],
  array: ['in', 'not in'],
};

/**
 * Validator for individual filter conditions
 */
export const ConditionValidator = {
  /**
   * Validates a single filter condition
   */
  validate(condition: FilterCondition): string[] {
    const errors: string[] = [];

    // Check if field is valid
    if (!FIELD_TYPES[condition.field]) {
      errors.push(`Invalid field: ${condition.field}`);
      return errors;
    }

    const fieldType = FIELD_TYPES[condition.field];
    const validOperators = VALID_OPERATORS[fieldType];

    // Check if operator is valid for field type
    if (!validOperators || !validOperators.includes(condition.operator)) {
      errors.push(
        `Invalid operator "${condition.operator}" for field "${condition.field}" of type "${fieldType}"`,
      );
    }

    // Validate value type
    const valueErrors = this.validateValueByType(condition, fieldType);
    errors.push(...valueErrors);

    return errors;
  },

  /**
   * Validates value based on field type
   */
  validateValueByType(condition: FilterCondition, fieldType: string): string[] {
    const errors: string[] = [];

    switch (fieldType) {
      case 'boolean':
        errors.push(...this.validateBooleanValue(condition));
        break;
      case 'number':
        errors.push(...this.validateNumberValue(condition));
        break;
      case 'date':
        errors.push(...this.validateDateValue(condition));
        break;
      case 'array':
        errors.push(...this.validateArrayValue(condition));
        break;
      // string fields don't need special validation
    }

    return errors;
  },

  /**
   * Validates boolean field values
   */
  validateBooleanValue(condition: FilterCondition): string[] {
    const errors: string[] = [];
    
    if (
      typeof condition.value !== 'boolean' &&
      condition.value !== 'true' &&
      condition.value !== 'false'
    ) {
      errors.push(`Field "${condition.field}" requires a boolean value`);
    }

    return errors;
  },

  /**
   * Validates numeric field values
   */
  validateNumberValue(condition: FilterCondition): string[] {
    const errors: string[] = [];
    
    if (typeof condition.value !== 'number' && isNaN(Number(condition.value))) {
      errors.push(`Field "${condition.field}" requires a numeric value`);
    }

    return errors;
  },

  /**
   * Validates date field values
   */
  validateDateValue(condition: FilterCondition): string[] {
    const errors: string[] = [];
    
    if (typeof condition.value === 'string') {
      if (!DateValidator.isValidDateValue(condition.value)) {
        errors.push(
          `Field "${condition.field}" requires a valid date value (ISO date or relative date like "now+1d")`,
        );
      }
    }

    return errors;
  },

  /**
   * Validates array field values
   */
  validateArrayValue(condition: FilterCondition): string[] {
    const errors: string[] = [];
    
    if (!Array.isArray(condition.value) && typeof condition.value !== 'string') {
      errors.push(`Field "${condition.field}" requires an array or comma-separated string value`);
    }

    return errors;
  }
} as const;