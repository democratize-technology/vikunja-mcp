/**
 * Zod validation schemas for task operations
 */

import { z } from 'zod';

/**
 * Schema for task title validation
 */
const TaskTitleSchema = z.string()
  .min(1, 'Title cannot be empty')
  .max(250, 'Title cannot exceed 250 characters');

/**
 * Schema for priority validation (0-5)
 */
const PrioritySchema = z.number()
  .int('Priority must be an integer')
  .min(0, 'Priority cannot be less than 0')
  .max(5, 'Priority cannot be greater than 5');

/**
 * Schema for repeat mode validation
 */
const RepeatModeSchema = z.enum(['day', 'week', 'month', 'year']);

/**
 * Schema for creating a task
 */
export const CreateTaskSchema = z.object({
  projectId: z.number().positive('Project ID must be positive'),
  title: TaskTitleSchema,
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  priority: PrioritySchema.optional(),
  labels: z.array(z.number().positive()).optional(),
  assignees: z.array(z.number().positive()).optional(),
  repeatAfter: z.number().min(0).optional(),
  repeatMode: RepeatModeSchema.optional(),
});

/**
 * Schema for updating a task
 */
export const UpdateTaskSchema = z.object({
  id: z.number().positive('Task ID must be positive'),
  title: TaskTitleSchema.optional(),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  priority: PrioritySchema.optional(),
  done: z.boolean().optional(),
  labels: z.array(z.number().positive()).optional(),
  assignees: z.array(z.number().positive()).optional(),
  repeatAfter: z.number().min(0).optional(),
  repeatMode: RepeatModeSchema.optional(),
}).refine(
  (data) => {
    // At least one field should be provided for update
    const updateFields = ['title', 'description', 'dueDate', 'priority', 'done', 'labels', 'assignees', 'repeatAfter', 'repeatMode'];
    return updateFields.some(field => data[field as keyof typeof data] !== undefined);
  },
  { message: 'At least one field must be provided for update' }
);

/**
 * Schema for listing tasks
 */
export const ListTasksSchema = z.object({
  projectId: z.number().positive().optional(),
  filter: z.string().optional(),
  filterId: z.string().optional(),
  page: z.number().positive().optional(),
  perPage: z.number().positive().max(100, 'Per page cannot exceed 100').optional(),
  sort: z.string().optional(),
  search: z.string().optional(),
  allProjects: z.boolean().optional(),
  done: z.boolean().optional(),
});

/**
 * Schema for deleting a task
 */
export const DeleteTaskSchema = z.object({
  id: z.number().positive('Task ID must be positive'),
});

/**
 * Schema for bulk creating tasks
 */
export const BulkCreateTasksSchema = z.object({
  projectId: z.number().positive('Project ID must be positive'),
  tasks: z.array(z.object({
    title: TaskTitleSchema,
    description: z.string().optional(),
    dueDate: z.string().datetime().optional(),
    priority: PrioritySchema.optional(),
    labels: z.array(z.number().positive()).optional(),
    assignees: z.array(z.number().positive()).optional(),
    repeatAfter: z.number().min(0).optional(),
    repeatMode: RepeatModeSchema.optional(),
  }))
    .min(1, 'At least one task must be provided')
    .max(100, 'Cannot create more than 100 tasks at once'),
});

/**
 * Schema for bulk updating tasks
 */
export const BulkUpdateTasksSchema = z.object({
  taskIds: z.array(z.number().positive())
    .min(1, 'At least one task ID must be provided')
    .max(100, 'Cannot update more than 100 tasks at once'),
  field: z.enum(['done', 'priority', 'due_date', 'project_id', 'assignees', 'labels', 'repeat_after', 'repeat_mode']),
  value: z.unknown(),
}).refine((data) => {
  // Validate value based on field type
  switch (data.field) {
    case 'done':
      return typeof data.value === 'boolean';
    case 'priority':
      return typeof data.value === 'number' && data.value >= 0 && data.value <= 5;
    case 'due_date':
      return data.value === null || (typeof data.value === 'string' && !isNaN(Date.parse(data.value)));
    case 'project_id':
      return typeof data.value === 'number' && data.value > 0;
    case 'assignees':
    case 'labels':
      return Array.isArray(data.value) && data.value.every(id => typeof id === 'number' && id > 0);
    case 'repeat_after':
      return data.value === null || (typeof data.value === 'number' && data.value >= 0);
    case 'repeat_mode':
      return data.value === null || ['day', 'week', 'month', 'year'].includes(data.value as string);
    default:
      return true;
  }
}, {
  message: 'Invalid value for the specified field'
});

/**
 * Schema for bulk deleting tasks
 */
export const BulkDeleteTasksSchema = z.object({
  taskIds: z.array(z.number().positive())
    .min(1, 'At least one task ID must be provided')
    .max(100, 'Cannot delete more than 100 tasks at once'),
});

/**
 * Type exports for use in handlers
 */
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type ListTasksInput = z.infer<typeof ListTasksSchema>;
export type DeleteTaskInput = z.infer<typeof DeleteTaskSchema>;
export type BulkCreateTasksInput = z.infer<typeof BulkCreateTasksSchema>;
export type BulkUpdateTasksInput = z.infer<typeof BulkUpdateTasksSchema>;
export type BulkDeleteTasksInput = z.infer<typeof BulkDeleteTasksSchema>;