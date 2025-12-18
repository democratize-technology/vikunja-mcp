/**
 * Tests for filter types
 */

import { describe, it, expect } from '@jest/globals';
import type {
  FilterCondition,
  FilterExpression,
  FilterField,
  FilterGroup,
  FilterOperator,
  LogicalOperator,
  SavedFilter,
} from '../../src/types/filters';

describe('Filter Types', () => {
  describe('FilterCondition', () => {
    it('should accept valid filter conditions', () => {
      const condition: FilterCondition = {
        field: 'priority',
        operator: '>=',
        value: 3,
      };

      expect(condition.field).toBe('priority');
      expect(condition.operator).toBe('>=');
      expect(condition.value).toBe(3);
    });

    it('should accept array values for in/not in operators', () => {
      const condition: FilterCondition = {
        field: 'assignees',
        operator: 'in',
        value: ['user1', 'user2'],
      };

      expect(condition.value).toEqual(['user1', 'user2']);
    });
  });

  describe('FilterGroup', () => {
    it('should group multiple conditions', () => {
      const group: FilterGroup = {
        conditions: [
          { field: 'done', operator: '=', value: false },
          { field: 'priority', operator: '>=', value: 3 },
        ],
        operator: '&&',
      };

      expect(group.conditions).toHaveLength(2);
      expect(group.operator).toBe('&&');
    });
  });

  describe('FilterExpression', () => {
    it('should combine multiple groups', () => {
      const expression: FilterExpression = {
        groups: [
          {
            conditions: [{ field: 'done', operator: '=', value: false }],
            operator: '&&',
          },
          {
            conditions: [{ field: 'priority', operator: '=', value: 5 }],
            operator: '&&',
          },
        ],
        operator: '||',
      };

      expect(expression.groups).toHaveLength(2);
      expect(expression.operator).toBe('||');
    });
  });

  describe('SavedFilter', () => {
    it('should contain all required fields', () => {
      const filter: SavedFilter = {
        id: '123',
        name: 'High Priority Tasks',
        description: 'All undone high priority tasks',
        filter: 'done = false && priority >= 4',
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      };

      expect(filter.id).toBe('123');
      expect(filter.name).toBe('High Priority Tasks');
      expect(filter.filter).toBe('done = false && priority >= 4');
      expect(filter.isGlobal).toBe(true);
    });

    it('should support project-specific filters', () => {
      const filter: SavedFilter = {
        id: '456',
        name: 'Project Tasks',
        filter: 'done = false',
        projectId: 42,
        created: new Date(),
        updated: new Date(),
        isGlobal: false,
      };

      expect(filter.projectId).toBe(42);
      expect(filter.isGlobal).toBe(false);
    });
  });
});
