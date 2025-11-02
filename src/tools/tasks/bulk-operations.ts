/**
 * Bulk operations for tasks with performance optimizations
 * Enhanced with intelligent batching, caching, and monitoring
 */

import { MCPError, ErrorCode, createStandardResponse } from '../../types/index';
import { getClientFromContext } from '../../client';
import type { Task } from 'node-vikunja';
import { logger } from '../../utils/logger';
import { isAuthenticationError } from '../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../utils/retry';
import { BatchProcessor, type BatchResult } from '../../utils/performance/batch-processor';
import { ResponseCache } from '../../utils/performance/response-cache';
import { performanceMonitor } from '../../utils/performance/performance-monitor';
import {
  createBulkOperationEnhancer,
  type EnhancedBatchResult
} from '../../utils/performance/bulk-operation-enhancer';
import {
  AUTH_ERROR_MESSAGES,
  MAX_BULK_OPERATION_TASKS,
} from './constants';
import { validateDateString, validateId, convertRepeatConfiguration } from './validation';

// Enhanced bulk operation processors with adaptive optimization
const bulkUpdateEnhancer = createBulkOperationEnhancer('bulk-update', {
  useProgressiveEnhancement: true,
  useAdaptiveBatching: true,
  useCircuitBreaker: true,
  useCache: true,
  maxBulkSize: MAX_BULK_OPERATION_TASKS,
  enableStreaming: true,
  streamingChunkSize: 50,
});

// Additional enhancers for delete and create operations (currently unused but ready for future use)
// const bulkDeleteEnhancer = createBulkOperationEnhancer('bulk-delete', {
//   useProgressiveEnhancement: false, // No bulk delete API in Vikunja
//   useAdaptiveBatching: true,
//   useCircuitBreaker: true,
//   useCache: false, // Don't cache delete operations
//   maxBulkSize: MAX_BULK_OPERATION_TASKS,
//   enableStreaming: true,
//   streamingChunkSize: 20,
// });

// const bulkCreateEnhancer = createBulkOperationEnhancer('bulk-create', {
//   useProgressiveEnhancement: false, // No bulk create API in Vikunja
//   useAdaptiveBatching: true,
//   useCircuitBreaker: true,
//   useCache: false, // Don't cache create operations
//   maxBulkSize: MAX_BULK_OPERATION_TASKS,
//   enableStreaming: true,
//   streamingChunkSize: 30,
// });

// Legacy batch processors for backward compatibility
const updateBatchProcessor = new BatchProcessor({
  maxConcurrency: 5,
  batchSize: 10,
  enableMetrics: true,
  batchDelay: 0,
});
const deleteBatchProcessor = new BatchProcessor({
  maxConcurrency: 3,
  batchSize: 5,
  enableMetrics: true,
  batchDelay: 100,
});
const createBatchProcessor = new BatchProcessor({
  maxConcurrency: 8,
  batchSize: 15,
  enableMetrics: true,
  batchDelay: 0,
});

// Response cache for task operations
const taskOperationCache = new ResponseCache<Task>({
  ttl: 30000, // 30 seconds for task data
  maxSize: 500,
  enableMetrics: true,
});


/**
 * Enhanced batch processor with performance optimizations
 */
async function processTasksOptimized<T>(
  taskIds: number[],
  processor: (taskId: number, index: number) => Promise<T>,
  operationType: string,
  useCache: boolean = true
): Promise<BatchResult<T>> {
  const operationId = `${operationType}-${Date.now()}`;
  
  performanceMonitor.startOperation(
    operationId,
    operationType,
    taskIds.length,
    5 // Default concurrency level
  );

  try {
    const batchProcessor = operationType.includes('delete') 
      ? deleteBatchProcessor 
      : operationType.includes('create')
      ? createBatchProcessor
      : updateBatchProcessor;

    // Enhanced processor with caching and monitoring
    const enhancedProcessor = async (taskId: number, index: number): Promise<T> => {
      const cacheKey = useCache ? `${operationType}:${taskId}` : null;
      
      if (useCache && cacheKey && taskOperationCache.has(cacheKey)) {
        performanceMonitor.recordCacheHit(operationId);
        const cachedResult = taskOperationCache.get(cacheKey);
        if (cachedResult) {
          return cachedResult as T;
        }
      }
      
      if (useCache && cacheKey) {
        performanceMonitor.recordCacheMiss(operationId);
      }
      
      performanceMonitor.recordApiCall(operationId);
      
      try {
        const result = await processor(taskId, index);
        
        if (useCache && cacheKey) {
          taskOperationCache.set(cacheKey, result as unknown as Task);
        }
        
        performanceMonitor.updateOperation(operationId, { successCount: 1 });
        return result;
      } catch (error) {
        performanceMonitor.updateOperation(operationId, { failureCount: 1 });
        throw error;
      }
    };

    const result = await batchProcessor.processBatches(taskIds, enhancedProcessor);
    
    performanceMonitor.completeOperation(operationId);
    return result;
  } catch (error) {
    performanceMonitor.updateOperation(operationId, { failureCount: taskIds.length });
    performanceMonitor.completeOperation(operationId);
    throw error;
  }
}

/**
 * Enhanced bulk update tasks with next-generation performance optimizations
 */
export async function bulkUpdateTasksEnhanced(args: {
  taskIds?: number[];
  field?: string;
  value?: unknown;
  useEnhancedOptimizations?: boolean;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const useEnhanced = args.useEnhancedOptimizations !== false; // Default to true
  
  if (useEnhanced) {
    return await bulkUpdateTasksWithEnhancer(args);
  } else {
    return await bulkUpdateTasks(args);
  }
}

/**
 * Enhanced bulk update implementation using BulkOperationEnhancer
 */
async function bulkUpdateTasksWithEnhancer(args: {
  taskIds?: number[];
  field?: string;
  value?: unknown;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    // Validation (reusing existing validation logic)
    if (!args.taskIds || args.taskIds.length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'taskIds array is required for bulk update operation',
      );
    }

    if (!args.field || args.value === undefined) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'field and value are required for bulk update operation');
    }

    const taskIds = args.taskIds;
    args.taskIds.forEach((id) => validateId(id, 'task ID'));

    // Preprocess value (reusing existing preprocessing logic)
    if (args.field === 'done' && typeof args.value === 'string') {
      args.value = args.value === 'true';
    }

    const client = await getClientFromContext();

    // Define bulk API operation (tries the official bulk API first)
    const bulkApiOperation = async (ids: number[]): Promise<Task[]> => {
      if (!args.field) {
        throw new Error('Field is required for bulk operation');
      }
      const bulkOperation = {
        task_ids: ids,
        field: args.field,
        value: args.value,
      };

      logger.debug('Attempting enhanced bulk API operation', { bulkOperation });
      const result = await client.tasks.bulkUpdateTasks(bulkOperation);
      
      // Handle API response format variations
      if (Array.isArray(result)) {
        return result;
      } else {
        // If API returns message, fetch updated tasks
        const fetchedTasks: Task[] = [];
        for (const taskId of ids) {
          const task = await client.tasks.getTask(taskId);
          fetchedTasks.push(task);
        }
        return fetchedTasks;
      }
    };

    // Define individual operation fallback
    const individualOperation = async (taskId: number): Promise<Task> => {
      const currentTask = await client.tasks.getTask(taskId);
      const updateData: Task = { ...currentTask };

      // Apply field update based on args.field
      switch (args.field) {
        case 'done':
          updateData.done = args.value as boolean;
          break;
        case 'priority':
          updateData.priority = args.value as number;
          break;
        case 'due_date':
          updateData.due_date = args.value as string;
          break;
        case 'project_id':
          updateData.project_id = args.value as number;
          break;
        // Add other field cases as needed
      }

      return await client.tasks.updateTask(taskId, updateData);
    };

    // Execute enhanced bulk operation
    const result: EnhancedBatchResult<Task> = await bulkUpdateEnhancer.execute(
      taskIds,
      bulkApiOperation,
      individualOperation
    );

    // Build enhanced response
    const response = createStandardResponse(
      'update-tasks',
      result.failed.length === 0
        ? `Successfully updated ${taskIds.length} tasks using ${result.strategy} strategy`
        : `Partially updated ${result.successful.length}/${taskIds.length} tasks using ${result.strategy} strategy`,
      { tasks: result.successful },
      {
        timestamp: new Date().toISOString(),
        count: taskIds.length,
        affectedFields: [args.field],
        performance: {
          strategy: result.strategy,
          totalDuration: result.metrics.totalDuration,
          operationsPerSecond: result.metrics.operationsPerSecond,
          efficiency: result.efficiency,
          optimizations: result.optimizations,
        },
        ...(result.recommendations && { recommendations: result.recommendations }),
        ...(result.failed.length > 0 && {
          failures: result.failed.map(f => ({
            taskId: f.originalItem,
            error: f.error instanceof Error ? f.error.message : String(f.error),
          })),
        }),
      },
    );

    logger.info('Enhanced bulk update completed', {
      strategy: result.strategy,
      taskCount: taskIds.length,
      successCount: result.successful.length,
      failureCount: result.failed.length,
      performance: response.metadata.performance,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };

  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to execute enhanced bulk update: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Legacy bulk update tasks (backward compatibility)
 */
export async function bulkUpdateTasks(args: {
  taskIds?: number[];
  field?: string;
  value?: unknown;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.taskIds || args.taskIds.length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'taskIds array is required for bulk update operation',
      );
    }

    if (!args.field) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'field is required for bulk update operation');
    }

    if (args.value === undefined) {
      throw new MCPError(ErrorCode.VALIDATION_ERROR, 'value is required for bulk update operation');
    }

    // Check max tasks limit
    if (args.taskIds.length > MAX_BULK_OPERATION_TASKS) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Too many tasks for bulk operation. Maximum allowed: ${MAX_BULK_OPERATION_TASKS}. Consider breaking into smaller batches.`,
      );
    }

    // Validate all task IDs
    args.taskIds.forEach((id) => validateId(id, 'task ID'));

    // Store taskIds in const after validation for TypeScript
    const taskIds = args.taskIds;

    // Preprocess value to handle common type coercion issues
    // MCP might pass boolean values as strings
    if (args.field === 'done' && typeof args.value === 'string') {
      const originalValue = args.value;
      if (args.value === 'true') {
        args.value = true;
      } else if (args.value === 'false') {
        args.value = false;
      }
      logger.debug('Preprocessed done field value', {
        originalValue: originalValue,
        processedValue: args.value,
      });
    }

    // Handle numeric fields that might come as strings
    if (
      (args.field === 'priority' ||
        args.field === 'project_id' ||
        args.field === 'repeat_after') &&
      typeof args.value === 'string'
    ) {
      const originalValue = args.value;
      const numValue = Number(args.value);
      if (!isNaN(numValue)) {
        args.value = numValue;
        logger.debug(`Preprocessed ${args.field} field value`, {
          originalValue: originalValue,
          processedValue: args.value,
        });
      }
    }

    // Validate the field and value based on allowed fields
    const allowedFields = [
      'done',
      'priority',
      'due_date',
      'project_id',
      'assignees',
      'labels',
      'repeat_after',
      'repeat_mode',
    ];
    if (!allowedFields.includes(args.field)) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid field: ${args.field}. Allowed fields: ${allowedFields.join(', ')}`,
      );
    }

    // Additional validation based on field type
    if (args.field === 'priority' && typeof args.value === 'number') {
      if (args.value < 0 || args.value > 5) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Priority must be between 0 and 5');
      }
    }

    if (args.field === 'due_date' && typeof args.value === 'string') {
      validateDateString(args.value, 'due_date');
    }

    if (args.field === 'project_id' && typeof args.value === 'number') {
      validateId(args.value, 'project_id');
    }

    // Type validation for array fields
    if (args.field === 'assignees' || args.field === 'labels') {
      if (!Array.isArray(args.value)) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, `${args.field} must be an array of numbers`);
      }
      const valueArray = args.value as number[];
      valueArray.forEach((id) => validateId(id, `${args.field} ID`));
    }

    // Type validation for boolean field
    if (args.field === 'done') {
      logger.debug('Bulk update done field validation', {
        value: args.value,
        typeOfValue: typeof args.value,
        isBoolean: typeof args.value === 'boolean',
      });
      if (typeof args.value !== 'boolean') {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'done field must be a boolean value (true or false)',
        );
      }
    }

    // Validation for recurring fields
    if (args.field === 'repeat_after' && typeof args.value === 'number') {
      if (args.value < 0) {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'repeat_after must be a non-negative number',
        );
      }
    }

    if (args.field === 'repeat_mode' && typeof args.value === 'string') {
      const validModes = ['day', 'week', 'month', 'year'];
      if (!validModes.includes(args.value)) {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid repeat_mode: ${args.value}. Valid modes: ${validModes.join(', ')}`,
        );
      }
    }

    const client = await getClientFromContext();

    // Use the proper bulk update API endpoint
    try {
      // Build the bulk update operation using TaskBulkOperation interface
      const bulkOperation = {
        task_ids: taskIds,
        field: args.field,
        value: args.value,
      };

      // Special handling for repeat_mode conversion
      if (args.field === 'repeat_mode' && typeof args.value === 'string') {
        const modeMap: Record<string, number> = {
          default: 0,
          month: 1,
          from_current: 2,
        };
        bulkOperation.value = modeMap[args.value] ?? args.value;
      }

      // Call the proper bulk update API
      logger.debug('Calling bulkUpdateTasks API', { bulkOperation });
      const bulkUpdateResult = await client.tasks.bulkUpdateTasks(bulkOperation);

      // Handle inconsistent return types from the bulk update API
      // Sometimes it returns Message object, sometimes Task[] array
      let updatedTasks: Task[] = [];
      let bulkUpdateSuccessful = false;

      if (Array.isArray(bulkUpdateResult)) {
        // API returned Task[] array - verify the updates were actually applied
        if (bulkUpdateResult.length > 0) {
          bulkUpdateSuccessful = true;

          // Check if the returned tasks have the expected values
          for (const task of bulkUpdateResult) {
            switch (args.field) {
              case 'priority':
                if (task.priority !== args.value) {
                  logger.warn('Bulk update API returned task with unchanged priority', {
                    taskId: task.id,
                    expectedPriority: args.value,
                    actualPriority: task.priority,
                  });
                  bulkUpdateSuccessful = false;
                }
                break;
              case 'done':
                if (task.done !== args.value) {
                  logger.warn('Bulk update API returned task with unchanged done status', {
                    taskId: task.id,
                    expectedDone: args.value,
                    actualDone: task.done,
                  });
                  bulkUpdateSuccessful = false;
                }
                break;
              case 'due_date':
                if (task.due_date !== args.value) {
                  logger.warn('Bulk update API returned task with unchanged due date', {
                    taskId: task.id,
                    expectedDueDate: args.value,
                    actualDueDate: task.due_date,
                  });
                  bulkUpdateSuccessful = false;
                }
                break;
              case 'project_id':
                if (task.project_id !== args.value) {
                  logger.warn('Bulk update API returned task with unchanged project ID', {
                    taskId: task.id,
                    expectedProjectId: args.value,
                    actualProjectId: task.project_id,
                  });
                  bulkUpdateSuccessful = false;
                }
                break;
            }
            if (!bulkUpdateSuccessful) break;
          }

          if (bulkUpdateSuccessful) {
            updatedTasks = bulkUpdateResult;
          }
        }
      } else if (
        bulkUpdateResult &&
        typeof bulkUpdateResult === 'object' &&
        'message' in bulkUpdateResult
      ) {
        // API returned Message object - treat as success but need to fetch updated tasks
        logger.debug('Bulk update API returned message object', { result: bulkUpdateResult });
        bulkUpdateSuccessful = true;
      }

      if (!bulkUpdateSuccessful) {
        // Bulk update didn't actually update the values, throw an error to trigger fallback
        throw new Error('Bulk update API reported success but did not update task values');
      }

      // If we don't have the updated tasks yet (Message response), fetch them using optimized processing
      if (updatedTasks.length === 0) {
        const fetchResult = await processTasksOptimized(
          taskIds,
          async (taskId: number) => {
            return await client.tasks.getTask(taskId);
          },
          'bulk_update_fetch',
          true // Enable caching for task fetches
        );

        updatedTasks = fetchResult.successful;
        
        if (fetchResult.failed.length > 0) {
          logger.warn('Some tasks could not be fetched after bulk update', {
            failedCount: fetchResult.failed.length,
            failedTaskIds: fetchResult.failed.map(f => f.originalItem),
          });
        }
      }

      const response = createStandardResponse(
        'update-tasks',
        `Successfully updated ${taskIds.length} tasks`,
        { tasks: updatedTasks },
        {
          timestamp: new Date().toISOString(),
          count: taskIds.length,
          affectedFields: [args.field],
        },
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (bulkError) {
      // If bulk update fails, fall back to individual updates
      logger.warn('Bulk update API failed, falling back to individual updates', {
        error: bulkError instanceof Error ? bulkError.message : String(bulkError),
        field: args.field,
        value: args.value,
        valueType: typeof args.value,
        taskIds: taskIds,
      });

      // Perform bulk update using individual task updates as fallback with optimization
      const updateResult = await processTasksOptimized(
        taskIds,
        async (taskId: number) => {
          // Fetch current task to preserve required fields
          const currentTask = await client.tasks.getTask(taskId);

          // Build update object based on field, preserving existing data
          const updateData: Task = { ...currentTask };

          switch (args.field) {
            case 'done':
              updateData.done = args.value as boolean;
              break;
            case 'priority':
              updateData.priority = args.value as number;
              break;
            case 'due_date':
              updateData.due_date = args.value as string;
              break;
            case 'project_id':
              updateData.project_id = args.value as number;
              break;
            case 'assignees':
              // For assignees, we need to handle the user assignment separately
              // This is a limitation of the current API
              break;
            case 'labels':
              // For labels, we need to handle the label assignment separately
              // This is a limitation of the current API
              break;
            case 'repeat_after':
              updateData.repeat_after = args.value as number;
              break;
            case 'repeat_mode':
              // The repeat_mode field in the API expects a number
              // But TypeScript types might be out of sync
              Object.assign(updateData, { repeat_mode: args.value });
              break;
          }

          // Update the task
          const updatedTask = await client.tasks.updateTask(taskId, updateData);

          // Handle assignees and labels separately if needed
          if (args.field === 'assignees' && Array.isArray(args.value)) {
            try {
              // Replace all assignees with the new list
              const currentTaskWithAssignees = await client.tasks.getTask(taskId);
              const currentAssigneeIds = currentTaskWithAssignees.assignees?.map((a) => a.id) || [];
              const newAssigneeIds = args.value as number[];

              // Add new assignees first to avoid leaving task unassigned
              if (newAssigneeIds.length > 0) {
                await withRetry(
                  () => client.tasks.bulkAssignUsersToTask(taskId, {
                    user_ids: newAssigneeIds,
                  }),
                  {
                    ...RETRY_CONFIG.AUTH_ERRORS,
                    shouldRetry: (error) => isAuthenticationError(error)
                  }
                );
              }

              // Remove old assignees only after new ones are successfully added
              for (const userId of currentAssigneeIds) {
                try {
                  await withRetry(
                    () => client.tasks.removeUserFromTask(taskId, userId),
                    {
                      ...RETRY_CONFIG.AUTH_ERRORS,
                      shouldRetry: (error) => isAuthenticationError(error)
                    }
                  );
                } catch (removeError) {
                  // Check if it's an auth error on remove after retries
                  if (isAuthenticationError(removeError)) {
                    throw new MCPError(
                      ErrorCode.API_ERROR,
                      `${AUTH_ERROR_MESSAGES.ASSIGNEE_REMOVE_PARTIAL} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`,
                    );
                  }
                  throw removeError;
                }
              }
            } catch (assigneeError) {
              // Check if it's an auth error after retries
              if (isAuthenticationError(assigneeError)) {
                throw new MCPError(
                  ErrorCode.API_ERROR, 
                  `${AUTH_ERROR_MESSAGES.ASSIGNEE_BULK_UPDATE} (Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times)`
                );
              }
              throw assigneeError;
            }
          }
          if (args.field === 'labels' && Array.isArray(args.value)) {
            await withRetry(
              () => client.tasks.updateTaskLabels(taskId, {
                label_ids: args.value as number[],
              }),
              {
                ...RETRY_CONFIG.AUTH_ERRORS,
                shouldRetry: (error) => isAuthenticationError(error)
              }
            );
          }

          return updatedTask;
        },
        'bulk_update_individual_fallback',
        false // Disable caching for individual updates to avoid stale data
      );

      // Check for any failures with optimized result format
      const failures = updateResult.failed;
      const successCount = updateResult.successful.length;

      if (failures.length > 0) {
        const failedIds = failures.map((f) => f.originalItem);

        // Check if all failures are due to assignee auth errors
        if (args.field === 'assignees') {
          const authFailures = failures.filter((f) => {
            const error = f.error;
            return (
              error instanceof MCPError &&
              error.message.includes('Assignee operations may have authentication issues')
            );
          });

          if (authFailures.length === failures.length) {
            // All failures are auth-related
            throw new MCPError(
              ErrorCode.API_ERROR,
              'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
                'This is a known limitation that prevents bulk updating assignees.',
            );
          }
        }

        // If some succeeded, report partial success
        if (successCount > 0) {
          logger.warn('Bulk update partially failed', {
            successCount,
            failedCount: failures.length,
            failedIds,
            performanceMetrics: updateResult.metrics,
          });
        } else {
          // All failed
          throw new MCPError(
            ErrorCode.API_ERROR,
            `Bulk update failed. Could not update any tasks. Failed IDs: ${failedIds.join(', ')}`,
          );
        }
      }

      // Use successful tasks from the update operation, or fetch fresh if needed
      let updatedTasks = updateResult.successful;
      let failedFetches = 0;

      // If we need fresh task data for display, fetch with optimization
      if (updatedTasks.length < successCount) {
        const fetchResult = await processTasksOptimized(
          taskIds,
          async (taskId: number) => {
            return await client.tasks.getTask(taskId);
          },
          'bulk_update_final_fetch',
          true // Enable caching for final fetch
        );

        updatedTasks = fetchResult.successful;
        failedFetches = fetchResult.failed.length;
      }

      const response = createStandardResponse(
        'update-tasks',
        `Successfully updated ${taskIds.length} tasks${failedFetches > 0 ? ` (${failedFetches} tasks could not be fetched after update)` : ''}`,
        { tasks: updatedTasks },
        {
          timestamp: new Date().toISOString(),
          affectedFields: [args.field],
          count: taskIds.length,
          ...(failedFetches > 0 && { fetchErrors: failedFetches }),
          performanceMetrics: {
            totalDuration: updateResult.metrics.totalDuration,
            operationsPerSecond: updateResult.metrics.operationsPerSecond,
            apiCallsUsed: updateResult.metrics.successfulOperations + updateResult.metrics.failedOperations,
            concurrencyLevel: updateResult.metrics.totalBatches > 0 ? 'optimized' : 'standard',
            cacheEfficiency: taskOperationCache.getMetrics().hitRatio,
          },
        },
      );

      logger.info('Bulk update completed with performance optimization', {
        taskCount: taskIds.length,
        field: args.field,
        fetchErrors: failedFetches,
        performance: response.metadata?.performanceMetrics,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to bulk update tasks: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Bulk delete tasks
 */
export async function bulkDeleteTasks(args: {
  taskIds?: number[];
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.taskIds || args.taskIds.length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'taskIds array is required for bulk delete operation',
      );
    }

    // Store taskIds in a const for TypeScript
    const taskIds = args.taskIds;

    // Check max tasks limit
    if (taskIds.length > MAX_BULK_OPERATION_TASKS) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Too many tasks for bulk operation. Maximum allowed: ${MAX_BULK_OPERATION_TASKS}. Consider breaking into smaller batches.`,
      );
    }

    // Validate all task IDs
    taskIds.forEach((id) => validateId(id, 'task ID'));

    const client = await getClientFromContext();

    // Fetch tasks before deletion for response metadata using optimized processing
    const fetchResult = await processTasksOptimized(
      taskIds,
      async (taskId: number) => {
        return await client.tasks.getTask(taskId);
      },
      'bulk_delete_fetch',
      true // Enable caching for task fetches
    );

    const tasksToDelete = fetchResult.successful;

    // Delete tasks using optimized processing
    const deletionResult = await processTasksOptimized(
      taskIds,
      async (taskId: number) => {
        await client.tasks.deleteTask(taskId);
        return { taskId, deleted: true }; // Return result for tracking
      },
      'bulk_delete_execution',
      false // Disable caching for delete operations
    );

    // Check for any failures
    const failures = deletionResult.failed;

    if (failures.length > 0) {
      const failedIds = failures.map((f) => f.originalItem);
      const successCount = deletionResult.successful.length;

      // If some succeeded, report partial success
      if (successCount > 0) {
        const response = createStandardResponse(
          'delete-tasks',
          `Bulk delete partially completed. Successfully deleted ${successCount} tasks. Failed to delete task IDs: ${failedIds.join(', ')}`,
          { deletedTaskIds: failedIds.filter((id): id is number => id !== undefined) },
          {
            timestamp: new Date().toISOString(),
            count: successCount,
            failedCount: failures.length,
            failedIds: failedIds.filter((id): id is number => id !== undefined),
            previousState: tasksToDelete as unknown as Record<string, unknown>,
          },
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } else {
        // All failed
        throw new MCPError(
          ErrorCode.API_ERROR,
          `Bulk delete failed. Could not delete any tasks. Failed IDs: ${failedIds.join(', ')}`,
        );
      }
    }

    const response = createStandardResponse(
      'delete-tasks',
      `Successfully deleted ${taskIds.length} tasks`,
      { deletedTaskIds: taskIds },
      {
        timestamp: new Date().toISOString(),
        count: taskIds.length,
        previousState: tasksToDelete as unknown as Record<string, unknown>,
      },
    );

    logger.debug('Bulk delete completed', {
      taskCount: taskIds.length,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to bulk delete tasks: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Bulk create tasks
 */
export async function bulkCreateTasks(args: {
  projectId?: number;
  tasks?: Array<{
    title: string;
    description?: string;
    dueDate?: string;
    priority?: number;
    labels?: number[];
    assignees?: number[];
    repeatAfter?: number;
    repeatMode?: 'day' | 'week' | 'month' | 'year';
  }>;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    if (!args.projectId) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'projectId is required for bulk create operation',
      );
    }
    validateId(args.projectId, 'projectId');

    if (!args.tasks || args.tasks.length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'tasks array is required and must contain at least one task',
      );
    }

    // Check max tasks limit
    if (args.tasks.length > MAX_BULK_OPERATION_TASKS) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Too many tasks for bulk operation. Maximum allowed: ${MAX_BULK_OPERATION_TASKS}. Consider breaking into smaller batches.`,
      );
    }

    // Validate all tasks have required fields
    args.tasks.forEach((task, index) => {
      if (!task.title || task.title.trim() === '') {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          `Task at index ${index} must have a non-empty title`,
        );
      }

      // Validate optional fields
      if (task.dueDate) {
        validateDateString(task.dueDate, `tasks[${index}].dueDate`);
      }

      if (task.assignees) {
        task.assignees.forEach((id) => validateId(id, `tasks[${index}].assignee ID`));
      }

      if (task.labels) {
        task.labels.forEach((id) => validateId(id, `tasks[${index}].label ID`));
      }
    });

    const client = await getClientFromContext();

    // Create tasks using optimized batch processor
    const projectId = args.projectId; // TypeScript knows this is defined due to earlier check
    const creationResult = await createBatchProcessor.processBatches(
      args.tasks.map((_, index) => index), // Use indices as items
      async (index: number) => {
        const taskData = args.tasks?.[index];
        if (!taskData) {
          throw new Error(`Task data not found at index ${index}`);
        }
        
        // Create the base task
        const newTask: Task = {
          title: taskData.title,
          project_id: projectId,
        };

        if (taskData.description !== undefined) newTask.description = taskData.description;
        if (taskData.dueDate !== undefined) newTask.due_date = taskData.dueDate;
        if (taskData.priority !== undefined) newTask.priority = taskData.priority;
        // Handle repeat configuration for bulk create
        if (taskData.repeatAfter !== undefined || taskData.repeatMode !== undefined) {
          const repeatConfig = convertRepeatConfiguration(
            taskData.repeatAfter,
            taskData.repeatMode,
          );
          if (repeatConfig.repeat_after !== undefined)
            newTask.repeat_after = repeatConfig.repeat_after;
          if (repeatConfig.repeat_mode !== undefined) {
            // Use index signature to bypass type mismatch - API expects number but node-vikunja types expect string
            (newTask as Record<string, unknown>).repeat_mode = repeatConfig.repeat_mode;
          }
        }

        // Create the task
        const createdTask = await client.tasks.createTask(projectId, newTask);

        // Add labels and assignees if provided
        if (createdTask.id) {
          try {
            if (taskData.labels && taskData.labels.length > 0) {
              const taskId = createdTask.id;
              const labelIds = taskData.labels;
              await withRetry(
                () => client.tasks.updateTaskLabels(taskId, {
                  label_ids: labelIds,
                }),
                {
                  ...RETRY_CONFIG.AUTH_ERRORS,
                  shouldRetry: (error) => isAuthenticationError(error)
                }
              );
            }

            if (taskData.assignees && taskData.assignees.length > 0) {
              const taskId = createdTask.id;
              const assigneeIds = taskData.assignees;
              try {
                await withRetry(
                  () => client.tasks.bulkAssignUsersToTask(taskId, {
                    user_ids: assigneeIds,
                  }),
                  {
                    ...RETRY_CONFIG.AUTH_ERRORS,
                    shouldRetry: (error) => isAuthenticationError(error)
                  }
                );
              } catch (assigneeError) {
                // Check if it's an auth error after retries
                if (isAuthenticationError(assigneeError)) {
                  throw new MCPError(
                    ErrorCode.API_ERROR,
                    'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
                      'This is a known limitation. The task was created but assignees could not be added. ' +
                      `(Retried ${RETRY_CONFIG.AUTH_ERRORS.maxRetries} times). Task ID: ${createdTask.id}`,
                  );
                }
                throw assigneeError;
              }
            }

            // Fetch the complete task with labels and assignees
            return await client.tasks.getTask(createdTask.id);
          } catch (updateError) {
            // If updating labels/assignees fails, try to clean up
            try {
              await client.tasks.deleteTask(createdTask.id);
            } catch (deleteError) {
              logger.error('Failed to clean up partially created task:', deleteError);
            }
            throw updateError;
          }
        }

        return createdTask;
      }
    );

    // Process results with modern batch processor format
    const successfulTasks = creationResult.successful;
    const failedTasks = creationResult.failed.map((f) => ({
      index: f.originalItem,
      error: f.error instanceof Error ? f.error.message : String(f.error),
    }));

    if (failedTasks.length > 0 && successfulTasks.length === 0) {
      // All failed
      throw new MCPError(
        ErrorCode.API_ERROR,
        `Bulk create failed. Could not create any tasks. Errors: ${JSON.stringify(failedTasks)}`,
      );
    }

    const response = createStandardResponse(
      'create-tasks',
      failedTasks.length > 0
        ? `Bulk create partially completed. Successfully created ${successfulTasks.length} tasks, ${failedTasks.length} failed.`
        : `Successfully created ${successfulTasks.length} tasks`,
      { tasks: successfulTasks },
      {
        timestamp: new Date().toISOString(),
        count: successfulTasks.length,
        ...(failedTasks.length > 0 && {
          failedCount: failedTasks.length,
          failures: failedTasks,
        }),
      },
    );

    logger.debug('Bulk create completed', {
      successCount: successfulTasks.length,
      failedCount: failedTasks.length,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to bulk create tasks: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}