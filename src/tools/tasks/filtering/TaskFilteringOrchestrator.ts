/**
 * Task Filtering Orchestrator
 * Main service that coordinates all filtering operations for tasks
 */

import type { TaskListingArgs, TaskFilterExecutionResult, TaskFilterValidationConfig } from '../types/filters';
import { FilterValidator } from '../../../storage/filtering/FilterValidator';
import { FilterExecutor } from './FilterExecutor';
import { MCPError, ErrorCode } from '../../../types/index';
import { logger } from '../../../utils/logger';

/**
 * Main orchestrator for task filtering operations
 * Coordinates validation, execution, and result processing
 */
export class TaskFilteringOrchestrator {
  /**
   * Executes the complete task filtering workflow
   *
   * @param args - Task listing arguments including filters
   * @param storage - Storage interface for saved filters
   * @param config - Optional validation configuration
   * @returns Promise resolving to filtering result with metadata
   */
  static async executeTaskFiltering(
    args: TaskListingArgs,
    storage: any,
    config: TaskFilterValidationConfig = {}
  ): Promise<TaskFilterExecutionResult> {
    try {
      logger.debug('Starting task filtering orchestration', {
        hasFilter: !!args.filter,
        hasFilterId: !!args.filterId,
        projectId: args.projectId,
        page: args.page,
        perPage: args.perPage
      });

      // Step 1: Validate all inputs and parse filters
      const validationResult = await FilterValidator.validateTaskFiltering(args, storage, config);

      // Log any validation warnings
      if (validationResult.validationWarnings.length > 0) {
        logger.warn('Task filtering validation warnings', {
          warnings: validationResult.validationWarnings
        });
      }

      // Step 2: Prepare query parameters
      const params = FilterExecutor.prepareQueryParameters(args);

      // Step 3: Execute the filtering
      const filteringResult = await FilterExecutor.executeFiltering(
        args,
        validationResult.filterExpression,
        validationResult.filterString,
        params,
        storage
      );

      // Step 4: Post-process and validate results
      const finalValidation = FilterValidator.validateLoadedTasks(filteringResult.tasks.length);
      if (finalValidation.warnings.length > 0) {
        logger.warn('Task filtering result warnings', {
          warnings: finalValidation.warnings
        });
      }

      if (finalValidation.shouldThrow) {
        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          `Task filtering result validation failed: ${finalValidation.warnings.join(', ')}`
        );
      }

      logger.debug('Task filtering orchestration completed', {
        taskCount: filteringResult.tasks.length,
        serverSideFilteringUsed: filteringResult.metadata.serverSideFilteringUsed,
        clientSideFiltering: filteringResult.metadata.clientSideFiltering
      });

      return filteringResult;

    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }

      logger.error('Task filtering orchestration failed', {
        error: error instanceof Error ? error.message : String(error),
        args: {
          hasFilter: !!args.filter,
          hasFilterId: !!args.filterId,
          projectId: args.projectId
        }
      });

      // Re-throw original error to be handled by main function
      throw error;
    }
  }

  /**
   * Validates task filtering parameters without executing the filtering
   * Useful for pre-validation or UI validation scenarios
   */
  static async validateTaskFiltering(
    args: TaskListingArgs,
    storage: any,
    config: TaskFilterValidationConfig = {}
  ): Promise<{
    isValid: boolean;
    warnings: string[];
    errors: string[];
    memoryValidation: {
      isValid: boolean;
      warnings: string[];
      maxAllowed?: number;
    };
  }> {
    try {
      const validationResult = await FilterValidator.validateTaskFiltering(args, storage, config);

      return {
        isValid: true,
        warnings: validationResult.validationWarnings,
        errors: [],
        memoryValidation: validationResult.memoryValidation
      };

    } catch (error) {
      if (error instanceof MCPError) {
        return {
          isValid: false,
          warnings: [],
          errors: [error.message],
          memoryValidation: { isValid: false, warnings: [] }
        };
      }

      return {
        isValid: false,
        warnings: [],
        errors: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
        memoryValidation: { isValid: false, warnings: [] }
      };
    }
  }

  /**
   * Prepares filtering context information for debugging and monitoring
   */
  static createFilteringContext(
    args: TaskListingArgs,
    result: TaskFilterExecutionResult
  ): {
    input: {
      hasFilter: boolean;
      hasFilterId: boolean;
      projectId?: number;
      page?: number;
      perPage?: number;
      search?: string;
      sort?: string;
    };
    output: {
      taskCount: number;
      serverSideFilteringUsed: boolean;
      serverSideFilteringAttempted: boolean;
      clientSideFiltering: boolean;
      filteringNote: string;
      memoryInfo?: any;
    };
    performance: {
      timestamp: string;
      processingTimeMs?: number;
    };
  } {
    // Build input object, only including defined properties to satisfy exactOptionalPropertyTypes
    const input: {
      hasFilter: boolean;
      hasFilterId: boolean;
      projectId?: number;
      page?: number;
      perPage?: number;
      search?: string;
      sort?: string;
    } = {
      hasFilter: !!args.filter,
      hasFilterId: !!args.filterId,
    };

    if (args.projectId !== undefined) {
      input.projectId = args.projectId;
    }

    if (args.page !== undefined) {
      input.page = args.page;
    }

    if (args.perPage !== undefined) {
      input.perPage = args.perPage;
    }

    if (args.search !== undefined) {
      input.search = args.search;
    }

    if (args.sort !== undefined) {
      input.sort = args.sort;
    }

    return {
      input,
      output: {
        taskCount: result.tasks.length,
        serverSideFilteringUsed: result.metadata.serverSideFilteringUsed,
        serverSideFilteringAttempted: result.metadata.serverSideFilteringAttempted,
        clientSideFiltering: result.metadata.clientSideFiltering,
        filteringNote: result.metadata.filteringNote,
        memoryInfo: result.memoryInfo
      },
      performance: {
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Analyzes filtering performance and provides recommendations
   */
  static analyzeFilteringPerformance(
    args: TaskListingArgs,
    result: TaskFilterExecutionResult
  ): {
    isOptimal: boolean;
    recommendations: string[];
    issues: string[];
  } {
    const recommendations: string[] = [];
    const issues: string[] = [];
    let isOptimal = true;

    // Check for server-side filtering usage
    if (args.filter && !result.metadata.serverSideFilteringUsed) {
      if (result.metadata.serverSideFilteringAttempted) {
        issues.push('Server-side filtering was attempted but failed, falling back to client-side');
        recommendations.push('Consider simplifying the filter syntax for better server-side compatibility');
      } else {
        recommendations.push('Consider enabling server-side filtering for better performance with large datasets');
      }
      isOptimal = false;
    }

    // Check page size efficiency
    if (args.perPage && args.perPage > 500) {
      issues.push('Large page size may impact performance');
      recommendations.push('Consider using smaller page sizes (<= 500) for better performance');
      isOptimal = false;
    }

    // Check memory usage
    if (result.memoryInfo && result.memoryInfo.actualCount > result.memoryInfo.maxAllowed) {
      issues.push('Task count exceeds recommended memory limits');
      recommendations.push('Apply more specific filters or use pagination to reduce memory usage');
      isOptimal = false;
    }

    // Check search efficiency
    if (args.search && args.search.length < 3) {
      recommendations.push('Search terms should be at least 3 characters for better results');
    }

    return {
      isOptimal,
      recommendations,
      issues
    };
  }
}