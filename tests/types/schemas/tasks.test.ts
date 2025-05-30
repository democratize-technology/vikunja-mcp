/**
 * Tests for task validation schemas
 */

import {
  CreateTaskSchema,
  UpdateTaskSchema,
  ListTasksSchema,
  DeleteTaskSchema,
  BulkCreateTasksSchema,
  BulkUpdateTasksSchema,
  BulkDeleteTasksSchema
} from '../../../src/types/schemas/tasks';

describe('Task Validation Schemas', () => {
  describe('CreateTaskSchema', () => {
    it('should validate valid create task input', () => {
      const validInput = {
        projectId: 1,
        title: 'Test Task',
        description: 'Test Description',
        dueDate: '2024-12-31T00:00:00Z',
        priority: 3,
        labels: [1, 2, 3],
        assignees: [10, 20],
        repeatAfter: 86400,
        repeatMode: 'day' as const
      };

      const result = CreateTaskSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInput);
      }
    });

    it('should reject missing required fields', () => {
      const invalidInput = {
        description: 'Missing title and projectId'
      };

      const result = CreateTaskSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid projectId', () => {
      const invalidInput = {
        projectId: -1,
        title: 'Test Task'
      };

      const result = CreateTaskSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject empty title', () => {
      const invalidInput = {
        projectId: 1,
        title: ''
      };

      const result = CreateTaskSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject title exceeding 250 characters', () => {
      const invalidInput = {
        projectId: 1,
        title: 'a'.repeat(251)
      };

      const result = CreateTaskSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority', () => {
      const invalidInput = {
        projectId: 1,
        title: 'Test Task',
        priority: 6
      };

      const result = CreateTaskSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid date format', () => {
      const invalidInput = {
        projectId: 1,
        title: 'Test Task',
        dueDate: 'not-a-date'
      };

      const result = CreateTaskSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid repeat mode', () => {
      const invalidInput = {
        projectId: 1,
        title: 'Test Task',
        repeatMode: 'invalid' as any
      };

      const result = CreateTaskSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateTaskSchema', () => {
    it('should validate valid update input', () => {
      const validInput = {
        id: 1,
        title: 'Updated Title',
        done: true,
        priority: 5
      };

      const result = UpdateTaskSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should require at least one field to update', () => {
      const invalidInput = {
        id: 1
      };

      const result = UpdateTaskSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should allow partial updates', () => {
      const validInput = {
        id: 1,
        done: true
      };

      const result = UpdateTaskSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });
  });

  describe('ListTasksSchema', () => {
    it('should validate valid list parameters', () => {
      const validInput = {
        projectId: 1,
        page: 2,
        perPage: 50,
        filter: 'done = true',
        sort: 'created',
        done: false
      };

      const result = ListTasksSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should allow empty parameters', () => {
      const validInput = {};

      const result = ListTasksSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject perPage exceeding 100', () => {
      const invalidInput = {
        perPage: 101
      };

      const result = ListTasksSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('DeleteTaskSchema', () => {
    it('should validate valid delete input', () => {
      const validInput = {
        id: 1
      };

      const result = DeleteTaskSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid id', () => {
      const invalidInput = {
        id: 0
      };

      const result = DeleteTaskSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('BulkCreateTasksSchema', () => {
    it('should validate valid bulk create input', () => {
      const validInput = {
        projectId: 1,
        tasks: [
          { title: 'Task 1' },
          { title: 'Task 2', priority: 3 },
          { title: 'Task 3', dueDate: '2024-12-31T00:00:00Z' }
        ]
      };

      const result = BulkCreateTasksSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject empty tasks array', () => {
      const invalidInput = {
        projectId: 1,
        tasks: []
      };

      const result = BulkCreateTasksSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject more than 100 tasks', () => {
      const invalidInput = {
        projectId: 1,
        tasks: Array(101).fill({ title: 'Task' })
      };

      const result = BulkCreateTasksSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('BulkUpdateTasksSchema', () => {
    it('should validate valid bulk update for done field', () => {
      const validInput = {
        taskIds: [1, 2, 3],
        field: 'done' as const,
        value: true
      };

      const result = BulkUpdateTasksSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate valid bulk update for priority', () => {
      const validInput = {
        taskIds: [1, 2, 3],
        field: 'priority' as const,
        value: 3
      };

      const result = BulkUpdateTasksSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate valid bulk update for labels', () => {
      const validInput = {
        taskIds: [1, 2, 3],
        field: 'labels' as const,
        value: [10, 20, 30]
      };

      const result = BulkUpdateTasksSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid value for field type', () => {
      const invalidInput = {
        taskIds: [1, 2, 3],
        field: 'done' as const,
        value: 'not-a-boolean'
      };

      const result = BulkUpdateTasksSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority value', () => {
      const invalidInput = {
        taskIds: [1, 2, 3],
        field: 'priority' as const,
        value: 10
      };

      const result = BulkUpdateTasksSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should accept null values for nullable fields', () => {
      const validInput = {
        taskIds: [1, 2, 3],
        field: 'due_date' as const,
        value: null
      };

      const result = BulkUpdateTasksSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate date strings', () => {
      const validInput = {
        taskIds: [1, 2, 3],
        field: 'due_date' as const,
        value: '2024-12-31T00:00:00Z'
      };

      const result = BulkUpdateTasksSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid date strings', () => {
      const invalidInput = {
        taskIds: [1, 2, 3],
        field: 'due_date' as const,
        value: 'not-a-date'
      };

      const result = BulkUpdateTasksSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('BulkDeleteTasksSchema', () => {
    it('should validate valid bulk delete input', () => {
      const validInput = {
        taskIds: [1, 2, 3, 4, 5]
      };

      const result = BulkDeleteTasksSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject empty taskIds array', () => {
      const invalidInput = {
        taskIds: []
      };

      const result = BulkDeleteTasksSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject more than 100 task IDs', () => {
      const invalidInput = {
        taskIds: Array(101).fill(1).map((_, i) => i + 1)
      };

      const result = BulkDeleteTasksSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject negative task IDs', () => {
      const invalidInput = {
        taskIds: [1, 2, -3, 4]
      };

      const result = BulkDeleteTasksSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });
});