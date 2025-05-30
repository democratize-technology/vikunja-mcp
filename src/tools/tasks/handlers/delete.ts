/**
 * Handler for deleting tasks with proper type safety
 */

import type { VikunjaClient } from 'node-vikunja';
import type { DeleteTaskRequest, DeleteTaskResponse } from '../../../types/operations/tasks';
import { MCPError, ErrorCode } from '../../../types/errors';
import { logger } from '../../../utils/logger';
import { isAuthenticationError } from '../../../utils/auth-error-handler';
import { withRetry, RETRY_CONFIG } from '../../../utils/retry';
import { AUTH_ERROR_MESSAGES } from '../constants';
import { DeleteTaskSchema } from '../../../types/schemas/tasks';

/**
 * Handle task deletion with validation and proper error handling
 */
export async function handleDeleteTask(
  request: DeleteTaskRequest,
  client: VikunjaClient
): Promise<DeleteTaskResponse> {
  try {
    // Validate input using Zod schema
    const validated = DeleteTaskSchema.parse({
      id: request.id
    });

    // Delete the task
    await withRetry(
      () => client.tasks.deleteTask(validated.id),
      {
        ...RETRY_CONFIG,
        shouldRetry: (error: Error) => isAuthenticationError(error)
      }
    );

    return {
      success: true,
      operation: 'delete',
      message: 'Task deleted successfully',
      metadata: {
        timestamp: new Date().toISOString(),
        deletedTaskId: validated.id
      }
    };
  } catch (error) {
    // Handle authentication errors
    if (error instanceof Error && isAuthenticationError(error)) {
      logger.error('Authentication error deleting task', { error: error.message });
      throw new MCPError(
        ErrorCode.AUTHENTICATION_ERROR,
        AUTH_ERROR_MESSAGES.NOT_AUTHENTICATED
      );
    }

    // Re-throw MCPErrors
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle Zod validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as { errors: Array<{ path: string[], message: string }> };
      const firstError = zodError.errors[0];
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        firstError ? `${firstError.path.join('.')}: ${firstError.message}` : 'Validation failed'
      );
    }

    // Handle other errors
    logger.error('Failed to delete task', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      operation: 'delete',
      message: 'Failed to delete task',
      metadata: {
        timestamp: new Date().toISOString(),
        deletedTaskId: request.id
      },
      error: {
        code: ErrorCode.API_ERROR,
        message: error instanceof Error ? error.message : String(error),
        details: error
      }
    };
  }
}