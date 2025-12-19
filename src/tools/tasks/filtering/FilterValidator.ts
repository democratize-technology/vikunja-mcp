/**
 * Filter validation for task filtering operations
 * Handles validation of filter expressions and task listing parameters
 */

import type { Task } from 'node-vikunja';
import type { FilterExpression, ParseResult } from '../../../types/filters';
import type { TaskListingArgs, TaskFilterValidationConfig, TaskFilterStorage } from '../types/filters';
import { MCPError, ErrorCode } from '../../../types';
import { parseFilterString } from '../../../utils/filters';
import { validateTaskCountLimit } from '../../../utils/memory';
import { logger } from '../../../utils/logger';

/**
 * Validates filter parameters for task listing operations
 */
export class FilterValidator {
  /**
   * Validates and processes filter string or filter ID
   */
  static async validateAndParseFilter(
    args: TaskListingArgs,
    storage: TaskFilterStorage
  ): Promise<{
    filterExpression: FilterExpression | null;
    filterString: string | undefined;
    validationWarnings: string[];
  }> {
    let filterExpression: FilterExpression | null = null;
    let filterString: string | undefined;
    const validationWarnings: string[] = [];

    try {
      // Handle filter - either direct filter string or saved filter ID
      if (args.filterId) {
        const savedFilter = await storage.get(args.filterId);
        if (!savedFilter) {
          throw new MCPError(
            ErrorCode.VALIDATION_ERROR,
            `Filter with id ${args.filterId} not found`
          );
        }
        filterString = savedFilter.filter;
      } else if (args.filter !== undefined) {
        filterString = args.filter;
      }

      // Parse the filter string for client-side filtering
      if (filterString) {
        const parseResult: ParseResult = parseFilterString(filterString);
        if (parseResult.error) {
          throw new MCPError(
            ErrorCode.VALIDATION_ERROR,
            `Invalid filter syntax: ${parseResult.error.message}${parseResult.error.context ? `\n${parseResult.error.context}` : ''}`
          );
        }
        filterExpression = parseResult.expression;

        // Log that we're preparing to attempt hybrid filtering
        logger.info('Preparing hybrid filtering (server-side attempt + client-side fallback)', {
          filter: filterString,
        });
      }

      return { filterExpression, filterString, validationWarnings };
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Filter validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Validates pagination and memory constraints
   */
  static validateMemoryConstraints(
    args: TaskListingArgs,
    requestedPageSize: number
  ): {
    isValid: boolean;
    warnings: string[];
    maxAllowed?: number;
  } {
    const warnings: string[] = [];

    // Validate pagination limits for memory protection with enhanced analysis
    const taskCountValidation = validateTaskCountLimit(
      requestedPageSize,
      undefined,
      args.filter ? {
        filterExpression: args.filter,
        operationType: 'list'
      } : undefined
    );

    if (!taskCountValidation.allowed) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Task count limit exceeded. Requested: ${requestedPageSize}, Max allowed: ${taskCountValidation.maxAllowed}. ` +
        `Estimated memory usage: ${taskCountValidation.estimatedMemoryMB}MB (risk: ${taskCountValidation.riskLevel}). ` +
        'Reduce the perPage parameter, use pagination with smaller page sizes, or apply more specific filters.'
      );
    }

    // Add warnings for large page sizes
    if (requestedPageSize > 500) {
      warnings.push(`Large page size (${requestedPageSize}) may impact performance. Consider using smaller pages or more specific filters.`);
    }

    // Include enhanced memory validation warnings
    if (taskCountValidation.warnings.length > 0) {
      warnings.push(...taskCountValidation.warnings);
    }

    return {
      isValid: true,
      warnings,
      maxAllowed: taskCountValidation.maxAllowed
    } as {
      isValid: boolean;
      warnings: string[];
      maxAllowed?: number;
      riskLevel?: 'low' | 'medium' | 'high';
      estimatedMemoryMB?: number;
    };
  }

  /**
   * Validates the actual loaded task count against limits
   */
  static validateLoadedTasks(actualTaskCount: number, sampleTask?: Task): {
    isValid: boolean;
    warnings: string[];
    shouldThrow: boolean;
    riskLevel?: 'low' | 'medium' | 'high';
    estimatedMemoryMB?: number;
  } {
    const warnings: string[] = [];
    const finalTaskCountValidation = validateTaskCountLimit(actualTaskCount, sampleTask);

    if (!finalTaskCountValidation.allowed) {
      // Log warning but don't fail since tasks are already loaded
      logger.warn('Loaded task count exceeds recommended limits', {
        actualCount: actualTaskCount,
        maxRecommended: finalTaskCountValidation.maxAllowed,
        estimatedMemoryMB: finalTaskCountValidation.estimatedMemoryMB,
        riskLevel: finalTaskCountValidation.riskLevel
      });

      warnings.push(
        `Loaded ${actualTaskCount} tasks, which exceeds recommended limit of ${finalTaskCountValidation.maxAllowed}. ` +
        `Estimated memory usage: ${finalTaskCountValidation.estimatedMemoryMB}MB (risk: ${finalTaskCountValidation.riskLevel}).`
      );

      // For extremely large datasets, still enforce hard limits
      if (actualTaskCount > finalTaskCountValidation.maxAllowed * 1.5) {
        return {
          isValid: false,
          warnings,
          shouldThrow: true,
          riskLevel: finalTaskCountValidation.riskLevel,
          estimatedMemoryMB: finalTaskCountValidation.estimatedMemoryMB
        };
      }
    }

    // Include warnings from enhanced validation
    if (finalTaskCountValidation.warnings.length > 0) {
      warnings.push(...finalTaskCountValidation.warnings);
    }

    return {
      isValid: true,
      warnings,
      shouldThrow: false,
      riskLevel: finalTaskCountValidation.riskLevel,
      estimatedMemoryMB: finalTaskCountValidation.estimatedMemoryMB
    };
  }

  /**
   * Validates task listing arguments
   */
  static validateTaskListingArgs(args: TaskListingArgs): string[] {
    const errors: string[] = [];

    // Validate numeric parameters
    if (args.page !== undefined && (args.page < 1 || !Number.isInteger(args.page))) {
      errors.push('Page number must be a positive integer');
    }

    if (args.perPage !== undefined && (args.perPage < 1 || !Number.isInteger(args.perPage))) {
      errors.push('Per page count must be a positive integer');
    }

    if (args.projectId !== undefined && (args.projectId < 1 || !Number.isInteger(args.projectId))) {
      errors.push('Project ID must be a positive integer');
    }

    // Validate boolean parameters
    if (args.done !== undefined && typeof args.done !== 'boolean') {
      errors.push('Done parameter must be a boolean value');
    }

    // Validate string parameters
    if (args.search !== undefined && typeof args.search !== 'string') {
      errors.push('Search parameter must be a string');
    }

    if (args.sort !== undefined && typeof args.sort !== 'string') {
      errors.push('Sort parameter must be a string');
    }

    if (args.filter !== undefined && typeof args.filter !== 'string') {
      errors.push('Filter parameter must be a string');
    }

    if (args.filterId !== undefined && typeof args.filterId !== 'string') {
      errors.push('Filter ID parameter must be a string');
    }

    return errors;
  }

  /**
   * Performs comprehensive validation of task filtering parameters
   */
  static async validateTaskFiltering(
    args: TaskListingArgs,
    storage: TaskFilterStorage,
    config: TaskFilterValidationConfig = {}
  ): Promise<{
    filterExpression: FilterExpression | null;
    filterString: string | undefined;
    validationWarnings: string[];
    memoryValidation: {
      isValid: boolean;
      warnings: string[];
      maxAllowed?: number;
    };
  }> {
    const allWarnings: string[] = [];

    // Validate basic arguments
    const argValidationErrors = this.validateTaskListingArgs(args);
    if (argValidationErrors.length > 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid task listing arguments: ${argValidationErrors.join(', ')}`
      );
    }

    // Validate and parse filter
    const filterValidation = await this.validateAndParseFilter(args, storage);
    allWarnings.push(...filterValidation.validationWarnings);

    // Validate memory constraints
    const pageSize = args.perPage || 1000; // Default pagination
    const memoryValidation = this.validateMemoryConstraints(args, pageSize);
    allWarnings.push(...memoryValidation.warnings);

    return {
      filterExpression: filterValidation.filterExpression,
      filterString: filterValidation.filterString,
      validationWarnings: allWarnings,
      memoryValidation
    };
  }
}