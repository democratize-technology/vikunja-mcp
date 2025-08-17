/**
 * Comprehensive tests for tasks filter evaluation functions
 * Tests all branches, edge cases, and defensive programming patterns
 */

import { describe, it, expect } from '@jest/globals';
import type { Task } from 'node-vikunja';
import type { FilterCondition, FilterGroup, FilterExpression } from '../../../src/types/filters';
import {
  evaluateCondition,
  evaluateComparison,
  evaluateDateComparison,
  parseRelativeDate,
  evaluateStringComparison,
  evaluateArrayComparison,
  evaluateGroup,
  applyFilter,
} from '../../../src/tools/tasks/filters';

// Mock task data for testing
const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: 1,
  title: 'Test Task',
  description: 'Test description',
  done: false,
  priority: 3,
  percent_done: 50,
  due_date: '2025-12-31T23:59:59Z',
  created: '2025-01-01T00:00:00Z',
  updated: '2025-06-01T12:00:00Z',
  project_id: 1,
  assignees: [{ id: 1, username: 'user1' }, { id: 2, username: 'user2' }],
  labels: [{ id: 10, title: 'urgent' }, { id: 20, title: 'bug' }],
  ...overrides,
});

describe('Filter Evaluation Functions', () => {
  describe('evaluateCondition', () => {
    describe('done field', () => {
      it('should evaluate done = true', () => {
        const task = createMockTask({ done: true });
        const condition: FilterCondition = { field: 'done', operator: '=', value: true };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should evaluate done = false', () => {
        const task = createMockTask({ done: false });
        const condition: FilterCondition = { field: 'done', operator: '=', value: false };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should evaluate done with string values', () => {
        const task = createMockTask({ done: true });
        const condition: FilterCondition = { field: 'done', operator: '=', value: 'true' };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should evaluate done != operator', () => {
        const task = createMockTask({ done: true });
        const condition: FilterCondition = { field: 'done', operator: '!=', value: false };
        expect(evaluateCondition(task, condition)).toBe(true);
      });
    });

    describe('priority field', () => {
      it('should evaluate priority with existing value', () => {
        const task = createMockTask({ priority: 5 });
        const condition: FilterCondition = { field: 'priority', operator: '>', value: 3 };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should handle undefined priority (defensive pattern)', () => {
        const task = createMockTask({ priority: undefined });
        const condition: FilterCondition = { field: 'priority', operator: '>', value: 3 };
        expect(evaluateCondition(task, condition)).toBe(false);
      });

      it('should evaluate priority equality', () => {
        const task = createMockTask({ priority: 3 });
        const condition: FilterCondition = { field: 'priority', operator: '=', value: 3 };
        expect(evaluateCondition(task, condition)).toBe(true);
      });
    });

    describe('percentDone field', () => {
      it('should evaluate percentDone with existing value', () => {
        const task = createMockTask({ percent_done: 75 });
        const condition: FilterCondition = { field: 'percentDone', operator: '>=', value: 50 };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should handle undefined percent_done (defensive pattern)', () => {
        const task = createMockTask({ percent_done: undefined });
        const condition: FilterCondition = { field: 'percentDone', operator: '>=', value: 50 };
        expect(evaluateCondition(task, condition)).toBe(false);
      });
    });

    describe('dueDate field', () => {
      it('should evaluate dueDate with existing value', () => {
        const task = createMockTask({ due_date: '2025-12-31T23:59:59Z' });
        const condition: FilterCondition = { field: 'dueDate', operator: '>', value: '2025-01-01' };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should handle null due_date with != operator (defensive pattern)', () => {
        const task = createMockTask({ due_date: null });
        const condition: FilterCondition = { field: 'dueDate', operator: '!=', value: '2025-12-31' };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should handle null due_date with = operator (defensive pattern)', () => {
        const task = createMockTask({ due_date: null });
        const condition: FilterCondition = { field: 'dueDate', operator: '=', value: '2025-12-31' };
        expect(evaluateCondition(task, condition)).toBe(false);
      });

      it('should handle undefined due_date (defensive pattern)', () => {
        const task = createMockTask({ due_date: undefined });
        const condition: FilterCondition = { field: 'dueDate', operator: '>', value: '2025-01-01' };
        expect(evaluateCondition(task, condition)).toBe(false);
      });
    });

    describe('created field', () => {
      it('should evaluate created date', () => {
        const task = createMockTask({ created: '2025-01-01T00:00:00Z' });
        const condition: FilterCondition = { field: 'created', operator: '>', value: '2024-12-31' };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should handle null created date (defensive pattern)', () => {
        const task = createMockTask({ created: null });
        const condition: FilterCondition = { field: 'created', operator: '>', value: '2024-12-31' };
        expect(evaluateCondition(task, condition)).toBe(false);
      });

      it('should handle undefined created date (defensive pattern)', () => {
        const task = createMockTask({ created: undefined });
        const condition: FilterCondition = { field: 'created', operator: '>', value: '2024-12-31' };
        expect(evaluateCondition(task, condition)).toBe(false);
      });
    });

    describe('updated field', () => {
      it('should evaluate updated date', () => {
        const task = createMockTask({ updated: '2025-06-01T12:00:00Z' });
        const condition: FilterCondition = { field: 'updated', operator: '<', value: '2025-07-01' };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should handle null updated date (defensive pattern)', () => {
        const task = createMockTask({ updated: null });
        const condition: FilterCondition = { field: 'updated', operator: '<', value: '2025-07-01' };
        expect(evaluateCondition(task, condition)).toBe(false);
      });

      it('should handle undefined updated date (defensive pattern)', () => {
        const task = createMockTask({ updated: undefined });
        const condition: FilterCondition = { field: 'updated', operator: '<', value: '2025-07-01' };
        expect(evaluateCondition(task, condition)).toBe(false);
      });
    });

    describe('title field', () => {
      it('should evaluate title equality', () => {
        const task = createMockTask({ title: 'Important Task' });
        const condition: FilterCondition = { field: 'title', operator: '=', value: 'Important Task' };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should evaluate title with like operator', () => {
        const task = createMockTask({ title: 'Important Task' });
        const condition: FilterCondition = { field: 'title', operator: 'like', value: 'important' };
        expect(evaluateCondition(task, condition)).toBe(true);
      });
    });

    describe('description field', () => {
      it('should evaluate description with existing value', () => {
        const task = createMockTask({ description: 'Detailed description' });
        const condition: FilterCondition = { field: 'description', operator: 'like', value: 'detailed' };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should handle undefined description (defensive pattern)', () => {
        const task = createMockTask({ description: undefined });
        const condition: FilterCondition = { field: 'description', operator: 'like', value: 'test' };
        expect(evaluateCondition(task, condition)).toBe(false);
      });

      it('should handle null description (defensive pattern)', () => {
        const task = createMockTask({ description: null });
        const condition: FilterCondition = { field: 'description', operator: 'like', value: 'test' };
        expect(evaluateCondition(task, condition)).toBe(false);
      });
    });

    describe('assignees field', () => {
      it('should evaluate assignees with array value', () => {
        const task = createMockTask();
        const condition: FilterCondition = { field: 'assignees', operator: 'in', value: [1, 3] };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should evaluate assignees with single value', () => {
        const task = createMockTask();
        const condition: FilterCondition = { field: 'assignees', operator: 'in', value: 2 };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should handle undefined assignees (defensive pattern)', () => {
        const task = createMockTask({ assignees: undefined });
        const condition: FilterCondition = { field: 'assignees', operator: 'in', value: [1] };
        expect(evaluateCondition(task, condition)).toBe(false);
      });

      it('should handle empty assignees array (defensive pattern)', () => {
        const task = createMockTask({ assignees: [] });
        const condition: FilterCondition = { field: 'assignees', operator: 'in', value: [1] };
        expect(evaluateCondition(task, condition)).toBe(false);
      });
    });

    describe('labels field', () => {
      it('should evaluate labels with array value', () => {
        const task = createMockTask();
        const condition: FilterCondition = { field: 'labels', operator: 'in', value: [10, 30] };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should evaluate labels with single value', () => {
        const task = createMockTask();
        const condition: FilterCondition = { field: 'labels', operator: 'in', value: 20 };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should handle undefined labels (defensive pattern)', () => {
        const task = createMockTask({ labels: undefined });
        const condition: FilterCondition = { field: 'labels', operator: 'in', value: [10] };
        expect(evaluateCondition(task, condition)).toBe(false);
      });

      it('should handle labels with undefined IDs (defensive pattern)', () => {
        const task = createMockTask({ 
          labels: [{ id: 10, title: 'valid' }, { id: undefined, title: 'invalid' }] 
        });
        const condition: FilterCondition = { field: 'labels', operator: 'in', value: [10] };
        expect(evaluateCondition(task, condition)).toBe(true);
      });

      it('should handle empty labels array (defensive pattern)', () => {
        const task = createMockTask({ labels: [] });
        const condition: FilterCondition = { field: 'labels', operator: 'in', value: [10] };
        expect(evaluateCondition(task, condition)).toBe(false);
      });
    });

    describe('unknown field (defensive pattern)', () => {
      it('should return false for unknown field', () => {
        const task = createMockTask();
        const condition: FilterCondition = { field: 'unknownField' as any, operator: '=', value: 'test' };
        expect(evaluateCondition(task, condition)).toBe(false);
      });
    });
  });

  describe('evaluateComparison', () => {
    it('should evaluate equality', () => {
      expect(evaluateComparison(5, '=', 5)).toBe(true);
      expect(evaluateComparison(5, '=', 3)).toBe(false);
    });

    it('should evaluate inequality', () => {
      expect(evaluateComparison(5, '!=', 3)).toBe(true);
      expect(evaluateComparison(5, '!=', 5)).toBe(false);
    });

    it('should evaluate greater than', () => {
      expect(evaluateComparison(5, '>', 3)).toBe(true);
      expect(evaluateComparison(3, '>', 5)).toBe(false);
    });

    it('should evaluate greater than or equal', () => {
      expect(evaluateComparison(5, '>=', 5)).toBe(true);
      expect(evaluateComparison(5, '>=', 3)).toBe(true);
      expect(evaluateComparison(3, '>=', 5)).toBe(false);
    });

    it('should evaluate less than', () => {
      expect(evaluateComparison(3, '<', 5)).toBe(true);
      expect(evaluateComparison(5, '<', 3)).toBe(false);
    });

    it('should evaluate less than or equal', () => {
      expect(evaluateComparison(3, '<=', 3)).toBe(true);
      expect(evaluateComparison(3, '<=', 5)).toBe(true);
      expect(evaluateComparison(5, '<=', 3)).toBe(false);
    });

    it('should handle unknown operator (defensive pattern)', () => {
      expect(evaluateComparison(5, 'unknown', 3)).toBe(false);
    });

    it('should handle type coercion for numbers', () => {
      expect(evaluateComparison('5', '>', '3')).toBe(true);
      expect(evaluateComparison('3', '<', '5')).toBe(true);
    });
  });

  describe('evaluateDateComparison', () => {
    it('should evaluate date equality', () => {
      // Date equality compares the date string part, not exact timestamps
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', '>', '2024-12-31')).toBe(true);
      expect(evaluateDateComparison('2025-01-01T12:00:00Z', '<', '2025-01-02')).toBe(true);
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', '!=', '2025-01-02')).toBe(true);
    });

    it('should evaluate date inequality', () => {
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', '!=', '2025-01-02')).toBe(true);
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', '!=', '2025-01-01')).toBe(false);
    });

    it('should evaluate date greater than', () => {
      expect(evaluateDateComparison('2025-01-02T00:00:00Z', '>', '2025-01-01')).toBe(true);
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', '>', '2025-01-02')).toBe(false);
    });

    it('should evaluate date greater than or equal', () => {
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', '>=', '2025-01-01')).toBe(true);
      expect(evaluateDateComparison('2025-01-02T00:00:00Z', '>=', '2025-01-01')).toBe(true);
    });

    it('should evaluate date less than', () => {
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', '<', '2025-01-02')).toBe(true);
      expect(evaluateDateComparison('2025-01-02T00:00:00Z', '<', '2025-01-01')).toBe(false);
    });

    it('should evaluate date less than or equal', () => {
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', '<=', '2025-01-01')).toBe(true);
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', '<=', '2025-01-02')).toBe(true);
    });

    it('should handle relative dates', () => {
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', '<', 'now')).toBe(true);
    });

    it('should handle invalid expected date (defensive pattern)', () => {
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', '=', 'invalid-date')).toBe(false);
    });

    it('should handle unknown operator (defensive pattern)', () => {
      expect(evaluateDateComparison('2025-01-01T00:00:00Z', 'unknown', '2025-01-01')).toBe(false);
    });
  });

  describe('parseRelativeDate', () => {
    it('should parse ISO date format', () => {
      const result = parseRelativeDate('2025-01-01T00:00:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toContain('2025-01-01');
    });

    it('should parse ISO date format without time', () => {
      const result = parseRelativeDate('2025-12-31');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toContain('2025-12-31');
    });

    it('should parse "now"', () => {
      const result = parseRelativeDate('now');
      expect(result).toBeInstanceOf(Date);
      const now = new Date();
      expect(Math.abs(result!.getTime() - now.getTime())).toBeLessThan(1000);
    });

    it('should parse relative dates with seconds', () => {
      const result = parseRelativeDate('now+30s');
      expect(result).toBeInstanceOf(Date);
      const expected = new Date();
      expected.setSeconds(expected.getSeconds() + 30);
      expect(Math.abs(result!.getTime() - expected.getTime())).toBeLessThan(1000);
    });

    it('should parse relative dates with minutes', () => {
      const result = parseRelativeDate('now-15m');
      expect(result).toBeInstanceOf(Date);
    });

    it('should parse relative dates with hours', () => {
      const result = parseRelativeDate('now+2h');
      expect(result).toBeInstanceOf(Date);
    });

    it('should parse relative dates with days (default unit)', () => {
      const result = parseRelativeDate('now+7');
      expect(result).toBeInstanceOf(Date);
    });

    it('should parse relative dates with days explicitly', () => {
      const result = parseRelativeDate('now+7d');
      expect(result).toBeInstanceOf(Date);
    });

    it('should parse relative dates with weeks', () => {
      const result = parseRelativeDate('now-2w');
      expect(result).toBeInstanceOf(Date);
    });

    it('should parse relative dates with months', () => {
      const result = parseRelativeDate('now+3M');
      expect(result).toBeInstanceOf(Date);
    });

    it('should parse relative dates with years', () => {
      const result = parseRelativeDate('now-1y');
      expect(result).toBeInstanceOf(Date);
    });

    it('should handle negative numbers', () => {
      const result = parseRelativeDate('now-7d');
      expect(result).toBeInstanceOf(Date);
    });

    it('should handle invalid format (defensive pattern)', () => {
      expect(parseRelativeDate('invalid')).toBeNull();
      expect(parseRelativeDate('now+')).toBeNull();
      expect(parseRelativeDate('tomorrow')).toBeNull();
      expect(parseRelativeDate('')).toBeNull();
    });

    it('should handle relative date without amount', () => {
      expect(parseRelativeDate('now+d')).toBeNull();
    });
  });

  describe('evaluateStringComparison', () => {
    it('should evaluate string equality', () => {
      expect(evaluateStringComparison('test', '=', 'test')).toBe(true);
      expect(evaluateStringComparison('test', '=', 'other')).toBe(false);
    });

    it('should evaluate string inequality', () => {
      expect(evaluateStringComparison('test', '!=', 'other')).toBe(true);
      expect(evaluateStringComparison('test', '!=', 'test')).toBe(false);
    });

    it('should evaluate like operator (case insensitive)', () => {
      expect(evaluateStringComparison('Important Task', 'like', 'important')).toBe(true);
      expect(evaluateStringComparison('IMPORTANT TASK', 'like', 'task')).toBe(true);
      expect(evaluateStringComparison('test', 'like', 'missing')).toBe(false);
    });

    it('should handle unknown operator (defensive pattern)', () => {
      expect(evaluateStringComparison('test', 'unknown', 'test')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(evaluateStringComparison('', '=', '')).toBe(true);
      expect(evaluateStringComparison('test', 'like', '')).toBe(true);
    });
  });

  describe('evaluateArrayComparison', () => {
    it('should evaluate "in" operator with matches', () => {
      expect(evaluateArrayComparison([1, 2, 3], 'in', [2, 4])).toBe(true);
      expect(evaluateArrayComparison([1, 2, 3], 'in', [4, 5])).toBe(false);
    });

    it('should evaluate "not in" operator', () => {
      expect(evaluateArrayComparison([1, 2, 3], 'not in', [4, 5])).toBe(true);
      expect(evaluateArrayComparison([1, 2, 3], 'not in', [2, 4])).toBe(false);
    });

    it('should handle empty arrays', () => {
      expect(evaluateArrayComparison([], 'in', [1])).toBe(false);
      expect(evaluateArrayComparison([1, 2], 'in', [])).toBe(false);
      expect(evaluateArrayComparison([], 'not in', [1])).toBe(true);
    });

    it('should handle unknown operator (defensive pattern)', () => {
      expect(evaluateArrayComparison([1, 2, 3], 'unknown', [2])).toBe(false);
    });
  });

  describe('evaluateGroup', () => {
    it('should evaluate AND group with all conditions true', () => {
      const group: FilterGroup = {
        operator: '&&',
        conditions: [
          { field: 'done', operator: '=', value: false },
          { field: 'priority', operator: '>', value: 2 },
        ],
      };
      const task = createMockTask({ done: false, priority: 3 });
      expect(evaluateGroup(task, group)).toBe(true);
    });

    it('should evaluate AND group with one condition false', () => {
      const group: FilterGroup = {
        operator: '&&',
        conditions: [
          { field: 'done', operator: '=', value: false },
          { field: 'priority', operator: '>', value: 5 },
        ],
      };
      const task = createMockTask({ done: false, priority: 3 });
      expect(evaluateGroup(task, group)).toBe(false);
    });

    it('should evaluate OR group with one condition true', () => {
      const group: FilterGroup = {
        operator: '||',
        conditions: [
          { field: 'done', operator: '=', value: true },
          { field: 'priority', operator: '>', value: 2 },
        ],
      };
      const task = createMockTask({ done: false, priority: 3 });
      expect(evaluateGroup(task, group)).toBe(true);
    });

    it('should evaluate OR group with all conditions false', () => {
      const group: FilterGroup = {
        operator: '||',
        conditions: [
          { field: 'done', operator: '=', value: true },
          { field: 'priority', operator: '>', value: 5 },
        ],
      };
      const task = createMockTask({ done: false, priority: 3 });
      expect(evaluateGroup(task, group)).toBe(false);
    });
  });

  describe('applyFilter', () => {
    const tasks = [
      createMockTask({ id: 1, done: false, priority: 3 }),
      createMockTask({ id: 2, done: true, priority: 1 }),
      createMockTask({ id: 3, done: false, priority: 5 }),
    ];

    it('should apply filter with AND groups', () => {
      const expression: FilterExpression = {
        operator: '&&',
        groups: [
          {
            operator: '&&',
            conditions: [{ field: 'done', operator: '=', value: false }],
          },
          {
            operator: '&&',
            conditions: [{ field: 'priority', operator: '>', value: 2 }],
          },
        ],
      };

      const result = applyFilter(tasks, expression);
      expect(result).toHaveLength(2);
      expect(result.map(t => t.id)).toEqual([1, 3]);
    });

    it('should apply filter with OR groups', () => {
      const expression: FilterExpression = {
        operator: '||',
        groups: [
          {
            operator: '&&',
            conditions: [{ field: 'done', operator: '=', value: true }],
          },
          {
            operator: '&&',
            conditions: [{ field: 'priority', operator: '>=', value: 5 }],
          },
        ],
      };

      const result = applyFilter(tasks, expression);
      expect(result).toHaveLength(2);
      expect(result.map(t => t.id)).toEqual([2, 3]);
    });

    it('should handle filter with default AND operator', () => {
      const expression: FilterExpression = {
        groups: [
          {
            operator: '&&',
            conditions: [{ field: 'done', operator: '=', value: false }],
          },
        ],
      };

      const result = applyFilter(tasks, expression);
      expect(result).toHaveLength(2);
      expect(result.map(t => t.id)).toEqual([1, 3]);
    });

    it('should handle empty groups', () => {
      const expression: FilterExpression = {
        operator: '&&',
        groups: [],
      };

      const result = applyFilter(tasks, expression);
      expect(result).toHaveLength(3); // No filters applied
    });

    it('should handle empty tasks array', () => {
      const expression: FilterExpression = {
        operator: '&&',
        groups: [
          {
            operator: '&&',
            conditions: [{ field: 'done', operator: '=', value: false }],
          },
        ],
      };

      const result = applyFilter([], expression);
      expect(result).toHaveLength(0);
    });
  });

  describe('Edge Cases and Defensive Programming', () => {
    it('should handle tasks with minimal data', () => {
      const minimalTask: Task = {
        id: 1,
        title: '',
        done: false,
        project_id: 1,
        created: '',
        updated: '',
      };

      const condition: FilterCondition = { field: 'priority', operator: '>', value: 0 };
      expect(evaluateCondition(minimalTask, condition)).toBe(false);
    });

    it('should handle malformed dates gracefully', () => {
      const task = createMockTask({ due_date: 'invalid-date' });
      const condition: FilterCondition = { field: 'dueDate', operator: '>', value: '2025-01-01' };
      expect(evaluateCondition(task, condition)).toBe(false);
    });

    it('should handle null/undefined arrays consistently', () => {
      const taskWithNulls = createMockTask({ 
        assignees: null as any, 
        labels: undefined as any 
      });
      
      const assigneeCondition: FilterCondition = { field: 'assignees', operator: 'in', value: [1] };
      expect(evaluateCondition(taskWithNulls, assigneeCondition)).toBe(false);
      
      const labelCondition: FilterCondition = { field: 'labels', operator: 'in', value: [1] };
      expect(evaluateCondition(taskWithNulls, labelCondition)).toBe(false);
    });
  });
});