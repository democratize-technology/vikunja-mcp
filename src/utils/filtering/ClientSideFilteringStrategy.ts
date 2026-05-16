/**
 * Client-side filtering strategy
 * 
 * This strategy loads all tasks from the API and then applies filtering
 * logic on the client side. This is the traditional approach that works
 * with all versions of Vikunja but may be less efficient for large datasets.
 */

import type { TaskFilteringStrategy } from './TaskFilteringStrategy';
import type { FilteringParams, FilteringResult } from './types';
import type { VikunjaClient, Task, GetTasksParams } from 'node-vikunja';
import { getClientFromContext } from '../../client';
import { validateId } from '../../tools/tasks/validation';
import { applyFilter } from '../../tools/tasks/filtering';
import { logger } from '../logger';

/**
 * Loads tasks from every project the user can access.
 *
 * Vikunja's dedicated "all tasks" endpoint (client.tasks.getAllTasks ->
 * GET /tasks/all) returns HTTP 400 "Invalid model provided" on some servers
 * (reproduced on v2.3.0), so it cannot be relied on for cross-project listing.
 * This aggregates GET /projects/{id}/tasks across every project instead, which
 * is consistently available. A project that fails individually is skipped
 * rather than failing the whole listing.
 */
async function loadTasksAcrossProjects(
  client: VikunjaClient,
  params: GetTasksParams,
): Promise<Task[]> {
  const projects = await client.projects.getProjects({ per_page: 1000 });

  const perProject = await Promise.all(
    projects.map(async (project): Promise<Task[]> => {
      const projectId = project.id;
      // Skip pseudo-projects (e.g. Favorites uses a negative id) to avoid duplicate tasks.
      if (typeof projectId !== 'number' || projectId <= 0) {
        return [];
      }
      try {
        return await client.tasks.getProjectTasks(projectId, params);
      } catch (error) {
        logger.warn('Skipping a project that failed during all-projects task aggregation', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    }),
  );

  return perProject.flat();
}

export class ClientSideFilteringStrategy implements TaskFilteringStrategy {
  async execute(params: FilteringParams): Promise<FilteringResult> {
    const { args, filterExpression, filterString, params: apiParams } = params;
    
    const client = await getClientFromContext();
    
    logger.info('Using client-side filtering', {
      filter: filterString,
      endpoint: args.projectId && !args.allProjects
        ? 'getProjectTasks'
        : 'getProjectTasks (aggregated across all projects)'
    });

    // Load tasks without server-side filtering
    let tasks;
    if (args.projectId !== undefined && !args.allProjects) {
      // Validate project ID
      validateId(args.projectId, 'projectId');
      // Get tasks for specific project without filter
      tasks = await client.tasks.getProjectTasks(args.projectId, apiParams);
    } else {
      // Aggregate tasks across all projects (GET /tasks/all is unreliable).
      tasks = await loadTasksAcrossProjects(client, apiParams);
    }
    
    logger.info('Tasks loaded for client-side filtering', {
      totalTasksLoaded: tasks?.length || 0,
      filter: filterString
    });
    
    // Apply client-side filtering if we have a filter expression
    const safeTasks = tasks || [];
    let filteredTasks = safeTasks;
    
    if (filterExpression) {
      const originalCount = safeTasks.length;
      filteredTasks = applyFilter(safeTasks, filterExpression);
      logger.debug('Applied client-side filter', {
        originalCount,
        filteredCount: filteredTasks?.length || 0,
        filter: filterString,
      });
    }
    
    return {
      tasks: filteredTasks || [],
      metadata: {
        serverSideFilteringUsed: false,
        serverSideFilteringAttempted: false,
        clientSideFiltering: Boolean(filterExpression),
        filteringNote: 'Client-side filtering applied (server-side disabled in development)'
      }
    };
  }
}