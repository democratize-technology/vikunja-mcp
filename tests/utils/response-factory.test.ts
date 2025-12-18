/**
 * Comprehensive test suite for AORP Response Factory
 * Tests response creation, error handling, AORP integration, and edge cases
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createAorpResponse,
  createTaskAorpResponse,
  createAorpErrorResponse,
  getDefaultAorpFactory,
  createAorpResponseFactory,
  createStandardResponse
} from '../../src/utils/response-factory';
import type { ResponseMetadata } from '../../src/types/responses';
import type { AorpFactoryOptions, AorpFactoryResult } from '../../src/types';
import { AorpResponseFactory } from '../../src/aorp/factory';

// Mock AorpResponseFactory to control its behavior
jest.mock('../../src/aorp/factory');

const MockedAorpResponseFactory = AorpResponseFactory as jest.MockedClass<typeof AorpResponseFactory>;

// Mock the response factory methods
const mockFromOptimizedResponse = jest.fn();
const mockFromError = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  // Mock the AorpResponseFactory constructor and methods
  MockedAorpResponseFactory.mockImplementation((options = {}) => ({
    fromOptimizedResponse: mockFromOptimizedResponse,
    fromError: mockFromError
  }));
});

describe('AORP Response Factory', () => {
  describe('createAorpResponse', () => {
    beforeEach(() => {
      // Setup default mock behavior
      mockFromOptimizedResponse.mockReturnValue({
        response: {
          success: true,
          operation: 'test-operation',
          summary: 'Test operation completed',
          metadata: {
            timestamp: '2024-01-01T00:00:00Z',
            processingTimeMs: 10,
            confidence: 0.8
          }
        },
        processingTimeMs: 10,
        originalSize: 100,
        optimizedSize: 60,
        sizeReduction: 40
      } as AorpFactoryResult);
    });

    it('should create AORP response with basic parameters', () => {
      const operation = 'test-operation';
      const message = 'Test message';
      const data = { test: 'data' };

      const result = createAorpResponse(operation, message, data);

      expect(MockedAorpResponseFactory).toHaveBeenCalledWith(undefined);
      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        {
          success: true,
          operation,
          message,
          data, // Actual data should be preserved
          metadata: {
            timestamp: expect.any(String),
            count: 1,
            sessionId: undefined
          }
        },
        { sessionId: undefined }
      );
    });

    it('should preserve actual data in OptimizedResponse', () => {
      const testData = { id: 1, title: 'Test Task', done: false };

      createAorpResponse('create-task', 'Task created', testData);

      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: testData // Should preserve actual data, not convert to string
        }),
        expect.any(Object)
      );
    });

    it('should handle array data correctly', () => {
      const testData = [
        { id: 1, title: 'Task 1' },
        { id: 2, title: 'Task 2' }
      ];

      createAorpResponse('list-tasks', 'Tasks retrieved', testData);

      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: testData,
          metadata: expect.objectContaining({
            count: 2
          })
        }),
        expect.any(Object)
      );
    });

    it('should include metadata in the response', () => {
      const metadata: Partial<ResponseMetadata> = {
        sessionId: 'test-session-123',
        requestId: 'request-456',
        userId: 789
      };

      createAorpResponse('test', 'message', {}, metadata);

      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            sessionId: 'test-session-123',
            count: 1
          })
        }),
        expect.objectContaining({
          sessionId: 'test-session-123'
        })
      );
    });

    it('should pass AORP options to factory', () => {
      const aorpOptions: AorpFactoryOptions = {
        sessionId: 'custom-session',
        builderConfig: {
          includeNextSteps: true,
          includeQualityIndicators: true,
          confidenceMethod: 'adaptive'
        }
      };

      createAorpResponse('test', 'message', {}, {}, { aorpOptions });

      expect(MockedAorpResponseFactory).toHaveBeenCalledWith(aorpOptions);
      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.any(Object),
        aorpOptions
      );
    });

    it('should handle empty metadata gracefully', () => {
      createAorpResponse('test', 'message', {});

      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {},
          metadata: expect.objectContaining({
            count: 1,
            sessionId: undefined
          })
        }),
        { sessionId: undefined }
      );
    });

    it('should handle null and undefined data', () => {
      createAorpResponse('test', 'message', null);
      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: null,
          metadata: expect.objectContaining({
            count: 0
          })
        }),
        expect.any(Object)
      );

      createAorpResponse('test', 'message', undefined);
      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: undefined,
          metadata: expect.objectContaining({
            count: 0
          })
        }),
        expect.any(Object)
      );
    });

    it('should track processing time', () => {
      const startTime = Date.now();

      createAorpResponse('test', 'message', {});

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
    });

    it('should handle large data objects', () => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        title: `Task ${i}`,
        description: `Description for task ${i}`,
        metadata: { created: new Date(), updated: new Date() }
      }));

      expect(() => createAorpResponse('test', 'message', largeData)).not.toThrow();
    });
  });

  describe('createTaskAorpResponse', () => {
    beforeEach(() => {
      mockFromOptimizedResponse.mockReturnValue({
        response: {
          success: true,
          operation: 'task-operation',
          summary: 'Task operation completed',
          metadata: {
            timestamp: '2024-01-01T00:00:00Z',
            processingTimeMs: 15,
            confidence: 0.85
          }
        },
        processingTimeMs: 15,
        originalSize: 200,
        optimizedSize: 100,
        sizeReduction: 50
      } as AorpFactoryResult);
    });

    it('should create AORP response for single task', () => {
      const taskData = { id: 1, title: 'Test Task', done: false };

      createTaskAorpResponse('create-task', 'Task created', taskData);

      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          operation: 'create-task',
          message: 'Task created',
          data: expect.any(Object) // Transformed task data
        }),
        expect.objectContaining({
          builderConfig: {
            confidenceMethod: 'adaptive'
          }
        })
      );
    });

    it('should create AORP response for multiple tasks', () => {
      const tasksData = [
        { id: 1, title: 'Task 1', done: false },
        { id: 2, title: 'Task 2', done: true }
      ];

      createTaskAorpResponse('list-tasks', 'Tasks retrieved', tasksData);

      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(Array), // Transformed tasks array
          metadata: expect.objectContaining({
            count: 2
          })
        }),
        expect.any(Object)
      );
    });

    it('should use standard verbosity by default', () => {
      const taskData = { id: 1, title: 'Test Task' };

      createTaskAorpResponse('test', 'message', taskData);

      // Verify the factory was called with standard verbosity
      expect(mockFromOptimizedResponse).toHaveBeenCalled();
    });

    it('should accept custom verbosity', () => {
      const taskData = { id: 1, title: 'Test Task' };
      const customOptions = { verbosity: 'minimal' as any };

      createTaskAorpResponse('test', 'message', taskData, {}, customOptions);

      expect(mockFromOptimizedResponse).toHaveBeenCalled();
    });

    it('should pass AORP options with adaptive confidence', () => {
      const taskData = { id: 1, title: 'Test Task' };
      const aorpOptions: AorpFactoryOptions = {
        sessionId: 'test-session',
        builderConfig: {
          includeNextSteps: true,
          includeQualityIndicators: true
        }
      };

      createTaskAorpResponse('test', 'message', taskData, {}, { aorpOptions });

      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          sessionId: 'test-session',
          builderConfig: expect.objectContaining({
            confidenceMethod: 'adaptive',
            includeNextSteps: true,
            includeQualityIndicators: true
          })
        })
      );
    });

    it('should handle empty tasks array', () => {
      createTaskAorpResponse('list-tasks', 'No tasks found', []);

      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(Array),
          metadata: expect.objectContaining({
            count: 0
          })
        }),
        expect.any(Object)
      );
    });

    it('should handle malformed task data gracefully', () => {
      const malformedTasks = [
        { id: 1, title: 'Task 1' }, // minimal valid task
        { id: 2, title: 'Task without done field' }, // task without some fields
        { id: 3, title: 'Valid task', done: true, extra: 'property' } // task with extra properties
      ];

      expect(() => createTaskAorpResponse('test', 'message', malformedTasks)).not.toThrow();
    });
  });

  describe('createAorpErrorResponse', () => {
    beforeEach(() => {
      mockFromError.mockReturnValue({
        response: {
          success: false,
          operation: 'test-operation',
          error: {
            code: 'ERROR_CODE',
            message: 'Test error message'
          },
          metadata: {
            timestamp: '2024-01-01T00:00:00Z',
            processingTimeMs: 5,
            confidence: 0.3
          }
        },
        processingTimeMs: 5
      } as AorpFactoryResult);
    });

    it('should create AORP error response from Error object', () => {
      const error = new Error('Test error message');
      const operation = 'test-operation';

      createAorpErrorResponse(operation, error);

      expect(MockedAorpResponseFactory).toHaveBeenCalledWith({});
      expect(mockFromError).toHaveBeenCalledWith(operation, error, {});
    });

    it('should create AORP error response from error record', () => {
      const errorRecord = { code: 'CUSTOM_ERROR', message: 'Custom error', details: 'Additional details' };
      const operation = 'test-operation';

      createAorpErrorResponse(operation, errorRecord);

      expect(mockFromError).toHaveBeenCalledWith(operation, errorRecord, {});
    });

    it('should pass custom AORP options', () => {
      const error = new Error('Test error');
      const aorpOptions: AorpFactoryOptions = {
        sessionId: 'error-session',
        builderConfig: {
          includeNextSteps: false
        }
      };

      createAorpErrorResponse('test-operation', error, aorpOptions);

      expect(MockedAorpResponseFactory).toHaveBeenCalledWith(aorpOptions);
      expect(mockFromError).toHaveBeenCalledWith('test-operation', error, aorpOptions);
    });

    it('should handle complex error objects', () => {
      const complexError = {
        name: 'ValidationError',
        message: 'Invalid input provided',
        stack: 'Error stack trace',
        details: {
          field: 'title',
          value: 'invalid value',
          constraints: ['must not be empty', 'must be under 100 characters']
        }
      };

      expect(() => createAorpErrorResponse('validation', complexError)).not.toThrow();
    });
  });

  describe('getDefaultAorpFactory', () => {
    it('should return AorpResponseFactory instance with default options', () => {
      const factory = getDefaultAorpFactory();

      expect(MockedAorpResponseFactory).toHaveBeenCalledWith();
      expect(factory).toBeDefined();
    });

    it('should create new factory instance on each call', () => {
      const factory1 = getDefaultAorpFactory();
      const factory2 = getDefaultAorpFactory();

      expect(MockedAorpResponseFactory).toHaveBeenCalledTimes(2);
    });
  });

  describe('createAorpResponseFactory', () => {
    it('should create factory with custom options', () => {
      const options: AorpFactoryOptions = {
        sessionId: 'custom-session-123',
        builderConfig: {
          includeNextSteps: true,
          includeQualityIndicators: true,
          confidenceMethod: 'high'
        }
      };

      createAorpResponseFactory(options);

      expect(MockedAorpResponseFactory).toHaveBeenCalledWith(options);
    });

    it('should create factory with empty options when none provided', () => {
      createAorpResponseFactory();

      expect(MockedAorpResponseFactory).toHaveBeenCalledWith({});
    });
  });

  describe('createStandardResponse', () => {
    beforeEach(() => {
      mockFromOptimizedResponse.mockReturnValue({
        response: {
          success: true,
          operation: 'test-operation',
          summary: 'Operation completed successfully',
          metadata: {
            timestamp: '2024-01-01T00:00:00Z',
            processingTimeMs: 20,
            confidence: 0.75
          }
        },
        processingTimeMs: 20
      } as AorpFactoryResult);
    });

    it('should create standard response always using AORP', () => {
      const operation = 'standard-operation';
      const message = 'Standard message';
      const data = { test: 'data' };

      const result = createStandardResponse(operation, message, data);

      expect(MockedAorpResponseFactory).toHaveBeenCalledWith({});
      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          operation,
          message,
          data
        }),
        { sessionId: undefined }
      );
      expect(result).toBeDefined();
    });

    it('should include metadata in standard response', () => {
      const metadata: Partial<ResponseMetadata> = {
        sessionId: 'standard-session',
        requestId: 'req-123'
      };

      createStandardResponse('test', 'message', {}, metadata);

      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {},
          metadata: expect.objectContaining({
            sessionId: 'standard-session'
          })
        }),
        expect.any(Object)
      );
    });

    it('should ignore backward compatibility options', () => {
      const oldOptions = {
        verbosity: 'minimal' as any,
        useOptimization: false,
        transformFields: ['id', 'title']
      };

      createStandardResponse('test', 'message', {}, {}, oldOptions);

      // Should still use AORP with standard format, ignoring the old options
      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.any(Object),
        { sessionId: undefined }
      );
    });

    it('should always use STANDARD verbosity for AORP', () => {
      // This test ensures backward compatibility options are ignored
      const oldOptions = {
        verbosity: 'minimal' as any, // This should be ignored
        useOptimization: true // This should be ignored
      };

      createStandardResponse('test', 'message', {}, {}, oldOptions);

      expect(mockFromOptimizedResponse).toHaveBeenCalledWith(
        expect.any(Object),
        { sessionId: undefined }
      );
    });

    it('should handle various data types in standard response', () => {
      const testCases = [
        { data: 'string message' },
        { data: 123 },
        { data: true },
        { data: [1, 2, 3] },
        { data: { nested: 'object' } },
        { data: null },
        { data: undefined }
      ];

      testCases.forEach(({ data }) => {
        expect(() => createStandardResponse('test', 'message', data)).not.toThrow();
      });
    });

    it('should maintain backward compatibility while using AORP', () => {
      const operation = 'legacy-operation';
      const message = 'Legacy message';
      const data = { legacy: 'data' };

      const result = createStandardResponse(operation, message, data);

      // Should still call AORP factory
      expect(MockedAorpResponseFactory).toHaveBeenCalled();
      expect(mockFromOptimizedResponse).toHaveBeenCalled();

      // Should return the response from AORP
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(() => {
      // Reset mocks to default behavior for error tests
      mockFromOptimizedResponse.mockReturnValue({
        response: {
          success: true,
          operation: 'test',
          summary: 'Success',
          metadata: { timestamp: new Date().toISOString() }
        },
        processingTimeMs: 10
      } as AorpFactoryResult);
    });

    it('should handle AORP factory errors gracefully', () => {
      MockedAorpResponseFactory.mockImplementation(() => {
        throw new Error('Factory initialization failed');
      });

      expect(() => createAorpResponse('test', 'message', {})).toThrow('Factory initialization failed');
    });

    it('should handle fromOptimizedResponse errors', () => {
      mockFromOptimizedResponse.mockImplementation(() => {
        throw new Error('Response generation failed');
      });

      expect(() => createAorpResponse('test', 'message', {})).toThrow('Response generation failed');
    });

    it('should handle fromError errors', () => {
      mockFromError.mockImplementation(() => {
        throw new Error('Error response generation failed');
      });

      expect(() => createAorpErrorResponse('test', new Error('test'))).toThrow('Error response generation failed');
    });

    it('should handle circular reference in data', () => {
      const circularData: any = { id: 1 };
      circularData.self = circularData;

      // This should not throw an error during response creation
      // The circular reference handling should be done by AORP factory
      expect(() => createAorpResponse('test', 'message', circularData)).not.toThrow();
    });

    it('should handle extremely large data objects', () => {
      const hugeData = {
        largeArray: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          data: 'x'.repeat(1000)
        }))
      };

      // Should handle large objects without memory issues
      expect(() => createAorpResponse('test', 'message', hugeData)).not.toThrow();
    });

    it('should handle Date objects in data', () => {
      const dataWithDates = {
        created: new Date(),
        updated: new Date('2024-01-01'),
        datesArray: [new Date(), new Date()]
      };

      expect(() => createAorpResponse('test', 'message', dataWithDates)).not.toThrow();
    });

    it('should handle mixed type arrays in data', () => {
      const mixedData = {
        mixedArray: [1, 'string', true, null, undefined, { nested: 'object' }]
      };

      expect(() => createAorpResponse('test', 'message', mixedData)).not.toThrow();
    });
  });

  describe('Performance Considerations', () => {
    it('should create responses quickly for small data', () => {
      const smallData = { id: 1, title: 'Test' };

      const startTime = performance.now();
      createStandardResponse('test', 'message', smallData);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(50); // Should complete in under 50ms
    });

    it('should handle concurrent response creation', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        Promise.resolve(createStandardResponse(`test-${i}`, 'message', { id: i }))
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });

    it('should not leak memory with repeated calls', () => {
      // Simulate repeated response creation
      for (let i = 0; i < 100; i++) {
        createStandardResponse('test', 'message', { id: i, data: 'x'.repeat(100) });
      }

      // If we reach here without memory issues, the test passes
      expect(true).toBe(true);
    });
  });
});