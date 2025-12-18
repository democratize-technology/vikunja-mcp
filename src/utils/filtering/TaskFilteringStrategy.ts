/**
 * Base interface for task filtering strategies
 * 
 * This interface defines the contract that all filtering strategies must implement.
 * It follows the Strategy pattern to encapsulate different filtering approaches
 * while maintaining a consistent interface.
 */

import type { FilteringParams, FilteringResult } from './types';

export interface TaskFilteringStrategy {
  /**
   * Execute the filtering strategy
   * 
   * @param params - The filtering parameters including args, expressions, and API params
   * @returns Promise resolving to the filtering result with tasks and metadata
   * @throws MCPError for validation or API errors
   */
  execute(params: FilteringParams): Promise<FilteringResult>;
}