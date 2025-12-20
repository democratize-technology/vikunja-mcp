/**
 * Filter Serializer
 *
 * Handles serialization and validation of filter expressions
 * with proper type safety for the storage layer.
 */

import type { FilterExpression } from '../../types/filters';

export class FilterSerializer {
  /**
   * Validates if an object is a proper filter expression
   */
  private isValidExpression(input: unknown): boolean {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const inputObj = input as Record<string, unknown>;

    // Must have groups array
    if (!Array.isArray(inputObj.groups)) {
      return false;
    }

    // Validate each group
    for (const group of inputObj.groups) {
      if (!this.isValidGroup(group)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validates if an object is a proper filter group
   */
  private isValidGroup(input: unknown): boolean {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const inputObj = input as Record<string, unknown>;

    // Must have conditions array and operator
    if (!Array.isArray(inputObj.conditions) || typeof inputObj.operator !== 'string') {
      return false;
    }

    // Validate operator
    if (!['&&', '||'].includes(inputObj.operator)) {
      return false;
    }

    // Validate each condition
    for (const condition of inputObj.conditions) {
      if (!this.isValidCondition(condition)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validates if an object is a proper filter condition
   */
  private isValidCondition(input: unknown): boolean {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const inputObj = input as Record<string, unknown>;

    // Must have field, operator, and value
    if (typeof inputObj.field !== 'string' || typeof inputObj.operator !== 'string') {
      return false;
    }

    // Validate operator
    const validOperators = ['=', '!=', '>', '>=', '<', '<=', 'like', 'LIKE', 'in', 'not in'];
    if (!validOperators.includes(inputObj.operator)) {
      return false;
    }

    // Value can be any type (string, number, boolean, array)
    return true;
  }

  /**
   * Serialize a filter expression to JSON string
   */
  serialize(expression: FilterExpression): string {
    if (!this.isValidExpression(expression)) {
      throw new Error('Invalid filter expression');
    }

    return JSON.stringify(expression);
  }

  /**
   * Deserialize a JSON string to filter expression
   */
  deserialize(data: string): FilterExpression {
    try {
      const parsed: unknown = JSON.parse(data);

      if (!this.isValidExpression(parsed)) {
        throw new Error('Invalid filter expression structure');
      }

      return parsed as FilterExpression;
    } catch (error) {
      throw new Error(`Failed to deserialize filter expression: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate filter expression structure
   */
  validate(expression: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!expression || typeof expression !== 'object') {
      errors.push('Expression must be an object');
      return { valid: false, errors };
    }

    const exprObj = expression as Record<string, unknown>;

    if (!Array.isArray(exprObj.groups)) {
      errors.push('Expression must have a groups array');
    } else {
      exprObj.groups.forEach((group: unknown, index: number) => {
        const groupErrors = this.validateGroup(group, `groups[${index}]`);
        errors.push(...groupErrors);
      });
    }

    if (exprObj.operator && !['&&', '||'].includes(exprObj.operator as string)) {
      errors.push('Invalid operator at root level');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a filter group
   */
  private validateGroup(group: unknown, path: string): string[] {
    const errors: string[] = [];

    if (!group || typeof group !== 'object') {
      errors.push(`${path} must be an object`);
      return errors;
    }

    const groupObj = group as Record<string, unknown>;

    if (!Array.isArray(groupObj.conditions)) {
      errors.push(`${path}.conditions must be an array`);
    } else {
      groupObj.conditions.forEach((condition: unknown, condIndex: number) => {
        const condErrors = this.validateCondition(condition, `${path}.conditions[${condIndex}]`);
        errors.push(...condErrors);
      });
    }

    if (!['&&', '||'].includes(groupObj.operator as string)) {
      errors.push(`${path}.operator must be '&&' or '||'`);
    }

    return errors;
  }

  /**
   * Validate a filter condition
   */
  private validateCondition(condition: unknown, path: string): string[] {
    const errors: string[] = [];

    if (!condition || typeof condition !== 'object') {
      errors.push(`${path} must be an object`);
      return errors;
    }

    const conditionObj = condition as Record<string, unknown>;

    if (typeof conditionObj.field !== 'string') {
      errors.push(`${path}.field must be a string`);
    }

    const validOperators = ['=', '!=', '>', '>=', '<', '<=', 'like', 'LIKE', 'in', 'not in'];
    if (!validOperators.includes(conditionObj.operator as string)) {
      errors.push(`${path}.operator must be one of: ${validOperators.join(', ')}`);
    }

    if (conditionObj.value === undefined) {
      errors.push(`${path}.value is required`);
    }

    return errors;
  }
}