/**
 * Memory protection and task limit utilities
 * Prevents memory exhaustion DoS attacks by limiting task loading
 */

import type { Task } from 'node-vikunja';
import { logger } from './logger';

// Default maximum number of tasks to load into memory
const DEFAULT_MAX_TASKS = 10000;

// Environment variable for configuring the limit
const MAX_TASKS_ENV_VAR = 'VIKUNJA_MAX_TASKS_LIMIT';

/**
 * Get the maximum allowed task count from environment or default
 */
export function getMaxTasksLimit(): number {
  const envValue = process.env[MAX_TASKS_ENV_VAR];
  
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (isNaN(parsed) || parsed <= 0) {
      logger.warn(`Invalid ${MAX_TASKS_ENV_VAR} value: ${envValue}. Using default: ${DEFAULT_MAX_TASKS}`);
      return DEFAULT_MAX_TASKS;
    }
    if (parsed > 50000) {
      logger.warn(`${MAX_TASKS_ENV_VAR} value too high: ${parsed}. Capping at 50000 for safety.`);
      return 50000;
    }
    return parsed;
  }
  
  return DEFAULT_MAX_TASKS;
}

/**
 * Estimate memory usage for a single task (in bytes)
 * Based on typical Task object structure from node-vikunja
 */
export function estimateTaskMemoryUsage(task?: Task): number {
  if (!task) {
    // Estimate for an average task if no sample provided
    return 2048; // ~2KB per task (conservative estimate)
  }
  
  let size = 200; // Base object properties (id, done, priority, etc.)
  
  // String properties
  size += (task.title?.length || 20) * 2; // UTF-16 encoding, minimum 20 chars
  size += (task.description?.length || 50) * 2; // Minimum 50 chars
  
  // Date strings (ISO format ~25 chars each)
  size += (task.due_date?.length || 25) * 2;
  size += (task.created?.length || 25) * 2;
  size += (task.updated?.length || 25) * 2;
  
  // Arrays (assignees, labels, etc.)
  size += (task.assignees?.length || 0) * 200; // ~200 bytes per assignee object
  size += (task.labels?.length || 0) * 100; // ~100 bytes per label object
  size += (task.attachments?.length || 0) * 300; // ~300 bytes per attachment object
  
  // Add 20% overhead for object metadata, pointers, etc.
  return Math.ceil(size * 1.2);
}

/**
 * Estimate total memory usage for an array of tasks
 */
export function estimateTasksMemoryUsage(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  
  // Use first few tasks to estimate average size
  const sampleSize = Math.min(10, tasks.length);
  let totalSampleSize = 0;
  
  for (let i = 0; i < sampleSize; i++) {
    totalSampleSize += estimateTaskMemoryUsage(tasks[i]);
  }
  
  const averageTaskSize = totalSampleSize / sampleSize;
  return Math.ceil(averageTaskSize * tasks.length);
}

/**
 * Check if loading a certain number of tasks would exceed memory limits
 */
export function validateTaskCountLimit(taskCount: number): {
  allowed: boolean;
  maxAllowed: number;
  estimatedMemoryMB: number;
  error?: string;
} {
  const maxTasks = getMaxTasksLimit();
  const estimatedMemoryBytes = taskCount * estimateTaskMemoryUsage();
  const estimatedMemoryMB = Math.ceil(estimatedMemoryBytes / (1024 * 1024));
  
  if (taskCount > maxTasks) {
    return {
      allowed: false,
      maxAllowed: maxTasks,
      estimatedMemoryMB,
      error: `Task count ${taskCount} exceeds maximum allowed limit of ${maxTasks}. ` +
             `Estimated memory usage: ${estimatedMemoryMB}MB. ` +
             `Use more specific filters to reduce the result set or increase the limit via ${MAX_TASKS_ENV_VAR} environment variable.`
    };
  }
  
  return {
    allowed: true,
    maxAllowed: maxTasks,
    estimatedMemoryMB
  };
}

/**
 * Log memory usage information
 */
export function logMemoryUsage(context: string, taskCount: number, actualTasks?: Task[]): void {
  const estimatedMemoryBytes = actualTasks 
    ? estimateTasksMemoryUsage(actualTasks)
    : taskCount * estimateTaskMemoryUsage();
  const estimatedMemoryMB = Math.ceil(estimatedMemoryBytes / (1024 * 1024));
  
  logger.info(`Memory usage for ${context}`, {
    taskCount,
    estimatedMemoryMB,
    maxTasksLimit: getMaxTasksLimit()
  });
  
  // Warn if approaching the limit
  const maxTasks = getMaxTasksLimit();
  if (taskCount > maxTasks * 0.8) {
    logger.warn(`Approaching task limit: ${taskCount}/${maxTasks} tasks loaded`, {
      utilizationPercent: Math.round((taskCount / maxTasks) * 100)
    });
  }
}

/**
 * Create a helpful error message for task limit exceeded scenarios
 */
export function createTaskLimitExceededMessage(
  requestedOperation: string,
  taskCount: number,
  suggestions: string[] = []
): string {
  const maxTasks = getMaxTasksLimit();
  const baseMessage = `Cannot ${requestedOperation}: would load ${taskCount} tasks, ` +
                     `exceeding the maximum limit of ${maxTasks} tasks for memory protection.`;
  
  const defaultSuggestions = [
    'Use more specific filters (e.g., filter by project, assignee, or date range)',
    'Implement pagination with smaller page sizes',
    'Use the search parameter to narrow results',
    `Increase the limit by setting ${MAX_TASKS_ENV_VAR} environment variable (use with caution)`
  ];
  
  const allSuggestions = [...suggestions, ...defaultSuggestions];
  
  return baseMessage + '\n\nSuggestions:\n' + 
         allSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n');
}