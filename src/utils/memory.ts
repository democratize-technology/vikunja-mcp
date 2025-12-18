/**
 * Simplified Memory Protection using object-sizeof
 *
 * Replaces 531 lines of custom V8 modeling with professional library approach.
 * Uses object-sizeof library for accurate memory estimation.
 */

import type { Task } from 'node-vikunja';
import { logger } from './logger';
import objectSizeof from 'object-sizeof';

/**
 * Interface for query parameters used in memory estimation
 */
interface QueryParams {
  [key: string]: string | number | boolean | string[] | number[] | undefined;
}

// Default maximum number of tasks to load into memory
const DEFAULT_MAX_TASKS = 10000;
const MAX_TASKS_ENV_VAR = 'VIKUNJA_MAX_TASKS_LIMIT';
const SAFETY_MULTIPLIER = 2.5; // Conservative safety margin

/**
 * Get the maximum allowed task count from environment or default
 */
export function getMaxTasksLimit(): number {
  const envValue = process.env[MAX_TASKS_ENV_VAR];

  if (envValue) {
    if (!/^\d+$/.test(envValue.trim())) {
      logger.warn(`Invalid ${MAX_TASKS_ENV_VAR} value format: ${envValue}. Must be a positive integer. Using default: ${DEFAULT_MAX_TASKS}`);
      return DEFAULT_MAX_TASKS;
    }

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
 * Estimate memory usage for a single task using object-sizeof
 */
export function estimateTaskMemoryUsage(task?: Task): number {
  if (!task) {
    return 4096; // Default estimate for undefined task
  }

  // Use object-sizeof with safety multiplier
  return Math.ceil(objectSizeof(task) * SAFETY_MULTIPLIER);
}

/**
 * Estimate memory usage for multiple tasks
 */
export function estimateTasksMemoryUsage(tasks?: Task[]): number {
  if (!tasks || tasks.length === 0) {
    return 0;
  }

  // Calculate task memory plus array overhead
  const taskMemory = tasks.reduce((total, task) => total + objectSizeof(task), 0);
  const arrayOverhead = objectSizeof(tasks) - taskMemory; // Array structure overhead

  return Math.ceil((taskMemory + arrayOverhead) * SAFETY_MULTIPLIER);
}

/**
 * Estimate memory usage for filter expressions and query parameters
 */
export function estimateFilterMemoryUsage(filterExpression?: string, queryParams?: QueryParams): number {
  let memoryUsage = 0;

  if (filterExpression) {
    memoryUsage += objectSizeof(filterExpression);
  }

  if (queryParams) {
    memoryUsage += objectSizeof(queryParams);
  }

  return Math.ceil(memoryUsage * SAFETY_MULTIPLIER);
}

/**
 * Estimate complete operation memory usage
 */
export function estimateOperationMemoryUsage(options: {
  taskCount: number;
  filterExpression?: string;
  queryParams?: QueryParams;
  includeResponseOverhead?: boolean;
}): number {
  const { taskCount, filterExpression, queryParams, includeResponseOverhead = false } = options;

  // Base task memory estimation (average 4KB per task with safety margin)
  const taskMemory = taskCount * 4096;

  // Filter memory
  const filterMemory = estimateFilterMemoryUsage(filterExpression, queryParams);

  // Response overhead (JSON serialization, MCP protocol)
  const responseOverhead = includeResponseOverhead ? Math.ceil(taskMemory * 0.3) + 2048 : 0;

  return taskMemory + filterMemory + responseOverhead;
}

/**
 * Risk level assessment based on memory usage
 */
function getRiskLevel(estimatedMemoryMB: number): 'low' | 'medium' | 'high' {
  if (estimatedMemoryMB < 50) return 'low';
  if (estimatedMemoryMB < 200) return 'medium';
  return 'high';
}

/**
 * Enhanced task count validation with risk assessment
 */
export function validateTaskCountLimit(
  taskCount: number,
  sampleTask?: Task,
  options?: {
    filterExpression?: string;
    operationType?: string;
  }
): {
  allowed: boolean;
  maxAllowed: number;
  estimatedMemoryMB: number;
  riskLevel: 'low' | 'medium' | 'high';
  warnings: string[];
  error?: string;
} {
  const maxTasks = getMaxTasksLimit();
  const sampleEstimate = sampleTask ? estimateTaskMemoryUsage(sampleTask) : 4096;
  const estimatedMemory = taskCount * sampleEstimate;
  const estimatedMemoryMB = Math.ceil(estimatedMemory / 1024 / 1024);
  const riskLevel = getRiskLevel(estimatedMemoryMB);
  const warnings: string[] = [];

  if (taskCount > maxTasks) {
    return {
      allowed: false,
      maxAllowed: maxTasks,
      estimatedMemoryMB,
      riskLevel: 'high',
      warnings,
      error: `Task count ${taskCount} exceeds maximum allowed limit of ${maxTasks}. Estimated memory usage: ${estimatedMemoryMB}MB`
    };
  }

  // Add warnings for high-risk operations
  if (estimatedMemoryMB > 100) {
    warnings.push(`High memory usage estimated: ${estimatedMemoryMB}MB`);
  }

  if (taskCount > maxTasks * 0.8) {
    warnings.push(`Approaching task count limit: ${Math.round((taskCount / maxTasks) * 100)}% utilized`);
  }

  return {
    allowed: true,
    maxAllowed: maxTasks,
    estimatedMemoryMB,
    riskLevel,
    warnings
  };
}

/**
 * Legacy task count validation (backward compatibility)
 */
export function validateTaskCountLimitLegacy(
  taskCount: number,
  sampleTask?: Task
): {
  allowed: boolean;
  maxAllowed: number;
  estimatedMemoryMB: number;
  error?: string;
} {
  const result = validateTaskCountLimit(taskCount, sampleTask);

  return {
    allowed: result.allowed,
    maxAllowed: result.maxAllowed,
    estimatedMemoryMB: result.estimatedMemoryMB,
    ...(result.error && { error: result.error })
  };
}

/**
 * Log memory usage information with warnings
 */
export function logMemoryUsage(
  operation: string,
  taskCount: number,
  estimatedMemory?: number
): void {
  const maxTasks = getMaxTasksLimit();
  const memoryEstimate = estimatedMemory || taskCount * 4096;
  const memoryMB = Math.ceil(memoryEstimate / 1024 / 1024);
  const utilizationPercent = Math.round((taskCount / maxTasks) * 100);

  logger.info('Memory usage for ' + operation, {
    taskCount,
    estimatedMemoryMB: memoryMB,
    maxTasksLimit: maxTasks,
    utilizationPercent
  });

  if (utilizationPercent > 80) {
    logger.warn(
      `Approaching task limit: ${utilizationPercent}% (${taskCount}/${maxTasks})`,
      { operation, memoryMB }
    );
  }

  if (memoryMB > 100) {
    logger.warn(
      `High memory usage: ${memoryMB}MB estimated for ${taskCount} tasks`,
      { operation }
    );
  }
}

/**
 * Create informative task limit exceeded message
 */
export function createTaskLimitExceededMessage(operation: string, requestedCount: number): string {
  const maxAllowed = getMaxTasksLimit();
  const estimatedMemory = Math.ceil(requestedCount * 4096 / 1024 / 1024);

  return `Cannot ${operation}: Requested ${requestedCount} tasks exceeds maximum limit of ${maxAllowed}.
Estimated memory usage: ${estimatedMemory}MB.

Suggestions:
- Use more specific filters to reduce task count
- Implement pagination for large result sets
- Use date range filters to limit scope
- Set VIKUNJA_MAX_TASKS_LIMIT environment variable if higher limits are needed

Current limit: ${maxAllowed} tasks
Recommended: Apply filters to stay under ${Math.ceil(maxAllowed * 0.8)} tasks for optimal performance`;
}