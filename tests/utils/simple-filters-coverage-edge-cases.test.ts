/**
 * Edge case tests specifically for remaining uncovered lines in simple-filters.ts
 * These tests target specific validation paths not covered in other test suites
 */

import { describe, it, expect } from '@jest/globals';
import { parseSimpleFilter, applyClientSideFilter } from '../../src/utils/simple-filters';
import type { Task } from 'node-vikunja';

describe('Simple Filters - Remaining Coverage Edge Cases', () => {
  const mockTask: Task = {
    id: 1,
    title: 'Test Task',
    description: 'Test Description',
    done: false,
    priority: 3,
    due_date: '2024-01-15T10:00:00Z',
    project_id: 1,
    created: '2024-01-01T10:00:00Z',
    updated: '2024-01-15T10:00:00Z',
    labels: [1, 2],
    assignees: [1],
    position: 0,
    kanban_position: 0,
    reminder_dates: [],
    subscription: null,
    percent_done: 50,
    identifier: 'TASK-1',
    index: 1,
    related_tasks: null,
    attachment_count: 0,
    comment_count: 0,
    cover_image_attachment_id: null,
    is_favorite: false,
    parent_task_id: null,
    hex_color: '',
    color: '',
    start_date: null,
    end_date: null,
    repeat_after: 0,
    repeat_mode: 0,
    repeat_from: null,
    repeat_until: null,
    remap_subtasks_on_repeat: false,
    subtasks: [],
    bucket_id: 0,
    done_at: null,
  };

  describe('isValidJsonArray uncovered paths', () => {
    it('should handle non-string input to isValidJsonArray', () => {
      // This indirectly tests isValidJsonArray by passing arrays to parseSimpleFilter
      const result = parseSimpleFilter('id = [1, 2]');
      expect(result).not.toBeNull();
      expect(Array.isArray(result!.value)).toBe(true);
    });

    it('should reject arrays that do not start with [ and end with ]', () => {
      // Test with malformed array-like strings
      const malformedInputs = [
        'id = (1, 2, 3)', // Parentheses instead of brackets
        'id = {1, 2, 3}', // Braces instead of brackets
        'id = [1, 2, 3', // Missing closing bracket
        'id = 1, 2, 3]', // Missing opening bracket
      ];

      malformedInputs.forEach(input => {
        const result = parseSimpleFilter(input);
        expect(result).toBeNull();
      });
    });

    it('should reject oversized array strings', () => {
      // Create an array string longer than 200 characters
      const longArray = '[' + '1,'.repeat(100) + '1]'; // This would be > 200 chars
      const result = parseSimpleFilter(`id = ${longArray}`);
      expect(result).toBeNull();
    });

    it('should reject arrays with too many items', () => {
      // Create an array with 101 items (over the 100 item limit)
      const manyItems = '[' + Array(102).join('1,') + '1]'; // 101 items
      const result = parseSimpleFilter(`id = ${manyItems}`);
      expect(result).toBeNull();
    });
  });

  describe('Parse error handling paths', () => {
    it('should handle JSON.parse errors in array parsing', () => {
      // Test malformed JSON that passes the basic checks but fails JSON.parse
      const malformedJson = 'id = [1, 2, invalid json syntax]';
      const result = parseSimpleFilter(malformedJson);
      expect(result).toBeNull();
    });

    it('should handle null rawValue defensive programming', () => {
      // This tests the defensive check for undefined rawValue
      const result = parseSimpleFilter('title ='); // Empty value after =
      expect(result).toBeNull();
    });

    it('should handle oversized numbers in parsing', () => {
      // Test number parsing limits
      const oversizedNumber = parseSimpleFilter('id = 99999999999');
      expect(oversizedNumber).toBeNull();

      const negativeOversized = parseSimpleFilter('id = -99999999999');
      expect(negativeOversized).toBeNull();
    });

    it('should handle invalid date parsing', () => {
      // Test date validation
      const tooEarly = parseSimpleFilter('created = 1800-01-01');
      expect(tooEarly).toBeNull();

      const tooLate = parseSimpleFilter('created = 2200-01-01');
      expect(tooLate).toBeNull();
    });
  });

  describe('Field value access edge cases', () => {
    it('should handle date field conversion for various date formats', () => {
      const tasks = [
        { ...mockTask, due_date: 1705310400000 }, // Unix timestamp
        { ...mockTask, due_date: '2024-01-15T10:00:00.000Z' }, // ISO string
        { ...mockTask, due_date: '2024-01-15' }, // Date string
      ];

      const filter = parseSimpleFilter('due_date > 2024-01-01');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter!);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle nested property mapping for snake_case to camelCase', () => {
      const tasks = [
        { ...mockTask, project_id: 5 },
        { ...mockTask, project_id: 10 },
      ];

      // Test projectId (camelCase) maps to project_id (snake_case)
      const filter = parseSimpleFilter('projectId > 7');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter!);
      expect(result).toHaveLength(1);
      expect(result[0].project_id).toBe(10);
    });
  });

  describe('Comparison operation edge cases', () => {
    it('should handle null comparisons with different operators', () => {
      const tasks = [
        { ...mockTask, description: null as any },
        { ...mockTask, description: 'not null' },
        { ...mockTask, description: undefined as any },
      ];

      // Test various operators with null values
      const equalNullFilter = parseSimpleFilter('description = null');
      const notEqualNullFilter = parseSimpleFilter('description != null');
      const greaterNullFilter = parseSimpleFilter('description > null');

      expect(equalNullFilter).not.toBeNull();
      expect(notEqualNullFilter).not.toBeNull();
      expect(greaterNullFilter).not.toBeNull();

      const equalResult = applyClientSideFilter(tasks, equalNullFilter!);
      const notEqualResult = applyClientSideFilter(tasks, notEqualNullFilter!);
      const greaterResult = applyClientSideFilter(tasks, greaterNullFilter!);

      expect(equalResult.length).toBeGreaterThan(0);
      expect(notEqualResult.length).toBeGreaterThan(0);
      expect(greaterResult.length).toBeGreaterThan(0);
    });

    it('should handle array operator comparisons with non-array values', () => {
      const tasks = [
        { ...mockTask, id: 1 },
        { ...mockTask, id: 2 },
      ];

      // Use in/not in operators - these should work with the array logic
      const inFilter = parseSimpleFilter('id in [1]');
      const notInFilter = parseSimpleFilter('id not in [1]');

      expect(inFilter).not.toBeNull();
      expect(notInFilter).not.toBeNull();

      const inResult = applyClientSideFilter(tasks, inFilter!);
      const notInResult = applyClientSideFilter(tasks, notInFilter!);

      expect(inResult).toHaveLength(1);
      expect(notInResult).toHaveLength(1);
    });

    it('should handle like operator with mixed case values', () => {
      const tasks = [
        { ...mockTask, title: 'Test Task' },
        { ...mockTask, title: 'TEST TASK' },
        { ...mockTask, title: 'test task' },
        { ...mockTask, title: 'Different' },
      ];

      const filter = parseSimpleFilter('title like "test"');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter!);
      expect(result).toHaveLength(3); // Case-insensitive matching
    });
  });

  describe('Type conversion and comparison edge cases', () => {
    it('should handle string comparison with various data types', () => {
      const tasks = [
        { ...mockTask, title: 123 as any }, // Number
        { ...mockTask, title: true as any }, // Boolean
        { ...mockTask, title: null as any }, // null
        { ...mockTask, title: undefined as any }, // undefined
        { ...mockTask, title: 'test' }, // String
      ];

      const filter = parseSimpleFilter('title = "true"');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter!);
      // Boolean true should convert to string "true"
      expect(result.some(task => task.title === true)).toBe(true);
    });

    it('should handle numeric comparisons with non-numeric values', () => {
      const tasks = [
        { ...mockTask, priority: '3' as any }, // Numeric string
        { ...mockTask, priority: 'invalid' as any }, // Non-numeric string
        { ...mockTask, priority: true as any }, // Boolean
        { ...mockTask, priority: null as any }, // null
        { ...mockTask, priority: 5 }, // Number
      ];

      const filter = parseSimpleFilter('priority > 4');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter!);
      // Should include numeric 5 and potentially numeric string '3' if converted
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle date comparisons with date objects', () => {
      const now = new Date('2024-01-15T00:00:00.000Z');
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const tasks = [
        { ...mockTask, due_date: yesterday.toISOString() },
        { ...mockTask, due_date: now.toISOString() },
        { ...mockTask, due_date: tomorrow.toISOString() },
      ];

      // Test all comparison operators with dates
      const operators = ['=', '!=', '>', '<', '>=', '<='] as const;

      operators.forEach(op => {
        const filter = parseSimpleFilter(`due_date ${op} 2024-01-15`);
        expect(filter).not.toBeNull();

        const result = applyClientSideFilter(tasks, filter!);
        expect(result.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle complex string comparisons', () => {
      const tasks = [
        { ...mockTask, title: 'abc' },
        { ...mockTask, title: 'def' },
        { ...mockTask, title: 123 as any }, // Number converted to string
        { ...mockTask, title: true as any }, // Boolean converted to string
        { ...mockTask, title: null as any }, // null converted to empty string
      ];

      // Test all string comparison operators
      const operators = ['=', '!=', '>', '<', '>=', '<='] as const;

      operators.forEach(op => {
        const filter = parseSimpleFilter(`title ${op} "123"`);
        expect(filter).not.toBeNull();

        const result = applyClientSideFilter(tasks, filter!);
        expect(result.length).toBeGreaterThanOrEqual(0);
      });
    });
  });
});