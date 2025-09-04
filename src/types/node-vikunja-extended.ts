/**
 * Extended types for node-vikunja client
 * 
 * This file provides proper TypeScript typing for node-vikunja features
 * that may not be fully typed in the original library, allowing us to
 * eliminate 'any' casts and eslint-disable statements throughout the codebase.
 */

import type {
  VikunjaClient,
  Task,
  Project,
  TeamService,
  LabelService,
  TaskService,
  ProjectService,
  UserService,
} from 'node-vikunja';

// Re-export all types from node-vikunja for centralized access
export type {
  VikunjaClient,
  Task,
  Project,
  TeamService,
  LabelService,
  TaskService,
  ProjectService,
  UserService,
} from 'node-vikunja';

// Extended client constructor type for proper dynamic import handling
export interface VikunjaClientConstructor {
  new (baseUrl: string, token?: string): VikunjaClient;
}

// Type for the dynamic import result
export interface VikunjaModule {
  VikunjaClient: VikunjaClientConstructor;
  // Add other exports as needed
}

// Enhanced export data types for export tool
export interface ProjectExportData {
  project: Project;
  tasks: Task[];
  subprojects?: ProjectExportData[];
}

export interface ExportOptions {
  includeChildren?: boolean;
  format?: 'json' | 'csv';
  visitedIds?: Set<number>;
}

// Extended client interface with proper typing for all operations
export interface TypedVikunjaClient extends VikunjaClient {
  // Ensure all services are properly typed
  teams: TeamService;
  labels: LabelService;
  tasks: TaskService;
  projects: ProjectService;
  users: UserService;
}

// Type guards for runtime type checking
export function isVikunjaClient(client: unknown): client is VikunjaClient {
  return (
    typeof client === 'object' &&
    client !== null &&
    'teams' in client &&
    'labels' in client &&
    'tasks' in client &&
    'projects' in client &&
    'users' in client
  );
}

export function isVikunjaClientConstructor(
  constructor: unknown
): constructor is VikunjaClientConstructor {
  return typeof constructor === 'function';
}

// Re-export commonly used types for convenience
export type {
  VikunjaClient as Client,
  TeamService as Teams,
  LabelService as Labels,
  TaskService as Tasks,
  ProjectService as Projects,
  UserService as Users,
} from 'node-vikunja';