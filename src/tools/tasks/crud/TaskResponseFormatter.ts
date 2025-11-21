/**
 * Task Response Formatter
 * Centralizes AORP response formatting logic for task operations
 */

import { MCPError, ErrorCode, type TaskResponseData, type TaskResponseMetadata, type QualityIndicatorFunction, type AorpTransformationContext, type AorpFactoryOptions } from '../../../types/index';
import { createAorpResponse, createTaskAorpResponse, createAorpErrorResponse } from '../../../utils/response-factory';
import type { Verbosity } from '../../../transforms/index';
import type { AorpBuilderConfig, AorpFactoryResult } from '../../../types/index';
import type { Task } from 'node-vikunja';

/**
 * AORP configuration generator for different operations
 * Creates optimized AORP configurations based on operation type
 */
function generateAorpConfig(
  operation: string,
  data: TaskResponseData,
  verbosity: string
): AorpBuilderConfig {
  // Base configuration
  const baseConfig: AorpBuilderConfig = {
    confidenceMethod: 'adaptive',
    // Next steps and quality indicators are always enabled
    confidenceWeights: {
      success: 0.4,
      dataSize: 0.2,
      responseTime: 0.2,
      completeness: 0.2
    }
  };

  // Operation-specific adjustments
  switch (operation) {
    case 'create-task':
      return {
        ...baseConfig,
        confidenceWeights: {
          success: 0.5,
          dataSize: 0.1,
          responseTime: 0.2,
          completeness: 0.2
        }
      };

    case 'bulk-create-tasks':
    case 'bulk-update-tasks':
    case 'bulk-delete-tasks':
      return {
        ...baseConfig,
        confidenceWeights: {
          success: 0.6,
          dataSize: 0.3,
          responseTime: 0.1,
          completeness: 0.0
        }
      };

    case 'list-tasks':
      return {
        ...baseConfig,
        confidenceWeights: {
          success: 0.3,
          dataSize: 0.4,
          responseTime: 0.2,
          completeness: 0.1
        }
      };

    default:
      return baseConfig;
  }
}

/**
 * Standardized next step templates for different operations
 */
const STANDARD_NEXT_STEPS_TEMPLATES = {
  'create-task': [
    "Verify the created task appears in listings",
    "Set up task dependencies and reminders",
    "Notify relevant team members"
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
};

/**
 * Standardized quality indicators for task data
 */
const STANDARD_QUALITY_INDICATORS = {
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
};

/**
 * Creates an AORP response for task operations with optimized configuration
 */
export function createTaskResponse(
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
): AorpFactoryResult {
  // Default to standard verbosity if not specified
  const selectedVerbosity = verbosity || 'standard';

  // AORP is now the only response format - always use it
  const aorpBuilderConfig = aorpConfig || generateAorpConfig(operation, data, selectedVerbosity);

  // For task operations, use specialized task AORP response
  const taskData = data.task || data.tasks;
  if (taskData) {
    const taskResult = createTaskAorpResponse(operation, message, taskData, metadata, {
      verbosity: selectedVerbosity as Verbosity,
      aorpOptions: {
        builderConfig: aorpBuilderConfig,
        nextStepsConfig: {
          maxSteps: 5, // Contextual next steps are always enabled
          templates: {
            ...STANDARD_NEXT_STEPS_TEMPLATES,
            [`${operation}`]: [
              "Verify the task data appears correctly in listings",
              "Check related tasks and dependencies",
              "Test any automated workflows or notifications"
            ]
          }
        },
        qualityConfig: {
          completenessWeight: 0.6,
          reliabilityWeight: 0.4,
          customIndicators: STANDARD_QUALITY_INDICATORS
        },
        ...(sessionId && { sessionId })
      }
    });

    // Return AORP result directly (no data field in AORP)
    return taskResult;
  }

  // Fallback for non-task data
  return createAorpResponse(operation, message, data, metadata, {
    verbosity: selectedVerbosity as Verbosity,
    aorpOptions: {
      builderConfig: aorpBuilderConfig,
      nextStepsConfig: {
        maxSteps: 5, // Contextual next steps are always enabled
        templates: STANDARD_NEXT_STEPS_TEMPLATES
      },
      qualityConfig: {
        completenessWeight: 0.6,
        reliabilityWeight: 0.4,
        customIndicators: STANDARD_QUALITY_INDICATORS
      },
      ...(sessionId && { sessionId })
    }
  });
}

/**
 * Creates an AORP error response for task operations
 */
export function createTaskErrorResponse(
  operation: string,
  error: Error | Record<string, unknown>,
  metadata: TaskResponseMetadata = {
    timestamp: new Date().toISOString()
  }
): AorpFactoryResult {
  const options: AorpFactoryOptions = {
    // Debug information is always included for AORP resilience
  };

  if (metadata.sessionId) {
    options.sessionId = metadata.sessionId;
  }

  return createAorpErrorResponse(operation, error, options);
}