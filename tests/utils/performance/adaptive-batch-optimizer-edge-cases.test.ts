/**
 * Edge case tests for adaptive batch optimizer
 * Focus on uncovered lines and defensive programming patterns
 */

import {
  AdaptiveBatchOptimizer,
  AdaptiveBatchOptimizerManager,
  adaptiveBatchManager,
  type AdaptiveBatchConfig,
  type OperationSample
} from '../../../src/utils/performance/adaptive-batch-optimizer';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('AdaptiveBatchOptimizer - Edge Cases', () => {
  let optimizer: AdaptiveBatchOptimizer;

  beforeEach(() => {
    optimizer = new AdaptiveBatchOptimizer('test-operation');
    jest.clearAllMocks();
  });

  describe('Performance history cleanup', () => {
    it('should cleanup history when exceeding adaptation window * 2', () => {
      const config: Partial<AdaptiveBatchConfig> = {
        adaptationWindow: 5,
        initialBatchSize: 10,
        initialConcurrency: 3,
      };
      const edgeOptimizer = new AdaptiveBatchOptimizer('edge-test', config);

      for (let i = 0; i < 12; i++) {
        edgeOptimizer.recordOperation({
          batchSize: 10,
          concurrency: 3,
          responseTime: 1000 + i * 100,
          success: true,
          itemCount: 10,
        });
      }

      const performanceWindow = edgeOptimizer.getPerformanceWindow();
      expect(performanceWindow).toBeTruthy();
      expect(performanceWindow!.operations.length).toBeLessThanOrEqual(config.adaptationWindow);
    });

    it('should not trigger adaptation before reaching adaptation window', () => {
      const config: Partial<AdaptiveBatchConfig> = {
        adaptationWindow: 10,
        initialBatchSize: 15,
        initialConcurrency: 4,
      };
      const edgeOptimizer = new AdaptiveBatchOptimizer('adaptation-test', config);

      for (let i = 0; i < 5; i++) {
        edgeOptimizer.recordOperation({
          batchSize: 15,
          concurrency: 4,
          responseTime: 1000,
          success: true,
          itemCount: 15,
        });
      }

      const optimalConfig = edgeOptimizer.getOptimalConfig();
      expect(optimalConfig.batchSize).toBe(config.initialBatchSize);
      expect(optimalConfig.concurrency).toBe(config.initialConcurrency);
    });
  });

  describe('High response time optimization', () => {
    it('should reduce both batch size and concurrency for high response times', () => {
      for (let i = 0; i < 10; i++) {
        optimizer.recordOperation({
          batchSize: 20,
          concurrency: 6,
          responseTime: 3500 + i * 200,
          success: true,
          itemCount: 20,
        });
      }

      const recommendation = optimizer.getOptimizationRecommendation();
      expect(recommendation).toBeTruthy();
      expect(recommendation!.recommendedBatchSize).toBeLessThan(20);
      expect(recommendation!.recommendedConcurrency).toBeLessThan(6);
      expect(recommendation!.reasoning.some(r => r.includes('exceeds target'))).toBe(true);
    });
  });

  describe('Low response time optimization', () => {
    it('should suggest optimization for very low response times', () => {
      for (let i = 0; i < 10; i++) {
        optimizer.recordOperation({
          batchSize: 5,
          concurrency: 2,
          responseTime: 200 + i * 50,
          success: true,
          itemCount: 5,
        });
      }

      const recommendation = optimizer.getOptimizationRecommendation();
      expect(recommendation).toBeTruthy();
      expect(recommendation!.reasoning.some(r => r.includes('room for optimization'))).toBe(true);
    });
  });

  describe('Low success rate optimization', () => {
    it('should reduce load for low success rates', () => {
      for (let i = 0; i < 10; i++) {
        optimizer.recordOperation({
          batchSize: 15,
          concurrency: 4,
          responseTime: 1000,
          success: i % 2 === 0,
          itemCount: i % 2 === 0 ? 15 : 0,
        });
      }

      const recommendation = optimizer.getOptimizationRecommendation();
      expect(recommendation).toBeTruthy();
      expect(recommendation!.reasoning.some(r => r.includes('below target'))).toBe(true);
      expect(recommendation!.confidence).toBeGreaterThan(0.3);
    });
  });

  describe('Optimal configuration detection', () => {
    it('should return recommendation when configuration can be optimized', () => {
      for (let i = 0; i < 10; i++) {
        optimizer.recordOperation({
          batchSize: 10,
          concurrency: 3,
          responseTime: 1800 + i * 100,
          success: true,
          itemCount: 10,
        });
      }

      const recommendation = optimizer.getOptimizationRecommendation();
      // Should return recommendation if performance exceeds target
      expect(recommendation).toBeTruthy();
    });
  });

  describe('Recommendation application with tracking', () => {
    it('should apply recommendation and track statistics', () => {
      const config: Partial<AdaptiveBatchConfig> = {
        initialBatchSize: 12,
        initialConcurrency: 5,
        learningRate: 0.5, // Higher learning rate to ensure changes
      };
      const trackingOptimizer = new AdaptiveBatchOptimizer('tracking-test', config);

      for (let i = 0; i < 10; i++) {
        trackingOptimizer.recordOperation({
          batchSize: 12,
          concurrency: 5,
          responseTime: 5000 + i * 200, // Very high response times
          success: true,
          itemCount: 12,
        });
      }

      const recommendation = trackingOptimizer.getOptimizationRecommendation();
      expect(recommendation).toBeTruthy();

      const originalConfig = trackingOptimizer.getOptimalConfig();
      trackingOptimizer.applyRecommendation(recommendation!);
      const newConfig = trackingOptimizer.getOptimalConfig();

      // At least one should change
      expect(newConfig.batchSize !== originalConfig.batchSize || newConfig.concurrency !== originalConfig.concurrency).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Applied batch optimization recommendation', expect.any(Object));
    });
  });

  describe('Data export functionality', () => {
    it('should export complete optimization data', () => {
      optimizer.recordOperation({
        batchSize: 8,
        concurrency: 2,
        responseTime: 1500,
        success: true,
        itemCount: 8,
      });

      optimizer.recordOperation({
        batchSize: 8,
        concurrency: 2,
        responseTime: 1600,
        success: false,
        itemCount: 0,
      });

      const exportedData = optimizer.exportData();

      expect(exportedData.operationType).toBe('test-operation');
      expect(exportedData.performanceHistory).toHaveLength(2);
      expect(exportedData.adaptationCount).toBe(0);
      expect(exportedData.lastAdaptation).toBe(0);
    });
  });

  describe('Reset functionality', () => {
    it('should reset optimizer to initial configuration', () => {
      for (let i = 0; i < 10; i++) {
        optimizer.recordOperation({
          batchSize: 10,
          concurrency: 5,
          responseTime: 2000,
          success: true,
          itemCount: 10,
        });
      }

      const performanceBefore = optimizer.getPerformanceWindow();
      expect(performanceBefore).toBeTruthy();
      expect(performanceBefore!.operations).toHaveLength(10);

      optimizer.reset();

      const performanceAfter = optimizer.getPerformanceWindow();
      expect(performanceAfter).toBeNull();

      const config = optimizer.getOptimalConfig();
      expect(config.batchSize).toBe(10);
      expect(config.concurrency).toBe(5);

      const exportedData = optimizer.exportData();
      expect(exportedData.performanceHistory).toHaveLength(0);
      expect(exportedData.adaptationCount).toBe(0);
      expect(exportedData.lastAdaptation).toBe(0);

      expect(logger.info).toHaveBeenCalledWith('Adaptive batch optimizer reset', expect.any(Object));
    });
  });
});

describe('AdaptiveBatchOptimizerManager - Edge Cases', () => {
  let manager: AdaptiveBatchOptimizerManager;

  beforeEach(() => {
    manager = new AdaptiveBatchOptimizerManager();
    jest.clearAllMocks();
  });

  it('should handle global performance summary with mixed data', () => {
    const optimizer1 = manager.getOptimizer('operation-1');
    const optimizer2 = manager.getOptimizer('operation-2');

    optimizer1.recordOperation({
      batchSize: 10,
      concurrency: 3,
      responseTime: 1000,
      success: true,
      itemCount: 10,
    });

    const summary = manager.getGlobalPerformanceSummary();

    expect(summary['operation-1']).toBeTruthy();
    expect(summary['operation-2']).toBeNull();
    expect(Object.keys(summary)).toHaveLength(2);
  });

  it('should handle all recommendations with mixed scenarios', () => {
    const optimizer1 = manager.getOptimizer('rec-operation-1');
    const optimizer2 = manager.getOptimizer('rec-operation-2');

    for (let i = 0; i < 10; i++) {
      optimizer1.recordOperation({
        batchSize: 15,
        concurrency: 6,
        responseTime: 4000,
        success: i < 8,
        itemCount: i < 8 ? 15 : 0,
      });
    }

    const recommendations = manager.getAllRecommendations();

    expect(recommendations['rec-operation-1']).toBeTruthy();
    expect(recommendations['rec-operation-2']).toBeNull();
    expect(Object.keys(recommendations)).toHaveLength(2);
  });

  it('should reset all optimizers', () => {
    const optimizer1 = manager.getOptimizer('reset-operation-1');
    const optimizer2 = manager.getOptimizer('reset-operation-2');

    optimizer1.recordOperation({
      batchSize: 8,
      concurrency: 2,
      responseTime: 1200,
      success: true,
      itemCount: 8,
    });

    optimizer2.recordOperation({
      batchSize: 12,
      concurrency: 4,
      responseTime: 1800,
      success: true,
      itemCount: 12,
    });

    expect(optimizer1.getPerformanceWindow()).toBeTruthy();
    expect(optimizer2.getPerformanceWindow()).toBeTruthy();

    manager.resetAll();

    expect(optimizer1.getPerformanceWindow()).toBeNull();
    expect(optimizer2.getPerformanceWindow()).toBeNull();

    expect(logger.info).toHaveBeenCalledWith('All adaptive batch optimizers reset');
  });

  it('should export all data from multiple optimizers', () => {
    const optimizer1 = manager.getOptimizer('export-operation-1');
    const optimizer2 = manager.getOptimizer('export-operation-2');

    optimizer1.recordOperation({
      batchSize: 5,
      concurrency: 1,
      responseTime: 800,
      success: true,
      itemCount: 5,
    });

    optimizer2.recordOperation({
      batchSize: 20,
      concurrency: 8,
      responseTime: 2500,
      success: false,
      itemCount: 0,
    });

    const allData = manager.exportAllData();

    expect(Object.keys(allData)).toHaveLength(2);
    expect(allData['export-operation-1'].performanceHistory).toHaveLength(1);
    expect(allData['export-operation-2'].performanceHistory).toHaveLength(1);
  });
});

describe('Global adaptiveBatchManager', () => {
  it('should provide consistent optimizer instances', () => {
    const optimizer1 = adaptiveBatchManager.getOptimizer('global-test');
    const optimizer2 = adaptiveBatchManager.getOptimizer('global-test');

    expect(optimizer1).toBe(optimizer2);
  });

  it('should handle multiple operation types independently', () => {
    const taskOptimizer = adaptiveBatchManager.getOptimizer('tasks');
    const projectOptimizer = adaptiveBatchManager.getOptimizer('projects');

    expect(taskOptimizer).not.toBe(projectOptimizer);

    taskOptimizer.recordOperation({
      batchSize: 15,
      concurrency: 4,
      responseTime: 2000,
      success: true,
      itemCount: 15,
    });

    const taskData = taskOptimizer.getPerformanceWindow();
    const projectData = projectOptimizer.getPerformanceWindow();

    expect(taskData).toBeTruthy();
    expect(projectData).toBeNull();
  });
});
