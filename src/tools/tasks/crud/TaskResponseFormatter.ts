/**
 * Task Response Formatter
 * Centralizes response formatting logic for task operations to eliminate duplication
 */

import { MCPError, ErrorCode, createStandardResponse, type TaskResponseData, type TaskResponseMetadata, type QualityIndicatorFunction } from '../../../types/index';
import { createAorpEnabledFactory } from '../../../utils/response-factory';
import type { Verbosity } from '../../../transforms/index';
import type { AorpBuilderConfig, AorpTransformationContext } from '../../../aorp/types';
import type { Task } from 'node-vikunja';

/**
 * Intelligent AORP activation logic
 * Automatically determines when AORP would provide the most value
 */
function shouldIntelligentlyActivateAorp(
  operation: string,
  data: TaskResponseData,
  verbosity: string
): boolean {
  // Always enable AORP for complex operations that benefit from next steps
  const complexOperations = [
    'create-task',
    'update-task',
    'delete-task',
    'bulk-create-tasks',
    'bulk-update-tasks',
    'bulk-delete-tasks',
    'relate',
    'unrelate'
  ];

  // Determine task count based on data structure
  let taskCount = 1;
  if (Array.isArray(data.tasks)) {
    taskCount = data.tasks.length;
  } else if (data.task) {
    taskCount = 1;
  }

  // Enable AORP based on operation complexity and data size
  if (complexOperations.includes(operation)) {
    return true; // Complex operations always benefit from guidance
  }

  if (operation === 'list-tasks' && taskCount > 5) {
    return true; // Lists with more than 5 tasks benefit from summaries
  }

  // Enable for non-standard verbosity levels (user wants optimization)
  if (verbosity !== 'standard') {
    return true;
  }

  // Enable for get-task operations when task has rich data
  if (operation === 'get-task' && data.task) {
    const task = data.task;
    const hasRichContent = task.description ||
                         (task.labels && task.labels.length > 0) ||
                         (task.assignees && task.assignees.length > 0) ||
                         task.due_date;
    if (hasRichContent) {
      return true;
    }
  }

  return false; // Default to standard responses for simple cases
}

/**
 * Standardized next step templates for different operations
 */
const STANDARD_NEXT_STEPS_TEMPLATES = {
  [`${'create-task'}`]: [
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
 * Creates a standardized response for task operations with optional optimization and intelligent AORP support
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
): unknown {
  // Default to standard verbosity if not specified
  const selectedVerbosity = verbosity || 'standard';

  // Use optimized format if requested or if verbosity is not standard
  const shouldOptimize = useOptimizedFormat || selectedVerbosity !== 'standard';

  // Intelligent AORP activation - auto-detect when beneficial
  // Disable AORP for CRUD operations to preserve original data structure
  const shouldUseAorp = useAorp && !['create-task', 'get-task', 'update-task', 'delete-task'].includes(operation)
                       && shouldIntelligentlyActivateAorp(operation, data, selectedVerbosity);

  // Use AORP if explicitly requested or intelligently detected
  if (shouldUseAorp) {
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
  }

  if (shouldOptimize) {
    // For tasks, we'll use the standard response with optimization
    return createStandardResponse(operation, message, data, metadata);
  }

  return createStandardResponse(operation, message, data, metadata);
}