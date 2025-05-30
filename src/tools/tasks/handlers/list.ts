/**
 * Handler for listing tasks with proper type safety
 */

import type { VikunjaClient, Task } from 'node-vikunja';
import type { ListTasksRequest, ListTasksResponse } from '../../../types/operations/tasks';
import { MCPError, ErrorCode } from '../../../types/errors';
import { logger } from '../../../utils/logger';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { wrapVikunjaClient } from '../../../utils/vikunja-client-wrapper';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { AUTH_ERROR_MESSAGES } from '../constants';
import { validateId } from '../validation';
import { applyFilter } from '../filters';
import type { FilterExpression } from '../../../types/filters';
import { ListTasksSchema } from '../../../types/schemas/tasks';

/**
 * Handle task listing with validation and proper error handling
 */
export async function handleListTasks(
  request: ListTasksRequest,
  client: VikunjaClient
): Promise<ListTasksResponse> {
  const extendedClient = wrapVikunjaClient(client);
  try {
    // Validate input using Zod schema
    const validated = ListTasksSchema.parse({
      projectId: request.projectId,
      filter: request.filter,
      filterId: request.filterId,
      page: request.page,
      perPage: request.perPage,
      sort: request.sort,
      search: request.search,
      allProjects: request.allProjects,
      done: request.done
    });

    let tasks: Task[] = [];

    // If using a saved filter
    if (validated.filterId) {
      // Filters are not properly typed in node-vikunja
      const clientWithFilters = client as VikunjaClient & { filters: { getAll: () => Promise<Array<{ id: number; title: string; filters?: { filter_query?: string } }>> } };
      const filters = await withRetry(
        () => clientWithFilters.filters.getAll(),
        {
          ...RETRY_CONFIG,
          shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
        }
      );

      const savedFilter = filters.find((f) => f.id === parseInt(validated.filterId || '0'));
      if (!savedFilter) {
        throw new MCPError(ErrorCode.NOT_FOUND, `Filter with ID ${validated.filterId} not found`);
      }

      // Apply the saved filter's query
      if (savedFilter.filters?.filter_query) {
        validated.filter = savedFilter.filters.filter_query;
      }
    }

    // Fetch tasks based on context
    if (validated.projectId) {
      validateId(validated.projectId, 'projectId');
      
      const listParams: Record<string, unknown> = {
        page: validated.page || 1,
        per_page: validated.perPage || 50
      };

      if (validated.sort) {
        listParams.sort_by = validated.sort.split(',');
        listParams.order_by = validated.sort.includes('desc') ? ['desc'] : ['asc'];
      }

      if (validated.search) {
        listParams.s = validated.search;
      }

      const projectId = validated.projectId;
      tasks = await withRetry(
        () => extendedClient.tasks.getTasksForProject(projectId, listParams),
        {
          ...RETRY_CONFIG,
          shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
        }
      );
    } else {
      // Get all tasks across projects
      const allParams: Record<string, unknown> = {
        page: validated.page || 1,
        per_page: validated.perPage || 50
      };

      if (validated.sort) {
        allParams.sort_by = validated.sort.split(',');
        allParams.order_by = validated.sort.includes('desc') ? ['desc'] : ['asc'];
      }

      if (validated.search) {
        allParams.s = validated.search;
      }

      tasks = await withRetry(
        () => extendedClient.tasks.getAll(allParams),
        {
          ...RETRY_CONFIG,
          shouldRetry: (error: unknown) => error instanceof Error && isAuthenticationError(error)
        }
      );
    }

    // Apply client-side filtering
    let clientSideFiltering = false;
    let filteringNote: string | undefined;

    if (validated.filter) {
      try {
        // Parse filter and apply
        const filterExpression = JSON.parse(validated.filter) as FilterExpression;
        tasks = applyFilter(tasks, filterExpression);
        clientSideFiltering = true;
      } catch (filterError) {
        filteringNote = 'Invalid filter format';
      }
    }

    // Apply done filter if specified
    if (validated.done !== undefined) {
      tasks = tasks.filter(task => task.done === validated.done);
      clientSideFiltering = true;
    }

    // Calculate pagination metadata
    const totalItems = tasks.length;
    const page = validated.page || 1;
    const perPage = validated.perPage || 50;
    const totalPages = Math.ceil(totalItems / perPage);

    return {
      success: true,
      operation: 'list',
      message: `Retrieved ${tasks.length} tasks`,
      tasks,
      data: tasks,
      metadata: {
        timestamp: new Date().toISOString(),
        count: tasks.length,
        ...(validated.filter && { filter: validated.filter }),
        ...(clientSideFiltering && { clientSideFiltering }),
        ...(filteringNote && { filteringNote }),
        page,
        perPage,
        totalPages,
        totalItems,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      }
    };
  } catch (error) {
    // Handle authentication errors
    if (error instanceof Error && isAuthenticationError(error)) {
      logger.error('Authentication error listing tasks', { error: error.message });
      throw new MCPError(
        ErrorCode.AUTH_REQUIRED,
        AUTH_ERROR_MESSAGES.NOT_AUTHENTICATED
      );
    }

    // Re-throw MCPErrors
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle Zod validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as unknown as { errors: Array<{ path: Array<string | number>, message: string }> };
      const firstError = zodError.errors[0];
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        firstError ? `${firstError.path.join('.')}: ${firstError.message}` : 'Validation failed'
      );
    }

    // Handle other errors
    logger.error('Failed to list tasks', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      operation: 'list',
      message: 'Failed to list tasks',
      tasks: [],
      metadata: {
        timestamp: new Date().toISOString(),
        count: 0
      },
      error: {
        code: ErrorCode.API_ERROR,
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}