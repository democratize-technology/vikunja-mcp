import { z } from 'zod';
import { MCPError, ErrorCode } from '../types';

/* ===================================================================
 * TYPE DEFINITIONS & SCHEMAS
 * Zod schemas and TypeScript interfaces for imported tasks from JSON
 * =================================================================== */

/**
 * Zod schema for validating imported task data from JSON
 * Defines the structure and validation rules for task objects
 */
export const importedTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  done: z.boolean().optional(),
  dueDate: z.string().optional(),
  priority: z.number().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  hexColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  percentDone: z.number().min(0).max(100).optional(),
  repeatAfter: z.number().optional(),
  repeatMode: z.number().optional(),
  reminders: z.array(z.string()).optional(),
}).strict(); // Reject unknown properties

/**
 * TypeScript type inferred from the importedTaskSchema
 * Represents a valid task object that can be imported
 */
export type ImportedTask = z.infer<typeof importedTaskSchema>;

/* ===================================================================
 * JSON PARSING FUNCTIONS
 * Functions for parsing and validating JSON input data
 * =================================================================== */

/**
 * Parses JSON input and normalizes to array of ImportedTask objects.
 * Handles both single task objects and arrays of tasks.
 * Validates each task against importedTaskSchema.
 *
 * @param data - JSON string containing task data
 * @returns Array of validated ImportedTask objects
 * @throws {MCPError} If JSON is malformed or validation fails
 *
 * @example
 * parseJSONInput('{"title": "Task 1"}')
 * // Returns: [{title: "Task 1"}]
 *
 * parseJSONInput('[{"title": "Task 1"}, {"title": "Task 2"}]')
 * // Returns: [{title: "Task 1"}, {title: "Task 2"}]
 */
export function parseJSONInput(data: string): ImportedTask[] {
  try {
    const parsed = JSON.parse(data) as unknown;
    const taskArray = Array.isArray(parsed) ? parsed : [parsed];

    const tasks: ImportedTask[] = [];
    for (const task of taskArray) {
      const validatedTask = importedTaskSchema.parse(task);
      tasks.push(validatedTask);
    }
    return tasks;
  } catch (error) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid JSON data: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}