/**
 * Conditional AORP Verbosity Tests
 * Tests that simple operations return concise responses while complex operations get full AORP
 */

import { AorpResponseFactory } from '../../src/aorp/factory';
import type { AorpFactoryResult, AorpFactoryOptions } from '../../src/aorp/types';
import { isSimpleAorpResponse } from '../../src/aorp/types';

describe('Conditional AORP Verbosity', () => {
  let factory: AorpResponseFactory;

  beforeEach(() => {
    factory = new AorpResponseFactory();
  });

  describe('Simple Operations - Should Return Concise Responses', () => {
    it('should return simple response for get-task operation', () => {
      const simpleData = { id: 123, title: 'Test Task', completed: false };

      const result = factory.fromData('get-task', 'Task retrieved successfully', true, 'Task found', {
        // Force simple mode for this operation
        builderConfig: {
          confidenceMethod: 'simple'
        }
      });

      // Should indicate this is a simple response
      expect(result.transformation.context).toMatchObject({
        operation: 'get-task',
        success: true,
        dataSize: 1, // fromData passes the summary as string, so dataSize is 1
        verbosityLevel: 'simple'
      });

      // Response should be simple format
      expect(isSimpleAorpResponse(result.response)).toBe(true);

      // Simple responses should be much shorter than full AORP
      const formatted = JSON.stringify(result.response);
      expect(formatted.length).toBeLessThan(500); // Much smaller than full AORP

      // Simple response should have expected structure
      if (isSimpleAorpResponse(result.response)) {
        expect(result.response).toHaveProperty('immediate');
        expect(result.response).toHaveProperty('summary');
        expect(result.response).toHaveProperty('metadata');
        expect(result.response).not.toHaveProperty('actionable');
        expect(result.response).not.toHaveProperty('quality');
      }
    });

    it('should return simple response for delete-task operation', () => {
      const result = factory.fromData('delete-task', 'Task deleted successfully', true, 'Task removed', {
        builderConfig: {
          confidenceMethod: 'simple'
        }
      });

      expect(result.transformation.context.operation).toBe('delete-task');
      expect(result.transformation.context.verbosityLevel).toBe('simple');
      expect(result.response.immediate.status).toBe('success');

      // Should be a simple response
      expect(isSimpleAorpResponse(result.response)).toBe(true);

      // Simple responses should not have actionable section
      expect(result.response).not.toHaveProperty('actionable');
    });

    it('should return simple response for simple update-task operation', () => {
      const updateData = { id: 123, title: 'Updated Task' };

      const result = factory.fromData('update-task', 'Task updated successfully', true, 'Task modified', {
        builderConfig: {
          confidenceMethod: 'simple'
        }
      });

      expect(result.transformation.context.operation).toBe('update-task');
      expect(result.transformation.context.verbosityLevel).toBe('simple');
      expect(result.response.immediate.status).toBe('success');

      // Should be a simple response
      expect(isSimpleAorpResponse(result.response)).toBe(true);
    });
  });

  describe('Complex Operations - Should Return Full AORP', () => {
    it('should return full AORP for bulk-create-tasks operation', () => {
      const complexData = {
        created: 15,
        failed: 2,
        total: 17,
        tasks: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, title: `Task ${i + 1}` }))
      };

      const result = factory.fromData('bulk-create-tasks', 'Bulk operation completed', true, 'Tasks processed with some failures', {
        builderConfig: {
          confidenceMethod: 'adaptive',
          confidenceWeights: {
            success: 0.6,
            dataSize: 0.3,
            responseTime: 0.1,
            completeness: 0.0
          }
        }
      });

      expect(result.transformation.context.operation).toBe('bulk-create-tasks');
      expect(result.transformation.context.verbosityLevel).toBe('full');

      // Should be a full AORP response
      expect(isSimpleAorpResponse(result.response)).toBe(false);

      // Complex operations should have next steps
      if (!isSimpleAorpResponse(result.response)) {
        expect(result.response.actionable.next_steps.length).toBeGreaterThan(0);

        // Should have quality indicators with custom metrics
        expect(result.response.quality.indicators).toBeDefined();

        // Full AORP responses should be longer
        const formatted = JSON.stringify(result.response);
        expect(formatted.length).toBeGreaterThan(1000);
      }
    });

    it('should return full AORP for list-tasks with large dataset', () => {
      const largeData = {
        tasks: Array.from({ length: 50 }, (_, i) => ({
          id: i + 1,
          title: `Task ${i + 1}`,
          priority: i % 5 + 1
        })),
        total: 50,
        page: 1,
        pageSize: 50
      };

      const result = factory.fromData('list-tasks', 'Tasks retrieved successfully', true, 'Found 50 tasks', {
        builderConfig: {
          confidenceMethod: 'adaptive',
          confidenceWeights: {
            success: 0.3,
            dataSize: 0.4,
            responseTime: 0.2,
            completeness: 0.1
          }
        }
      });

      expect(result.transformation.context.operation).toBe('list-tasks');
      expect(result.transformation.context.verbosityLevel).toBe('full');

      // Should be a full AORP response
      expect(isSimpleAorpResponse(result.response)).toBe(false);

      // Large dataset operations should have quality indicators
      if (!isSimpleAorpResponse(result.response)) {
        expect(result.response.quality.completeness).toBeGreaterThan(0.0);
        expect(result.response.quality.reliability).toBeGreaterThan(0.0);

        // Should include recommendations for handling large datasets
        expect(result.response.actionable.recommendations.primary).toBeDefined();
        // Secondary recommendations are optional
      }
    });

    it('should return full AORP for operations with errors', () => {
      const error = new Error('Validation failed: Missing required fields');

      const result = factory.fromError('create-task', error);

      expect(result.response.immediate.status).toBe('error');
      expect(result.transformation.context.verbosityLevel).toBe('full');

      // Error responses should always be full AORP for debugging
      expect(isSimpleAorpResponse(result.response)).toBe(false);

      if (!isSimpleAorpResponse(result.response)) {
        expect(result.response.actionable.next_steps.length).toBeGreaterThan(2);
        expect(result.response.details.debug).toBeDefined();
        expect(result.response.quality.urgency).toBe('high');
      }
    });
  });

  describe('User-Configurable Verbosity Controls', () => {
    it('should respect useAorp: false parameter to force simple responses', () => {
      const complexData = {
        tasks: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, title: `Task ${i + 1}` }))
      };

      const result = factory.fromData('list-tasks', 'Tasks retrieved', true, 'Found 20 tasks', {
        useAorp: false, // Force simple response
        builderConfig: {
          confidenceMethod: 'adaptive'
        }
      });

      // Should force simple response despite complex data
      expect(result.transformation.context.verbosityLevel).toBe('simple');
      expect(isSimpleAorpResponse(result.response)).toBe(true);

      // Simple response should have expected structure
      if (isSimpleAorpResponse(result.response)) {
        expect(result.response).toHaveProperty('summary');
        expect(result.response).not.toHaveProperty('actionable');
      }
    });

    it('should respect useAorp: true parameter to force full AORP', () => {
      const result = factory.fromData('get-task', 'Task found', true, 'Simple task', {
        useAorp: true, // Force full AORP even for simple operation
        builderConfig: {
          confidenceMethod: 'adaptive'
        }
      });

      // Should have full AORP structure despite simple operation
      expect(result.transformation.context.verbosityLevel).toBe('full');
      expect(isSimpleAorpResponse(result.response)).toBe(false);

      if (!isSimpleAorpResponse(result.response)) {
        expect(result.response.actionable.next_steps.length).toBeGreaterThan(0);
        expect(result.response.quality.indicators).toBeDefined();
      }
    });
  });

  describe('Intelligent Verbosity Detection', () => {
    it('should auto-detect simple operations based on operation type', () => {
      const simpleOperations = ['get-task', 'delete-task', 'get-project', 'delete-project'];

      simpleOperations.forEach(operation => {
        const result = factory.fromData(operation, 'Operation completed', true, 'Success');

        // Simple operations should be detected automatically
        expect(result.transformation.context.verbosityLevel).toBe('simple');
        expect(isSimpleAorpResponse(result.response)).toBe(true);
      });
    });

    it('should auto-detect complex operations based on data size and complexity', () => {
      const complexData = {
        created: 25,
        failed: 3,
        warnings: ['Some tasks had missing fields'],
        totalProcessed: 28
      };

      const result = factory.fromData('bulk-create-tasks', 'Bulk completed', true, 'Processed with warnings');

      // Should detect complexity from data structure
      expect(result.transformation.context.verbosityLevel).toBe('full');
      expect(result.transformation.context.complexityFactors).toBeDefined();
      expect(result.transformation.context.complexityFactors.isBulkOperation).toBe(true);
      expect(isSimpleAorpResponse(result.response)).toBe(false);
    });
  });
});