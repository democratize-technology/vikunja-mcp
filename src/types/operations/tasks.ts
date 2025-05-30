/**
 * Task-specific operation types for type-safe task management
 */

import type { Task } from 'node-vikunja';
import type { 
  BaseOperationRequest, 
  BaseOperationResponse, 
  PaginatedMetadata
} from './base';

/**
 * Request to list tasks with optional filtering and pagination
 */
export interface ListTasksRequest extends BaseOperationRequest {
  operation: 'list';
  /** Project ID to filter tasks */
  projectId?: number;
  /** SQL-like filter string */
  filter?: string;
  /** Saved filter ID to use */
  filterId?: string;
  /** Page number for pagination (1-based) */
  page?: number;
  /** Number of items per page */
  perPage?: number;
  /** Sort expression */
  sort?: string;
  /** Search string to filter tasks */
  search?: string;
  /** Whether to search across all projects */
  allProjects?: boolean;
  /** Filter by completion status */
  done?: boolean;
}

/**
 * Response containing a list of tasks
 */
export interface ListTasksResponse extends BaseOperationResponse<Task[]> {
  /** The list of tasks */
  tasks: Task[];
  /** Metadata about the list operation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Number of tasks returned */
    count: number;
    /** Applied filter string */
    filter?: string;
    /** Whether client-side filtering was used */
    clientSideFiltering?: boolean;
    /** Note about filtering limitations */
    filteringNote?: string;
  } & Partial<PaginatedMetadata>;
}

/**
 * Request to create a new task
 */
export interface CreateTaskRequest extends BaseOperationRequest {
  operation: 'create';
  /** Project ID where the task will be created */
  projectId: number;
  /** Task title (required) */
  title: string;
  /** Task description */
  description?: string;
  /** Due date in ISO format */
  dueDate?: string;
  /** Priority level (0-5) */
  priority?: number;
  /** Label IDs to assign */
  labels?: number[];
  /** User IDs to assign */
  assignees?: number[];
  /** Repeat interval in seconds */
  repeatAfter?: number;
  /** How to calculate the next occurrence */
  repeatMode?: 'day' | 'week' | 'month' | 'year';
}

/**
 * Response after creating a task
 */
export interface CreateTaskResponse extends BaseOperationResponse<Task> {
  /** The created task */
  task: Task;
  /** Metadata about the creation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Whether labels were successfully added */
    labelsAdded?: boolean;
    /** Whether assignees were successfully added */
    assigneesAdded?: boolean;
  };
}

/**
 * Request to update an existing task
 */
export interface UpdateTaskRequest extends BaseOperationRequest {
  operation: 'update';
  /** Task ID to update */
  id: number;
  /** New title */
  title?: string;
  /** New description */
  description?: string;
  /** New due date in ISO format */
  dueDate?: string;
  /** New priority (0-5) */
  priority?: number;
  /** Completion status */
  done?: boolean;
  /** New label IDs (replaces existing) */
  labels?: number[];
  /** New assignee IDs (replaces existing) */
  assignees?: number[];
  /** New repeat interval in seconds */
  repeatAfter?: number;
  /** New repeat mode */
  repeatMode?: 'day' | 'week' | 'month' | 'year';
}

/**
 * Response after updating a task
 */
export interface UpdateTaskResponse extends BaseOperationResponse<Task> {
  /** The updated task */
  task: Task;
  /** Metadata about the update */
  metadata: BaseOperationResponse['metadata'] & {
    /** List of fields that were updated */
    affectedFields: string[];
    /** Previous values of updated fields */
    previousState?: Partial<Task>;
  };
}

/**
 * Request to delete a task
 */
export interface DeleteTaskRequest extends BaseOperationRequest {
  operation: 'delete';
  /** Task ID to delete */
  id: number;
}

/**
 * Response after deleting a task
 */
export interface DeleteTaskResponse extends BaseOperationResponse<void> {
  /** Metadata about the deletion */
  metadata: BaseOperationResponse['metadata'] & {
    /** The ID of the deleted task */
    deletedTaskId: number;
  };
}

/**
 * Request to create multiple tasks
 */
export interface BulkCreateTasksRequest extends BaseOperationRequest {
  operation: 'bulk-create';
  /** Project ID where tasks will be created */
  projectId: number;
  /** Array of tasks to create */
  tasks: Array<{
    title: string;
    description?: string;
    dueDate?: string;
    priority?: number;
    labels?: number[];
    assignees?: number[];
    repeatAfter?: number;
    repeatMode?: 'day' | 'week' | 'month' | 'year';
  }>;
}

/**
 * Response after bulk creating tasks
 */
export interface BulkCreateTasksResponse extends BaseOperationResponse<Task[]> {
  /** Successfully created tasks */
  tasks: Task[];
  /** Metadata about the bulk operation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Number of successfully created tasks */
    count: number;
    /** Number of failed tasks */
    failedCount?: number;
    /** Details about failures */
    failures?: Array<{
      index: number;
      error: string;
      taskData?: unknown;
    }>;
  };
}

/**
 * Request to update multiple tasks
 */
export interface BulkUpdateTasksRequest extends BaseOperationRequest {
  operation: 'bulk-update';
  /** Task IDs to update */
  taskIds: number[];
  /** Field to update */
  field: 'done' | 'priority' | 'due_date' | 'project_id' | 'assignees' | 'labels' | 'repeat_after' | 'repeat_mode';
  /** New value for the field */
  value: unknown;
}

/**
 * Response after bulk updating tasks
 */
export interface BulkUpdateTasksResponse extends BaseOperationResponse<Task[]> {
  /** Successfully updated tasks */
  tasks: Task[];
  /** Metadata about the bulk operation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Field that was updated */
    affectedField: string;
    /** Number of successfully updated tasks */
    count: number;
    /** Number of tasks that couldn't be fetched after update */
    fetchErrors?: number;
  };
}

/**
 * Request to bulk delete tasks
 */
export interface BulkDeleteTasksRequest extends BaseOperationRequest {
  operation: 'bulk-delete';
  /** Task IDs to delete */
  taskIds: number[];
}

/**
 * Response after bulk deleting tasks
 */
export interface BulkDeleteTasksResponse extends BaseOperationResponse<void> {
  /** Metadata about the bulk deletion */
  metadata: BaseOperationResponse['metadata'] & {
    /** Number of successfully deleted tasks */
    count: number;
    /** IDs of deleted tasks */
    deletedTaskIds: number[];
    /** IDs of tasks that failed to delete */
    failedTaskIds?: number[];
  };
}

/**
 * Union type of all task operation requests
 */
export type TaskOperationRequest = 
  | ListTasksRequest
  | CreateTaskRequest
  | UpdateTaskRequest
  | DeleteTaskRequest
  | BulkCreateTasksRequest
  | BulkUpdateTasksRequest
  | BulkDeleteTasksRequest;

/**
 * Union type of all task operation responses
 */
export type TaskOperationResponse =
  | ListTasksResponse
  | CreateTaskResponse
  | UpdateTaskResponse
  | DeleteTaskResponse
  | BulkCreateTasksResponse
  | BulkUpdateTasksResponse
  | BulkDeleteTasksResponse;

/**
 * Type guards for request types
 */
export function isListTasksRequest(req: BaseOperationRequest): req is ListTasksRequest {
  return req.operation === 'list';
}

export function isCreateTaskRequest(req: BaseOperationRequest): req is CreateTaskRequest {
  return req.operation === 'create' && 'projectId' in req && 'title' in req;
}

export function isUpdateTaskRequest(req: BaseOperationRequest): req is UpdateTaskRequest {
  return req.operation === 'update' && 'id' in req;
}

export function isDeleteTaskRequest(req: BaseOperationRequest): req is DeleteTaskRequest {
  return req.operation === 'delete' && 'id' in req;
}

export function isBulkCreateTasksRequest(req: BaseOperationRequest): req is BulkCreateTasksRequest {
  return req.operation === 'bulk-create' && 'projectId' in req && 'tasks' in req;
}

export function isBulkUpdateTasksRequest(req: BaseOperationRequest): req is BulkUpdateTasksRequest {
  return req.operation === 'bulk-update' && 'taskIds' in req && 'field' in req;
}

export function isBulkDeleteTasksRequest(req: BaseOperationRequest): req is BulkDeleteTasksRequest {
  return req.operation === 'bulk-delete' && 'taskIds' in req;
}