/**
 * Main transformer exports
 * Centralized access to all transformation components
 */

// Base types and utilities
export * from './base';

// Field selection system
export * from './field-selector';

// Task-specific transformers
export * from './task';

// Size calculation and monitoring
export * from './size-calculator';

// Re-export commonly used items for convenience
export {
  Verbosity,
  FieldCategory
} from './base';

export type {
  TransformerConfig,
  OptimizedResponse,
  TransformationResult
} from './base';

export { SizeEstimator } from './base';

export {
  FieldSelector,
  defaultFieldSelector
} from './field-selector';

export {
  TaskTransformer,
  defaultTaskTransformer,
  transformTask,
  transformTasks
} from './task';

export {
  SizeCalculator,
  defaultSizeCalculator,
  calculateSizeMetrics,
  estimateSize,
  calculateReduction
} from './size-calculator';