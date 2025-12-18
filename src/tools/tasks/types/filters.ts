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

/**
 * Arguments for filtering operations
 */
export interface FilteringArgs {
  projectId?: number;
  page?: number;
  perPage?: number;
  search?: string;
  sort?: string;
  filter?: string;
  filterId?: string;
  allProjects?: boolean;
  done?: boolean;
}

/**
 * Parameters passed to filtering strategies
 */
export interface FilteringParams {
  args: FilteringArgs;
  filterExpression: FilterExpression | null;
  filterString: string | undefined;
  params: GetTasksParams;
}

/**
 * Metadata about the filtering operation performed
 */
export interface FilteringMetadata {
  serverSideFilteringUsed: boolean;
  serverSideFilteringAttempted: boolean;
  clientSideFiltering: boolean;
  filteringNote: string;
}

/**
 * Result of a filtering operation
 */
export interface FilteringResult {
  tasks: import('node-vikunja').Task[];
  metadata: FilteringMetadata;
}

/**
 * Task listing arguments with filtering support
 */
export interface TaskListingArgs extends FilteringArgs {
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
  aorpConfig?: import('../../../types/index').AorpBuilderConfig;
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
  /** Whether the filtering operation was successful */
  success: boolean;
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