/**
 * Tests for BatchImportResponseFormatter
 *
 * This test suite ensures comprehensive coverage of the response formatting functionality
 * extracted from batch-import.ts to improve maintainability and testability.
 */

import { BatchImportResponseFormatter, ImportResult, FormatterOptions } from '../../src/formatters/BatchImportResponseFormatter';

describe('BatchImportResponseFormatter', () => {
  let formatter: BatchImportResponseFormatter;

  beforeEach(() => {
    formatter = new BatchImportResponseFormatter();
  });

  describe('formatResult', () => {
    it('should format successful import with basic information', () => {
      const result: ImportResult = {
        success: 3,
        failed: 0,
        errors: [],
        createdTasks: [
          { id: 1, title: 'Task 1' },
          { id: 2, title: 'Task 2' },
          { id: 3, title: 'Task 3' },
        ],
      };

      const formatted = formatter.formatResult(result);

      expect(formatted).toContain('Import completed:');
      expect(formatted).toContain('Successfully imported: 3 tasks');
      expect(formatted).toContain('Failed: 0 tasks');
      expect(formatted).toContain('Created tasks:');
      expect(formatted).toContain('- #1: Task 1');
      expect(formatted).toContain('- #2: Task 2');
      expect(formatted).toContain('- #3: Task 3');
      expect(formatted).not.toContain('Errors:');
      expect(formatted).not.toContain('Warnings:');
    });

    it('should format failed import with errors', () => {
      const result: ImportResult = {
        success: 1,
        failed: 2,
        errors: [
          { index: 0, title: 'Invalid Task', error: 'Missing required field: title' },
          { index: 2, title: 'Bad Task', error: 'Invalid date format' },
        ],
        createdTasks: [
          { id: 1, title: 'Valid Task' },
        ],
      };

      const formatted = formatter.formatResult(result);

      expect(formatted).toContain('Import completed:');
      expect(formatted).toContain('Successfully imported: 1 tasks');
      expect(formatted).toContain('Failed: 2 tasks');
      expect(formatted).toContain('Created tasks:');
      expect(formatted).toContain('- #1: Valid Task');
      expect(formatted).toContain('Errors:');
      expect(formatted).toContain('- Row 1 (Invalid Task): Missing required field: title');
      expect(formatted).toContain('- Row 3 (Bad Task): Invalid date format');
    });

    it('should format import with warnings', () => {
      const result: ImportResult = {
        success: 2,
        failed: 0,
        errors: [],
        createdTasks: [
          { id: 1, title: 'Task 1' },
          { id: 2, title: 'Task 2' },
        ],
        warnings: [
          { taskId: 1, title: 'Task 1', warning: 'Some labels could not be found' },
          { taskId: 2, title: 'Task 2', warning: 'Assignees not found' },
        ],
      };

      const formatted = formatter.formatResult(result);

      expect(formatted).toContain('Import completed:');
      expect(formatted).toContain('Successfully imported: 2 tasks');
      expect(formatted).toContain('Failed: 0 tasks');
      expect(formatted).toContain('Created tasks:');
      expect(formatted).toContain('⚠️  Warnings:');
      expect(formatted).toContain('- Task #1 (Task 1): Some labels could not be found');
      expect(formatted).toContain('- Task #2 (Task 2): Assignees not found');
      expect(formatted).not.toContain('Errors:');
    });

    it('should include authentication warning when users fetch failed and tasks have assignees', () => {
      const result: ImportResult = {
        success: 1,
        failed: 0,
        errors: [],
        createdTasks: [
          { id: 1, title: 'Task with assignee' },
        ],
      };

      const formatted = formatter.formatResult(result, true, true);

      expect(formatted).toContain('Import completed:');
      expect(formatted).toContain('⚠️  Warning: Could not fetch users due to Vikunja API authentication issue.');
      expect(formatted).toContain('Assignees were skipped for all tasks.');
    });

    it('should not include authentication warning when users fetch failed but no assignees present', () => {
      const result: ImportResult = {
        success: 1,
        failed: 0,
        errors: [],
        createdTasks: [
          { id: 1, title: 'Task without assignee' },
        ],
      };

      const formatted = formatter.formatResult(result, true, false);

      expect(formatted).toContain('Import completed:');
      expect(formatted).not.toContain('Could not fetch users due to Vikunja API authentication issue');
    });

    it('should not include authentication warning when users fetch succeeded', () => {
      const result: ImportResult = {
        success: 1,
        failed: 0,
        errors: [],
        createdTasks: [
          { id: 1, title: 'Task with assignee' },
        ],
      };

      const formatted = formatter.formatResult(result, false, true);

      expect(formatted).toContain('Import completed:');
      expect(formatted).not.toContain('Could not fetch users due to Vikunja API authentication issue');
    });

    it('should format empty import results', () => {
      const result: ImportResult = {
        success: 0,
        failed: 0,
        errors: [],
        createdTasks: [],
      };

      const formatted = formatter.formatResult(result);

      expect(formatted).toContain('Import completed:');
      expect(formatted).toContain('Successfully imported: 0 tasks');
      expect(formatted).toContain('Failed: 0 tasks');
      expect(formatted).not.toContain('Created tasks:');
      expect(formatted).not.toContain('Errors:');
      expect(formatted).not.toContain('Warnings:');
    });

    it('should handle complex results with everything', () => {
      const result: ImportResult = {
        success: 2,
        failed: 3,
        errors: [
          { index: 0, title: 'Bad Task 1', error: 'Missing title' },
          { index: 3, title: 'Bad Task 2', error: 'Invalid project' },
          { index: 4, title: 'Bad Task 3', error: 'Due date in past' },
        ],
        createdTasks: [
          { id: 1, title: 'Good Task 1' },
          { id: 2, title: 'Good Task 2' },
        ],
        warnings: [
          { taskId: 1, title: 'Good Task 1', warning: 'Some labels not found' },
          { taskId: 2, title: 'Good Task 2', warning: 'Priority level adjusted' },
        ],
      };

      const formatted = formatter.formatResult(result, true, true);

      // Check all sections are present
      expect(formatted).toContain('Import completed:');
      expect(formatted).toContain('Successfully imported: 2 tasks');
      expect(formatted).toContain('Failed: 3 tasks');

      // Auth warning
      expect(formatted).toContain('Could not fetch users due to Vikunja API authentication issue');
      expect(formatted).toContain('Assignees were skipped for all tasks');

      // Created tasks
      expect(formatted).toContain('Created tasks:');
      expect(formatted).toContain('- #1: Good Task 1');
      expect(formatted).toContain('- #2: Good Task 2');

      // Warnings
      expect(formatted).toContain('⚠️  Warnings:');
      expect(formatted).toContain('- Task #1 (Good Task 1): Some labels not found');
      expect(formatted).toContain('- Task #2 (Good Task 2): Priority level adjusted');

      // Errors
      expect(formatted).toContain('Errors:');
      expect(formatted).toContain('- Row 1 (Bad Task 1): Missing title');
      expect(formatted).toContain('- Row 4 (Bad Task 2): Invalid project');
      expect(formatted).toContain('- Row 5 (Bad Task 3): Due date in past');
    });

    it('should handle single character task titles', () => {
      const result: ImportResult = {
        success: 1,
        failed: 1,
        errors: [
          { index: 0, title: 'A', error: 'Some error' },
        ],
        createdTasks: [
          { id: 1, title: 'B' },
        ],
      };

      const formatted = formatter.formatResult(result);

      expect(formatted).toContain('- Row 1 (A): Some error');
      expect(formatted).toContain('- #1: B');
    });

    it('should handle task titles with special characters', () => {
      const result: ImportResult = {
        success: 1,
        failed: 1,
        errors: [
          { index: 0, title: 'Task with "quotes" & symbols!', error: 'Error with special chars: #$%' },
        ],
        createdTasks: [
          { id: 1, title: 'Valid "quoted" task & more' },
        ],
      };

      const formatted = formatter.formatResult(result);

      expect(formatted).toContain('- Row 1 (Task with "quotes" & symbols!): Error with special chars: #$%');
      expect(formatted).toContain('- #1: Valid "quoted" task & more');
    });

    it('should handle empty warnings and errors arrays', () => {
      const result: ImportResult = {
        success: 1,
        failed: 0,
        errors: [],
        createdTasks: [
          { id: 1, title: 'Task' },
        ],
        warnings: [],
      };

      const formatted = formatter.formatResult(result);

      expect(formatted).toContain('Import completed:');
      expect(formatted).toContain('Created tasks:');
      expect(formatted).not.toContain('Warnings:');
      expect(formatted).not.toContain('Errors:');
    });

    it('should handle undefined warnings', () => {
      const result: ImportResult = {
        success: 1,
        failed: 0,
        errors: [],
        createdTasks: [
          { id: 1, title: 'Task' },
        ],
        warnings: undefined,
      };

      const formatted = formatter.formatResult(result);

      expect(formatted).toContain('Import completed:');
      expect(formatted).toContain('Created tasks:');
      expect(formatted).not.toContain('Warnings:');
      expect(formatted).not.toContain('Errors:');
    });

    it('should handle very large numbers', () => {
      const result: ImportResult = {
        success: 999999,
        failed: 888888,
        errors: [],
        createdTasks: [],
      };

      const formatted = formatter.formatResult(result);

      expect(formatted).toContain('Successfully imported: 999999 tasks');
      expect(formatted).toContain('Failed: 888888 tasks');
    });
  });

  describe('formatResultWithOptions', () => {
    it('should format result using options object', () => {
      const result: ImportResult = {
        success: 1,
        failed: 0,
        errors: [],
        createdTasks: [
          { id: 1, title: 'Task with assignee' },
        ],
      };

      const options: FormatterOptions = {
        userFetchFailedDueToAuth: true,
        hasAssignees: true,
      };

      const formatted = formatter.formatResultWithOptions(result, options);

      expect(formatted).toContain('Import completed:');
      expect(formatted).toContain('Could not fetch users due to Vikunja API authentication issue');
      expect(formatted).toContain('Assignees were skipped for all tasks');
    });

    it('should handle default options', () => {
      const result: ImportResult = {
        success: 1,
        failed: 0,
        errors: [],
        createdTasks: [
          { id: 1, title: 'Task' },
        ],
      };

      const options: FormatterOptions = {
        userFetchFailedDueToAuth: false,
        hasAssignees: false,
      };

      const formatted = formatter.formatResultWithOptions(result, options);

      expect(formatted).toContain('Import completed:');
      expect(formatted).not.toContain('Could not fetch users due to Vikunja API authentication issue');
    });
  });

  describe('private methods behavior (via public interface)', () => {
    it('should maintain consistent formatting order', () => {
      const result: ImportResult = {
        success: 1,
        failed: 1,
        errors: [
          { index: 1, title: 'Error Task', error: 'Some error' },
        ],
        createdTasks: [
          { id: 1, title: 'Success Task' },
        ],
        warnings: [
          { taskId: 1, title: 'Success Task', warning: 'Some warning' },
        ],
      };

      const formatted = formatter.formatResult(result, true, true);

      // Check order: Summary -> Auth Warning -> Created Tasks -> Warnings -> Errors
      const lines = formatted.split('\n').filter(line => line.trim());

      // Summary should be first
      expect(lines[0]).toBe('Import completed:');
      expect(lines[1]).toContain('Successfully imported:');
      expect(lines[2]).toContain('Failed:');

      // Auth warning should come after summary
      const authWarningIndex = lines.findIndex(line => line.includes('Could not fetch users'));
      expect(authWarningIndex).toBeGreaterThan(2); // After summary (0, 1, 2 are summary lines)

      // Created tasks should come before warnings and errors
      const createdTasksIndex = lines.findIndex(line => line.includes('Created tasks:'));
      const warningsIndex = lines.findIndex(line => line.includes('Warnings:'));
      const errorsIndex = lines.findIndex(line => line.includes('Errors:'));

      expect(createdTasksIndex).toBeLessThan(warningsIndex);
      expect(warningsIndex).toBeLessThan(errorsIndex);
    });
  });
});