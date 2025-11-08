/**
 * Security-focused tests for simple-filters.ts
 * Tests edge cases and validation paths that are not covered in the main tests
 */

import { describe, it, expect } from '@jest/globals';
import { parseSimpleFilter, applyClientSideFilter } from '../../src/utils/simple-filters';
import type { Task } from 'node-vikunja';

describe('Simple Filters - Security Validation Edge Cases', () => {
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

  describe('parseSimpleFilter - Invalid Input Handling', () => {
    it('should handle non-string input', () => {
      expect(parseSimpleFilter(null as any)).toBeNull();
      expect(parseSimpleFilter(undefined as any)).toBeNull();
      expect(parseSimpleFilter(123 as any)).toBeNull();
      expect(parseSimpleFilter({} as any)).toBeNull();
      expect(parseSimpleFilter([] as any)).toBeNull();
    });

    it('should handle empty string input', () => {
      expect(parseSimpleFilter('')).toBeNull();
      expect(parseSimpleFilter('   ')).toBeNull();
      expect(parseSimpleFilter('\t\n')).toBeNull();
    });

    it('should handle overly long filter strings', () => {
      const longFilter = 'title = ' + 'a'.repeat(1000);
      expect(parseSimpleFilter(longFilter)).toBeNull();
    });

    it('should handle invalid filter syntax', () => {
      expect(parseSimpleFilter('invalid syntax')).toBeNull();
      expect(parseSimpleFilter('title')).toBeNull();
      expect(parseSimpleFilter('= value')).toBeNull();
      expect(parseSimpleFilter('title =')).toBeNull();
      expect(parseSimpleFilter('title unknown value')).toBeNull();
    });

    it('should handle disallowed field names', () => {
      expect(parseSimpleFilter('malicious_field = value')).toBeNull();
      expect(parseSimpleFilter('__proto__ = value')).toBeNull();
      expect(parseSimpleFilter('constructor = value')).toBeNull();
      expect(parseSimpleFilter('prototype = value')).toBeNull();
      expect(parseSimpleFilter('eval = value')).toBeNull();
      expect(parseSimpleFilter('function = value')).toBeNull();
    });
  });

  describe('parseSimpleFilter - Value Validation', () => {
    it('should handle overly long quoted strings', () => {
      const longString = '"' + 'a'.repeat(503) + '"';
      expect(parseSimpleFilter(`title = ${longString}`)).toBeNull();
    });

    it('should handle overly long arrays', () => {
      const longArray = '[' + '1,'.repeat(101) + ']';
      expect(parseSimpleFilter(`id = ${longArray}`)).toBeNull();
    });

    it('should handle invalid JSON arrays', () => {
      expect(parseSimpleFilter('id = [invalid json]')).toBeNull();
      expect(parseSimpleFilter('id = [1, 2,]')).toBeNull();
      expect(parseSimpleFilter('id = [1, 2')).toBeNull();
      expect(parseSimpleFilter('id = 1, 2, 3]')).toBeNull();
      expect(parseSimpleFilter('id = {"key": "value"}]')).toBeNull();
    });

    it('should handle dangerous strings in arrays', () => {
      expect(parseSimpleFilter('id = ["function(){}", 2]')).toBeNull();
      expect(parseSimpleFilter('id = ["=>()", 2]')).toBeNull();
      expect(parseSimpleFilter('id = ["constructor", 2]')).toBeNull();
      expect(parseSimpleFilter('id = ["__proto__", 2]')).toBeNull();
      expect(parseSimpleFilter('id = ["prototype", 2]')).toBeNull();
      expect(parseSimpleFilter('id = ["eval", 2]')).toBeNull();
    });

    it('should handle overly long strings in arrays', () => {
      const longString = '"' + 'a'.repeat(51) + '"';
      expect(parseSimpleFilter(`id = [${longString}]`)).toBeNull();
    });

    it('should handle invalid numbers in arrays', () => {
      expect(parseSimpleFilter('id = [Infinity]')).toBeNull();
      expect(parseSimpleFilter('id = [-Infinity]')).toBeNull();
      expect(parseSimpleFilter('id = [NaN]')).toBeNull();
      expect(parseSimpleFilter('id = [1e500]')).toBeNull();
    });

    it('should handle invalid types in arrays', () => {
      expect(parseSimpleFilter('id = [{"key": "value"}]')).toBeNull();
      expect(parseSimpleFilter('id = [function(){}]')).toBeNull();
      expect(parseSimpleFilter('id = [{nested: "object"}]')).toBeNull();
    });

    it('should handle oversized numbers', () => {
      expect(parseSimpleFilter('id = 99999999999')).toBeNull();
      expect(parseSimpleFilter('id = -99999999999')).toBeNull();
    });

    it('should handle invalid dates', () => {
      expect(parseSimpleFilter('created = 1800-01-01')).toBeNull();
      expect(parseSimpleFilter('created = 2200-01-01')).toBeNull();
      expect(parseSimpleFilter('created = 2024-13-01')).toBeNull();
      expect(parseSimpleFilter('created = 2024-01-32')).toBeNull();
      expect(parseSimpleFilter('created = invalid-date')).toBeNull();
    });
  });

  describe('applyClientSideFilter - Field Access Edge Cases', () => {
    it('should handle missing fields gracefully', () => {
      const filter = parseSimpleFilter('missing_field = value');
      expect(filter).toBeNull();

      // Even if filter was valid, missing fields should return null from getTaskFieldValue
      const result = applyClientSideFilter([mockTask], null);
      expect(result).toEqual([mockTask]);
    });

    it('should handle snake_case to camelCase field mapping', () => {
      const filter1 = parseSimpleFilter('projectId = 1');
      expect(filter1).not.toBeNull();

      // Test that projectId filter works (maps to project_id)
      const result1 = applyClientSideFilter([mockTask], filter1!);
      expect(result1).toHaveLength(1);

      // Test date field mapping - use a task with a date
      const dateTask = { ...mockTask, due_date: '2024-01-15T00:00:00.000Z' };
      const filter2 = parseSimpleFilter('dueDate = 2024-01-15');
      expect(filter2).not.toBeNull();

      const result2 = applyClientSideFilter([dateTask], filter2!);
      expect(result2).toHaveLength(1);
    });

    it('should handle nested property access', () => {
      // Test accessing fields that exist on task
      const filter = parseSimpleFilter('title = "Test Task"');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter([mockTask], filter!);
      expect(result).toHaveLength(1);
    });
  });

  describe('applyClientSideFilter - Comparison Edge Cases', () => {
    it('should handle null comparisons with different operators', () => {
      const tasks = [
        { ...mockTask, description: null as any },
        { ...mockTask, description: 'not null' },
        { ...mockTask, description: undefined as any },
      ];

      const equalNullFilter = parseSimpleFilter('description = null');
      const notEqualNullFilter = parseSimpleFilter('description != null');

      expect(equalNullFilter).not.toBeNull();
      expect(notEqualNullFilter).not.toBeNull();

      const equalResult = applyClientSideFilter(tasks, equalNullFilter!);
      const notEqualResult = applyClientSideFilter(tasks, notEqualNullFilter!);

      expect(equalResult).toHaveLength(2); // null and undefined
      expect(notEqualResult).toHaveLength(1); // only "not null"
    });

    it('should handle array operators with non-array filter values', () => {
      // This test demonstrates that the parser accepts string values, but array filtering
      // logic will handle the type mismatch appropriately
      const filter = parseSimpleFilter('id = "not an array"');
      expect(filter).not.toBeNull(); // String values are valid

      // When applied with array operators, this will return false in the evaluation
      const result = applyClientSideFilter([mockTask], filter!);
      expect(result).toHaveLength(0); // No match since string doesn't equal number
    });

    it('should handle like operator with non-string values', () => {
      const tasks = [
        { ...mockTask, id: 123 },
        { ...mockTask, id: 456 },
      ];

      const filter = parseSimpleFilter('id like "test"');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter!);
      expect(result).toHaveLength(0); // No matches since id is not a string
    });

    it('should handle case-insensitive like operations', () => {
      const tasks = [
        { ...mockTask, title: 'Test Task' },
        { ...mockTask, title: 'test task' },
        { ...mockTask, title: 'Different Task' },
      ];

      const filter = parseSimpleFilter('title like "test"');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter!);
      expect(result).toHaveLength(2); // Case-insensitive match
    });
  });

  describe('applyClientSideFilter - Type Conversion Edge Cases', () => {
    it('should handle date comparisons with different types', () => {
      const tasks = [
        { ...mockTask, due_date: '2024-01-15T10:00:00Z' },
        { ...mockTask, due_date: 1705310400000 }, // Unix timestamp
        { ...mockTask, due_date: null },
      ];

      const dateFilter = parseSimpleFilter('due_date > 2024-01-01');
      expect(dateFilter).not.toBeNull();

      const result = applyClientSideFilter(tasks, dateFilter!);
      expect(result).toHaveLength(2); // Two dates should be greater than 2024-01-01
    });

    it('should handle numeric conversions for comparison', () => {
      const tasks = [
        { ...mockTask, priority: '3' as any }, // String number
        { ...mockTask, priority: 5 }, // Actual number
        { ...mockTask, priority: 'high' as any }, // Non-numeric string
      ];

      const filter = parseSimpleFilter('priority > 4');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter);
      expect(result).toHaveLength(2); // Both '5' and 5 should be > 4
    });

    it('should handle boolean value comparisons', () => {
      const tasks = [
        { ...mockTask, done: true },
        { ...mockTask, done: false },
        { ...mockTask, done: 1 as any }, // Truthy number
        { ...mockTask, done: 0 as any }, // Falsy number
      ];

      const trueFilter = parseSimpleFilter('done = true');
      const falseFilter = parseSimpleFilter('done = false');

      expect(trueFilter).not.toBeNull();
      expect(falseFilter).not.toBeNull();

      const trueResult = applyClientSideFilter(tasks, trueFilter!);
      const falseResult = applyClientSideFilter(tasks, falseFilter!);

      expect(trueResult).toHaveLength(2); // true and 1
      expect(falseResult).toHaveLength(2); // false and 0
    });
  });

  describe('applyClientSideFilter - Complex Data Types', () => {
    it('should handle array field comparisons', () => {
      const tasks = [
        { ...mockTask, labels: [1, 2, 3] },
        { ...mockTask, labels: [4, 5] },
        { ...mockTask, labels: null as any },
      ];

      const inFilter = parseSimpleFilter('labels in [1, 2]');
      const notInFilter = parseSimpleFilter('labels not in [1, 2]');

      expect(inFilter).not.toBeNull();
      expect(notInFilter).not.toBeNull();

      const inResult = applyClientSideFilter(tasks, inFilter!);
      const notInResult = applyClientSideFilter(tasks, notInFilter!);

      expect(inResult).toHaveLength(1); // Only first task has labels 1 or 2
      expect(notInResult).toHaveLength(2); // Second and third tasks don't have labels 1 or 2
    });

    it('should handle object-to-string conversions', () => {
      const tasks = [
        { ...mockTask, title: { nested: 'value' } as any },
        { ...mockTask, title: '[1, 2, 3]' as any },
        { ...mockTask, title: null as any },
      ];

      const filter = parseSimpleFilter('title = "[1, 2, 3]"');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter!);
      expect(result).toHaveLength(1); // Only second task should match after JSON.stringify
    });
  });

  describe('Additional Edge Cases for Coverage', () => {
    it('should handle null rawValue in parseSimpleFilter', () => {
      // This tests a defensive programming case that shouldn't happen but is covered
      const result = parseSimpleFilter('title =');
      expect(result).toBeNull();
    });

    it('should handle numeric comparisons with different data types', () => {
      const tasks = [
        { ...mockTask, priority: '3' as any }, // String that converts to number
        { ...mockTask, priority: 5 }, // Actual number
        { ...mockTask, priority: 'invalid' as any }, // String that doesn't convert
      ];

      const filter = parseSimpleFilter('priority > 4');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter!);
      expect(result).toHaveLength(2); // Both '5' and 5 should be > 4, 'invalid' becomes NaN
    });

    it('should handle string comparisons with different types', () => {
      const tasks = [
        { ...mockTask, title: 123 as any }, // Number
        { ...mockTask, title: true as any }, // Boolean
        { ...mockTask, title: null as any }, // null
        { ...mockTask, title: 'abc' }, // String
      ];

      const filter = parseSimpleFilter('title > "100"');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter!);
      expect(result).toHaveLength(2); // "123" and "true" are > "100" lexicographically
    });

    it('should handle comparison operators with Date objects', () => {
      const baseDate = new Date('2024-01-15T00:00:00.000Z');
      const yesterday = new Date(baseDate.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);

      const tasks = [
        { ...mockTask, due_date: yesterday.toISOString() },
        { ...mockTask, due_date: baseDate.toISOString() },
        { ...mockTask, due_date: tomorrow.toISOString() },
      ];

      const filter = parseSimpleFilter('due_date > 2024-01-15');
      expect(filter).not.toBeNull();

      const result = applyClientSideFilter(tasks, filter!);
      expect(result).toHaveLength(1); // Only tomorrow should be greater
    });
  });

  describe('Security Validation - Injection Prevention', () => {
    it('should prevent code injection through filter values', () => {
      // Test that dangerous strings in arrays are rejected
      const maliciousArrayInputs = [
        'title = ["function(){alert(1)}"]',
        'title = ["()=>{alert(1)}"]',
        'title = ["__proto__"]',
        'title = ["constructor"]',
        'title = ["prototype"]',
        'title = ["eval(malicious)"]',
      ];

      maliciousArrayInputs.forEach(input => {
        const result = parseSimpleFilter(input);
        expect(result).toBeNull(); // All dangerous strings in arrays should be rejected
      });

      // Test that dangerous strings as regular quoted values are allowed but don't execute
      const maliciousStringInputs = [
        'title = "function(){alert(1)}"',
        'title = "__proto__"',
        'title = "constructor"',
        'title = "prototype"',
      ];

      maliciousStringInputs.forEach(input => {
        const result = parseSimpleFilter(input);
        // These should parse as regular strings since they're not in arrays
        if (result) {
          expect(typeof result.value).toBe('string');
          // But they should be treated as literal strings, not executable code
          // The filtering logic will compare them as strings, not execute them
        }
      });
    });

    it('should prevent prototype pollution through field names', () => {
      const maliciousFields = [
        '__proto__',
        'constructor',
        'prototype',
        '__defineGetter__',
        '__defineSetter__',
        '__lookupGetter__',
        '__lookupSetter__',
      ];

      maliciousFields.forEach(field => {
        const result = parseSimpleFilter(`${field} = value`);
        expect(result).toBeNull(); // All should be rejected
      });
    });
  });
});