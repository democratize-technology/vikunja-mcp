/**
 * Client-side filtering strategy
 * 
 * This strategy loads all tasks from the API and then applies filtering
 * logic on the client side. This is the traditional approach that works
 * with all versions of Vikunja but may be less efficient for large datasets.
 */

import type { TaskFilteringStrategy } from './TaskFilteringStrategy';
import type { FilteringParams, FilteringResult } from './types';
import { getClientFromContext } from '../../client';
import { validateId } from '../../tools/tasks/validation';
import { applyFilter } from '../../tools/tasks/filtering';
import { logger } from '../logger';

export class ClientSideFilteringStrategy implements TaskFilteringStrategy {
  async execute(params: FilteringParams): Promise<FilteringResult> {
    const { args, filterExpression, filterString, params: apiParams } = params;
    
    const client = await getClientFromContext();
    
    logger.info('Using client-side filtering', {
      filter: filterString,
      endpoint: args.projectId && !args.allProjects ? 'getProjectTasks' : 'getAllTasks'
    });
    
    // Load tasks without server-side filtering
    let tasks;
    if (args.projectId !== undefined && !args.allProjects) {
      // Validate project ID
      validateId(args.projectId, 'projectId');
      // Get tasks for specific project without filter
      tasks = await client.tasks.getProjectTasks(args.projectId, apiParams);
    } else {
      // Get all tasks across all projects without filter  
      tasks = await client.tasks.getAllTasks(apiParams);
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