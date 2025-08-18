/**
 * Adaptive batch optimizer that learns from performance patterns
 * Dynamically adjusts batch sizes and concurrency based on API response times and success rates
 */

import { logger } from '../logger';

export interface AdaptiveBatchConfig {
  /**
   * Initial batch size (default: 10)
   */
  initialBatchSize: number;
  
  /**
   * Minimum batch size (default: 1)
   */
  minBatchSize: number;
  
  /**
   * Maximum batch size (default: 50)
   */
  maxBatchSize: number;
  
  /**
   * Initial concurrency level (default: 5)
   */
  initialConcurrency: number;
  
  /**
   * Minimum concurrency level (default: 1)
   */
  minConcurrency: number;
  
  /**
   * Maximum concurrency level (default: 15)
   */
  maxConcurrency: number;
  
  /**
   * Target response time in milliseconds (default: 2000)
   */
  targetResponseTime: number;
  
  /**
   * Target success rate as percentage (default: 95)
   */
  targetSuccessRate: number;
  
  /**
   * Learning rate for adjustments (default: 0.1)
   */
  learningRate: number;
  
  /**
   * Number of operations to consider for adaptation (default: 10)
   */
  adaptationWindow: number;
}

export interface PerformanceWindow {
  operations: OperationSample[];
  averageResponseTime: number;
  successRate: number;
  throughput: number;
  timestamp: number;
}

export interface OperationSample {
  batchSize: number;
  concurrency: number;
  responseTime: number;
  success: boolean;
  itemCount: number;
  timestamp: number;
}

export interface OptimizationRecommendation {
  recommendedBatchSize: number;
  recommendedConcurrency: number;
  confidence: number;
  reasoning: string[];
  performanceGain: number;
}

const DEFAULT_CONFIG: AdaptiveBatchConfig = {
  initialBatchSize: 10,
  minBatchSize: 1,
  maxBatchSize: 50,
  initialConcurrency: 5,
  minConcurrency: 1,
  maxConcurrency: 15,
  targetResponseTime: 2000, // 2 seconds
  targetSuccessRate: 95, // 95%
  learningRate: 0.1,
  adaptationWindow: 10,
};

export class AdaptiveBatchOptimizer {
  private currentBatchSize: number;
  private currentConcurrency: number;
  private performanceHistory: OperationSample[] = [];
  private readonly config: AdaptiveBatchConfig;
  private lastAdaptation: number = 0;
  private adaptationCount: number = 0;

  constructor(
    private readonly operationType: string,
    config: Partial<AdaptiveBatchConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentBatchSize = this.config.initialBatchSize;
    this.currentConcurrency = this.config.initialConcurrency;
    
    logger.debug('Adaptive batch optimizer initialized', {
      operationType: this.operationType,
      config: this.config,
    });
  }

  /**
   * Get current optimized batch configuration
   */
  getOptimalConfig(): { batchSize: number; concurrency: number } {
    return {
      batchSize: this.currentBatchSize,
      concurrency: this.currentConcurrency,
    };
  }

  /**
   * Record operation performance for learning
   */
  recordOperation(sample: Omit<OperationSample, 'timestamp'>): void {
    const operationSample: OperationSample = {
      ...sample,
      timestamp: Date.now(),
    };

    this.performanceHistory.push(operationSample);

    // Keep only recent samples within adaptation window
    if (this.performanceHistory.length > this.config.adaptationWindow * 2) {
      this.performanceHistory = this.performanceHistory.slice(-this.config.adaptationWindow);
    }

    // Trigger adaptation if we have enough samples
    if (this.performanceHistory.length >= this.config.adaptationWindow) {
      this.adaptConfiguration();
    }
  }

  /**
   * Get performance analysis for recent operations
   */
  getPerformanceWindow(): PerformanceWindow | null {
    if (this.performanceHistory.length === 0) return null;

    const recentSamples = this.performanceHistory.slice(-this.config.adaptationWindow);
    const totalResponseTime = recentSamples.reduce((sum, s) => sum + s.responseTime, 0);
    const successfulOperations = recentSamples.filter(s => s.success).length;
    const totalItems = recentSamples.reduce((sum, s) => sum + s.itemCount, 0);
    const totalTime = totalResponseTime / 1000; // Convert to seconds

    return {
      operations: recentSamples,
      averageResponseTime: totalResponseTime / recentSamples.length,
      successRate: (successfulOperations / recentSamples.length) * 100,
      throughput: totalTime > 0 ? totalItems / totalTime : 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Get optimization recommendation based on performance patterns
   */
  getOptimizationRecommendation(): OptimizationRecommendation | null {
    const window = this.getPerformanceWindow();
    if (!window) return null;

    const reasoning: string[] = [];
    let recommendedBatchSize = this.currentBatchSize;
    let recommendedConcurrency = this.currentConcurrency;
    let confidence = 0;
    let performanceGain = 0;

    // Analyze response time performance
    if (window.averageResponseTime > this.config.targetResponseTime) {
      reasoning.push(`Average response time (${Math.round(window.averageResponseTime)}ms) exceeds target (${this.config.targetResponseTime}ms)`);
      
      // Reduce batch size or concurrency
      if (this.currentBatchSize > this.config.minBatchSize) {
        recommendedBatchSize = Math.max(
          this.config.minBatchSize,
          Math.round(this.currentBatchSize * 0.8)
        );
        confidence += 0.3;
      }
      
      if (this.currentConcurrency > this.config.minConcurrency) {
        recommendedConcurrency = Math.max(
          this.config.minConcurrency,
          Math.round(this.currentConcurrency * 0.9)
        );
        confidence += 0.2;
      }
    } else if (window.averageResponseTime < this.config.targetResponseTime * 0.5) {
      reasoning.push(`Response time (${Math.round(window.averageResponseTime)}ms) is well below target - room for optimization`);
      
      // Increase batch size or concurrency for better throughput
      if (this.currentBatchSize < this.config.maxBatchSize) {
        recommendedBatchSize = Math.min(
          this.config.maxBatchSize,
          Math.round(this.currentBatchSize * 1.2)
        );
        confidence += 0.2;
      }
      
      if (this.currentConcurrency < this.config.maxConcurrency) {
        recommendedConcurrency = Math.min(
          this.config.maxConcurrency,
          Math.round(this.currentConcurrency * 1.1)
        );
        confidence += 0.2;
      }
    }

    // Analyze success rate
    if (window.successRate < this.config.targetSuccessRate) {
      reasoning.push(`Success rate (${window.successRate.toFixed(1)}%) below target (${this.config.targetSuccessRate}%)`);
      
      // Reduce load to improve reliability
      recommendedBatchSize = Math.max(
        this.config.minBatchSize,
        Math.round(recommendedBatchSize * 0.7)
      );
      recommendedConcurrency = Math.max(
        this.config.minConcurrency,
        Math.round(recommendedConcurrency * 0.8)
      );
      confidence += 0.4;
    }

    // Calculate potential performance gain
    const currentThroughput = window.throughput;
    const projectedThroughput = this.estimateThroughput(recommendedBatchSize, recommendedConcurrency);
    performanceGain = ((projectedThroughput - currentThroughput) / currentThroughput) * 100;

    // Only recommend changes if there's meaningful improvement potential
    if (confidence < 0.3 && Math.abs(performanceGain) < 5) {
      reasoning.push('Current configuration appears optimal');
      return null;
    }

    return {
      recommendedBatchSize,
      recommendedConcurrency,
      confidence: Math.min(confidence, 1.0),
      reasoning,
      performanceGain,
    };
  }

  /**
   * Apply optimization recommendation
   */
  applyRecommendation(recommendation: OptimizationRecommendation): void {
    const oldBatchSize = this.currentBatchSize;
    const oldConcurrency = this.currentConcurrency;

    this.currentBatchSize = recommendation.recommendedBatchSize;
    this.currentConcurrency = recommendation.recommendedConcurrency;
    this.lastAdaptation = Date.now();
    this.adaptationCount++;

    logger.info('Applied batch optimization recommendation', {
      operationType: this.operationType,
      changes: {
        batchSize: { from: oldBatchSize, to: this.currentBatchSize },
        concurrency: { from: oldConcurrency, to: this.currentConcurrency },
      },
      recommendation: {
        confidence: recommendation.confidence,
        reasoning: recommendation.reasoning,
        expectedGain: `${recommendation.performanceGain.toFixed(1)}%`,
      },
      adaptationCount: this.adaptationCount,
    });
  }

  /**
   * Reset optimizer to initial configuration
   */
  reset(): void {
    this.currentBatchSize = this.config.initialBatchSize;
    this.currentConcurrency = this.config.initialConcurrency;
    this.performanceHistory = [];
    this.lastAdaptation = 0;
    this.adaptationCount = 0;

    logger.info('Adaptive batch optimizer reset', {
      operationType: this.operationType,
    });
  }

  /**
   * Export performance data for analysis
   */
  exportData(): {
    operationType: string;
    config: AdaptiveBatchConfig;
    currentConfig: { batchSize: number; concurrency: number };
    performanceHistory: OperationSample[];
    adaptationCount: number;
    lastAdaptation: number;
  } {
    return {
      operationType: this.operationType,
      config: this.config,
      currentConfig: this.getOptimalConfig(),
      performanceHistory: [...this.performanceHistory],
      adaptationCount: this.adaptationCount,
      lastAdaptation: this.lastAdaptation,
    };
  }

  private adaptConfiguration(): void {
    const recommendation = this.getOptimizationRecommendation();
    
    if (recommendation && recommendation.confidence > 0.5) {
      // Apply gradual changes to avoid oscillation
      const gradualBatchSize = this.gradualAdjustment(
        this.currentBatchSize,
        recommendation.recommendedBatchSize
      );
      const gradualConcurrency = this.gradualAdjustment(
        this.currentConcurrency,
        recommendation.recommendedConcurrency
      );

      if (gradualBatchSize !== this.currentBatchSize || gradualConcurrency !== this.currentConcurrency) {
        this.applyRecommendation({
          ...recommendation,
          recommendedBatchSize: gradualBatchSize,
          recommendedConcurrency: gradualConcurrency,
        });
      }
    }
  }

  private gradualAdjustment(current: number, target: number): number {
    const maxChange = Math.max(1, Math.round(current * this.config.learningRate));
    const difference = target - current;
    
    if (Math.abs(difference) <= maxChange) {
      return target;
    }
    
    return current + Math.sign(difference) * maxChange;
  }

  private estimateThroughput(batchSize: number, concurrency: number): number {
    const window = this.getPerformanceWindow();
    if (!window) return 0;

    // Simple throughput estimation based on current performance
    // This could be enhanced with machine learning models
    const baselineEfficiency = window.throughput / (this.currentBatchSize * this.currentConcurrency);
    return baselineEfficiency * batchSize * concurrency * 0.9; // Conservative estimate
  }
}

/**
 * Manager for multiple adaptive batch optimizers
 */
export class AdaptiveBatchOptimizerManager {
  private optimizers = new Map<string, AdaptiveBatchOptimizer>();

  /**
   * Get or create optimizer for operation type
   */
  getOptimizer(operationType: string, config?: Partial<AdaptiveBatchConfig>): AdaptiveBatchOptimizer {
    if (!this.optimizers.has(operationType)) {
      this.optimizers.set(operationType, new AdaptiveBatchOptimizer(operationType, config));
    }
    return this.optimizers.get(operationType)!;
  }

  /**
   * Get performance summary for all optimizers
   */
  getGlobalPerformanceSummary(): Record<string, PerformanceWindow | null> {
    const summary: Record<string, PerformanceWindow | null> = {};
    for (const [operationType, optimizer] of this.optimizers) {
      summary[operationType] = optimizer.getPerformanceWindow();
    }
    return summary;
  }

  /**
   * Get optimization recommendations for all operation types
   */
  getAllRecommendations(): Record<string, OptimizationRecommendation | null> {
    const recommendations: Record<string, OptimizationRecommendation | null> = {};
    for (const [operationType, optimizer] of this.optimizers) {
      recommendations[operationType] = optimizer.getOptimizationRecommendation();
    }
    return recommendations;
  }

  /**
   * Reset all optimizers
   */
  resetAll(): void {
    for (const optimizer of this.optimizers.values()) {
      optimizer.reset();
    }
    logger.info('All adaptive batch optimizers reset');
  }

  /**
   * Export all optimization data
   */
  exportAllData(): Record<string, ReturnType<AdaptiveBatchOptimizer['exportData']>> {
    const data: Record<string, ReturnType<AdaptiveBatchOptimizer['exportData']>> = {};
    for (const [operationType, optimizer] of this.optimizers) {
      data[operationType] = optimizer.exportData();
    }
    return data;
  }
}

// Global adaptive batch optimizer manager
export const adaptiveBatchManager = new AdaptiveBatchOptimizerManager();