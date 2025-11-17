/**
 * Task-specific filtering type definitions
 * Extends the base filter types with task-specific functionality
 */

import type { Task } from 'node-vikunja';
import type {
  FilterExpression,
  SavedFilter,
  FilterValidationResult,
  FilterValidationConfig
} from '../../../types/filters';
import type { GetTasksParams } from 'node-vikunja';
import type {
  FilteringArgs,
  FilteringParams,
  FilteringMetadata,
  FilteringResult
} from '../../../utils/filtering/types';

/**
 * Task listing arguments with filtering support
 */
export interface TaskListingArgs extends FilteringArgs {
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
  aorpConfig?: import('../../../aorp/types').AorpBuilderConfig;
  sessionId?: string;
}

/**
 * Enhanced filtering parameters for task operations
 */
export interface TaskFilteringParams extends FilteringParams {
  args: TaskListingArgs;
}

/**
 * Enhanced filtering result with task-specific metadata
 */
export interface TaskFilteringResult extends FilteringResult {
  /** Additional task-specific metadata can be added here */
}

/**
 * Task filtering validation configuration
 */
export interface TaskFilterValidationConfig extends FilterValidationConfig {
  /** Enable memory usage validation */
  enableMemoryValidation?: boolean;
  /** Task count limit for validation */
  maxTaskCount?: number;
}

/**
 * Task filtering storage interface
 */
export interface TaskFilterStorage {
  list(): Promise<SavedFilter[]>;
  get(id: string): Promise<SavedFilter | null>;
  create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter>;
  update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>,
  ): Promise<SavedFilter>;
  delete(id: string): Promise<void>;
  findByName(name: string): Promise<SavedFilter | null>;
}

/**
 * Task filtering execution context
 */
export interface TaskFilteringContext {
  /** Vikunja API parameters */
  params: GetTasksParams;
  /** Filter expression if provided */
  filterExpression: FilterExpression | null;
  /** Raw filter string */
  filterString: string | undefined;
  /** Task listing arguments */
  args: TaskListingArgs;
  /** Storage interface for saved filters */
  storage: import('../../../storage').SimpleFilterStorage;
}

/**
 * Task filtering result with metadata
 */
export interface TaskFilterExecutionResult {
  /** Filtered tasks */
  tasks: Task[];
  /** Filtering metadata */
  metadata: FilteringMetadata;
  /** Memory usage information */
  memoryInfo?: {
    actualCount: number;
    maxAllowed: number;
    estimatedMemoryMB: number;
  };
}