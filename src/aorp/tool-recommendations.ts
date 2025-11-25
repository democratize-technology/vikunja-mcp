/**
 * Tool Recommendation Engine for AORP
 * Generates specific, actionable MCP tool recommendations based on operation context
 */

import type { AorpTransformationContext } from './types';

/**
 * Task assignee interface
 */
export interface TaskAssignee {
  id?: number;
  username?: string;
}

/**
 * Task data interface with all optional properties for safety
 */
export interface TaskData {
  id?: number;
  title?: string;
  description?: string;
  project_id?: number;
  priority?: number;
  due_date?: string;
  done?: boolean;
  assignees?: TaskAssignee[];
  labels?: unknown[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Bulk operation results interface
 */
export interface BulkOperationResults {
  successful?: number;
  failed?: number;
  failed_ids?: number[];
  errors?: unknown[];
}

/**
 * Tool recommendation interface
 */
export interface ToolRecommendation {
  /** Tool command with parameters */
  command: string;
  /** Description of what the tool does */
  description: string;
  /** Why this tool is recommended in this context */
  rationale: string;
}

/**
 * Tool recommendation result
 */
export interface ToolRecommendations {
  /** Primary recommendation - most important next action */
  primary: ToolRecommendation | null;
  /** Secondary recommendations - additional useful actions */
  secondary: ToolRecommendation[];
  /** Workflow sequence - recommended order of operations */
  workflowSequence: string[];
}

/**
 * Type guard to validate task data
 */
function validateTask(task: unknown): task is TaskData {
  return task !== null && typeof task === 'object';
}

/**
 * Type guard to validate tasks array
 */
function validateTasksArray(tasks: unknown): tasks is TaskData[] {
  return Array.isArray(tasks);
}

/**
 * Type guard to validate bulk operation results
 */
function validateBulkResults(results: unknown): results is BulkOperationResults {
  return results !== null && typeof results === 'object';
}

/**
 * Tool Recommendation Engine
 * Analyzes operation context and generates specific MCP tool recommendations
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ToolRecommendationEngine {
  /**
   * Generate tool recommendations based on operation context
   */
  static generateRecommendations(
    context: AorpTransformationContext
  ): ToolRecommendations {
    const { operation } = context;

    switch (operation) {
      case 'create-task':
      case 'create':
        return this.generateCreateTaskRecommendations(context);

      case 'list-tasks':
        return this.generateListTasksRecommendations(context);

      case 'update-task':
      case 'update':
        return this.generateUpdateTaskRecommendations(context);

      case 'delete-task':
      case 'delete':
        return this.generateDeleteTaskRecommendations(context);

      case 'bulk-create-tasks':
      case 'bulk-update-tasks':
      case 'bulk-delete-tasks':
        return this.generateBulkOperationRecommendations(context);

      case 'get-task':
      case 'get':
        return this.generateGetTaskRecommendations(context);

      default:
        return this.generateGenericRecommendations(context);
    }
  }

  /**
   * Generate recommendations for create-task operations
   */
  private static generateCreateTaskRecommendations(
    context: AorpTransformationContext
  ): ToolRecommendations {
    const { task, dataSize } = context;
    const recommendations: ToolRecommendations = {
      primary: null,
      secondary: [],
      workflowSequence: []
    };

    const workflowSteps: string[] = [];

    // Handle case where no task data is provided (common in tests)
    if (!validateTask(task)) {
      recommendations.primary = {
        command: 'vikunja_tasks_list --limit=20 --sort=priority',
        description: `Review current tasks: ${dataSize} items`,
        rationale: `Processing ${dataSize} items - get overview of current work after creation`
      };
      workflowSteps.push(recommendations.primary.command);
      workflowSteps.push('vikunja_projects_list --limit=10');

      recommendations.secondary.push({
        command: 'vikunja_projects_list --limit=10',
        description: 'Review project context',
        rationale: 'Understand task organization across projects'
      });

      recommendations.workflowSequence = workflowSteps;
      return recommendations;
    }

    const taskData: TaskData = task;

    // Primary recommendation based on project context
    if (taskData.project_id) {
      recommendations.primary = {
        command: `vikunja_projects_get --id=${taskData.project_id}`,
        description: `Review current tasks: ${dataSize} items`,
        rationale: `Processing ${dataSize} items - see the new task in its project context and understand related work`
      };
      workflowSteps.push(recommendations.primary.command);
    } else if ((taskData.priority ?? 0) >= 4) {
      recommendations.primary = {
        command: 'vikunja_tasks_list --filter="priority >= 4"',
        description: `Review current tasks: ${dataSize} items`,
        rationale: `Processing ${dataSize} items - track this new high-priority task alongside other urgent items`
      };
      workflowSteps.push(recommendations.primary.command);
    } else {
      recommendations.primary = {
        command: `vikunja_tasks_get --id=${taskData.id}`,
        description: `Review current tasks: ${dataSize} items`,
        rationale: `Processing ${dataSize} items - confirm the task was created with all correct properties`
      };
      workflowSteps.push(recommendations.primary.command);
    }

    // Secondary recommendations based on task properties
    if ((taskData.priority ?? 0) >= 4 && !taskData.project_id) {
      recommendations.secondary.push({
        command: 'vikunja_tasks_list --filter="priority > 4" --limit=10',
        description: 'Get urgent tasks overview',
        rationale: 'Focus on the most critical tasks first'
      });
    }

    if (taskData.assignees && Array.isArray(taskData.assignees) && taskData.assignees.length > 0) {
      const assigneeNames = taskData.assignees
        .map((a: TaskAssignee) => a.username || `user_${a.id}`)
        .join(', ');
      const firstUsername = taskData.assignees[0]?.username;
      if (firstUsername) {
        recommendations.secondary.push({
          command: `vikunja_tasks_list --filter="assignees=@${firstUsername}"`,
          description: `Check ${assigneeNames}' current workload`,
          rationale: 'Understand assignee capacity and upcoming work'
        });
      }
    }

    if (taskData.due_date) {
      const dueDate = new Date(taskData.due_date);
      if (dueDate < new Date()) {
        recommendations.secondary.push({
          command: 'vikunja_tasks_list --filter="due_date < now()" --sort=due_date',
          description: 'Review overdue tasks',
          rationale: 'This task is overdue - prioritize it with other overdue items'
        });
      } else {
        recommendations.secondary.push({
          command: `vikunja_tasks_list --filter="due_date < ${taskData.due_date}" --sort=due_date`,
          description: 'Review tasks due before this one',
          rationale: 'Plan work sequence leading up to this due date'
        });
      }
    }

    // Build workflow sequence
    if (taskData.project_id && workflowSteps.length > 0) {
      workflowSteps.push(`vikunja_tasks_list --project_id=${taskData.project_id} --limit=10`);
    }
    if ((taskData.priority ?? 0) >= 4) {
      workflowSteps.push('vikunja_tasks_list --filter="priority >= 4" --sort=priority');
    }

    recommendations.workflowSequence = workflowSteps;

    return recommendations;
  }

  /**
   * Generate recommendations for list-tasks operations
   */
  private static generateListTasksRecommendations(
    context: AorpTransformationContext
  ): ToolRecommendations {
    const { tasks, dataSize } = context;
    const recommendations: ToolRecommendations = {
      primary: null,
      secondary: [],
      workflowSequence: []
    };

    if (!validateTasksArray(tasks)) {
      return this.generateGenericRecommendations(context);
    }

    const taskList: TaskData[] = tasks;
    const workflowSteps: string[] = [];

    // Analyze task list characteristics
    const highPriorityTasks = taskList.filter(t => (t.priority ?? 0) >= 4).length;
    const overdueTasks = taskList.filter(t => {
      if (!t.due_date || t.done) return false;
      return new Date(t.due_date) < new Date();
    }).length;
    const completedTasks = taskList.filter(t => t.done).length;

    // Primary recommendation based on list analysis
    if (highPriorityTasks > 0) {
      recommendations.primary = {
        command: 'vikunja_tasks_list --filter="priority >= 4" --sort=priority',
        description: `Focus on ${highPriorityTasks} high-priority task${highPriorityTasks === 1 ? '' : 's'}`,
        rationale: `Processing ${dataSize} items - prioritize high-priority tasks for immediate attention`
      };
      workflowSteps.push(recommendations.primary.command);
    } else if (overdueTasks > 0) {
      recommendations.primary = {
        command: 'vikunja_tasks_list --filter="due_date < now()" --sort=due_date',
        description: `Address ${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'}`,
        rationale: `Processing ${dataSize} items - overdue tasks should be handled immediately`
      };
      workflowSteps.push(recommendations.primary.command);
    } else if (dataSize > 20) {
      recommendations.primary = {
        command: 'vikunja_tasks_list --limit=20 --sort=priority',
        description: `Review current tasks: ${dataSize} items`,
        rationale: `Processing ${dataSize} items - focus on the most important items to avoid overwhelm`
      };
      workflowSteps.push(recommendations.primary.command);
    } else {
      recommendations.primary = {
        command: 'vikunja_tasks_list --sort=due_date',
        description: `Review current tasks: ${dataSize} items`,
        rationale: `Processing ${dataSize} items - plan work based on upcoming deadlines`
      };
      workflowSteps.push(recommendations.primary.command);
    }

    // Secondary recommendations
    if (completedTasks > taskList.length * 0.5) {
      recommendations.secondary.push({
        command: 'vikunja_tasks_list --filter="done=true" --sort=updated_at',
        description: 'Review completed tasks for archiving',
        rationale: 'Clean up workspace by archiving completed work'
      });
    }

    if (dataSize > 50) {
      recommendations.secondary.push({
        command: 'vikunja_tasks_list --limit=10 --sort=priority',
        description: 'Get a manageable high-priority overview',
        rationale: 'Focus on the most critical tasks first'
      });
    }

    if (overdueTasks > 0) {
      recommendations.secondary.push({
        command: 'vikunja_tasks_list --filter="due_date < now()" --limit=10',
        description: 'Get urgent overdue tasks overview',
        rationale: 'Immediate action needed on overdue items'
      });
    }

    // Add project-based filtering if project IDs are present
    const projectIds = Array.from(new Set(taskList.filter(t => t.project_id).map(t => t.project_id ?? 0)));
    if (projectIds.length > 1) {
      recommendations.secondary.push({
        command: `vikunja_tasks_list --project_id=${projectIds[0]}`,
        description: 'Focus on specific project tasks',
        rationale: 'Break down work by project for better organization'
      });
    }

    recommendations.workflowSequence = workflowSteps;

    return recommendations;
  }

  /**
   * Generate recommendations for update-task operations
   */
  private static generateUpdateTaskRecommendations(
    context: AorpTransformationContext
  ): ToolRecommendations {
    const { task } = context;
    const recommendations: ToolRecommendations = {
      primary: null,
      secondary: [],
      workflowSequence: []
    };

    if (!validateTask(task)) {
      return this.generateGenericRecommendations(context);
    }

    const taskData: TaskData = task;
    const workflowSteps: string[] = [];

    // Primary recommendation - verify the update
    if (taskData.id) {
      recommendations.primary = {
        command: `vikunja_tasks_get --id=${taskData.id}`,
        description: 'Verify task updates were applied correctly',
        rationale: 'Confirm all changes are reflected in the task data'
      };
      workflowSteps.push(recommendations.primary.command);
    }

    // Secondary recommendations based on update context
    if ((taskData.priority ?? 0) >= 4) {
      recommendations.secondary.push({
        command: 'vikunja_tasks_list --filter="priority >= 4" --sort=priority',
        description: 'Review high-priority task landscape',
        rationale: 'Ensure this task fits properly in the priority queue'
      });
    }

    if (taskData.due_date) {
      const dueDate = new Date(taskData.due_date);
      if (dueDate < new Date()) {
        recommendations.secondary.push({
          command: 'vikunja_tasks_list --filter="due_date < now()" --sort=due_date',
          description: 'Review overdue tasks requiring attention',
          rationale: 'This task may need immediate action if overdue'
        });
      } else {
        recommendations.secondary.push({
          command: `vikunja_tasks_list --filter="due_date > now() AND due_date < ${taskData.due_date}" --sort=due_date`,
          description: 'Review tasks due before this one',
          rationale: 'Plan work sequence considering this deadline'
        });
      }
    }

    recommendations.workflowSequence = workflowSteps;

    return recommendations;
  }

  /**
   * Generate recommendations for delete-task operations
   */
  private static generateDeleteTaskRecommendations(
    _context: AorpTransformationContext
  ): ToolRecommendations {
    const recommendations: ToolRecommendations = {
      primary: {
        command: 'vikunja_tasks_list --sort=updated_at',
        description: 'Review remaining tasks',
        rationale: 'Confirm deletion and check for any orphaned dependencies'
      },
      secondary: [
        {
          command: 'vikunja_tasks_list --filter="done=false" --sort=priority',
          description: 'Focus on active tasks',
          rationale: 'Shift attention to remaining actionable items'
        }
      ],
      workflowSequence: [
        'vikunja_tasks_list --sort=updated_at',
        'vikunja_tasks_list --filter="done=false" --sort=priority'
      ]
    };

    return recommendations;
  }

  /**
   * Generate recommendations for bulk operations
   */
  private static generateBulkOperationRecommendations(
    context: AorpTransformationContext
  ): ToolRecommendations {
    const { results } = context;
    const recommendations: ToolRecommendations = {
      primary: null,
      secondary: [],
      workflowSequence: []
    };

    if (!validateBulkResults(results)) {
      return this.generateGenericRecommendations(context);
    }

    const resultsData: BulkOperationResults = results;
    const successful = resultsData.successful ?? 0;
    const failed = resultsData.failed ?? 0;

    const workflowSteps: string[] = [];

    if (failed > 0) {
      // Handle partial success scenarios
      recommendations.primary = {
        command: 'vikunja_tasks_list --sort=updated_at --limit=20',
        description: 'Review recent task changes for validation',
        rationale: `Check that ${successful} tasks were processed correctly`
      };
      workflowSteps.push(recommendations.primary.command);

      // If we have specific failed IDs, recommend validation
      if (resultsData.failed_ids && Array.isArray(resultsData.failed_ids)) {
        const failedIds = resultsData.failed_ids.slice(0, 5).join(',');
        recommendations.secondary.push({
          command: `vikunja_tasks_get --id=${failedIds}`,
          description: 'Validate specific failed task updates',
          rationale: 'Check what went wrong with specific items'
        });
      }

      if (resultsData.errors && Array.isArray(resultsData.errors)) {
        recommendations.secondary.push({
          command: 'vikunja_tasks_list --filter="done=false" --sort=created_at',
          description: 'Review tasks that may need manual intervention',
          rationale: 'Some tasks may require manual correction based on errors'
        });
      }
    } else {
      // Complete success scenario
      recommendations.primary = {
        command: 'vikunja_tasks_list --filter="done=false" --sort=priority',
        description: 'Review active task landscape',
        rationale: 'Understand the impact of bulk changes on remaining work'
      };
      workflowSteps.push(recommendations.primary.command);

      if (successful > 10) {
        recommendations.secondary.push({
          command: 'vikunja_tasks_list --limit=20 --sort=updated_at',
          description: 'Review recent changes',
          rationale: 'Validate bulk operation results'
        });
      }
    }

    recommendations.workflowSequence = workflowSteps;

    return recommendations;
  }

  /**
   * Generate recommendations for get-task operations
   */
  private static generateGetTaskRecommendations(
    context: AorpTransformationContext
  ): ToolRecommendations {
    const { task } = context;
    const recommendations: ToolRecommendations = {
      primary: null,
      secondary: [],
      workflowSequence: []
    };

    if (!validateTask(task)) {
      return this.generateGenericRecommendations(context);
    }

    const taskData: TaskData = task;
    const workflowSteps: string[] = [];

    // Primary recommendation based on task state
    if (!taskData.done) {
      if ((taskData.priority ?? 0) >= 4) {
        recommendations.primary = {
          command: 'vikunja_tasks_list --filter="priority >= 4" --sort=priority',
          description: 'Review high-priority tasks for planning',
          rationale: 'This high-priority task should be planned alongside other urgent items'
        };
        workflowSteps.push(recommendations.primary.command);
      } else {
        recommendations.primary = {
          command: 'vikunja_tasks_list --filter="done=false" --sort=due_date',
          description: 'Review active tasks by deadline',
          rationale: 'Plan this task in context of other active work'
        };
        workflowSteps.push(recommendations.primary.command);
      }
    } else {
      recommendations.primary = {
        command: 'vikunja_tasks_list --filter="done=true" --sort=updated_at',
        description: 'Review recently completed tasks',
        rationale: 'See this task in context of recent work'
      };
      workflowSteps.push(recommendations.primary.command);
    }

    // Secondary recommendations
    if (taskData.due_date && !taskData.done) {
      const dueDate = new Date(taskData.due_date);
      if (dueDate < new Date()) {
        recommendations.secondary.push({
          command: 'vikunja_tasks_list --filter="due_date < now() AND done=false"',
          description: 'Review other overdue tasks',
          rationale: 'This task is overdue - check for other urgent items'
        });
      }
    }

    if (taskData.project_id) {
      recommendations.secondary.push({
        command: `vikunja_tasks_list --project_id=${taskData.project_id} --limit=10`,
        description: 'Review project context',
        rationale: 'Understand this task in relation to project work'
      });
    }

    recommendations.workflowSequence = workflowSteps;

    return recommendations;
  }

  /**
   * Generate generic recommendations for unknown operations
   */
  private static generateGenericRecommendations(
    context: AorpTransformationContext
  ): ToolRecommendations {
    const { dataSize } = context;

    return {
      primary: {
        command: 'vikunja_tasks_list --limit=20 --sort=priority',
        description: `Review current tasks: ${dataSize} items processed`,
        rationale: `Get overview of current work after processing ${dataSize} items`
      },
      secondary: [
        {
          command: 'vikunja_projects_list --limit=10',
          description: 'Review project context',
          rationale: 'Understand task organization across projects'
        }
      ],
      workflowSequence: [
        'vikunja_tasks_list --limit=20 --sort=priority',
        'vikunja_projects_list --limit=10'
      ]
    };
  }

  /**
   * Format tool recommendations as strings for AORP components
   */
  static formatForAorp(recommendations: ToolRecommendations): {
    nextSteps: string[];
    primaryRecommendation: string;
    secondaryRecommendations: string[];
    workflowGuidance: string;
  } {
    const nextSteps: string[] = [];
    const secondaryRecommendations: string[] = [];

    // Build next steps from secondary recommendations
    recommendations.secondary.forEach(rec => {
      nextSteps.push(`${rec.description}: ${rec.command}`);
    });

    // Add primary recommendation as next step if important
    if (recommendations.primary) {
      nextSteps.unshift(`${recommendations.primary.description}: ${recommendations.primary.command}`);
    }

    // Build primary recommendation string
    const primaryRecommendation = recommendations.primary
      ? `${recommendations.primary.description}. Use: ${recommendations.primary.command}`
      : 'Review operation results and plan next actions.';

    // Build secondary recommendations
    recommendations.secondary.forEach(rec => {
      secondaryRecommendations.push(`${rec.description}: ${rec.command}`);
    });

    // Build workflow guidance with data-driven insights
    let workflowGuidance = '';
    if (recommendations.workflowSequence.length > 0 && recommendations.primary) {
      // Include data size information from primary recommendation in workflow guidance
      workflowGuidance = `Recommended workflow: ${recommendations.workflowSequence.join(' → ')}`;

      // If the primary recommendation contains data size information, add it to the workflow guidance
      if (recommendations.primary.rationale &&
          recommendations.primary.rationale.includes('Processing') &&
          recommendations.primary.rationale.includes('items')) {
        workflowGuidance += ` (${recommendations.primary.rationale})`;
      }
    } else if (recommendations.workflowSequence.length > 0) {
      workflowGuidance = `Recommended workflow: ${recommendations.workflowSequence.join(' → ')}`;
    } else if (recommendations.primary) {
      workflowGuidance = recommendations.primary.rationale;
    } else {
      workflowGuidance = 'Operation completed successfully. Use the tools above to continue your work.';
    }

    return {
      nextSteps: nextSteps.slice(0, 5), // Limit to 5 next steps
      primaryRecommendation,
      secondaryRecommendations,
      workflowGuidance
    };
  }
}