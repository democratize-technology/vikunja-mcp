/**
 * Adapter to make new handlers compatible with legacy behavior
 * This is a temporary solution to maintain backward compatibility
 * while migrating to the new typed handlers
 */

import type { VikunjaClient } from 'node-vikunja';
import { 
  handleListTasks as newHandleListTasks,
  handleCreateTask as newHandleCreateTask,
  handleUpdateTask as newHandleUpdateTask,
  handleDeleteTask as newHandleDeleteTask,
  handleBulkCreateTasks as newHandleBulkCreateTasks,
  handleBulkUpdateTasks as newHandleBulkUpdateTasks,
  handleBulkDeleteTasks as newHandleBulkDeleteTasks
} from './handlers';
import { cleanArgs } from '../../utils/clean-args';

/**
 * Adapt list handler to match legacy behavior
 */
export async function handleListTasksCompat(
  args: any,
  client: VikunjaClient
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  try {
    // Don't add default pagination if not specified
    const cleanedArgs = cleanArgs(args);
    
    // Call the new handler
    const result = await newHandleListTasks(
      { ...cleanedArgs, operation: 'list' } as any,
      client
    );
    
    // Return in the expected format
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    // Re-throw errors as-is for tests
    throw error;
  }
}

/**
 * Adapt create handler to match legacy behavior
 */
export async function handleCreateTaskCompat(
  args: any,
  client: VikunjaClient
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const cleanedArgs = cleanArgs(args);
  
  const result = await newHandleCreateTask(
    { ...cleanedArgs, operation: 'create' } as any,
    client
  );
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Adapt update handler to match legacy behavior
 */
export async function handleUpdateTaskCompat(
  args: any,
  client: VikunjaClient
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const cleanedArgs = cleanArgs(args);
  
  const result = await newHandleUpdateTask(
    { ...cleanedArgs, operation: 'update' } as any,
    client
  );
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Adapt delete handler to match legacy behavior
 */
export async function handleDeleteTaskCompat(
  args: any,
  client: VikunjaClient
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const cleanedArgs = cleanArgs(args);
  
  const result = await newHandleDeleteTask(
    { ...cleanedArgs, operation: 'delete' } as any,
    client
  );
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Adapt bulk create handler to match legacy behavior
 */
export async function handleBulkCreateTasksCompat(
  args: any,
  client: VikunjaClient
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const cleanedArgs = cleanArgs(args);
  
  const result = await newHandleBulkCreateTasks(
    { ...cleanedArgs, operation: 'bulk-create' } as any,
    client
  );
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Adapt bulk update handler to match legacy behavior
 */
export async function handleBulkUpdateTasksCompat(
  args: any,
  client: VikunjaClient
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const cleanedArgs = cleanArgs(args);
  
  const result = await newHandleBulkUpdateTasks(
    { ...cleanedArgs, operation: 'bulk-update' } as any,
    client
  );
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Adapt bulk delete handler to match legacy behavior
 */
export async function handleBulkDeleteTasksCompat(
  args: any,
  client: VikunjaClient
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const cleanedArgs = cleanArgs(args);
  
  const result = await newHandleBulkDeleteTasks(
    { ...cleanedArgs, operation: 'bulk-delete' } as any,
    client
  );
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}