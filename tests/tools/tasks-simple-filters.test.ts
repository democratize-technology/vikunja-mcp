/**
 * Tests for simplified filtering approach
 * These tests validate that simple filter parsing and application works correctly
 */

import { describe, it, expect } from '@jest/globals';
import type { Task } from 'node-vikunja';
import { parseSimpleFilter, applyClientSideFilter } from '../../src/utils/simple-filters';

// Import the private function for testing by re-implementing the test cases
// This tests the security validation indirectly through parseSimpleFilter

// Mock data
const mockTasks: Task[] = [
  {
    id: 1,
    title: 'Completed Task',
    description: 'A task that is done',
    done: true,
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
    percent_done: 100,
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
    created_by: {
      id: 1,
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      created: '2024-01-01T10:00:00Z',
      updated: '2024-01-01T10:00:00Z'
    }
  },
  {
    id: 2,
    title: 'High Priority Task',
    description: 'An important task',
    done: false,
    priority: 5,
    due_date: '2024-02-01T10:00:00Z',
    project_id: 1,
    created: '2024-01-10T10:00:00Z',
    updated: '2024-01-10T10:00:00Z',
    labels: [2],
    assignees: [2],
    position: 1,
    kanban_position: 1,
    reminder_dates: [],
    subscription: null,
    percent_done: 0,
    identifier: 'TASK-2',
    index: 2,
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
    created_by: {
      id: 1,
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      created: '2024-01-01T10:00:00Z',
      updated: '2024-01-01T10:00:00Z'
    }
  },
  {
    id: 3,
    title: 'Low Priority Incomplete Task',
    description: 'Not important and not done',
    done: false,
    priority: 1,
    due_date: null,
    project_id: 2,
    created: '2024-01-20T10:00:00Z',
    updated: '2024-01-20T10:00:00Z',
    labels: [],
    assignees: [],
    position: 2,
    kanban_position: 2,
    reminder_dates: [],
    subscription: null,
    percent_done: 25,
    identifier: 'TASK-3',
    index: 3,
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
    created_by: {
      id: 1,
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      created: '2024-01-01T10:00:00Z',
      updated: '2024-01-01T10:00:00Z'
    }
  }
];

describe('Simplified Filter Parsing', () => {
  describe('parseSimpleFilter', () => {
    it('should parse simple equality filter', () => {
      const result = parseSimpleFilter('done = true');
      expect(result).toEqual({
        field: 'done',
        operator: '=',
        value: true
      });
    });

    it('should parse comparison filter with priority', () => {
      const result = parseSimpleFilter('priority > 3');
      expect(result).toEqual({
        field: 'priority',
        operator: '>',
        value: 3
      });
    });

    it('should parse string filter with quotes', () => {
      const result = parseSimpleFilter('title = "High Priority Task"');
      expect(result).toEqual({
        field: 'title',
        operator: '=',
        value: 'High Priority Task'
      });
    });

    it('should parse like operator for substring matching', () => {
      const result = parseSimpleFilter('title like "Task"');
      expect(result).toEqual({
        field: 'title',
        operator: 'like',
        value: 'Task'
      });
    });

    it('should handle array operators', () => {
      const result = parseSimpleFilter('labels in [1, 2]');
      expect(result).toEqual({
        field: 'labels',
        operator: 'in',
        value: [1, 2]
      });
    });

    it('should return null for invalid syntax', () => {
      const result = parseSimpleFilter('invalid filter syntax');
      expect(result).toBeNull();
    });

    it('should return null for empty filter', () => {
      const result = parseSimpleFilter('');
      expect(result).toBeNull();
    });
  });

  describe('applyClientSideFilter', () => {
    it('should filter tasks by done status', () => {
      const filter = parseSimpleFilter('done = true');
      const result = applyClientSideFilter(mockTasks, filter);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should filter tasks by priority comparison', () => {
      const filter = parseSimpleFilter('priority > 3');
      const result = applyClientSideFilter(mockTasks, filter);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });

    it('should filter tasks by title substring', () => {
      const filter = parseSimpleFilter('title like "High Priority"');
      const result = applyClientSideFilter(mockTasks, filter);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });

    it('should handle array field filtering', () => {
      const filter = parseSimpleFilter('labels in [1]');
      const result = applyClientSideFilter(mockTasks, filter);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should return all tasks when filter is null', () => {
      const result = applyClientSideFilter(mockTasks, null);
      expect(result).toHaveLength(3);
    });

    it('should handle due date comparisons', () => {
      const filter = parseSimpleFilter('due_date < 2024-01-31');
      const result = applyClientSideFilter(mockTasks, filter);
      // Should include only tasks with due dates before Jan 31, 2024
      // Task 1: 2024-01-15 (before) ✓
      // Task 2: 2024-02-01 (after) ✗
      // Task 3: null (excluded from date comparisons) ✗
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should handle null values', () => {
      const filter = parseSimpleFilter('due_date = null');
      const result = applyClientSideFilter(mockTasks, filter);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(3);
    });
  });

  describe('Integration Tests', () => {
    it('should handle simple filtering scenarios', () => {
      // Find all incomplete high priority tasks (using single filter)
      const filter = parseSimpleFilter('done = false');
      const result = applyClientSideFilter(mockTasks, filter);
      // Should find task 2 and task 3 (both incomplete)
      expect(result).toHaveLength(2);
      expect(result.map(t => t.id).sort()).toEqual([2, 3]);
    });

    it('should handle date filtering properly', () => {
      // Find tasks due before January 31, 2024
      const filter = parseSimpleFilter('due_date < 2024-01-31');
      const result = applyClientSideFilter(mockTasks, filter);
      // Should find only task 1 (due Jan 15)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should demonstrate progressive filtering', () => {
      // Step 1: Find tasks with high priority
      const filter1 = parseSimpleFilter('priority > 2');
      const result1 = applyClientSideFilter(mockTasks, filter1);
      // Should find task 1 (priority 3) and task 2 (priority 5)
      expect(result1).toHaveLength(2);

      // Step 2: From high priority tasks, find incomplete ones
      const filter2 = parseSimpleFilter('done = false');
      const finalResult = applyClientSideFilter(result1, filter2);
      // Should find only task 2 (high priority and incomplete)
      expect(finalResult).toHaveLength(1);
      expect(finalResult[0].id).toBe(2);
    });
  });

  describe('JSON Injection Security Tests', () => {
    it('should reject malicious object injection attempts', () => {
      // Attempt to inject an object instead of array
      const maliciousPayloads = [
        '{"__proto__": {"polluted": true}}',
        '{"constructor": {"prototype": {"polluted": true}}}',
        '{"toString": "hacked"}',
        '{"valueOf": "hacked"}',
        '{"key": "value"}'
      ];

      maliciousPayloads.forEach(payload => {
        const result = parseSimpleFilter(`labels in ${payload}`);
        expect(result).toBeNull();
      });
    });

    it('should reject arrays with nested objects', () => {
      const maliciousArrays = [
        '[{"__proto__": {"polluted": true}}]',
        '[{"constructor": {"prototype": {"polluted": true}}}]',
        '[{"nested": {"object": "here"}}]',
        '[{"key": "value"}, {"another": "object"}]',
        '[{"function": "() => { console.log(\\"hacked\\") }"}]'
      ];

      maliciousArrays.forEach(payload => {
        const result = parseSimpleFilter(`labels in ${payload}`);
        expect(result).toBeNull();
      });
    });

    it('should reject prototype pollution attempts', () => {
      const pollutionPayloads = [
        '["__proto__"]',
        '["constructor", "prototype"]',
        '["__proto__", "polluted"]',
        '[{"__proto__": {"polluted": "yes"}}]'
      ];

      pollutionPayloads.forEach(payload => {
        const result = parseSimpleFilter(`labels in ${payload}`);
        expect(result).toBeNull();
      });
    });

    it('should reject oversized arrays', () => {
      // Create an array with more than 100 items
      const oversizedArray = '[' + Array.from({length: 101}, (_, i) => i).join(', ') + ']';
      const result = parseSimpleFilter(`labels in ${oversizedArray}`);
      expect(result).toBeNull();
    });

    it('should reject arrays with functions or code', () => {
      const functionPayloads = [
        '[() => { console.log("hacked") }]',
        '[function() { return "malicious"; }]',
        '[{"key": "function() { return \\"hacked\\"; }"}]',
        '[{"func": "() => {}"}]'
      ];

      functionPayloads.forEach(payload => {
        const result = parseSimpleFilter(`labels in ${payload}`);
        expect(result).toBeNull();
      });
    });

    it('should reject malformed JSON', () => {
      const malformedPayloads = [
        '[1, 2, 3',      // Missing closing bracket
        '[1, 2, ]',      // Trailing comma
        '[, 1, 2]',      // Leading comma
        '[1 2 3]',       // Missing commas
        '[invalid]',     // Invalid token
        '[1.2.3]',       // Invalid number
        '[]]'           // Extra bracket
      ];

      malformedPayloads.forEach(payload => {
        const result = parseSimpleFilter(`labels in ${payload}`);
        expect(result).toBeNull();
      });
    });

    it('should reject overly long array strings', () => {
      // Create a string longer than 200 characters
      const longArray = '[' + Array.from({length: 50}, (_, i) => `"item${i}"`).join(', ') + ']';
      expect(longArray.length).toBeGreaterThan(200);

      const result = parseSimpleFilter(`labels in ${longArray}`);
      expect(result).toBeNull();
    });

    it('should still accept valid arrays within limits', () => {
      const validArrays = [
        '[1, 2, 3]',
        '["a", "b", "c"]',
        '[1]',
        '[]',
        '[0, -1, 999999999]',
        '["valid", "strings", "here"]'
      ];

      validArrays.forEach(payload => {
        const result = parseSimpleFilter(`labels in ${payload}`);
        expect(result).not.toBeNull();
        if (result) {
          expect(Array.isArray(result.value)).toBe(true);
        }
      });
    });

    it('should accept arrays at the size limit (within constraints)', () => {
      // Create an array that fits within 200 characters but has many items
      const maxSizeArray = '[' + Array.from({length: 50}, (_, i) => i).join(',') + ']';
      const result = parseSimpleFilter(`labels in ${maxSizeArray}`);
      expect(result).not.toBeNull();
      if (result) {
        expect(Array.isArray(result.value)).toBe(true);
        expect(result.value).toHaveLength(50);
      }
    });

    it('should reject arrays with dangerous string patterns', () => {
      const dangerousPayloads = [
        '["function malicious() {}"]',
        '["() => { console.log(\\"hacked\\") }"]',
        '["constructor.prototype.polluted"]',
        '["__proto__.polluted"]',
        '["eval(malicious)"]',
        '["prototype.hack"]'
      ];

      dangerousPayloads.forEach(payload => {
        const result = parseSimpleFilter(`labels in ${payload}`);
        expect(result).toBeNull();
      });
    });

    it('should reject arrays with invalid numbers', () => {
      const invalidNumberPayloads = [
        '[Infinity]',
        '[-Infinity]',
        '[NaN]',
        '[1.7976931348623157e+308]', // Very large number
        '[999999999999999999999]' // Very large integer
      ];

      invalidNumberPayloads.forEach(payload => {
        const result = parseSimpleFilter(`labels in ${payload}`);
        expect(result).toBeNull();
      });
    });

    it('should accept arrays with valid safe numbers', () => {
      const validNumberPayloads = [
        '[0]',
        '[-1]',
        '[2147483647]', // Max 32-bit int
        '[-2147483648]', // Min 32-bit int
        '[3.14159]',
        '[1.23, 4.56, 7.89]'
      ];

      validNumberPayloads.forEach(payload => {
        const result = parseSimpleFilter(`labels in ${payload}`);
        expect(result).not.toBeNull();
        if (result) {
          expect(Array.isArray(result.value)).toBe(true);
        }
      });
    });

    it('should accept arrays with null values', () => {
      const result = parseSimpleFilter('labels in [1, null, "test"]');
      expect(result).not.toBeNull();
      if (result) {
        expect(Array.isArray(result.value)).toBe(true);
        expect(result.value).toEqual([1, null, "test"]);
      }
    });

    it('should handle edge cases properly', () => {
      // Test that empty arrays are allowed
      const result1 = parseSimpleFilter('labels in []');
      expect(result1).not.toBeNull();
      if (result1) {
        expect(Array.isArray(result1.value)).toBe(true);
        expect(result1.value).toHaveLength(0);
      }

      // Test that single item arrays work
      const result2 = parseSimpleFilter('labels in [42]');
      expect(result2).not.toBeNull();
      if (result2) {
        expect(result2.value).toEqual([42]);
      }

      // Test that mixed type arrays work
      const result3 = parseSimpleFilter('labels in [1, "test", null]');
      expect(result3).not.toBeNull();
      if (result3) {
        expect(result3.value).toEqual([1, "test", null]);
      }
    });
  });
});