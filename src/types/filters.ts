/**
 * Filter-related type definitions for Vikunja MCP Server
 */

import type { Task } from 'node-vikunja';
import type { FilteringMetadata } from '../utils/filtering/types';

/**
 * Supported filter operators
 */
export type FilterOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'like' | 'LIKE' | 'in' | 'not in';

/**
 * Logical operators for combining conditions
 */
export type LogicalOperator = '&&' | '||';

/**
 * Available fields for filtering tasks
 */
export type FilterField =
  | 'done'
  | 'priority'
  | 'percentDone'
  | 'dueDate'
  | 'assignees'
  | 'labels'
  | 'created'
  | 'updated'
  | 'title'
  | 'description';

/**
 * Valid field types for validation
 */
export const FIELD_TYPES: Record<FilterField, 'boolean' | 'number' | 'date' | 'string' | 'array'> = {
  done: 'boolean',
  priority: 'number',
  percentDone: 'number',
  dueDate: 'date',
  assignees: 'array',
  labels: 'array',
  created: 'date',
  updated: 'date',
  title: 'string',
  description: 'string',
};

/**
 * Represents a single filter condition
 */
export interface FilterCondition {
  field: FilterField;
  operator: FilterOperator;
  value: string | number | boolean | string[] | number[];
}

/**
 * Represents a group of filter conditions
 */
export interface FilterGroup {
  conditions: FilterCondition[];
  operator: LogicalOperator;
}

/**
 * Represents a complete filter expression
 */
export interface FilterExpression {
  groups: FilterGroup[];
  operator?: LogicalOperator;
}

/**
 * Represents a saved filter
 */
export interface SavedFilter {
  id: string;
  name: string;
  description?: string;
  filter: string;
  expression?: FilterExpression;
  created: Date;
  updated: Date;
  projectId?: number;
  isGlobal: boolean;
}

/**
 * Filter validation result
 */
export interface FilterValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Parser error with position information
 */
export interface ParseError {
  message: string;
  position: number;
  context?: string;
}

/**
 * Result of parsing a filter string
 */
export interface ParseResult {
  expression: FilterExpression | null;
  error?: ParseError;
}

/**
 * Configuration for filter validation
 */
export interface FilterValidationConfig {
  /** Threshold for performance warning (default: 10) */
  performanceWarningThreshold?: number;
  /** Custom validator function */
  customValidator?: (expression: FilterExpression) => FilterValidationResult;
}

/**
 * Filter storage interface
 */
export interface FilterStorage {
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
 * Arguments for task listing operations
 */
export interface TaskListingArgs {
  /** Filter expression to apply */
  filter?: string;
  /** Page number for pagination */
  page?: number;
  /** Number of items per page */
  limit?: number;
  /** Sort field */
  sort?: string;
  /** Sort order */
  order?: 'asc' | 'desc';
}

/**
 * Result of task filter execution
 */
export interface TaskFilterExecutionResult {
  /** Whether filtering was successful */
  success: boolean;
  /** Filtered tasks (if successful) */
  tasks?: Task[];
  /** Error message (if failed) */
  error?: string;
  /** Number of tasks returned */
  count?: number;
  /** Total number of tasks matching filter */
  total?: number;
  /** Filtering metadata */
  metadata?: FilteringMetadata;
  /** Memory usage information */
  memoryInfo?: {
    actualCount: number;
    maxAllowed: number;
    estimatedMemoryMB: number;
  };
  /** Performance metrics */
  performance?: {
    filterTime: number;
    fetchTime: number;
    totalTime: number;
    memoryUsage?: number;
  };
}
