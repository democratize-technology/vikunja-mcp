/**
 * Task Filtering Module
 * Provides comprehensive filtering capabilities for task operations
 */

// Main orchestrator
export { TaskFilteringOrchestrator } from './TaskFilteringOrchestrator';

// Core components
export { FilterValidator } from './FilterValidator';
export { FilterExecutor } from './FilterExecutor';

// Filter evaluators (moved from original filters.ts)
export {
  evaluateCondition,
  evaluateComparison,
  evaluateDateComparison,
  parseRelativeDate,
  evaluateStringComparison,
  evaluateArrayComparison,
  evaluateGroup,
  applyFilter
} from './evaluators';

// Types
export type {
  TaskListingArgs,
  TaskFilteringParams,
  TaskFilteringResult,
  TaskFilterValidationConfig,
  TaskFilteringContext,
  TaskFilterExecutionResult,
  TaskFilterStorage
} from '../types/filters';

// Re-export commonly used types from base filter types
export type {
  FilterExpression,
  FilterValidationResult,
  SavedFilter
} from '../../../types/filters';