/**
 * Tests for size calculator functionality
 * Ensures comprehensive coverage of size metrics calculation and performance tracking
 */

import { SizeCalculator, calculateSizeMetrics, calculateResponseMetrics, estimateSize, calculateReduction } from '../../src/transforms/size-calculator';
import { Verbosity } from '../../src/transforms/base';
import type { TransformationResult } from '../../src/transforms/base';

describe('Size Calculator', () => {
  let sizeCalculator: SizeCalculator;
  let mockTransformationResult: TransformationResult;
  let mockOptimizedResponse: any;

  beforeEach(() => {
    sizeCalculator = new SizeCalculator();

    mockTransformationResult = {
      data: [
        { id: 1, title: 'Task 1', done: false },
        { id: 2, title: 'Task 2', done: true }
      ],
      metrics: {
        originalSize: 1000,
        optimizedSize: 600,
        reductionPercentage: 40,
        fieldsIncluded: 6,
        totalFields: 10,
        fieldInclusionPercentage: 60
      },
      metadata: {
        verbosity: Verbosity.STANDARD,
        categoriesIncluded: ['core', 'context'],
        timestamp: '2024-01-01T00:00:00.000Z',
        processingTimeMs: 5
      }
    };

    mockOptimizedResponse = {
      success: true,
      operation: 'list_tasks',
      message: 'Tasks retrieved successfully',
      data: mockTransformationResult.data,
      metadata: {
        timestamp: '2024-01-01T00:00:00.000Z',
        count: 2,
        optimization: {
          verbosity: Verbosity.STANDARD,
          sizeMetrics: {
            originalSize: 1000,
            optimizedSize: 600,
            reductionPercentage: 40
          },
          fieldMetrics: {
            fieldsIncluded: 6,
            totalFields: 10,
            inclusionPercentage: 60
          },
          performance: {
            transformationTimeMs: 5,
            totalTimeMs: 10
          },
          categoriesIncluded: ['core', 'context']
        }
      }
    };
  });

  describe('calculateMetrics', () => {
    it('should calculate size metrics from transformation result', () => {
      const result = sizeCalculator.calculateMetrics(mockTransformationResult);

      expect(result.metrics.originalSize).toBe(1000);
      expect(result.metrics.optimizedSize).toBe(600);
      expect(result.metrics.reductionPercentage).toBe(40);
      expect(result.metrics.reductionAbsolute).toBe(400);
      expect(result.metrics.compressionRatio).toBeCloseTo(1.67, 1);
      expect(result.metrics.fieldsReduced).toBe(4);
      expect(result.metrics.bytesSavedPerField).toBeCloseTo(66.67, 1);
    });

    it('should track performance metrics', () => {
      const result = sizeCalculator.calculateMetrics(mockTransformationResult);

      expect(result.performance.calculationTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.performance.fieldsProcessed).toBe(10);
      expect(result.performance.objectsProcessed).toBe(2);
      expect(result.performance.averageProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include breakdown analysis', () => {
      const result = sizeCalculator.calculateMetrics(mockTransformationResult);

      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.byField).toBeDefined();
      expect(result.breakdown.byCategory).toBeDefined();
      expect(result.breakdown.byType).toBeDefined();
    });

    it('should handle zero original size gracefully', () => {
      const zeroSizeResult = {
        ...mockTransformationResult,
        metrics: {
          ...mockTransformationResult.metrics,
          originalSize: 0,
          optimizedSize: 0
        }
      };

      const result = sizeCalculator.calculateMetrics(zeroSizeResult);

      expect(result.metrics.compressionRatio).toBe(1);
      expect(result.metrics.bytesSavedPerField).toBe(0);
    });

    it('should handle single object data', () => {
      const singleObjectResult = {
        ...mockTransformationResult,
        data: { id: 1, title: 'Single Task', done: false }
      };

      const result = sizeCalculator.calculateMetrics(singleObjectResult);

      expect(result.performance.objectsProcessed).toBe(1);
      expect(result.breakdown.byField).toBeDefined();
    });

    it('should store calculation in history', () => {
      expect(sizeCalculator.getHistory()).toHaveLength(0);

      sizeCalculator.calculateMetrics(mockTransformationResult);

      expect(sizeCalculator.getHistory()).toHaveLength(1);
      expect(sizeCalculator.getHistory()[0].timestamp).toBeDefined();
    });
  });

  describe('calculateResponseMetrics', () => {
    it('should calculate metrics from optimized response', () => {
      const result = sizeCalculator.calculateResponseMetrics(mockOptimizedResponse);

      expect(result.metrics.originalSize).toBe(1000);
      expect(result.metrics.optimizedSize).toBe(600);
      expect(result.metrics.reductionPercentage).toBe(40);
      expect(result.metrics.reductionAbsolute).toBe(400);
    });

    it('should throw error for response without optimization metadata', () => {
      const responseWithoutOptimization = {
        ...mockOptimizedResponse,
        metadata: {
          timestamp: '2024-01-01T00:00:00.000Z',
          count: 2
        }
      };

      expect(() => {
        sizeCalculator.calculateResponseMetrics(responseWithoutOptimization);
      }).toThrow('Response does not contain optimization metadata');
    });

    it('should calculate field metrics from response', () => {
      const result = sizeCalculator.calculateResponseMetrics(mockOptimizedResponse);

      expect(result.metrics.fieldsReduced).toBe(4);
      expect(result.metrics.bytesSavedPerField).toBeCloseTo(66.67, 1);
    });

    it('should handle response with single object', () => {
      const singleObjectResponse = {
        ...mockOptimizedResponse,
        data: { id: 1, title: 'Single Task' }
      };

      const result = sizeCalculator.calculateResponseMetrics(singleObjectResponse);

      expect(result.performance.objectsProcessed).toBe(1);
    });
  });

  describe('Breakdown Analysis', () => {
    it('should analyze object fields correctly', () => {
      const result = sizeCalculator.calculateMetrics(mockTransformationResult);

      expect(result.breakdown.byField).toBeDefined();
      expect(result.breakdown.byType).toBeDefined();

      // Should track field sizes
      expect(Object.keys(result.breakdown.byField)).toContain('id');
      expect(Object.keys(result.breakdown.byField)).toContain('title');
      expect(Object.keys(result.breakdown.byField)).toContain('done');

      // Should track type information (either object or array based on data structure)
      expect(Object.keys(result.breakdown.byType).length).toBeGreaterThan(0);
    });

    it('should handle different data types in breakdown', () => {
      const complexData = {
        id: 1,
        title: 'Test',
        tags: ['urgent', 'important'],
        metadata: { priority: 1, category: 'work' },
        count: 42,
        active: true,
        created: '2024-01-01T00:00:00Z'
      };

      const complexResult = {
        ...mockTransformationResult,
        data: complexData
      };

      const result = sizeCalculator.calculateMetrics(complexResult);

      expect(result.breakdown.byType.number).toBeDefined();
      expect(result.breakdown.byType.string).toBeDefined();
      expect(result.breakdown.byType.boolean).toBeDefined();
      expect(result.breakdown.byType.array).toBeDefined();
      expect(result.breakdown.byType.object).toBeDefined();
    });

    it('should handle null and undefined values in breakdown', () => {
      const dataWithNulls = {
        id: 1,
        title: 'Test',
        description: null,
        metadata: undefined,
        completed: false
      };

      const resultWithDataWithNulls = {
        ...mockTransformationResult,
        data: dataWithNulls
      };

      expect(() => {
        sizeCalculator.calculateMetrics(resultWithDataWithNulls);
      }).not.toThrow();
    });
  });

  describe('History Management', () => {
    it('should maintain calculation history', () => {
      // Add multiple calculations
      for (let i = 0; i < 5; i++) {
        sizeCalculator.calculateMetrics(mockTransformationResult);
      }

      const history = sizeCalculator.getHistory();
      expect(history).toHaveLength(5);

      // Check that all entries have required fields
      history.forEach(entry => {
        expect(entry.timestamp).toBeDefined();
        expect(entry.metrics).toBeDefined();
        expect(entry.performance).toBeDefined();
        expect(entry.breakdown).toBeDefined();
      });
    });

    it('should limit history size', () => {
      const maxSize = 100;
      const customCalculator = new SizeCalculator();

      // Add more calculations than the max history size
      for (let i = 0; i < maxSize + 50; i++) {
        customCalculator.calculateMetrics(mockTransformationResult);
      }

      expect(customCalculator.getHistory()).toHaveLength(maxSize);
    });

    it('should clear history', () => {
      sizeCalculator.calculateMetrics(mockTransformationResult);
      expect(sizeCalculator.getHistory()).toHaveLength(1);

      sizeCalculator.clearHistory();
      expect(sizeCalculator.getHistory()).toHaveLength(0);
    });
  });

  describe('Average Metrics', () => {
    it('should calculate average metrics from history', () => {
      // Add calculations with different metrics
      const results = [
        { ...mockTransformationResult, metrics: { ...mockTransformationResult.metrics, reductionPercentage: 20 } },
        { ...mockTransformationResult, metrics: { ...mockTransformationResult.metrics, reductionPercentage: 40 } },
        { ...mockTransformationResult, metrics: { ...mockTransformationResult.metrics, reductionPercentage: 60 } }
      ];

      results.forEach(result => sizeCalculator.calculateMetrics(result));

      const averages = sizeCalculator.getAverageMetrics();

      expect(averages.averageReduction).toBe(40);
      expect(averages.totalFieldsProcessed).toBe(30); // 3 results * 10 fields each
      expect(averages.totalObjectsProcessed).toBe(6); // 3 results * 2 objects each
      expect(averages.totalBytesSaved).toBe(1200); // (200 + 400 + 600)
    });

    it('should handle empty history gracefully', () => {
      const averages = sizeCalculator.getAverageMetrics();

      expect(averages.averageReduction).toBe(0);
      expect(averages.averageCompressionRatio).toBe(1);
      expect(averages.totalFieldsProcessed).toBe(0);
      expect(averages.totalObjectsProcessed).toBe(0);
      expect(averages.totalBytesSaved).toBe(0);
    });

    it('should calculate compression ratio average correctly', () => {
      const results = [
        mockTransformationResult, // compressionRatio ~1.67
        {
          ...mockTransformationResult,
          metrics: { ...mockTransformationResult.metrics, originalSize: 800, optimizedSize: 400 } // compressionRatio 2.0
        }
      ];

      results.forEach(result => sizeCalculator.calculateMetrics(result));

      const averages = sizeCalculator.getAverageMetrics();
      expect(averages.averageCompressionRatio).toBeCloseTo(1.84, 1);
    });
  });

  describe('Performance Report', () => {
    it('should generate comprehensive performance report', () => {
      // Add some history
      for (let i = 0; i < 3; i++) {
        sizeCalculator.calculateMetrics(mockTransformationResult);
      }

      const report = sizeCalculator.generatePerformanceReport();

      expect(report).toContain('Size Calculator Performance Report');
      expect(report).toContain('Overall Statistics');
      expect(report).toContain('Average Size Reduction: 40.00%');
      expect(report).toContain('Average Compression Ratio');
      expect(report).toContain('Total Fields Processed');
      expect(report).toContain('Recent Performance');
    });

    it('should handle empty history in report', () => {
      const report = sizeCalculator.generatePerformanceReport();

      expect(report).toContain('Size Calculator Performance Report');
      expect(report).toContain('Average Size Reduction: 0.00%');
      expect(report).toContain('Total Fields Processed: 0');
    });

    it('should format numbers correctly in report', () => {
      // Add a calculation to get some numbers
      sizeCalculator.calculateMetrics(mockTransformationResult);

      const report = sizeCalculator.generatePerformanceReport();

      // Should format KB correctly
      expect(report).toContain('KB');
      // Should format percentages correctly
      expect(report).toContain('%');
      // Should format ratios correctly
      expect(report).toContain(':1');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero reduction percentage', () => {
      const noReductionResult = {
        ...mockTransformationResult,
        metrics: {
          ...mockTransformationResult.metrics,
          originalSize: 600,
          optimizedSize: 600,
          reductionPercentage: 0
        }
      };

      const result = sizeCalculator.calculateMetrics(noReductionResult);

      expect(result.metrics.reductionAbsolute).toBe(0);
      expect(result.metrics.compressionRatio).toBe(1);
    });

    it('should handle division by zero in bytes saved per field', () => {
      const noFieldsResult = {
        ...mockTransformationResult,
        metrics: {
          ...mockTransformationResult.metrics,
          fieldsIncluded: 0
        }
      };

      const result = sizeCalculator.calculateMetrics(noFieldsResult);

      expect(result.metrics.bytesSavedPerField).toBe(0);
    });

    it('should handle memory usage calculation', () => {
      // This test just ensures the memory usage doesn't throw errors
      // In different environments, memory usage might not be available
      const result = sizeCalculator.calculateMetrics(mockTransformationResult);

      expect(typeof result.performance.memoryUsageMB).toBe('number');
      expect(result.performance.memoryUsageMB).toBeGreaterThanOrEqual(0);
    });

    it('should handle invalid data gracefully', () => {
      const invalidResult = {
        data: null,
        metrics: {
          originalSize: 0,
          optimizedSize: 0,
          reductionPercentage: 0,
          fieldsIncluded: 0,
          totalFields: 0,
          fieldInclusionPercentage: 0
        },
        metadata: {
          verbosity: Verbosity.MINIMAL,
          categoriesIncluded: [],
          timestamp: '2024-01-01T00:00:00.000Z',
          processingTimeMs: 0
        }
      } as TransformationResult;

      expect(() => {
        sizeCalculator.calculateMetrics(invalidResult);
      }).not.toThrow();
    });
  });
});

describe('Utility Functions', () => {
  let mockResult: TransformationResult;

  beforeEach(() => {
    mockResult = {
      data: { id: 1, title: 'Test' },
      metrics: {
        originalSize: 100,
        optimizedSize: 60,
        reductionPercentage: 40,
        fieldsIncluded: 2,
        totalFields: 4,
        fieldInclusionPercentage: 50
      },
      metadata: {
        verbosity: Verbosity.STANDARD,
        categoriesIncluded: ['core'],
        timestamp: '2024-01-01T00:00:00.000Z',
        processingTimeMs: 2
      }
    };
  });

  describe('calculateSizeMetrics', () => {
    it('should provide convenient calculation function', () => {
      const result = calculateSizeMetrics(mockResult);

      expect(result.metrics.originalSize).toBe(100);
      expect(result.metrics.optimizedSize).toBe(60);
      expect(result.performance.calculationTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateResponseMetrics', () => {
    it('should provide convenient response calculation function', () => {
      const mockResponse = {
        success: true,
        operation: 'test',
        message: 'Test',
        data: mockResult.data,
        metadata: {
          timestamp: '2024-01-01T00:00:00.000Z',
          optimization: {
            verbosity: Verbosity.STANDARD,
            sizeMetrics: {
              originalSize: 100,
              optimizedSize: 60,
              reductionPercentage: 40
            },
            fieldMetrics: {
              fieldsIncluded: 2,
              totalFields: 4,
              inclusionPercentage: 50
            },
            performance: {
              transformationTimeMs: 2,
              totalTimeMs: 5
            },
            categoriesIncluded: ['core']
          }
        }
      };

      const result = calculateResponseMetrics(mockResponse);

      expect(result.metrics.originalSize).toBe(100);
      expect(result.metrics.optimizedSize).toBe(60);
      expect(result.performance.objectsProcessed).toBe(1);
    });
  });

  describe('estimateSize', () => {
    it('should estimate size of different data types', () => {
      expect(estimateSize('hello')).toBe(10); // 5 chars * 2 bytes
      expect(estimateSize(42)).toBe(8); // number
      expect(estimateSize(true)).toBe(4); // boolean
      expect(estimateSize(null)).toBe(0);
      expect(estimateSize(undefined)).toBe(0);
    });

    it('should estimate size of arrays', () => {
      const array = ['hello', 'world'];
      const expectedSize = 10 + 10 + 2; // two strings + array overhead
      expect(estimateSize(array)).toBe(expectedSize);
    });

    it('should estimate size of objects', () => {
      const obj = { key1: 'value1', key2: 42 };
      const actualSize = estimateSize(obj);
      expect(actualSize).toBeGreaterThan(0);
      expect(actualSize).toBeGreaterThan(30); // Should be at least the sum of basic parts
    });
  });

  describe('calculateReduction', () => {
    it('should calculate reduction percentage correctly', () => {
      expect(calculateReduction(100, 60)).toBe(40);
      expect(calculateReduction(200, 100)).toBe(50);
      expect(calculateReduction(100, 0)).toBe(100);
      expect(calculateReduction(100, 100)).toBe(0);
    });

    it('should handle zero original size', () => {
      expect(calculateReduction(0, 0)).toBe(0);
      expect(calculateReduction(0, 50)).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(calculateReduction(1, 0)).toBe(100);
      expect(calculateReduction(1, 1)).toBe(0);
      expect(calculateReduction(1000, 1)).toBe(100);
    });
  });
});