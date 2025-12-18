/**
 * Filtering strategy pattern exports
 * 
 * This module provides a clean interface for the filtering strategy pattern
 * implementation, allowing easy import of all necessary components.
 */

// Core strategy interface
export type { TaskFilteringStrategy } from './TaskFilteringStrategy';

// Strategy implementations  
export { ServerSideFilteringStrategy } from './ServerSideFilteringStrategy';
export { ClientSideFilteringStrategy } from './ClientSideFilteringStrategy';
export { HybridFilteringStrategy } from './HybridFilteringStrategy';

// Context for strategy selection
export { FilteringContext } from './FilteringContext';

// Type definitions
export type {
  FilteringArgs,
  FilteringParams, 
  FilteringMetadata,
  FilteringResult,
  StrategyConfig
} from './types';