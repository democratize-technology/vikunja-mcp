/**
 * ARCH-001 Confidence Scoring Regression Tests
 *
 * These tests ensure the confidence scoring algorithm produces realistic,
 * data-driven confidence scores after the mathematical flaw fixes.
 */

import { AorpBuilder } from '../../src/aorp/builder';
import type { AorpTransformationContext } from '../../src/aorp/types';

describe('ARCH-001 Confidence Scoring Regression Tests', () => {

  describe('Realistic Confidence Ranges', () => {
    it('should return high confidence (0.9+) for perfect data scenarios', () => {
      const perfectContext: AorpTransformationContext = {
        operation: 'create-task',
        success: true,
        dataSize: 1,
        processingTime: 200,
        verbosity: 'standard',
        task: {
          id: 12345,
          title: 'Complete comprehensive project documentation',
          description: 'Detailed documentation covering API endpoints, usage examples, and best practices',
          priority: 5,
          due_date: '2024-12-15T00:00:00Z',
          assignees: [{ username: 'john_doe', id: 678 }, { username: 'jane_smith', id: 679 }],
          labels: [{ title: 'urgent' }, { title: 'documentation' }, { title: 'api' }]
        }
      };

      const builder = new AorpBuilder(perfectContext);
      const response = builder
        .status('success', 'Perfect task created successfully')
        .buildWithAutogeneration();

      expect(response.immediate.confidence).toBeGreaterThanOrEqual(0.90);
      expect(response.immediate.confidence).toBeLessThanOrEqual(0.95);
    });

    it('should return medium confidence (0.4-0.8) for partial data scenarios', () => {
      const mediumContext: AorpTransformationContext = {
        operation: 'create-task',
        success: true,
        dataSize: 1,
        processingTime: 300,
        verbosity: 'standard',
        task: {
          id: 12345,
          title: 'Task with basic info',
          priority: 3
          // Missing: description, due_date, assignees, labels
        }
      };

      const builder = new AorpBuilder(mediumContext);
      const response = builder
        .status('success', 'Basic task created')
        .buildWithAutogeneration();

      expect(response.immediate.confidence).toBeGreaterThanOrEqual(0.40);
      expect(response.immediate.confidence).toBeLessThanOrEqual(0.80);
    });

    it('should return low confidence (<0.3) for poor data scenarios', () => {
      const poorContext: AorpTransformationContext = {
        operation: 'create-task',
        success: true,
        dataSize: 1,
        processingTime: 200,
        verbosity: 'standard',
        task: {
          id: 12345
          // Missing all critical fields: title, priority
        }
      };

      const builder = new AorpBuilder(poorContext);
      const response = builder
        .status('success', 'Minimal task created')
        .buildWithAutogeneration();

      expect(response.immediate.confidence).toBeLessThan(0.30);
    });
  });

  describe('Field Validation Impact', () => {
    it('should heavily penalize missing critical fields (title, priority)', () => {
      const missingCriticalContext: AorpTransformationContext = {
        operation: 'create-task',
        success: true,
        dataSize: 1,
        processingTime: 200,
        verbosity: 'standard',
        task: {
          id: 12345,
          description: 'Description without title or priority',
          due_date: '2024-12-15T00:00:00Z'
        }
      };

      const builder = new AorpBuilder(missingCriticalContext);
      const response = builder
        .status('success', 'Task created despite missing critical fields')
        .buildWithAutogeneration();

      expect(response.immediate.confidence).toBeLessThan(0.20);
    });

    it('should moderately penalize missing important fields (due_date, description)', () => {
      const missingImportantContext: AorpTransformationContext = {
        operation: 'create-task',
        success: true,
        dataSize: 1,
        processingTime: 200,
        verbosity: 'standard',
        task: {
          id: 12345,
          title: 'Task with title and priority',
          priority: 4
          // Missing: due_date, description, assignees, labels
        }
      };

      const builder = new AorpBuilder(missingImportantContext);
      const response = builder
        .status('success', 'Task created with missing important fields')
        .buildWithAutogeneration();

      expect(response.immediate.confidence).toBeGreaterThanOrEqual(0.30);
      expect(response.immediate.confidence).toBeLessThan(0.80);
    });
  });

  describe('Bulk Operation Realism', () => {
    it('should return high confidence (>0.7) for bulk operations with very high success rates', () => {
      const highSuccessBulkContext: AorpTransformationContext = {
        operation: 'bulk-update-tasks',
        success: true,
        dataSize: 50,
        processingTime: 3000,
        verbosity: 'standard',
        results: {
          successful: 48,
          failed: 2
        }
      };

      const builder = new AorpBuilder(highSuccessBulkContext);
      const response = builder
        .status('partial', 'Bulk update with very high success rate')
        .buildWithAutogeneration();

      // 48/50 = 96% success rate should result in high confidence (>0.7)
      expect(response.immediate.confidence).toBeGreaterThanOrEqual(0.70);
      expect(response.immediate.confidence).toBeLessThan(0.95);
    });

    it('should return moderate confidence (0.6-0.8) for bulk operations with good success rates', () => {
      const goodSuccessBulkContext: AorpTransformationContext = {
        operation: 'bulk-update-tasks',
        success: true,
        dataSize: 20,
        processingTime: 3000,
        verbosity: 'standard',
        results: {
          successful: 16,
          failed: 4 // 80% success rate
        }
      };

      const builder = new AorpBuilder(goodSuccessBulkContext);
      const response = builder
        .status('partial', 'Bulk update with good success rate')
        .buildWithAutogeneration();

      expect(response.immediate.confidence).toBeGreaterThanOrEqual(0.60);
      expect(response.immediate.confidence).toBeLessThan(0.80);
    });

    it('should return lower confidence (<0.7) for bulk operations with significant failures', () => {
      const lowSuccessBulkContext: AorpTransformationContext = {
        operation: 'bulk-update-tasks',
        success: true,
        dataSize: 20,
        processingTime: 3000,
        verbosity: 'standard',
        errors: ['5 tasks failed validation', '3 tasks had conflicts'],
        results: {
          successful: 12,
          failed: 8
        }
      };

      const builder = new AorpBuilder(lowSuccessBulkContext);
      const response = builder
        .status('partial', 'Bulk update with significant failures')
        .buildWithAutogeneration();

      expect(response.immediate.confidence).toBeLessThan(0.70);
    });
  });

  describe('Data Quality Scoring', () => {
    it('should differentiate between valid and invalid field values', () => {
      const invalidFieldsContext: AorpTransformationContext = {
        operation: 'create-task',
        success: true,
        dataSize: 1,
        processingTime: 200,
        verbosity: 'standard',
        task: {
          id: 12345,
          title: '  ', // Empty/whitespace title
          priority: 10, // Invalid priority range
          due_date: 'invalid-date'
        }
      };

      const builder = new AorpBuilder(invalidFieldsContext);
      const response = builder
        .status('success', 'Task created with invalid field values')
        .buildWithAutogeneration();

      expect(response.immediate.confidence).toBeLessThan(0.15);
    });

    it('should reward high-quality task lists with varied data', () => {
      const qualityListContext: AorpTransformationContext = {
        operation: 'list-tasks',
        success: true,
        dataSize: 15,
        processingTime: 600,
        verbosity: 'standard',
        tasks: Array(15).fill({}).map((_, i) => ({
          id: i + 1,
          title: `High-quality task ${i + 1}`,
          description: `Detailed description for task ${i + 1}`,
          priority: Math.floor(Math.random() * 5) + 1,
          due_date: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
          assignees: i % 3 === 0 ? [{ username: `user_${i}`, id: i }] : [],
          labels: i % 2 === 0 ? [{ title: 'important' }, { title: 'project' }] : []
        }))
      };

      const builder = new AorpBuilder(qualityListContext);
      const response = builder
        .status('success', 'High-quality task list retrieved')
        .buildWithAutogeneration();

      expect(response.immediate.confidence).toBeGreaterThanOrEqual(0.70);
      expect(response.immediate.confidence).toBeLessThanOrEqual(0.90);
    });
  });

  describe('Performance Impact', () => {
    it('should slightly reduce confidence for slow operations', () => {
      const slowOperationContext: AorpTransformationContext = {
        operation: 'create-task',
        success: true,
        dataSize: 1,
        processingTime: 3000, // Very slow for single task
        verbosity: 'standard',
        task: {
          id: 12345,
          title: 'Slow task creation',
          priority: 3
        }
      };

      const builder = new AorpBuilder(slowOperationContext);
      const response = builder
        .status('success', 'Task created slowly')
        .buildWithAutogeneration();

      // Should be lower than equivalent fast operation
      expect(response.immediate.confidence).toBeLessThanOrEqual(0.55);
    });

    it('should reward fast operations with performance bonus', () => {
      const fastOperationContext: AorpTransformationContext = {
        operation: 'get-task',
        success: true,
        dataSize: 1,
        processingTime: 50, // Very fast
        verbosity: 'standard',
        task: {
          id: 12345,
          title: 'Fast retrieved task',
          priority: 3
        }
      };

      const builder = new AorpBuilder(fastOperationContext);
      const response = builder
        .status('success', 'Task retrieved quickly')
        .buildWithAutogeneration();

      expect(response.immediate.confidence).toBeGreaterThanOrEqual(0.45);
    });
  });

  describe('Error Handling Realism', () => {
    it('should handle failed operations gracefully with very low confidence', () => {
      const failedOperationContext: AorpTransformationContext = {
        operation: 'create-task',
        success: false,
        dataSize: 0,
        processingTime: 5000,
        verbosity: 'standard',
        errors: ['Authentication failed', 'Invalid API token']
      };

      const builder = new AorpBuilder(failedOperationContext);
      const response = builder
        .status('error', 'Task creation failed')
        .buildWithAutogeneration();

      expect(response.immediate.confidence).toBeLessThan(0.20);
    });
  });

  describe('Confidence Range Verification', () => {
    it('should never return perfect 1.0 confidence scores', () => {
      // Test multiple scenarios to ensure no 1.0 scores
      const scenarios = [
        {
          operation: 'create-task' as const,
          success: true,
          dataSize: 1,
          processingTime: 200,
          task: {
            id: 1,
            title: 'Perfect task',
            description: 'Complete description',
            priority: 5,
            due_date: '2024-12-15T00:00:00Z',
            assignees: [{ username: 'test', id: 1 }],
            labels: [{ title: 'test' }]
          }
        },
        {
          operation: 'list-tasks' as const,
          success: true,
          dataSize: 100,
          processingTime: 800,
          tasks: Array(100).fill({}).map((_, i) => ({
            id: i,
            title: `Task ${i}`,
            priority: 3,
            due_date: new Date().toISOString()
          }))
        },
        {
          operation: 'bulk-create-tasks' as const,
          success: true,
          dataSize: 20,
          processingTime: 2000,
          results: { successful: 20, failed: 0 }
        }
      ];

      scenarios.forEach((scenario, index) => {
        const builder = new AorpBuilder(scenario);
        const response = builder
          .status('success', `Scenario ${index + 1}`)
          .buildWithAutogeneration();

        expect(response.immediate.confidence).toBeLessThan(1.0);
        expect(response.immediate.confidence).toBeGreaterThanOrEqual(0.0);
      });
    });
  });

  describe('Algorithm Weight Distribution', () => {
    it('should properly balance success flag vs data quality', () => {
      // Same success flag, different data quality should show significant difference
      const baseSuccessContext = {
        operation: 'create-task' as const,
        success: true,
        dataSize: 1,
        processingTime: 200,
        verbosity: 'standard' as const
      };

      const highQualityContext: AorpTransformationContext = {
        ...baseSuccessContext,
        task: {
          id: 12345,
          title: 'High quality task with all fields',
          description: 'Comprehensive description',
          priority: 5,
          due_date: '2024-12-15T00:00:00Z',
          assignees: [{ username: 'test', id: 1 }],
          labels: [{ title: 'test' }]
        }
      };

      const lowQualityContext: AorpTransformationContext = {
        ...baseSuccessContext,
        task: {
          id: 12345
          // Missing all other fields
        }
      };

      const highQualityBuilder = new AorpBuilder(highQualityContext);
      const lowQualityBuilder = new AorpBuilder(lowQualityContext);

      const highQualityResponse = highQualityBuilder
        .status('success', 'High quality')
        .buildWithAutogeneration();

      const lowQualityResponse = lowQualityBuilder
        .status('success', 'Low quality')
        .buildWithAutogeneration();

      // Data quality should make significant difference
      const confidenceDifference = highQualityResponse.immediate.confidence - lowQualityResponse.immediate.confidence;
      expect(confidenceDifference).toBeGreaterThan(0.5); // Significant difference
    });
  });
});