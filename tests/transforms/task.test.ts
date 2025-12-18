/**
 * Tests for task transformer functionality
 * Ensures comprehensive coverage of task transformation for different verbosity levels
 */

import { TaskTransformer, transformTask, transformTasks, createMinimalTask, createStandardTask, createDetailedTask, createCompleteTask } from '../../src/transforms/task';
import { Verbosity, FieldCategory } from '../../src/transforms/base';
import type { Task } from '../../src/transforms/task';

describe('Task Transformer', () => {
  let taskTransformer: TaskTransformer;
  let sampleTask: Task;

  beforeEach(() => {
    taskTransformer = new TaskTransformer();
    sampleTask = {
      id: 1,
      title: 'Test Task',
      description: 'This is a test task',
      done: false,
      priority: 3,
      due_date: '2024-01-15T10:00:00Z',
      start_date: '2024-01-10T09:00:00Z',
      end_date: '2024-01-15T11:00:00Z',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-05T14:30:00Z',
      completed_at: null,
      project_id: 5,
      hex_color: '#ff0000',
      position: 1,
      identifier: 'TEST-001',
      index: 0,
      parent_task_id: null,
      repeat_after: 0
    };
  });

  describe('Single Task Transformation', () => {
    describe('Minimal Verbosity', () => {
      it('should transform task to minimal representation', () => {
        const config = { verbosity: Verbosity.MINIMAL };
        const result = taskTransformer.transformTask(sampleTask, config);

        expect(result.data).toEqual({
          id: 1,
          title: 'Test Task',
          done: false
        });
        expect(result.metrics.fieldsIncluded).toBe(3);
        expect(result.metrics.totalFields).toBe(Object.keys(sampleTask).length);
        expect(result.metadata.verbosity).toBe(Verbosity.MINIMAL);
        expect(result.metadata.categoriesIncluded).toEqual([FieldCategory.CORE]);
      });

      it('should handle task with missing core fields', () => {
        const incompleteTask = {
          id: 1,
          title: 'Test Task',
          // Missing done field
          description: 'This is a test'
        } as Task;

        const config = { verbosity: Verbosity.MINIMAL };
        const result = taskTransformer.transformTask(incompleteTask, config);

        expect(result.data).toEqual({
          id: 1,
          title: 'Test Task'
        });
        expect(result.data.done).toBeUndefined();
      });

      it('should calculate size reduction correctly', () => {
        const config = { verbosity: Verbosity.MINIMAL };
        const result = taskTransformer.transformTask(sampleTask, config);

        expect(result.metrics.originalSize).toBeGreaterThan(0);
        expect(result.metrics.optimizedSize).toBeGreaterThan(0);
        expect(result.metrics.reductionPercentage).toBeGreaterThan(0);
        expect(result.metrics.reductionPercentage).toBeLessThanOrEqual(100);
      });
    });

    describe('Standard Verbosity', () => {
      it('should transform task to standard representation', () => {
        const config = { verbosity: Verbosity.STANDARD };
        const result = taskTransformer.transformTask(sampleTask, config);

        expect(result.data).toMatchObject({
          id: 1,
          title: 'Test Task',
          done: false,
          description: 'This is a test task',
          priority: 3,
          project_id: 5
        });
        expect(result.metrics.fieldsIncluded).toBeGreaterThan(3);
        expect(result.metadata.categoriesIncluded).toContain(FieldCategory.CONTEXT);
      });

      it('should handle missing optional fields gracefully', () => {
        const minimalTask = {
          id: 1,
          title: 'Test Task',
          done: true,
          priority: 1
          // Missing description and project_id
        } as Task;

        const config = { verbosity: Verbosity.STANDARD };
        const result = taskTransformer.transformTask(minimalTask, config);

        expect(result.data.id).toBe(1);
        expect(result.data.title).toBe('Test Task');
        expect(result.data.done).toBe(true);
        expect(result.data.priority).toBe(1);
        expect(result.data.description).toBeUndefined();
        expect(result.data.project_id).toBeUndefined();
      });
    });

    describe('Detailed Verbosity', () => {
      it('should transform task to detailed representation', () => {
        const config = { verbosity: Verbosity.DETAILED };
        const result = taskTransformer.transformTask(sampleTask, config);

        expect(result.data).toMatchObject({
          id: 1,
          title: 'Test Task',
          done: false,
          description: 'This is a test task',
          priority: 3,
          due_date: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/),
          created_at: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/),
          updated_at: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/),
          project_id: 5
        });

        expect(result.metadata.categoriesIncluded).toContain(FieldCategory.SCHEDULING);
      });

      it('should convert date fields to ISO format', () => {
        const config = { verbosity: Verbosity.DETAILED };
        const result = taskTransformer.transformTask(sampleTask, config);

        const dueDate = new Date(result.data.due_date);
        expect(dueDate.getTime()).toBe(new Date('2024-01-15T10:00:00Z').getTime());

        const createdDate = new Date(result.data.created_at);
        expect(createdDate.getTime()).toBe(new Date('2024-01-01T08:00:00Z').getTime());
      });

      it('should handle null date fields', () => {
        const taskWithNullDates = {
          ...sampleTask,
          due_date: null,
          completed_at: null
        };

        const config = { verbosity: Verbosity.DETAILED };
        const result = taskTransformer.transformTask(taskWithNullDates, config);

        expect(result.data.due_date).toBeUndefined();
        expect(result.data.completed_at).toBeUndefined();
      });
    });

    describe('Complete Verbosity', () => {
      it('should transform task to complete representation', () => {
        const config = { verbosity: Verbosity.COMPLETE };
        const result = taskTransformer.transformTask(sampleTask, config);

        // Should include all available fields
        Object.keys(sampleTask).forEach(key => {
          if (sampleTask[key] !== null) {
            expect(result.data).toHaveProperty(key);
          }
        });

        expect(result.metadata.categoriesIncluded).toContain(FieldCategory.METADATA);
        expect(result.metrics.fieldsIncluded).toBeCloseTo(Object.keys(sampleTask).length, -1);
      });

      it('should include metadata fields', () => {
        const config = { verbosity: Verbosity.COMPLETE };
        const result = taskTransformer.transformTask(sampleTask, config);

        expect(result.data.hex_color).toBe('#ff0000');
        expect(result.data.position).toBe(1);
        expect(result.data.identifier).toBe('TEST-001');
        expect(result.data.index).toBe(0);
      });
    });

    describe('Performance Metrics', () => {
      it('should track processing time', () => {
        const config = { verbosity: Verbosity.STANDARD };
        const result = taskTransformer.transformTask(sampleTask, config);

        expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.metadata.processingTimeMs).toBeLessThan(100); // Should be very fast
      });

      it('should calculate field inclusion percentage correctly', () => {
        const config = { verbosity: Verbosity.MINIMAL };
        const result = taskTransformer.transformTask(sampleTask, config);

        const expectedPercentage = Math.round((3 / Object.keys(sampleTask).length) * 100);
        expect(result.metrics.fieldInclusionPercentage).toBe(expectedPercentage);
      });
    });
  });

  describe('Multiple Task Transformation', () => {
    let tasks: Task[];

    beforeEach(() => {
      tasks = [
        sampleTask,
        {
          id: 2,
          title: 'Second Task',
          done: true,
          priority: 1,
          description: 'Completed task',
          created_at: '2024-01-02T10:00:00Z',
          updated_at: '2024-01-03T15:00:00Z',
          completed_at: '2024-01-03T15:00:00Z',
          project_id: 5
        } as Task,
        {
          id: 3,
          title: 'Third Task',
          done: false,
          priority: 2,
          due_date: '2024-02-01T09:00:00Z',
          created_at: '2024-01-04T11:00:00Z',
          project_id: 6
        } as Task
      ];
    });

    it('should transform multiple tasks correctly', () => {
      const config = { verbosity: Verbosity.STANDARD };
      const result = taskTransformer.transformTasks(tasks, config);

      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data).toHaveLength(3);

      result.data.forEach((task, index) => {
        expect(task.id).toBe(tasks[index].id);
        expect(task.title).toBe(tasks[index].title);
        expect(task).toHaveProperty('done');
        expect(task).toHaveProperty('priority');
      });
    });

    it('should handle empty array', () => {
      const config = { verbosity: Verbosity.STANDARD };
      const result = taskTransformer.transformTasks([], config);

      expect(result.data).toEqual([]);
      expect(result.metrics.totalFields).toBe(0);
      expect(result.metrics.fieldsIncluded).toBe(0);
    });

    it('should calculate combined metrics correctly', () => {
      const config = { verbosity: Verbosity.MINIMAL };
      const result = taskTransformer.transformTasks(tasks, config);

      // Should get unique fields across all tasks (determined by field selector)
      const allFields = new Set<string>();
      tasks.forEach(task => Object.keys(task).forEach(field => allFields.add(field)));

      // Fields included should be the minimal fields (id, title, done) available across all tasks
      expect(result.metrics.fieldsIncluded).toBeGreaterThan(0);
      expect(result.metrics.fieldsIncluded).toBeLessThanOrEqual(3 * tasks.length);
      expect(result.metrics.totalFields).toBe(allFields.size);
      expect(result.metrics.originalSize).toBeGreaterThan(result.metrics.optimizedSize);
    });

    it('should handle tasks with different field sets', () => {
      const config = { verbosity: Verbosity.DETAILED };
      const result = taskTransformer.transformTasks(tasks, config);

      expect(result.data).toHaveLength(3);
      expect(result.metadata.categoriesIncluded).toContain(FieldCategory.SCHEDULING);

      // First task should have all detailed fields
      expect(result.data[0]).toHaveProperty('due_date');
      expect(result.data[0]).toHaveProperty('created_at');

      // Second task should be missing due_date but have completed_at
      expect(result.data[1]).not.toHaveProperty('due_date');
      expect(result.data[1]).toHaveProperty('completed_at');

      // Third task should have due_date but no completed_at
      expect(result.data[2]).toHaveProperty('due_date');
      expect(result.data[2]).not.toHaveProperty('completed_at');
    });
  });

  describe('Static Methods', () => {
    describe('createMinimalTask', () => {
      it('should create minimal task representation', () => {
        const minimalTask = createMinimalTask(sampleTask);

        expect(minimalTask).toEqual({
          id: 1,
          title: 'Test Task',
          done: false
        });
      });
    });

    describe('createStandardTask', () => {
      it('should create standard task representation', () => {
        const standardTask = createStandardTask(sampleTask);

        expect(standardTask).toMatchObject({
          id: 1,
          title: 'Test Task',
          done: false,
          priority: 3,
          description: 'This is a test task',
          project_id: 5
        });
      });

      it('should handle missing optional fields', () => {
        const taskWithoutOptionals = {
          id: 1,
          title: 'Test',
          done: false
        } as Task;

        const standardTask = createStandardTask(taskWithoutOptionals);

        expect(standardTask).toEqual({
          id: 1,
          title: 'Test',
          done: false
        });
        expect(standardTask.description).toBeUndefined();
        expect(standardTask.project_id).toBeUndefined();
      });
    });

    describe('createDetailedTask', () => {
      it('should create detailed task representation', () => {
        const detailedTask = createDetailedTask(sampleTask);

        expect(detailedTask).toMatchObject({
          id: 1,
          title: 'Test Task',
          done: false,
          priority: 3,
          description: 'This is a test task',
          project_id: 5,
          hex_color: '#ff0000'
        });

        expect(detailedTask.due_date).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);
        expect(detailedTask.created_at).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);
        expect(detailedTask.updated_at).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);
      });

      it('should handle null date fields', () => {
        const taskWithNullDates = {
          ...sampleTask,
          due_date: null,
          start_date: null
        };

        const detailedTask = createDetailedTask(taskWithNullDates);

        expect(detailedTask.due_date).toBeUndefined();
        expect(detailedTask.start_date).toBeUndefined();
        expect(detailedTask.created_at).toBeDefined();
      });
    });

    describe('createCompleteTask', () => {
      it('should create complete task representation', () => {
        const completeTask = createCompleteTask(sampleTask);

        // Should include all fields from the original task
        Object.keys(sampleTask).forEach(key => {
          if (sampleTask[key] !== null) {
            expect(completeTask).toHaveProperty(key);
          }
        });

        // Date fields should be in ISO format
        expect(completeTask.due_date).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);
        expect(completeTask.created_at).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);
      });

      it('should preserve null values', () => {
        const taskWithNulls = {
          ...sampleTask,
          completed_at: null,
          parent_task_id: null
        };

        const completeTask = createCompleteTask(taskWithNulls);

        expect(completeTask.completed_at).toBeNull();
        expect(completeTask.parent_task_id).toBeNull();
      });
    });
  });

  describe('Utility Functions', () => {
    describe('transformTask', () => {
      it('should provide convenient single-task transformation', () => {
        const result = transformTask(sampleTask, Verbosity.DETAILED);

        expect(result.data).toMatchObject({
          id: 1,
          title: 'Test Task',
          done: false,
          priority: 3
        });
        expect(result.metadata.verbosity).toBe(Verbosity.DETAILED);
      });
    });

    describe('transformTasks', () => {
      it('should provide convenient multi-task transformation', () => {
        const tasks = [sampleTask];
        const result = transformTasks(tasks, Verbosity.MINIMAL);

        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toEqual({
          id: 1,
          title: 'Test Task',
          done: false
        });
        expect(result.metadata.verbosity).toBe(Verbosity.MINIMAL);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle task with only id and title', () => {
      const minimalTask = {
        id: 1,
        title: 'Minimal Task'
      } as Task;

      const result = taskTransformer.transformTask(minimalTask, { verbosity: Verbosity.STANDARD });

      expect(result.data).toEqual({
        id: 1,
        title: 'Minimal Task'
      });
    });

    it('should handle empty task object', () => {
      const emptyTask = {} as Task;

      const result = taskTransformer.transformTask(emptyTask, { verbosity: Verbosity.MINIMAL });

      // Should handle gracefully by returning empty or minimal object
      expect(result.data).toBeDefined();
      expect(result.metrics.totalFields).toBe(0);
    });

    it('should handle task with custom fields', () => {
      const taskWithCustomFields = {
        ...sampleTask,
        custom_field: 'custom value',
        another_custom: 42,
        custom_date: '2024-01-20T10:00:00Z'
      };

      const config = {
        verbosity: Verbosity.STANDARD,
        fieldOverrides: { include: ['custom_field', 'another_custom', 'custom_date'] }
      };

      const result = taskTransformer.transformTask(taskWithCustomFields, config);

      expect(result.data.custom_field).toBe('custom value');
      expect(result.data.another_custom).toBe(42);
      expect(result.data.custom_date).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z/);
    });

    it('should handle performance with large number of tasks', () => {
      const largeTaskList = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        title: `Task ${i + 1}`,
        done: i % 2 === 0,
        priority: (i % 5) + 1,
        description: `Description for task ${i + 1}`,
        created_at: new Date(Date.now() - i * 1000000).toISOString()
      }));

      const startTime = Date.now();
      const result = taskTransformer.transformTasks(largeTaskList, { verbosity: Verbosity.STANDARD });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(500); // Should complete in < 500ms
      expect(result.data).toHaveLength(1000);
      expect(result.metrics.fieldsIncluded).toBeGreaterThan(0);
    });
  });
});