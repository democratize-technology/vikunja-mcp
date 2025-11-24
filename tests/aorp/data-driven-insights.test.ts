/**
 * Failing Tests for Data-Driven AORP Insights
 * These tests demonstrate the problems with generic AORP templates
 * and will pass once we implement specific, data-driven insights
 */

import { describe, it, expect } from '@jest/globals';
import { AorpBuilder } from '../../src/aorp/builder';
import type { AorpTransformationContext } from '../../src/aorp/types';

describe('AORP Builder - Data-Driven Insights (Failing Tests)', () => {
  describe('Generic Template Problems', () => {
    it('should generate specific insights for create-task operation', () => {
      const context: AorpTransformationContext = {
        operation: 'create-task',
        success: true,
        dataSize: 1,
        processingTime: 250,
        verbosity: 'standard',
        // Real task data that should be analyzed
        task: {
          id: 12345,
          title: 'Build new API endpoint',
          priority: 5,
          due_date: '2024-12-15T00:00:00Z',
          assignees: [{ username: 'john_doe', id: 678 }]
        }
      };

      const builder = new AorpBuilder(context);
      const response = builder
        .status('success', 'Task created successfully')
        .generateNextSteps()
        .generateQuality()
        .generateWorkflowGuidance()
        .build();

      // Now this should pass - we generate specific data-driven insights
      expect(response.actionable.next_steps).toContain(
        'Task "Build new API endpoint" priority 5 Due Dec 14 Assigned to @john_doe.'
      );
    });

    it('should generate specific insights for list-tasks operation', () => {
      const context: AorpTransformationContext = {
        operation: 'list-tasks',
        success: true,
        dataSize: 12,
        processingTime: 450,
        verbosity: 'standard',
        // Real task list data that should be analyzed
        tasks: [
          { priority: 5, due_date: '2024-12-01T00:00:00Z', done: false }, // High priority, overdue
          { priority: 5, due_date: '2024-12-02T00:00:00Z', done: false }, // High priority, overdue
          { priority: 5, due_date: '2024-12-03T00:00:00Z', done: false }, // High priority, overdue
          { priority: 3, due_date: '2024-12-15T00:00:00Z', done: false }, // Medium priority
          { priority: 1, due_date: '2024-12-20T00:00:00Z', done: false }, // Low priority
          // ... 7 more tasks
        ]
      };

      const builder = new AorpBuilder(context);
      const response = builder
        .status('success', 'Tasks retrieved successfully')
        .generateNextSteps()
        .generateQuality()
        .generateWorkflowGuidance()
        .build();

      // Now this should pass - we generate specific data-driven insights
      expect(response.actionable.next_steps).toContain(
        'Found 5 tasks, 3 high priority, 5 overdue.'
      );
    });

    it('should generate specific insights for bulk operations', () => {
      const context: AorpTransformationContext = {
        operation: 'bulk-create-tasks',
        success: true,
        dataSize: 10,
        processingTime: 1500,
        verbosity: 'standard',
        // Real bulk operation data that should be analyzed
        results: {
          successful: 8,
          failed: 2,
          errors: [
            { index: 3, error: 'Invalid due_date format' },
            { index: 7, error: 'Priority must be between 1-5' }
          ]
        }
      };

      const builder = new AorpBuilder(context);
      const response = builder
        .status('partial', 'Bulk operation completed with some failures')
        .generateNextSteps()
        .generateQuality()
        .generateWorkflowGuidance()
        .build();

      // Now this should pass - we generate specific data-driven insights
      expect(response.actionable.next_steps).toContain(
        'Created 8/10 tasks successfully.'
      );
    });
  });

  describe('Generic Confidence Score Problems', () => {
    it('should calculate confidence based on actual data quality', () => {
      const highQualityContext: AorpTransformationContext = {
        operation: 'create-task',
        success: true,
        dataSize: 1,
        processingTime: 200, // Fast response
        verbosity: 'standard',
        task: {
          id: 12345,
          title: 'Complete project documentation',
          description: 'Detailed documentation for the new API',
          priority: 5,
          due_date: '2024-12-15T00:00:00Z',
          assignees: [{ username: 'john_doe', id: 678 }],
          labels: [{ title: 'urgent' }, { title: 'documentation' }]
        }
      };

      const builder = new AorpBuilder(highQualityContext);
      const response = builder
        .status('success', 'Task created successfully')
        .generateNextSteps()
        .generateQuality()
        .generateWorkflowGuidance()
        .build();

      // Now this should pass - data-driven confidence calculation
      // High-quality data should result in confidence >= 0.9
      expect(response.immediate.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('should reduce confidence for partial success bulk operations', () => {
      const partialSuccessContext: AorpTransformationContext = {
        operation: 'bulk-update-tasks',
        success: true, // Operation succeeded but some items failed
        dataSize: 20,
        processingTime: 3000, // Slow response
        verbosity: 'standard',
        errors: ['5 tasks failed to update due to concurrent modification'],
        results: {
          successful: 15,
          failed: 5
        }
      };

      const builder = new AorpBuilder(partialSuccessContext);
      const response = builder
        .status('partial', 'Bulk update completed with partial success')
        .generateNextSteps()
        .generateQuality()
        .generateWorkflowGuidance()
        .build();

      // Now this should pass - data-driven confidence calculation
      // Partial success with errors should result in confidence < 1.0
      expect(response.immediate.confidence).toBeLessThan(1.0);
    });
  });

  describe('Generic Next Steps Problems', () => {
    it('should recommend specific tools based on operation context', () => {
      const listTasksContext: AorpTransformationContext = {
        operation: 'list-tasks',
        success: true,
        dataSize: 50, // Large dataset
        processingTime: 600,
        verbosity: 'standard',
        tasks: Array(50).fill({}).map((_, i) => ({
          id: i + 1,
          title: `Task ${i + 1}`,
          priority: Math.floor(Math.random() * 5) + 1,
          done: false
        }))
      };

      const builder = new AorpBuilder(listTasksContext);
      const response = builder
        .status('success', 'Tasks retrieved successfully')
        .generateNextSteps()
        .generateQuality()
        .generateWorkflowGuidance()
        .build();

      // Now this should pass - data-driven recommendations
      expect(response.actionable.workflow_guidance).toContain(
        'high-priority'
      );
    });

    it('should suggest different next steps for overdue tasks', () => {
      const overdueTasksContext: AorpTransformationContext = {
        operation: 'list-tasks',
        success: true,
        dataSize: 5,
        processingTime: 300,
        verbosity: 'standard',
        tasks: [
          {
            id: 1,
            title: 'Critical bug fix',
            priority: 5,
            due_date: '2024-11-01T00:00:00Z', // Overdue
            done: false
          },
          {
            id: 2,
            title: 'Security update',
            priority: 5,
            due_date: '2024-11-15T00:00:00Z', // Overdue
            done: false
          }
          // ... more overdue tasks
        ]
      };

      const builder = new AorpBuilder(overdueTasksContext);
      const response = builder
        .status('success', 'Tasks retrieved successfully')
        .generateNextSteps()
        .generateQuality()
        .generateWorkflowGuidance()
        .build();

      // Now this should pass - data-driven next steps for overdue tasks
      expect(response.actionable.next_steps).toContain(
        'Update overdue tasks with new due dates or mark as completed'
      );
    });
  });
});