/**
 * Task-specific transformers for different verbosity levels
 * Handles transformation of Vikunja task objects based on verbosity settings
 */

import type { FieldDefinition, Verbosity, TransformerConfig, TransformationResult } from './base';
import { SizeEstimator } from './base';
import { defaultFieldSelector } from './field-selector';

/**
 * Task interface for type safety
 */
export interface Task {
  id: number;
  title: string;
  description?: string;
  done: boolean;
  priority: number;
  due_date?: string;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  project_id?: number;
  hex_color?: string;
  position?: number;
  identifier?: string;
  index?: number;
  parent_task_id?: number;
  repeat_after?: number;
  // Define specific additional fields instead of using unknown
  percent_done?: number;
  repeat_mode?: number;
  reminder_dates?: string[];
  labels?: Array<{ id: number; title: string; description?: string; hex_color?: string }>;
  assignees?: Array<{ id: number; username: string; email?: string }>;
  subtasks?: Task[];
  related_tasks?: Array<{
    id: number;
    relation_kind: 'parenttask' | 'subtask' | 'related';
    created_by: number;
  }>;
  attachment_count?: number;
  cover_image_attachment_id?: number;
  is_favorite?: boolean;
  // Allow dynamic field access for transformation with specific types
  [key: string]: string | number | boolean | undefined | Array<string | number | boolean> | Array<{ id: number; title: string; description?: string; hex_color?: string }> | Array<{ id: number; username: string; email?: string }> | Array<Task> | Array<{ id: number; relation_kind: 'parenttask' | 'subtask' | 'related'; created_by: number }> | { id: number; title: string; description?: string; hex_color?: string } | { id: number; username: string; email?: string } | { id: number; relation_kind: 'parenttask' | 'subtask' | 'related'; created_by: number } | Task | { [key: string]: unknown } | null;
}

/**
 * Optimized task interface
 */
export interface OptimizedTask {
  id: number;
  title: string;
  done?: boolean;
  status?: string;
  description?: string;
  priority?: number;
  due_date?: string;
  created_at?: string;
  updated_at?: string;
  project_id?: number;
  hex_color?: string;
  position?: number;
  identifier?: string;
  index?: number;
  parent_task_id?: number;
  repeat_after?: number;
  // Specific additional fields for optimized output
  percent_done?: number;
  repeat_mode?: number;
  reminder_dates?: string[];
  labels?: Array<{ id: number; title: string; description?: string; hex_color?: string }>;
  assignees?: Array<{ id: number; username: string; email?: string }>;
  subtasks?: number[];
  related_tasks?: Array<{
    id: number;
    relation_kind: 'parenttask' | 'subtask' | 'related';
    created_by: number;
  }>;
  attachment_count?: number;
  cover_image_attachment_id?: number;
  is_favorite?: boolean;
  // Allow dynamic field access for transformation with specific types
  [key: string]: string | number | boolean | undefined | Array<string | number | boolean> | Array<{ id: number; title: string; description?: string; hex_color?: string }> | Array<{ id: number; username: string; email?: string }> | Array<Task> | Array<{ id: number; relation_kind: 'parenttask' | 'subtask' | 'related'; created_by: number }> | { id: number; title: string; description?: string; hex_color?: string } | { id: number; username: string; email?: string } | { id: number; relation_kind: 'parenttask' | 'subtask' | 'related'; created_by: number } | Task | { [key: string]: unknown } | null;
}

/**
 * Task transformer class
 */
export class TaskTransformer {
  /**
   * Transform a single task based on configuration
   */
  transformTask(task: Task, config: TransformerConfig): TransformationResult<OptimizedTask> {
    const startTime = Date.now();

    // Get available fields from the task
    const availableFields = Object.keys(task).filter(key => typeof key === 'string');

    // Select fields based on configuration
    const fieldSelection = defaultFieldSelector.selectFields(config, availableFields);

    // Transform the task
    const optimizedTask: OptimizedTask = this.applyTransformations(task, fieldSelection.fieldDefinitions);

    const originalSize = SizeEstimator.estimateSize(task);
    const optimizedSize = SizeEstimator.estimateSize(optimizedTask);
    const processingTime = Date.now() - startTime;

    return {
      data: optimizedTask,
      metrics: {
        originalSize,
        optimizedSize,
        reductionPercentage: SizeEstimator.calculateReduction(originalSize, optimizedSize),
        fieldsIncluded: fieldSelection.includedFields.length,
        totalFields: availableFields.length,
        fieldInclusionPercentage: Math.round((fieldSelection.includedFields.length / availableFields.length) * 100)
      },
      metadata: {
        verbosity: config.verbosity,
        categoriesIncluded: fieldSelection.activeCategories,
        timestamp: new Date().toISOString(),
        processingTimeMs: processingTime
      }
    };
  }

  /**
   * Transform multiple tasks
   */
  transformTasks(tasks: Task[], config: TransformerConfig): TransformationResult<OptimizedTask[]> {
    const startTime = Date.now();

    const transformedTasks = tasks.map(task => {
      const taskResult = this.transformTask(task, config);
      return taskResult.data;
    });

    const processingTime = Date.now() - startTime;

    // Calculate combined metrics
    const totalOriginalSize = tasks.reduce((sum, task) => sum + SizeEstimator.estimateSize(task), 0);
    const totalOptimizedSize = transformedTasks.reduce((sum, task) => sum + SizeEstimator.estimateSize(task), 0);

    // Get unique available fields across all tasks
    const allAvailableFields = new Set<string>();
    tasks.forEach(task => Object.keys(task).forEach(field => allAvailableFields.add(field)));

    const fieldSelection = defaultFieldSelector.selectFields(config, Array.from(allAvailableFields));

    return {
      data: transformedTasks,
      metrics: {
        originalSize: totalOriginalSize,
        optimizedSize: totalOptimizedSize,
        reductionPercentage: SizeEstimator.calculateReduction(totalOriginalSize, totalOptimizedSize),
        fieldsIncluded: fieldSelection.includedFields.length,
        totalFields: allAvailableFields.size,
        fieldInclusionPercentage: Math.round((fieldSelection.includedFields.length / allAvailableFields.size) * 100)
      },
      metadata: {
        verbosity: config.verbosity,
        categoriesIncluded: fieldSelection.activeCategories,
        timestamp: new Date().toISOString(),
        processingTimeMs: processingTime
      }
    };
  }

  /**
   * Apply field transformations to a task
   */
  private applyTransformations(task: Task, fieldDefinitions: FieldDefinition[]): OptimizedTask {
    const optimizedTask: Partial<OptimizedTask> = {};

    fieldDefinitions.forEach(fieldDef => {
      const sourceValue = task[fieldDef.fieldName];

      if (sourceValue !== undefined && sourceValue !== null) {
        // Apply field transformation if available
        let transformedValue: unknown = sourceValue;

        if (fieldDef.transformer) {
          transformedValue = fieldDef.transformer(sourceValue, task);
        } else {
          // Apply default transformations based on field type
          transformedValue = this.applyDefaultTransformation(fieldDef.fieldName, sourceValue);
        }

        // Use target name if specified, otherwise use field name
        const targetName = fieldDef.targetName || fieldDef.fieldName;
        (optimizedTask as Record<string, unknown>)[targetName] = transformedValue;
      }
    });

    // Ensure required fields are present
    if (optimizedTask.id === undefined) optimizedTask.id = task.id;
    if (optimizedTask.title === undefined) optimizedTask.title = task.title;

    return optimizedTask as OptimizedTask;
  }

  /**
   * Apply default transformations for common fields
   */
  private applyDefaultTransformation(fieldName: string, value: unknown): unknown {
    switch (fieldName) {
      case 'done':
        return value;

      case 'priority':
        return value;

      case 'due_date':
      case 'start_date':
      case 'end_date':
        if (!value) return undefined;
        return new Date(value as string | number | Date).toISOString();

      case 'created_at':
      case 'updated_at':
      case 'completed_at':
        if (!value) return undefined;
        return new Date(value as string | number | Date).toISOString();

      case 'description':
        return value;

      case 'project_id':
        return value;

      case 'hex_color':
        return value;

      case 'position':
      case 'index':
        return typeof value === 'number' ? value : parseInt(String(value), 10);

      default:
        return value;
    }
  }

  /**
   * Create a minimal task representation
   */
  static createMinimalTask(task: Task): OptimizedTask {
    return {
      id: task.id,
      title: task.title,
      done: task.done
    };
  }

  /**
   * Create a standard task representation
   */
  static createStandardTask(task: Task): OptimizedTask {
    const result: OptimizedTask = {
      id: task.id,
      title: task.title,
      done: task.done,
      priority: task.priority
    };

    if (task.description !== undefined) {
      result.description = task.description;
    }

    if (task.project_id !== undefined) {
      result.project_id = task.project_id;
    }

    return result;
  }

  /**
   * Create a detailed task representation
   */
  static createDetailedTask(task: Task): OptimizedTask {
    const result: OptimizedTask = {
      id: task.id,
      title: task.title,
      done: task.done,
      priority: task.priority
    };

    if (task.description !== undefined) {
      result.description = task.description;
    }

    if (task.due_date) {
      result.due_date = new Date(task.due_date).toISOString();
    }

    if (task.created_at) {
      result.created_at = new Date(task.created_at).toISOString();
    }

    if (task.updated_at) {
      result.updated_at = new Date(task.updated_at).toISOString();
    }

    if (task.project_id !== undefined) {
      result.project_id = task.project_id;
    }

    if (task.hex_color !== undefined) {
      result.hex_color = task.hex_color;
    }

    return result;
  }

  /**
   * Create a complete task representation
   */
  static createCompleteTask(task: Task): OptimizedTask {
    // Transform subtasks to IDs for optimized version
    const { subtasks, ...taskWithoutSubtasks } = task;
    const optimizedTaskData: Partial<OptimizedTask> = {
      ...taskWithoutSubtasks,
      ...(subtasks && { subtasks: subtasks.map(subtask => subtask.id) })
    };
    const completeTask: OptimizedTask = optimizedTaskData as OptimizedTask;

    // Normalize date fields
    ['due_date', 'start_date', 'end_date', 'created_at', 'updated_at', 'completed_at'].forEach(dateField => {
      if (completeTask[dateField]) {
        completeTask[dateField] = new Date(completeTask[dateField] as string | number | Date).toISOString();
      }
    });

    return completeTask;
  }
}

/**
 * Default task transformer instance
 */
export const defaultTaskTransformer = new TaskTransformer();

/**
 * Utility functions for quick task transformation
 */
export function transformTask(task: Task, verbosity: Verbosity): TransformationResult<OptimizedTask> {
  const config: TransformerConfig = { verbosity };
  return defaultTaskTransformer.transformTask(task, config);
}

export function transformTasks(tasks: Task[], verbosity: Verbosity): TransformationResult<OptimizedTask[]> {
  const config: TransformerConfig = { verbosity };
  return defaultTaskTransformer.transformTasks(tasks, config);
}

/**
 * Quick transformation functions for common verbosity levels
 */
export function createMinimalTask(task: Task): OptimizedTask {
  return TaskTransformer.createMinimalTask(task);
}

export function createStandardTask(task: Task): OptimizedTask {
  return TaskTransformer.createStandardTask(task);
}

export function createDetailedTask(task: Task): OptimizedTask {
  return TaskTransformer.createDetailedTask(task);
}

export function createCompleteTask(task: Task): OptimizedTask {
  return TaskTransformer.createCompleteTask(task);
}