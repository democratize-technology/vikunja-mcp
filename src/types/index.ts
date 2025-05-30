/**
 * Type exports
 */

// Type extensions for node-vikunja
import type { Task, GetTasksParams } from 'node-vikunja';

declare module 'node-vikunja' {
  interface TaskService {
    /**
     * Get all tasks (alias for getAllTasks)
     */
    getAll(params?: GetTasksParams): Promise<Task[]>;
    
    /**
     * Get tasks for a specific project (alias for getProjectTasks)
     */
    getTasksForProject(projectId: number, params?: GetTasksParams): Promise<Task[]>;
    
    /**
     * Add a label to a task using label ID
     */
    addLabelToTask(taskId: number, labelId: number): Promise<void>;
    
    /**
     * Add an assignee to a task using user ID
     */
    addAssigneeToTask(taskId: number, userId: number): Promise<void>;
  }
}

// Export from vikunja
export {
  type LoginCredentials,
  type AuthToken,
  type AuthSession,
  type StandardTaskResponse,
  type StandardProjectResponse,
  type MinimalTask,
  type TaskReminder,
  type Webhook,
} from './vikunja';

// Export from errors
export { MCPError, ErrorCode, type MCPResponse } from './errors';

// Export from filters
export {
  type FilterOperator,
  type LogicalOperator,
  type FilterField,
  type FilterCondition,
  type FilterGroup,
  type FilterExpression,
  type SavedFilter,
  type FilterValidationResult,
  type FilterStorage,
} from './filters';

// Export from responses
export {
  type ResponseMetadata,
  type StandardResponse,
  type StandardErrorResponse,
  createStandardResponse,
  createErrorResponse,
} from './responses';
