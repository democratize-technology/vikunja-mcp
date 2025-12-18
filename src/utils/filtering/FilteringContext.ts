/**
 * Filtering context for strategy selection and execution
 * 
 * This class encapsulates the logic for selecting the appropriate filtering
 * strategy based on configuration and environment settings. It maintains
 * the same behavior as the original implementation while providing a
 * cleaner separation of concerns.
 */

import type { TaskFilteringStrategy } from './TaskFilteringStrategy';
import type { FilteringParams, FilteringResult, StrategyConfig } from './types';
import { ClientSideFilteringStrategy } from './ClientSideFilteringStrategy';
import { HybridFilteringStrategy } from './HybridFilteringStrategy';

export class FilteringContext {
  private strategy: TaskFilteringStrategy;

  constructor(config: StrategyConfig) {
    this.strategy = this.getStrategy(config);
  }

  /**
   * Execute filtering using the selected strategy
   */
  async execute(params: FilteringParams): Promise<FilteringResult> {
    return this.strategy.execute(params);
  }

  /**
   * Select the appropriate filtering strategy based on configuration
   * 
   * This method preserves the original environment-based logic:
   * - If server-side filtering is enabled AND we're in production OR the env var is set,
   *   use hybrid filtering (server attempt + client fallback)
   * - Otherwise, use client-side only filtering
   */
  private getStrategy(config: StrategyConfig): TaskFilteringStrategy {
    const shouldAttemptServerSideFiltering = config.enableServerSide && (
      process.env.NODE_ENV === 'production' || 
      process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING === 'true'
    );

    if (shouldAttemptServerSideFiltering) {
      return new HybridFilteringStrategy();
    }

    return new ClientSideFilteringStrategy();
  }
}