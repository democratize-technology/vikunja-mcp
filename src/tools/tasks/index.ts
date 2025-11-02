/**
 * Tasks Tool
 * Handles task operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Task } from 'node-vikunja';
import type { AuthManager } from '../../auth/AuthManager';
import type { VikunjaClientFactory } from '../../client/VikunjaClientFactory';
import { MCPError, ErrorCode, createStandardResponse, type TaskResponseData, type TaskResponseMetadata, type QualityIndicatorFunction } from '../../types/index';
import { getClientFromContext, setGlobalClientFactory } from '../../client';
import { logger } from '../../utils/logger';
import { createAorpEnabledFactory } from '../../utils/response-factory';
import type { Verbosity } from '../../transforms/index';
import type { AorpBuilderConfig, AorpTransformationContext } from '../../aorp/types';
import { storageManager } from '../../storage/FilterStorage';
import { relationSchema, handleRelationSubcommands } from '../tasks-relations';
import { parseFilterString } from '../../utils/filters';
import type { FilterExpression, SavedFilter } from '../../types/filters';
import type { GetTasksParams } from 'node-vikunja';
import { validateTaskCountLimit, logMemoryUsage, createTaskLimitExceededMessage } from '../../utils/memory';
import { FilteringContext, type FilteringArgs } from '../../utils/filtering';

/**
 * Zod schema for AorpBuilderConfig
 * Replaces z.any() with proper type validation
 */
const AorpBuilderConfigSchema = z.object({
  confidenceMethod: z.enum(['adaptive', 'weighted', 'simple']).optional(),
  enableNextSteps: z.boolean().optional(),
  enableQualityIndicators: z.boolean().optional(),
  confidenceWeights: z.object({
    success: z.number(),
    dataSize: z.number(),
    responseTime: z.number(),
    completeness: z.number(),
  }).optional(),
}).optional();

// Import all operation handlers
import { createTask, getTask, updateTask, deleteTask } from './crud';
import { bulkCreateTasks, bulkUpdateTasks, bulkDeleteTasks } from './bulk-operations';
import { assignUsers, unassignUsers, listAssignees } from './assignees';
import { handleComment } from './comments';
import { addReminder, removeReminder, listReminders } from './reminders';
import { applyLabels, removeLabels, listTaskLabels } from './labels';

/**
 * Helper function to create response with optional optimization and AORP support
 */
function createTaskResponse(
  operation: string,
  message: string,
  data: TaskResponseData,
  metadata: TaskResponseMetadata = {
    timestamp: new Date().toISOString()
  },
  verbosity?: string,
  useOptimizedFormat?: boolean,
  useAorp?: boolean,
  aorpConfig?: AorpBuilderConfig,
  sessionId?: string
): unknown {
  // Default to standard verbosity if not specified
  const selectedVerbosity = verbosity || 'standard';

  // Use optimized format if requested or if verbosity is not standard
  const shouldOptimize = useOptimizedFormat || selectedVerbosity !== 'standard';

  // Use AORP if explicitly requested
  if (useAorp) {
    const aorpFactory = createAorpEnabledFactory();
    return aorpFactory.createResponse(operation, message, data, metadata, {
      verbosity: selectedVerbosity as Verbosity,
      useOptimization: shouldOptimize,
      useAorp: true,
      aorpOptions: {
        builderConfig: {
          confidenceMethod: 'adaptive',
          enableNextSteps: true,
          enableQualityIndicators: true,
          ...aorpConfig
        },
        nextStepsConfig: {
          maxSteps: 5,
          enableContextual: true,
          templates: {
            [`${operation}`]: [
              "Verify the task data appears correctly in listings",
              "Check related tasks and dependencies",
              "Test any automated workflows or notifications"
            ],
            'list-tasks': [
              "Review the returned tasks for completeness",
              "Apply filters or pagination if needed",
              "Consider sorting by priority or due date"
            ],
            'get-task': [
              "Verify all required task fields are present",
              "Check task relationships and dependencies",
              "Review task assignees and labels"
            ],
            'create-task': [
              "Verify the created task appears in listings",
              "Set up task dependencies and reminders",
              "Notify relevant team members"
            ],
            'update-task': [
              "Confirm changes are reflected in the UI",
              "Check related data for consistency",
              "Notify team members of important changes"
            ],
            'delete-task': [
              "Verify task no longer appears in searches",
              "Check for any orphaned subtasks or dependencies",
              "Update project timelines and milestones"
            ],
            'assign-task': [
              "Verify assignee received notification",
              "Update task status and priority if needed",
              "Check assignee availability and workload"
            ],
            'unassign-task': [
              "Verify task is properly unassigned",
              "Consider reassigning to another team member",
              "Update task status and deadlines"
            ],
            'bulk-create-tasks': [
              "Verify all tasks were created successfully",
              "Check for duplicate tasks or conflicts",
              "Set up task relationships and dependencies"
            ],
            'bulk-update-tasks': [
              "Verify all updates were applied correctly",
              "Check for data consistency across tasks",
              "Review project timeline impacts"
            ],
            'bulk-delete-tasks': [
              "Verify all tasks were deleted",
              "Check for orphaned dependencies",
              "Update project metrics and reports"
            ]
          }
        },
        qualityConfig: {
          completenessWeight: 0.6,
          reliabilityWeight: 0.4,
          customIndicators: {
            taskPriority: ((data: unknown, _context: AorpTransformationContext) => {
              // Higher completeness for high-priority tasks
              const taskData = data as { task?: Task };
              if (!taskData?.task) return 0.7;
              const priority = taskData.task.priority || 0;
              return Math.min(1.0, 0.5 + (priority / 5) * 0.5);
            }) as QualityIndicatorFunction,
            taskCompleteness: ((data: unknown, _context: AorpTransformationContext) => {
              // Based on task fields completeness
              const taskData = data as { task?: Task };
              if (!taskData?.task) return 0.5;
              const task = taskData.task;
              let score = 0.3; // Base score for having a task
              if (task.title) score += 0.2;
              if (task.description) score += 0.2;
              if (task.due_date) score += 0.1;
              if (task.priority !== undefined) score += 0.1;
              if (task.labels && task.labels.length > 0) score += 0.05;
              if (task.assignees && task.assignees.length > 0) score += 0.05;
              return Math.min(1.0, score);
            }) as QualityIndicatorFunction
          }
        },
        ...(sessionId && { sessionId })
      }
    });
  }

  if (shouldOptimize) {
    // For tasks, we'll use the standard response with optimization
    return createStandardResponse(operation, message, data, metadata);
  }

  return createStandardResponse(operation, message, data, metadata);
}

/**
 * Get session-scoped storage instance
 */
async function getSessionStorage(authManager: AuthManager): ReturnType<typeof storageManager.getStorage> {
  const session = authManager.getSession();
  const sessionId = session.apiToken ? `${session.apiUrl}:${session.apiToken.substring(0, 8)}` : 'anonymous';
  return storageManager.getStorage(sessionId, session.userId, session.apiUrl);
}

/**
 * List tasks with optional filtering
 */
async function listTasks(
  args: {
    projectId?: number;
    page?: number;
    perPage?: number;
    search?: string;
    sort?: string;
    filter?: string;
    filterId?: string;
    allProjects?: boolean;
    done?: boolean;
    verbosity?: string;
    useOptimizedFormat?: boolean;
    useAorp?: boolean;
    aorpConfig?: AorpBuilderConfig;
    sessionId?: string;
  },
  storage: Awaited<ReturnType<typeof storageManager.getStorage>>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const params: GetTasksParams = {};

  try {
    let tasks: Task[] = [];
    let filterExpression: FilterExpression | null = null;
    let filterString: string | undefined;

    // Build query parameters
    if (args.page !== undefined) params.page = args.page;
    if (args.perPage !== undefined) params.per_page = args.perPage;
    if (args.search !== undefined) params.s = args.search;
    if (args.sort !== undefined) params.sort_by = args.sort;

    // Handle filter - either direct filter string or saved filter ID
    if (args.filterId) {
      const savedFilter: SavedFilter | null = await storage.get(args.filterId);
      if (!savedFilter) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, `Filter with id ${args.filterId} not found`);
      }
      filterString = savedFilter.filter;
    } else if (args.filter !== undefined) {
      filterString = args.filter;
    }

    // Parse the filter string for client-side filtering
    if (filterString) {
      const parseResult = parseFilterString(filterString);
      if (parseResult.error) {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid filter syntax: ${parseResult.error.message}${parseResult.error.context ? `\n${parseResult.error.context}` : ''}`,
        );
      }
      filterExpression = parseResult.expression;

      // Log that we're preparing to attempt hybrid filtering
      logger.info('Preparing hybrid filtering (server-side attempt + client-side fallback)', {
        filter: filterString,
      });
    }

    // Memory protection: Check if we should implement pagination limits
    // Note: Vikunja API doesn't provide task count endpoints, so we use conservative defaults
    // and rely on user-provided pagination parameters
    if (!params.per_page) {
      // Set default pagination to prevent unbounded loading
      params.per_page = 1000; // Conservative default
      if (!params.page) {
        params.page = 1;
      }
      logger.info('Applied default pagination for memory protection', {
        per_page: params.per_page,
        page: params.page
      });
    }

    // Validate pagination limits for memory protection
    const requestedPageSize = params.per_page || 1000;
    const taskCountValidation = validateTaskCountLimit(requestedPageSize);
    
    if (!taskCountValidation.allowed) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        createTaskLimitExceededMessage(
          'list tasks',
          requestedPageSize,
          [
            `Reduce the perPage parameter (current: ${requestedPageSize}, max allowed: ${taskCountValidation.maxAllowed})`,
            'Use pagination with smaller page sizes',
            'Apply more specific filters before listing'
          ]
        )
      );
    }

    // Execute filtering using strategy pattern
    const filteringContext = new FilteringContext({
      enableServerSide: Boolean(filterString)
    });
    
    const filteringParams = {
      args: args as FilteringArgs,
      filterExpression,
      filterString,
      params
    };
    
    const filteringResult = await filteringContext.execute(filteringParams);
    tasks = filteringResult.tasks;
    
    // Extract metadata for response formatting
    const {
      serverSideFilteringUsed,
      serverSideFilteringAttempted,
    } = filteringResult.metadata;

    // Additional memory protection: validate actual loaded task count
    const actualTaskCount = tasks.length;
    const finalTaskCountValidation = validateTaskCountLimit(actualTaskCount);
    
    if (!finalTaskCountValidation.allowed) {
      // Log warning but don't fail since tasks are already loaded
      logger.warn('Loaded task count exceeds recommended limits', {
        actualCount: actualTaskCount,
        maxRecommended: finalTaskCountValidation.maxAllowed,
        estimatedMemoryMB: finalTaskCountValidation.estimatedMemoryMB
      });
      
      // For extremely large datasets, still enforce hard limits
      if (actualTaskCount > finalTaskCountValidation.maxAllowed * 1.5) {
        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          createTaskLimitExceededMessage(
            'process loaded tasks',
            actualTaskCount,
            [
              'The API returned more tasks than expected',
              'Use stricter pagination or filtering',
              'Contact administrator about data size'
            ]
          )
        );
      }
    }

    // Log memory usage for monitoring
    logMemoryUsage('task listing', actualTaskCount, tasks);

    // Note: Client-side filtering is now handled within the strategy implementations

    // Filter by done status if specified (this is a simpler filter that works)
    if (args.done !== undefined) {
      tasks = tasks.filter((task) => task.done === args.done);
    }

    // Determine filtering method message and metadata from strategy result
    let filteringMessage = '';
    let filteringMetadata = {};
    
    if (filterString) {
      if (serverSideFilteringUsed) {
        filteringMessage = ' (filtered server-side)';
        filteringMetadata = {
          filter: filterString,
          serverSideFilteringUsed: true,
          serverSideFilteringAttempted: true,
          clientSideFiltering: false,
          filteringNote: filteringResult.metadata.filteringNote,
        };
      } else if (serverSideFilteringAttempted) {
        filteringMessage = ' (filtered client-side - server-side fallback)';
        filteringMetadata = {
          filter: filterString,
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: true,
          clientSideFiltering: true,
          filteringNote: filteringResult.metadata.filteringNote,
        };
      } else {
        filteringMessage = ' (filtered client-side)';
        filteringMetadata = {
          filter: filterString,
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: false,
          clientSideFiltering: true,
          filteringNote: filteringResult.metadata.filteringNote,
        };
      }
    }

    const response = createTaskResponse(
      'list-tasks',
      `Found ${tasks.length} tasks${filteringMessage}`,
      { tasks },
      {
        timestamp: new Date().toISOString(),
        count: tasks.length,
        ...filteringMetadata,
      },
      args.verbosity,
      args.useOptimizedFormat,
      args.useAorp,
      args.aorpConfig,
      args.sessionId
    );

    logger.debug('Tasks tool response', { subcommand: 'list', itemCount: tasks.length });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }

    // Log the full error for debugging filter issues
    logger.error('Task list error:', {
      error: error instanceof Error ? error.message : String(error),
      params: params,
      filter: args.filter,
      filterId: args.filterId,
    });

    throw new MCPError(
      ErrorCode.API_ERROR,
      `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Handle file attachments (not supported)
 */
function handleAttach(): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Attachment handling would require file upload capabilities
  // which are not available in the current MCP context
  throw new MCPError(
    ErrorCode.NOT_IMPLEMENTED,
    'File attachments are not supported in the current MCP context',
  );
}

export function registerTasksTool(
  server: McpServer, 
  authManager: AuthManager, 
  clientFactory?: VikunjaClientFactory
): void {
  server.tool(
    'vikunja_tasks',
    {
      subcommand: z.enum([
        'create',
        'get',
        'update',
        'delete',
        'list',
        'assign',
        'unassign',
        'list-assignees',
        'attach',
        'comment',
        'bulk-create',
        'bulk-update',
        'bulk-delete',
        'relate',
        'unrelate',
        'relations',
        'add-reminder',
        'remove-reminder',
        'list-reminders',
        'apply-label',
        'remove-label',
        'list-labels',
      ]),
      // Task creation/update fields
      title: z.string().optional(),
      description: z.string().optional(),
      projectId: z.number().optional(),
      dueDate: z.string().optional(),
      priority: z.number().min(0).max(5).optional(),
      labels: z.array(z.number()).optional(),
      assignees: z.array(z.number()).optional(),
      // Recurring task fields
      repeatAfter: z.number().min(0).optional(),
      repeatMode: z.enum(['day', 'week', 'month', 'year']).optional(),
      // Query fields
      id: z.number().optional(),
      filter: z.string().optional(),
      filterId: z.string().optional(),
      page: z.number().optional(),
      perPage: z.number().optional(),
      sort: z.string().optional(),
      search: z.string().optional(),
      // List specific filters
      allProjects: z.boolean().optional(),
      done: z.boolean().optional(),
      // Comment fields
      comment: z.string().optional(),
      commentId: z.number().optional(),
      // Bulk operation fields
      taskIds: z.array(z.number()).optional(),
      field: z.string().optional(),
      value: z.unknown().optional(),
      tasks: z
        .array(
          z.object({
            title: z.string(),
            description: z.string().optional(),
            dueDate: z.string().optional(),
            priority: z.number().min(0).max(5).optional(),
            labels: z.array(z.number()).optional(),
            assignees: z.array(z.number()).optional(),
            repeatAfter: z.number().min(0).optional(),
            repeatMode: z.enum(['day', 'week', 'month', 'year']).optional(),
          }),
        )
        .optional(),
      // Reminder fields
      reminderDate: z.string().optional(),
      reminderId: z.number().optional(),
      // Add relation schema
      ...relationSchema,
      // Response formatting options
      verbosity: z.enum(['minimal', 'standard', 'detailed', 'complete']).optional(),
      useOptimizedFormat: z.boolean().optional(),
      useAorp: z.boolean().optional(),
      aorpConfig: AorpBuilderConfigSchema, // AorpBuilderConfig with proper Zod schema
      sessionId: z.string().optional(),
    },
    async (args) => {
      try {
        logger.debug('Executing tasks tool', { subcommand: args.subcommand, args });

        // Check authentication
        if (!authManager.isAuthenticated()) {
          throw new MCPError(
            ErrorCode.AUTH_REQUIRED,
            'Authentication required. Please use vikunja_auth.connect first.',
          );
        }

        // Set the client factory for this request if provided
        if (clientFactory) {
          setGlobalClientFactory(clientFactory);
        }

        // Test client connection
        await getClientFromContext();

        switch (args.subcommand) {
          case 'list': {
            // Get session-scoped storage for filter operations (only when needed)
            const storage = await getSessionStorage(authManager);
            return listTasks(args as Parameters<typeof listTasks>[0], storage);
          }

          case 'create':
            return createTask(args as Parameters<typeof createTask>[0]);

          case 'get':
            return getTask(args as Parameters<typeof getTask>[0]);

          case 'update':
            return updateTask(args as Parameters<typeof updateTask>[0]);

          case 'delete':
            return deleteTask(args as Parameters<typeof deleteTask>[0]);

          case 'assign':
            return assignUsers(args as Parameters<typeof assignUsers>[0]);

          case 'unassign':
            return unassignUsers(args as Parameters<typeof unassignUsers>[0]);

          case 'list-assignees':
            return listAssignees(args as Parameters<typeof listAssignees>[0]);

          case 'comment':
            return handleComment(args as Parameters<typeof handleComment>[0]);

          case 'attach':
            return handleAttach();

          case 'bulk-update':
            return bulkUpdateTasks(args as Parameters<typeof bulkUpdateTasks>[0]);

          case 'bulk-delete':
            return bulkDeleteTasks(args as Parameters<typeof bulkDeleteTasks>[0]);

          case 'bulk-create':
            return bulkCreateTasks(args as Parameters<typeof bulkCreateTasks>[0]);

          // Handle relation subcommands
          case 'relate':
          case 'unrelate':
          case 'relations':
            return handleRelationSubcommands({
              subcommand: args.subcommand,
              id: args.id,
              otherTaskId: args.otherTaskId,
              relationKind: args.relationKind,
            });

          // Handle reminder operations
          case 'add-reminder':
            return addReminder(args as Parameters<typeof addReminder>[0]);

          case 'remove-reminder':
            return removeReminder(args as Parameters<typeof removeReminder>[0]);

          case 'list-reminders':
            return listReminders(args as Parameters<typeof listReminders>[0]);
          case 'apply-label':
            return applyLabels(args as Parameters<typeof applyLabels>[0]);

          case 'remove-label':
            return removeLabels(args as Parameters<typeof removeLabels>[0]);

          case 'list-labels':
            return listTaskLabels(args as Parameters<typeof listTaskLabels>[0]);

          default:
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Unknown subcommand: ${args.subcommand as string}`,
            );
        }
      } catch (error) {
        if (error instanceof MCPError) {
          throw error;
        }
        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          `Task operation error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
