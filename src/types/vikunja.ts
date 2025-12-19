/**
 * Vikunja API Types
 * Adapted from the Deno prototype with additions from API documentation
 */

// Import the Task type from node-vikunja to ensure compatibility
import type { Task as VikunjaTask } from 'node-vikunja';

// Authentication Types
export interface LoginCredentials {
  username: string;
  password: string;
  totp_passcode?: string;
}

export interface AuthToken {
  token: string;
  expires_at: string;
}

export interface AuthSession {
  apiUrl: string;
  apiToken: string;
  tokenExpiry?: Date;
  userId?: string;
  authType: 'api-token' | 'jwt';
}

// Common Types
export interface Message {
  message: string;
}

export interface Pagination {
  page?: number;
  per_page?: number;
}

export interface SearchParams {
  s?: string;
}

export interface DateRange {
  date_from?: string;
  date_to?: string;
}

// User Types
export interface User {
  id: number;
  username: string;
  email?: string;
  name?: string;
  created?: string;
  updated?: string;
  // Notification preference fields (may be present in full user objects)
  email_reminders_enabled?: boolean;
  overdue_tasks_reminders_enabled?: boolean;
  overdue_tasks_reminders_time?: string;
  // Other settings fields
  language?: string;
  timezone?: string;
  week_start?: number;
  frontend_settings?: Record<string, unknown>;
}

// Extended UserSettings interface with notification preferences
export interface ExtendedUserSettings {
  name?: string;
  email?: string;
  language?: string;
  timezone?: string;
  week_start?: number;
  frontend_settings?: Record<string, unknown>;
  email_reminders_enabled?: boolean;
  overdue_tasks_reminders_enabled?: boolean;
  overdue_tasks_reminders_time?: string;
  discoverable_by_name?: boolean;
  discoverable_by_email?: boolean;
  default_project_id?: number;
}

// Project Types
export interface Project {
  id?: number;
  title: string;
  description?: string;
  parent_project_id?: number;
  is_archived?: boolean;
  hex_color?: string;
  created?: string;
  updated?: string;
  owner?: User;
}

export interface ProjectUser {
  user_id: number;
  project_id: number;
  right: number; // 0: Read, 1: Write, 2: Admin
  created?: string;
  updated?: string;
}

export interface ProjectView {
  id?: number;
  project_id: number;
  title: string;
  view_kind: 'list' | 'board' | 'table' | 'gantt';
  position?: number;
  bucket_configuration?: unknown;
  created?: string;
  updated?: string;
}

// Task Types
export interface Task {
  id?: number;
  project_id: number;
  title: string;
  description?: string;
  done?: boolean;
  done_at?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  repeat_after?: number;
  repeat_mode?: 'day' | 'week' | 'month' | 'year';
  priority?: number;
  percent_done?: number;
  labels?: Label[];
  assignees?: User[];
  attachments?: Attachment[];
  reminders?: TaskReminder[];
  created?: string;
  updated?: string;
  created_by?: User;
}

export interface TaskReminder {
  id: number;
  reminder_date: string; // ISO 8601 date string
}

export interface TaskComment {
  id?: number;
  task_id: number;
  comment: string;
  author?: User;
  created?: string;
  updated?: string;
}

export interface TaskRelation {
  id?: number;
  task_id: number;
  other_task_id: number;
  relation_kind: string;
  created_by?: User;
  created?: string;
}

// Label Types
export interface Label {
  id?: number;
  title: string;
  description?: string;
  hex_color?: string;
  created_by?: User;
  created?: string;
  updated?: string;
}

// Team Types
export interface Team {
  id?: number;
  name: string;
  description?: string;
  members?: TeamMember[];
  created?: string;
  updated?: string;
  created_by?: User;
}

export interface TeamMember {
  id: number;
  username: string;
  email?: string;
  admin: boolean;
}

// Attachment Types
export interface Attachment {
  id?: number;
  task_id: number;
  file: File | string;
  created?: string;
  created_by?: User;
}

// Filter Types
export interface SavedFilter {
  id?: number;
  title: string;
  description?: string;
  filters: FilterQuery;
  created?: string;
  updated?: string;
  owner?: User;
}

export interface FilterQuery {
  filter?: string;
  filter_timezone?: string;
  filter_include_nulls?: boolean;
}

// Notification Types
export interface Notification {
  id?: number;
  name?: string;
  notification?: unknown;
  read?: boolean;
  read_at?: string | null;
  created?: string;
}

// Bucket Types (Kanban)
export interface Bucket {
  id?: number;
  project_id: number;
  view_id: number;
  title: string;
  position: number;
  limit?: number;
  is_done_bucket?: boolean;
  created?: string;
  updated?: string;
  created_by?: User;
}

// Webhook Types
export interface Webhook {
  id?: number;
  project_id: number;
  target_url: string;
  events: string[];
  secret?: string;
  created?: string;
  updated?: string;
  created_by?: User;
}

// Migration Types
export interface MigrationStatus {
  id?: number;
  migrator_name?: string;
  started?: string;
  finished?: string | null;
}

// Share Types
export interface ProjectShare {
  id?: number;
  project_id: number;
  hash?: string;
  right?: number; // 0: Read, 1: Write, 2: Admin
  sharing_type?: number; // 0: Link share
  shared_by?: User;
  created?: string;
  updated?: string;
}

// Subscription Types
export interface Subscription {
  id?: number;
  entity: string;
  entity_id: number;
  user?: User;
  created?: string;
}

// Error Types
export interface VikunjaError {
  code?: number;
  message: string;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: VikunjaError;
}

// Task Creation and Update Types
export interface TaskCreationData {
  project_id: number;
  title: string;
  done?: boolean;
  priority?: number;
  percent_done?: number;
  description?: string;
  due_date?: string;
  start_date?: string;
  end_date?: string;
  hex_color?: string;
  repeat_after?: number;
  repeat_mode?: string;
}

export interface TaskUpdateData extends Partial<TaskCreationData> {
  id: number;
}

// Minimal Task Types
export interface MinimalTask {
  id?: number;
  title: string;
  assignees?: User[];
}

// Standardized MCP Response Types
export interface StandardTaskResponse {
  success: boolean;
  operation:
    | 'create'
    | 'update'
    | 'delete'
    | 'list'
    | 'get'
    | 'assign'
    | 'unassign'
    | 'comment'
    | 'bulk-update'
    | 'bulk-delete'
    | 'relate'
    | 'unrelate'
    | 'relations'
    | 'add-reminder'
    | 'remove-reminder'
    | 'list-reminders';
  message?: string;
  task?: VikunjaTask | MinimalTask; // Full or minimal task object when applicable
  tasks?: VikunjaTask[]; // For list operations
  comment?: TaskComment; // For comment operations
  comments?: TaskComment[]; // For list comments
  reminder?: TaskReminder; // For single reminder operations
  reminders?: TaskReminder[]; // For list reminders
  metadata?: {
    timestamp: string;
    affectedFields?: string[]; // For updates
    previousState?: Partial<VikunjaTask> | VikunjaTask[]; // For updates/deletes
    count?: number; // For list operations
    fetchErrors?: number; // For bulk operations with fetch failures
    failedCount?: number; // For partial failures
    failedIds?: number[]; // IDs that failed in bulk operations
    performanceMetrics?: {
      totalDuration: number;
      operationsPerSecond: number;
      apiCallsUsed: number;
      concurrencyLevel: string;
      cacheEfficiency: number;
    };
  };
}

// Standardized Project Response Types
export interface StandardProjectResponse {
  success: boolean;
  operation: 'create' | 'update' | 'delete' | 'list' | 'get' | 'archive' | 'unarchive';
  message?: string;
  project?: Project;
  projects?: Project[];
  metadata?: {
    timestamp: string;
    count?: number;
    affectedFields?: string[];
  };
}

// Token Types
export interface ApiToken {
  id?: number;
  title: string;
  token?: string;
  permissions?: string[];
  expires_at?: string;
  created?: string;
}
