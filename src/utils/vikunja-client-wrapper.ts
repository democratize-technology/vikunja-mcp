/**
 * Type-safe wrapper for node-vikunja client to handle missing type definitions
 */

import type { VikunjaClient, Task, GetTasksParams } from 'node-vikunja';

/**
 * Extended task service interface with proper types for methods that exist at runtime
 * but are missing from the node-vikunja TypeScript definitions
 */
export interface ExtendedTaskService {
  // Standard methods from node-vikunja
  createTask(projectId: number, task: Partial<Task>): Promise<Task>;
  getTask(taskId: number): Promise<Task>;
  updateTask(taskId: number, task: Partial<Task>): Promise<Task>;
  deleteTask(taskId: number): Promise<void>;
  
  // Extended methods that exist at runtime but lack types
  getAll(params?: GetTasksParams): Promise<Task[]>;
  getTasksForProject(projectId: number, params?: GetTasksParams): Promise<Task[]>;
  addLabelToTask(taskId: number, labelId: number): Promise<void>;
  addLabelsToTask(taskId: number, labelIds: number[]): Promise<void>;
  removeLabelFromTask(taskId: number, labelId: number): Promise<void>;
  removeLabelsFromTask(taskId: number, labelIds: number[]): Promise<void>;
  addAssigneeToTask(taskId: number, userId: number): Promise<void>;
  removeAssigneeFromTask(taskId: number, userId: number): Promise<void>;
}

/**
 * Extended client interface with proper task service types
 */
export interface ExtendedVikunjaClient extends Omit<VikunjaClient, 'tasks'> {
  tasks: ExtendedTaskService;
}

/**
 * Wraps a VikunjaClient to provide type-safe access to all methods
 */
export function wrapVikunjaClient(client: VikunjaClient): ExtendedVikunjaClient {
  // The client already has these methods at runtime, we're just providing proper types
  return client as unknown as ExtendedVikunjaClient;
}