/**
 * Hybrid filtering strategy
 * 
 * This strategy attempts server-side filtering first, and falls back to
 * client-side filtering if server-side fails. This provides the best of
 * both worlds: efficiency when possible, reliability always.
 */

import type { TaskFilteringStrategy } from './TaskFilteringStrategy';
import type { FilteringParams, FilteringResult } from './types';
import { ServerSideFilteringStrategy } from './ServerSideFilteringStrategy';
import { ClientSideFilteringStrategy } from './ClientSideFilteringStrategy';
import { logger } from '../logger';

export class HybridFilteringStrategy implements TaskFilteringStrategy {
  private serverSideStrategy = new ServerSideFilteringStrategy();
  private clientSideStrategy = new ClientSideFilteringStrategy();

  async execute(params: FilteringParams): Promise<FilteringResult> {
    const { filterString } = params;
    
    if (!filterString) {
      // No filtering needed, use client-side strategy (which just loads tasks)
      return this.clientSideStrategy.execute(params);
    }
    
    // Attempt server-side filtering first
    try {
      logger.info('Hybrid filtering: attempting server-side filtering first', {
        filter: filterString
      });
      
      const result = await this.serverSideStrategy.execute(params);
      
      logger.info('Hybrid filtering: server-side filtering succeeded', {
        taskCount: result.tasks.length,
        filter: filterString
      });
      
      return result;
      
    } catch (error) {
      // Server-side filtering failed, fall back to client-side
      logger.warn('Hybrid filtering: server-side filtering failed, falling back to client-side', {
        error: error instanceof Error ? error.message : String(error),
        filter: filterString
      });
      
      const result = await this.clientSideStrategy.execute(params);
      
      // Update metadata to reflect that server-side was attempted
      return {
        ...result,
        metadata: {
          ...result.metadata,
          serverSideFilteringAttempted: true,
          filteringNote: 'Server-side filtering failed, client-side filtering applied as fallback'
        }
      };
    }
  }
}