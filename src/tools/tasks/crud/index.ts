/**
 * CRUD Operations for Tasks
 * Centralized exports for all task CRUD operations with clean modular architecture
 */

// Export all service functions with their original signatures for backward compatibility
export { createTask } from './TaskCreationService';
export { updateTask } from './TaskUpdateService';
export { deleteTask } from './TaskDeletionService';
export { getTask } from './TaskReadService';

// Export the response formatter for use in other modules
export { createTaskResponse } from './TaskResponseFormatter';

// Export types for external use
export type { CreateTaskArgs } from './TaskCreationService';
export type { UpdateTaskArgs } from './TaskUpdateService';
export type { DeleteTaskArgs } from './TaskDeletionService';
export type { GetTaskArgs } from './TaskReadService';

// Re-export for backward compatibility - maintain the original API surface
export type {
  Task,
} from 'node-vikunja';

export type {
  AorpBuilderConfig,
} from '../../../utils/response-factory';