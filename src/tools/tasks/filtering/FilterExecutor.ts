/**
 * Filter execution engine for task filtering operations
 * Handles the execution of filters and applies additional post-processing
 */

import type { Task } from 'node-vikunja';
import type { TaskListingArgs, TaskFilterExecutionResult } from '../types/filters';
import { FilteringContext } from '../../../utils/filtering';
import { validateTaskCountLimit, logMemoryUsage, createTaskLimitExceededMessage } from '../../../utils/memory';
import { MCPError, ErrorCode } from '../../../types/index';
import { logger } from '../../../utils/logger';
import { handleFetchError } from '../../../utils/error-handler';

/**
 * Executes filtering operations on tasks with comprehensive error handling
 */
export class FilterExecutor {
  /**
   * Executes task filtering with the provided parameters
   */
  static async executeFiltering(
    args: TaskListingArgs,
    filterExpression: any,
    filterString: string | undefined,
    params: any,
    storage: any
  ): Promise<TaskFilterExecutionResult> {
    try {
      // Execute filtering using strategy pattern
      const filteringContext = new FilteringContext({
        enableServerSide: Boolean(filterString)
      });

      const filteringParams = {
        args: args as any,
        filterExpression,
        filterString,
        params
      };

      const filteringResult = await filteringContext.execute(filteringParams);
      const tasks = filteringResult.tasks;

      // Extract metadata for response formatting
      const {
        serverSideFilteringUsed,
        serverSideFilteringAttempted,
      } = filteringResult.metadata;

      // Additional memory protection: validate actual loaded task count
      const actualTaskCount = tasks.length;
      const finalTaskCountValidation = validateTaskCountLimit(actualTaskCount);

      let memoryInfo;
      if (!finalTaskCountValidation.allowed) {
        // Log warning but don't fail since tasks are already loaded
        logger.warn('Loaded task count exceeds recommended limits', {
          actualCount: actualTaskCount,
          maxRecommended: finalTaskCountValidation.maxAllowed,
          estimatedMemoryMB: finalTaskCountValidation.estimatedMemoryMB
        });

        memoryInfo = {
          actualCount: actualTaskCount,
          maxAllowed: finalTaskCountValidation.maxAllowed,
          estimatedMemoryMB: finalTaskCountValidation.estimatedMemoryMB
        };

        // For extremely large datasets, still enforce hard limits
        if (actualTaskCount > finalTaskCountValidation.maxAllowed * 1.5) {
          throw new MCPError(
            ErrorCode.INTERNAL_ERROR,
            createTaskLimitExceededMessage(
              'process loaded tasks',
              actualTaskCount,
              [
                'The API returned more tasks than expected',
                'Use stricter pagination or filtering',
                'Contact administrator about data size'
              ]
            )
          );
        }
      }

      // Log memory usage for monitoring
      logMemoryUsage('task listing', actualTaskCount, tasks);

      // Apply post-processing filters
      const processedTasks = this.applyPostProcessingFilters(tasks, args);

      // Determine filtering method message and metadata from strategy result
      const filteringMetadata = this.createFilteringMetadata(
        filterString,
        serverSideFilteringUsed,
        serverSideFilteringAttempted,
        filteringResult.metadata.filteringNote
      );

      // Build return object, only including defined properties to satisfy exactOptionalPropertyTypes
      const result: any = {
        tasks: processedTasks,
        metadata: filteringMetadata,
      };

      if (memoryInfo !== undefined) {
        result.memoryInfo = memoryInfo;
      }

      return result;

    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }

      // Log the full error for debugging filter issues
      logger.error('Task filtering execution error:', {
        error: error instanceof Error ? error.message : String(error),
        params: params,
        filter: args.filter,
        filterId: args.filterId,
      });

      // Re-throw original error to be handled by main function
      throw error;
    }
  }

  /**
   * Applies post-processing filters that aren't handled by the main filtering strategies
   */
  private static applyPostProcessingFilters(tasks: Task[], args: TaskListingArgs): Task[] {
    let filteredTasks = [...tasks];

    // Filter by done status if specified (this is a simpler filter that works)
    if (args.done !== undefined) {
      filteredTasks = filteredTasks.filter((task) => task.done === args.done);
    }

    return filteredTasks;
  }

  /**
   * Creates filtering metadata for response formatting
   */
  private static createFilteringMetadata(
    filterString: string | undefined,
    serverSideFilteringUsed: boolean,
    serverSideFilteringAttempted: boolean,
    filteringNote: string
  ): any {
    let filteringMessage = '';
    let filteringMetadata = {};

    if (filterString) {
      if (serverSideFilteringUsed) {
        filteringMessage = ' (filtered server-side)';
        filteringMetadata = {
          filter: filterString,
          serverSideFilteringUsed: true,
          serverSideFilteringAttempted: true,
          clientSideFiltering: false,
          filteringNote,
        };
      } else if (serverSideFilteringAttempted) {
        filteringMessage = ' (filtered client-side - server-side fallback)';
        filteringMetadata = {
          filter: filterString,
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: true,
          clientSideFiltering: true,
          filteringNote,
        };
      } else {
        filteringMessage = ' (filtered client-side)';
        filteringMetadata = {
          filter: filterString,
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: false,
          clientSideFiltering: true,
          filteringNote,
        };
      }
    }

    return filteringMetadata;
  }

  /**
   * Prepares query parameters for API calls
   */
  static prepareQueryParameters(args: TaskListingArgs): any {
    const params: any = {};

    // Build query parameters
    if (args.page !== undefined) params.page = args.page;
    if (args.perPage !== undefined) params.per_page = args.perPage;
    if (args.search !== undefined) params.s = args.search;
    if (args.sort !== undefined) params.sort_by = args.sort;

    // Memory protection: Check if we should implement pagination limits
    // Note: Vikunja API doesn't provide task count endpoints, so we use conservative defaults
    // and rely on user-provided pagination parameters
    if (!params.per_page) {
      // Set default pagination to prevent unbounded loading
      params.per_page = 1000; // Conservative default
      if (!params.page) {
        params.page = 1;
      }
      logger.info('Applied default pagination for memory protection', {
        per_page: params.per_page,
        page: params.page
      });
    }

    return params;
  }

  /**
   * Validates loaded tasks against memory constraints
   */
  static validateLoadedTaskCount(tasks: Task[]): {
    isValid: boolean;
    warnings: string[];
    shouldThrow: boolean;
  } {
    const actualTaskCount = tasks.length;
    const finalTaskCountValidation = validateTaskCountLimit(actualTaskCount);
    const warnings: string[] = [];

    if (!finalTaskCountValidation.allowed) {
      // Log warning but don't fail since tasks are already loaded
      logger.warn('Loaded task count exceeds recommended limits', {
        actualCount: actualTaskCount,
        maxRecommended: finalTaskCountValidation.maxAllowed,
        estimatedMemoryMB: finalTaskCountValidation.estimatedMemoryMB
      });

      warnings.push(
        `Loaded ${actualTaskCount} tasks, which exceeds recommended limit of ${finalTaskCountValidation.maxAllowed}. ` +
        `Estimated memory usage: ${finalTaskCountValidation.estimatedMemoryMB}MB.`
      );

      // For extremely large datasets, still enforce hard limits
      if (actualTaskCount > finalTaskCountValidation.maxAllowed * 1.5) {
        return {
          isValid: false,
          warnings,
          shouldThrow: true
        };
      }
    }

    return {
      isValid: true,
      warnings,
      shouldThrow: false
    };
  }
}