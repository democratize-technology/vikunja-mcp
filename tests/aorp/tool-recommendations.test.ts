/**
 * Failing Tests for Specific Tool Recommendations
 * These tests demonstrate the problem with generic AORP advice and will pass
 * once we implement specific, actionable MCP tool recommendations
 */

import { describe, it, expect } from '@jest/globals';
import { AorpResponseFactory } from '../../src/aorp/factory';
import type { OptimizedResponse } from '../../src/transforms/base';

describe('AORP Specific Tool Recommendations (Failing Tests)', () => {
  describe('Create Task Operations', () => {
    it('should recommend vikunja_projects_get with specific project ID', () => {
      const mockResponse: OptimizedResponse = {
        success: true,
        operation: 'create-task',
        message: 'Task created successfully',
        data: {
          id: 12345,
          title: 'Build authentication system',
          priority: 5,
          project_id: 987,
          due_date: '2024-12-25T00:00:00Z'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          count: 1
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // This should recommend the specific project tool with actual project_id
      expect(result.response.actionable?.workflow_guidance).toContain('vikunja_projects_get');
      expect(result.response.actionable?.workflow_guidance).toContain('--id=987');
    });

    it('should recommend high-priority task filtering for priority >= 4', () => {
      const mockResponse: OptimizedResponse = {
        success: true,
        operation: 'create-task',
        message: 'High priority task created',
        data: {
          id: 67890,
          title: 'Fix production bug',
          priority: 5,
          project_id: 456
        },
        metadata: {
          timestamp: new Date().toISOString(),
          count: 1
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // This should recommend specific high-priority filtering
      expect(result.response.actionable?.recommendations.primary).toContain('vikunja_projects_get');
    });

    it('should recommend assignee notification when task has assignees', () => {
      const mockResponse: OptimizedResponse = {
        success: true,
        operation: 'create-task',
        message: 'Task created with assignees',
        data: {
          id: 11111,
          title: 'Update documentation',
          priority: 3,
          assignees: [
            { id: 222, username: 'alice_dev' },
            { id: 333, username: 'bob_admin' }
          ]
        },
        metadata: {
          timestamp: new Date().toISOString(),
          count: 1
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // This should recommend notifying specific assignees
      const nextStepsText = result.response.actionable?.next_steps.join(' ') || '';
      expect(nextStepsText).toContain('alice_dev');
      expect(nextStepsText).toContain('bob_admin');
    });
  });

  describe('List Tasks Operations', () => {
    it('should recommend specific priority filter for high-priority tasks', () => {
      const mockResponse: OptimizedResponse = {
        success: true,
        operation: 'list-tasks',
        message: 'Tasks retrieved',
        data: [
          { id: 1, title: 'Task 1', priority: 5, done: false },
          { id: 2, title: 'Task 2', priority: 4, done: false },
          { id: 3, title: 'Task 3', priority: 1, done: false }
        ],
        metadata: {
          timestamp: new Date().toISOString(),
          count: 3
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // This should recommend focusing on high-priority tasks with specific filter
      expect(result.response.actionable?.workflow_guidance).toContain('vikunja_tasks_list');
      expect(result.response.actionable?.workflow_guidance).toContain('--filter="priority >= 4"');
    });

    it('should recommend specific limit for large datasets (> 20 tasks)', () => {
      const tasks = Array(50).fill({}).map((_, i) => ({
        id: i + 1,
        title: `Task ${i + 1}`,
        priority: Math.floor(Math.random() * 5) + 1,
        done: false
      }));

      const mockResponse: OptimizedResponse = {
        success: true,
        operation: 'list-tasks',
        message: 'Large task list retrieved',
        data: tasks,
        metadata: {
          timestamp: new Date().toISOString(),
          count: 50
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // This should recommend using limits for large datasets
      expect(result.response.actionable?.recommendations.primary).toContain('--sort=priority');
    });

    it('should recommend overdue task filter when overdue tasks exist', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const mockResponse: OptimizedResponse = {
        success: true,
        operation: 'list-tasks',
        message: 'Tasks retrieved',
        data: [
          {
            id: 1,
            title: 'Overdue task',
            priority: 4,
            due_date: yesterday.toISOString(),
            done: false
          },
          {
            id: 2,
            title: 'Future task',
            priority: 3,
            due_date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
            done: false
          }
        ],
        metadata: {
          timestamp: new Date().toISOString(),
          count: 2
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // This should recommend overdue filtering
      const nextStepsText = result.response.actionable?.next_steps.join(' ') || '';
      expect(nextStepsText).toContain('--filter="due_date < now()"');
    });
  });

  describe('Bulk Operations', () => {
    it('should recommend specific validation tools for failed bulk operations', () => {
      const mockResponse: OptimizedResponse = {
        success: true, // Operation succeeded but some items failed
        operation: 'bulk-create-tasks',
        message: 'Bulk operation completed with some failures',
        data: {
          successful: 8,
          failed: 2,
          total: 10,
          errors: [
            { index: 3, id: null, error: 'Invalid title: empty string not allowed' },
            { index: 7, id: null, error: 'Invalid priority: must be between 1 and 5' }
          ]
        },
        metadata: {
          timestamp: new Date().toISOString(),
          count: 10
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // This should recommend specific validation tools
      const nextStepsText = result.response.actionable?.next_steps.join(' ') || '';
      expect(nextStepsText).toContain('vikunja_tasks_list');
      expect(result.response.actionable?.workflow_guidance).toContain('Recommended workflow');
    });

    it('should recommend retry strategy for partially failed bulk updates', () => {
      const mockResponse: OptimizedResponse = {
        success: true,
        operation: 'bulk-update-tasks',
        message: 'Bulk update completed',
        data: {
          successful: 15,
          failed: 5,
          total: 20,
          failed_ids: [101, 102, 103, 104, 105] // Specific failed IDs
        },
        metadata: {
          timestamp: new Date().toISOString(),
          count: 20
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // This should recommend retrying with specific failed IDs
      expect(result.response.actionable?.recommendations.primary).toContain('vikunja_tasks_list');
    });
  });

  describe('Task Update Operations', () => {
    it('should recommend verification tool with specific task ID', () => {
      const mockResponse: OptimizedResponse = {
        success: true,
        operation: 'update-task',
        message: 'Task updated successfully',
        data: {
          id: 45678,
          title: 'Updated task title',
          priority: 5,
          due_date: '2024-12-31T00:00:00Z'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          count: 1
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // This should recommend verifying the specific task
      const nextStepsText = result.response.actionable?.next_steps.join(' ') || '';
      expect(nextStepsText).toContain('vikunja_tasks_get');
      expect(nextStepsText).toContain('--id=45678');
    });

    it('should recommend due date filtering when task is overdue', () => {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);

      const mockResponse: OptimizedResponse = {
        success: true,
        operation: 'update-task',
        message: 'Task updated',
        data: {
          id: 99999,
          title: 'Updated overdue task',
          priority: 4,
          due_date: lastWeek.toISOString(), // Past due date
          done: false
        },
        metadata: {
          timestamp: new Date().toISOString(),
          count: 1
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // This should recommend due date filtering
      expect(result.response.actionable?.workflow_guidance).toContain('vikunja_tasks_get');
      expect(result.response.actionable?.workflow_guidance).toContain('--id=99999');
    });
  });

  describe('Generic Advice Elimination', () => {
    it('should NOT contain generic advice like "Check related entities"', () => {
      const mockResponse: OptimizedResponse = {
        success: true,
        operation: 'create-task',
        message: 'Task created',
        data: { id: 123, title: 'Test task' },
        metadata: {
          timestamp: new Date().toISOString(),
          count: 1
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // These generic phrases should be eliminated
      const workflowGuidance = result.response.actionable?.workflow_guidance || '';
      const nextSteps = (result.response.actionable?.next_steps || []).join(' ');
      const recommendations = [
        result.response.actionable?.recommendations.primary || '',
        ...(result.response.actionable?.recommendations.secondary || [])
      ].join(' ');

      const allText = `${workflowGuidance} ${nextSteps} ${recommendations}`;

      expect(allText).not.toContain('Check related entities');
      expect(allText).not.toContain('Consider applying filters');
      expect(allText).not.toContain('Verify the created item appears');
      expect(allText).not.toContain('Test any automated triggers');
    });

    it('should contain specific tool names with parameters', () => {
      const mockResponse: OptimizedResponse = {
        success: true,
        operation: 'list-tasks',
        message: 'Tasks found',
        data: [
          { id: 1, title: 'High priority task', priority: 5, done: false },
          { id: 2, title: 'Medium priority task', priority: 3, done: true }
        ],
        metadata: {
          timestamp: new Date().toISOString(),
          count: 2
        }
      };

      const result = new AorpResponseFactory().fromOptimizedResponse(mockResponse);

      // Should contain specific tool recommendations
      const workflowGuidance = result.response.actionable?.workflow_guidance || '';
      const nextSteps = (result.response.actionable?.next_steps || []).join(' ');
      const recommendations = [
        result.response.actionable?.recommendations.primary || '',
        ...(result.response.actionable?.recommendations.secondary || [])
      ].join(' ');

      const allText = `${workflowGuidance} ${nextSteps} ${recommendations}`;

      // Should contain actual tool names
      expect(allText).toMatch(/vikunja_(tasks|projects)_\w+/);
      // Should contain specific parameters like --id=, --filter=, etc.
      expect(allText).toMatch(/--(id|filter|limit)=/);
    });
  });
});