/**
 * AORP Factory Tests
 * Tests the factory integration and response conversion functionality
 */

import { AorpResponseFactory } from '../../src/aorp/factory';
// Legacy OptimizedResponse interface for testing conversion functionality
interface LegacyOptimizedResponse<T> {
  success: boolean;
  operation: string;
  message: string;
  data: T;
  metadata: {
    timestamp: string;
    count?: number;
    optimization?: {
      verbosity: string;
      sizeMetrics: {
        originalSize: number;
        optimizedSize: number;
        reductionPercentage: number;
      };
      fieldMetrics: {
        fieldsIncluded: number;
        totalFields: number;
        inclusionPercentage: number;
      };
      performance: {
        transformationTimeMs: number;
        totalTimeMs: number;
      };
      categoriesIncluded: string[];
    };
  };
}
import type { Verbosity } from '../../src/transforms/base';

describe('AorpResponseFactory', () => {
  let factory: AorpResponseFactory;
  let mockOptimizedResponse: LegacyOptimizedResponse<any>;

  beforeEach(() => {
    factory = new AorpResponseFactory();
    mockOptimizedResponse = {
      success: true,
      operation: 'test_operation',
      message: 'Test operation successful',
      data: { id: 123, title: 'Test Task', description: 'Test description' },
      metadata: {
        timestamp: '2024-01-01T00:00:00Z',
        count: 1,
        optimization: {
          verbosity: 'standard' as Verbosity,
          sizeMetrics: {
            originalSize: 500,
            optimizedSize: 300,
            reductionPercentage: 40
          },
          fieldMetrics: {
            fieldsIncluded: 8,
            totalFields: 15,
            inclusionPercentage: 53.33
          },
          performance: {
            transformationTimeMs: 50,
            totalTimeMs: 100
          },
          categoriesIncluded: ['core', 'context']
        }
      }
    };
  });

  describe('Factory Configuration', () => {
    test('should create factory with default configuration', () => {
      expect(factory).toBeInstanceOf(AorpResponseFactory);
    });

    test('should create factory with custom configuration', () => {
      const customFactory = new AorpResponseFactory({
        builderConfig: {
          confidenceMethod: 'simple',
          enableNextSteps: true // AORP always enabled
        },
        nextStepsConfig: {
          maxSteps: 3
        },
        includeDebug: true
      });

      expect(customFactory).toBeInstanceOf(AorpResponseFactory);
    });

    test('should update default options', () => {
      factory.updateDefaultOptions({
        builderConfig: {
          confidenceMethod: 'weighted'
        }
      });

      const config = factory.getDefaultOptions();
      expect(config.builderConfig?.confidenceMethod).toBe('weighted');
    });
  });

  describe('From Optimized Response', () => {
    test('should convert optimized response to AORP format', () => {
      const result = factory.fromOptimizedResponse(mockOptimizedResponse);

      expect(result.response).toBeDefined();
      expect(result.transformation).toBeDefined();
      expect(result.response.immediate.status).toBe('success');
      expect(result.response.immediate.confidence).toBeGreaterThan(0);
      expect(result.response.actionable.next_steps.length).toBeGreaterThan(0);
      expect(result.response.quality.completeness).toBeGreaterThan(0);
      expect(result.response.details.summary).toBeDefined();
    });

    test('should handle failed optimized response', () => {
      const failedResponse = {
        ...mockOptimizedResponse,
        success: false,
        message: 'Operation failed'
      };

      const result = factory.fromOptimizedResponse(failedResponse);

      expect(result.response.immediate.status).toBe('error');
      expect(result.response.immediate.key_insight).toContain('failed');
      expect(result.response.quality.reliability).toBeLessThan(0.8);
    });

    test('should include transformation metadata', () => {
      const result = factory.fromOptimizedResponse(mockOptimizedResponse);

      expect(result.transformation.originalResponse).toBe(mockOptimizedResponse);
      expect(result.transformation.context.operation).toBe('test_operation');
      expect(result.transformation.context.success).toBe(true);
      expect(result.transformation.context.dataSize).toBeGreaterThan(0);
      expect(result.transformation.metrics.aorpProcessingTime).toBeGreaterThanOrEqual(0);
      expect(result.transformation.metrics.totalTime).toBeGreaterThanOrEqual(0);
    });

    test('should apply custom options', () => {
      const customOptions = {
        sessionId: 'custom-session-123',
        includeDebug: true,
        builderConfig: {
          confidenceMethod: 'simple' as const
        }
      };

      const result = factory.fromOptimizedResponse(mockOptimizedResponse, customOptions);

      expect(result.response.immediate.session_id).toBe('custom-session-123');
      expect(result.response.details.debug).toBeDefined();
      expect(result.response.immediate.confidence).toBe(0.9); // Simple method for success
    });
  });

  describe('From Raw Data', () => {
    test('should create AORP response from raw data', () => {
      const result = factory.fromData('create', 'Task created successfully', true, 'Task created');

      expect(result.response.immediate.status).toBe('success');
      expect(result.response.immediate.key_insight).toContain('Successfully created');
      expect(result.response.details.summary).toContain('Task created');
      expect(result.transformation.context.operation).toBe('create');
    });

    test('should handle error data', () => {
      const result = factory.fromData('delete', 'Delete failed - resource not found', false, 'Delete failed');

      expect(result.response.immediate.status).toBe('error');
      expect(result.response.details.summary).toContain('Delete failed');
      expect(result.transformation.context.success).toBe(false);
    });

    test('should handle array data', () => {
      const summary = 'Retrieved 2 tasks';

      const result = factory.fromData('list', summary, true, 'Tasks retrieved');

      expect(result.response.details.summary).toContain('tasks');
      expect(result.transformation.context.dataSize).toBe(1); // Summary is a string (primitive)
    });
  });

  describe('From Error', () => {
    test('should create AORP response from error', () => {
      const testError = new Error('Test error message');
      testError.name = 'TestError';

      const result = factory.fromError('update', testError);

      expect(result.response.immediate.status).toBe('error');
      expect(result.response.immediate.key_insight).toContain('Test error message');
      expect(result.response.details.summary).toContain('Test error message');
      expect(result.transformation.context.errors).toContain('Test error message');
    });

    test('should handle string errors', () => {
      const result = factory.fromError('process', 'Simple error string');

      expect(result.response.immediate.status).toBe('error');
      expect(result.response.immediate.key_insight).toBe('Operation failed: Simple error string');
    });

    test('should handle object errors', () => {
      const objectError = {
        message: 'Object error',
        code: 'ERR_001',
        details: { field: 'value' }
      };

      const result = factory.fromError('validate', objectError);

      expect(result.response.immediate.status).toBe('error');
      expect(result.response.immediate.key_insight).toBe('Operation failed: Object error');
    });
  });

  describe('Context Creation', () => {
    test('should create transformation context correctly', () => {
      const result = factory.fromOptimizedResponse(mockOptimizedResponse);
      const context = result.transformation.context;

      expect(context.operation).toBe('test_operation');
      expect(context.success).toBe(true);
      expect(context.verbosity).toBe('standard');
      expect(context.processingTime).toBe(50);
      expect(context.sizeMetrics).toBeDefined();
      expect(context.fieldMetrics).toBeDefined();
    });

    test('should handle response without optimization metadata', () => {
      const basicResponse = {
        success: true,
        operation: 'basic',
        message: 'Basic response',
        data: { test: true },
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          count: 1
        }
      };

      const result = factory.fromOptimizedResponse(basicResponse);
      const context = result.transformation.context;

      expect(context.verbosity).toBe('standard');
      expect(context.processingTime).toBe(0);
    });

    test('should include errors in context', () => {
      const result = factory.fromError('test', new Error('Test error'));
      const context = result.transformation.context;

      expect(context.errors).toContain('Test error');
    });
  });

  describe('Key Insight Generation', () => {
    test('should generate appropriate key insights for different operations', () => {
      const operations = ['create', 'update', 'delete', 'list', 'get'];
      const expectedInsights = [
        'Successfully created new resource',
        'Successfully updated resource',
        'Successfully deleted resource',
        'Found',
        'Successfully retrieved resource details'
      ];

      operations.forEach((op, index) => {
        const response = { ...mockOptimizedResponse, operation: op };
        const result = factory.fromOptimizedResponse(response);
        expect(result.response.immediate.key_insight).toContain(expectedInsights[index]);
      });
    });

    test('should handle list operation with zero results', () => {
      const emptyResponse = {
        ...mockOptimizedResponse,
        operation: 'list',
        data: [],
        metadata: { ...mockOptimizedResponse.metadata, count: 0 }
      };

      const result = factory.fromOptimizedResponse(emptyResponse);
      expect(result.response.immediate.key_insight).toContain('No resources found');
    });

    test('should handle list operation with single result', () => {
      const singleResponse = {
        ...mockOptimizedResponse,
        operation: 'list',
        data: [{ id: 1 }],
        metadata: { ...mockOptimizedResponse.metadata, count: 1 }
      };

      const result = factory.fromOptimizedResponse(singleResponse);
      expect(result.response.immediate.key_insight).toContain('Found 1 resource');
    });

    test('should handle list operation with multiple results', () => {
      const multiResponse = {
        ...mockOptimizedResponse,
        operation: 'list',
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        metadata: { ...mockOptimizedResponse.metadata, count: 3 }
      };

      const result = factory.fromOptimizedResponse(multiResponse);
      expect(result.response.immediate.key_insight).toContain('Found 3 resources');
    });
  });

  describe('Data Size Estimation', () => {
    test('should estimate size for different data types', () => {
      const testCases = [
        { data: null, expectedSize: 0 },
        { data: undefined, expectedSize: 0 },
        { data: 'string', expectedSize: 1 },
        { data: 123, expectedSize: 1 },
        { data: true, expectedSize: 1 },
        { data: [1, 2, 3], expectedSize: 3 },
        { data: { a: 1, b: 2 }, expectedSize: 2 }
      ];

      testCases.forEach(({ data, expectedSize }) => {
        const response = { ...mockOptimizedResponse, data };
        const result = factory.fromOptimizedResponse(response);
        expect(result.transformation.context.dataSize).toBe(expectedSize);
      });
    });
  });

  describe('Static Factory Methods', () => {
    test('should create factory for specific operations', () => {
      const taskFactory = AorpResponseFactory.forOperations([
        'tasks_create',
        'tasks_update',
        'tasks_list'
      ]);

      expect(taskFactory).toBeInstanceOf(AorpResponseFactory);
    });

    test('should create specialized factory with operation-specific templates', () => {
      const taskFactory = AorpResponseFactory.forOperations(['tasks_create']);
      const response = { ...mockOptimizedResponse, operation: 'tasks_create' };
      const result = taskFactory.fromOptimizedResponse(response);

      // With data-driven insights, we should get specific information about the operation
      expect(result.response.actionable.next_steps.length).toBeGreaterThan(0);
      expect(result.response.actionable.next_steps[0]).toContain('3 items');
    });
  });

  describe('Performance Metrics', () => {
    test('should track AORP processing time', () => {
      const startTime = Date.now();
      const result = factory.fromOptimizedResponse(mockOptimizedResponse);
      const endTime = Date.now();

      expect(result.transformation.metrics.aorpProcessingTime).toBeGreaterThanOrEqual(0);
      expect(result.transformation.metrics.aorpProcessingTime).toBeLessThan(endTime - startTime + 100); // Allow some margin
    });

    test('should calculate total processing time correctly', () => {
      const result = factory.fromOptimizedResponse(mockOptimizedResponse);

      expect(result.transformation.metrics.totalTime).toBe(
        mockOptimizedResponse.metadata.optimization!.performance.totalTimeMs +
        result.transformation.metrics.aorpProcessingTime
      );
    });
  });

  describe('Integration with Optimization', () => {
    test('should work with optimized responses with different verbosity levels', () => {
      const verbosities: Verbosity[] = ['minimal', 'standard', 'detailed', 'complete'];

      verbosities.forEach(verbosity => {
        const response = {
          ...mockOptimizedResponse,
          metadata: {
            ...mockOptimizedResponse.metadata,
            optimization: {
              ...mockOptimizedResponse.metadata.optimization!,
              verbosity
            }
          }
        };

        const result = factory.fromOptimizedResponse(response);
        expect(result.transformation.context.verbosity).toBe(verbosity);
      });
    });

    test('should handle responses without optimization metadata', () => {
      const nonOptimizedResponse = {
        success: true,
        operation: 'test',
        message: 'Test',
        data: { test: true },
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          count: 1
        }
      };

      const result = factory.fromOptimizedResponse(nonOptimizedResponse);

      expect(result.response).toBeDefined();
      expect(result.transformation.context.verbosity).toBe('standard');
    });
  });
});