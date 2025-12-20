/**
 * Size calculator for response monitoring
 * Provides accurate size estimation and reduction metrics for optimization tracking
 */

import type { TransformationResult, OptimizedResponse } from './base';
import { SizeEstimator } from './base';

/**
 * Size metrics interface
 */
export interface SizeMetrics {
  originalSize: number;
  optimizedSize: number;
  reductionPercentage: number;
  reductionAbsolute: number;
  compressionRatio: number;
  fieldsReduced: number;
  bytesSavedPerField: number;
}

/**
 * Performance metrics for size calculation
 */
export interface PerformanceMetrics {
  calculationTimeMs: number;
  memoryUsageMB: number;
  fieldsProcessed: number;
  objectsProcessed: number;
  averageProcessingTimeMs: number;
}

/**
 * Size calculation result
 */
export interface SizeCalculationResult {
  metrics: SizeMetrics;
  performance: PerformanceMetrics;
  timestamp: string;
  breakdown: {
    byField: Record<string, { original: number; optimized: number; saved: number }>;
    byCategory: Record<string, { original: number; optimized: number; saved: number }>;
    byType: Record<string, { count: number; size: number; averageSize: number }>;
  };
}

/**
 * Advanced size calculator with detailed metrics
 */
export class SizeCalculator {
  private calculationHistory: SizeCalculationResult[] = [];
  private maxHistorySize = 100;

  /**
   * Calculate size metrics for a transformation result
   */
  calculateMetrics(result: TransformationResult): SizeCalculationResult {
    const startTime = Date.now();
    const startMemory = this.getMemoryUsage();

    const metrics: SizeMetrics = {
      originalSize: result.metrics.originalSize,
      optimizedSize: result.metrics.optimizedSize,
      reductionPercentage: result.metrics.reductionPercentage,
      reductionAbsolute: result.metrics.originalSize - result.metrics.optimizedSize,
      compressionRatio: result.metrics.originalSize > 0 ? result.metrics.originalSize / result.metrics.optimizedSize : 1,
      fieldsReduced: result.metrics.totalFields - result.metrics.fieldsIncluded,
      bytesSavedPerField: result.metrics.fieldsIncluded > 0 ?
        (result.metrics.originalSize - result.metrics.optimizedSize) / result.metrics.fieldsIncluded : 0
    };

    const endTime = Date.now();
    const endMemory = this.getMemoryUsage();

    const performance: PerformanceMetrics = {
      calculationTimeMs: endTime - startTime,
      memoryUsageMB: endMemory - startMemory,
      fieldsProcessed: result.metrics.totalFields,
      objectsProcessed: Array.isArray(result.data) ? result.data.length : 1,
      averageProcessingTimeMs: (endTime - startTime) / (Array.isArray(result.data) ? result.data.length : 1)
    };

    const breakdown = this.analyzeSizeBreakdown(result);

    const calculationResult: SizeCalculationResult = {
      metrics,
      performance,
      timestamp: new Date().toISOString(),
      breakdown
    };

    this.addToHistory(calculationResult);
    return calculationResult;
  }

  /**
   * Calculate size metrics for optimized response
   */
  calculateResponseMetrics(response: OptimizedResponse): SizeCalculationResult {
    // Extract optimization metadata from response
    const optimization = response.metadata.optimization;
    if (!optimization) {
      throw new Error('Response does not contain optimization metadata');
    }

    const startTime = Date.now();
    const startMemory = this.getMemoryUsage();

    const metrics: SizeMetrics = {
      originalSize: optimization.sizeMetrics.originalSize,
      optimizedSize: optimization.sizeMetrics.optimizedSize,
      reductionPercentage: optimization.sizeMetrics.reductionPercentage,
      reductionAbsolute: optimization.sizeMetrics.originalSize - optimization.sizeMetrics.optimizedSize,
      compressionRatio: optimization.sizeMetrics.originalSize > 0 ?
        optimization.sizeMetrics.originalSize / optimization.sizeMetrics.optimizedSize : 1,
      fieldsReduced: optimization.fieldMetrics.totalFields - optimization.fieldMetrics.fieldsIncluded,
      bytesSavedPerField: optimization.fieldMetrics.fieldsIncluded > 0 ?
        (optimization.sizeMetrics.originalSize - optimization.sizeMetrics.optimizedSize) / optimization.fieldMetrics.fieldsIncluded : 0
    };

    const endTime = Date.now();
    const endMemory = this.getMemoryUsage();

    const performance: PerformanceMetrics = {
      calculationTimeMs: endTime - startTime,
      memoryUsageMB: endMemory - startMemory,
      fieldsProcessed: optimization.fieldMetrics.totalFields,
      objectsProcessed: Array.isArray(response.data) ? response.data.length : 1,
      averageProcessingTimeMs: (endTime - startTime) / (Array.isArray(response.data) ? response.data.length : 1)
    };

    const breakdown = this.analyzeResponseBreakdown(response);

    return {
      metrics,
      performance,
      timestamp: new Date().toISOString(),
      breakdown
    };
  }

  /**
   * Analyze size breakdown by field, category, and type
   */
  private analyzeSizeBreakdown(result: TransformationResult): SizeCalculationResult['breakdown'] {
    const breakdown: SizeCalculationResult['breakdown'] = {
      byField: {},
      byCategory: {},
      byType: {}
    };

    // For detailed breakdown, we'd need to analyze the original and optimized data
    // This is a simplified version that focuses on what we can calculate
    const data = result.data;

    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item && typeof item === 'object') {
          this.analyzeObjectBreakdown(item as Record<string, unknown>, breakdown);
        }
      });
    } else if (data && typeof data === 'object') {
      this.analyzeObjectBreakdown(data as Record<string, unknown>, breakdown);
    }

    return breakdown;
  }

  /**
   * Analyze response breakdown
   */
  private analyzeResponseBreakdown(response: OptimizedResponse): SizeCalculationResult['breakdown'] {
    const breakdown: SizeCalculationResult['breakdown'] = {
      byField: {},
      byCategory: {},
      byType: {}
    };

    const data = response.data;

    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item && typeof item === 'object') {
          this.analyzeObjectBreakdown(item as Record<string, unknown>, breakdown);
        }
      });
    } else if (data && typeof data === 'object') {
      this.analyzeObjectBreakdown(data as Record<string, unknown>, breakdown);
    }

    return breakdown;
  }

  /**
   * Analyze individual object breakdown
   */
  private analyzeObjectBreakdown(obj: Record<string, unknown>, breakdown: SizeCalculationResult['breakdown']): void {
    if (!obj || typeof obj !== 'object') return;

    Object.entries(obj).forEach(([key, value]) => {
      const size = SizeEstimator.estimateSize(value);
      const type = this.getValueType(value);

      // Track by field
      if (!breakdown.byField[key]) {
        breakdown.byField[key] = { original: 0, optimized: 0, saved: 0 };
      }
      breakdown.byField[key].optimized += size;

      // Track by type
      if (!breakdown.byType[type]) {
        breakdown.byType[type] = { count: 0, size: 0, averageSize: 0 };
      }
      breakdown.byType[type].count++;
      breakdown.byType[type].size += size;
      breakdown.byType[type].averageSize = breakdown.byType[type].size / breakdown.byType[type].count;
    });
  }

  /**
   * Get type name for value
   */
  private getValueType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return typeof value;
  }

  /**
   * Get current memory usage in MB
   */
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return usage.heapUsed / 1024 / 1024; // Convert to MB
    }
    return 0;
  }

  /**
   * Add calculation result to history
   */
  private addToHistory(result: SizeCalculationResult): void {
    this.calculationHistory.push(result);
    if (this.calculationHistory.length > this.maxHistorySize) {
      this.calculationHistory.shift();
    }
  }

  /**
   * Get calculation history
   */
  getHistory(): SizeCalculationResult[] {
    return [...this.calculationHistory];
  }

  /**
   * Get average metrics across all calculations
   */
  getAverageMetrics(): {
    averageReduction: number;
    averageCompressionRatio: number;
    totalFieldsProcessed: number;
    totalObjectsProcessed: number;
    totalBytesSaved: number;
  } {
    if (this.calculationHistory.length === 0) {
      return {
        averageReduction: 0,
        averageCompressionRatio: 1,
        totalFieldsProcessed: 0,
        totalObjectsProcessed: 0,
        totalBytesSaved: 0
      };
    }

    const totalReduction = this.calculationHistory.reduce((sum, result) => sum + result.metrics.reductionPercentage, 0);
    const totalCompressionRatio = this.calculationHistory.reduce((sum, result) => sum + result.metrics.compressionRatio, 0);
    const totalFields = this.calculationHistory.reduce((sum, result) => sum + result.performance.fieldsProcessed, 0);
    const totalObjects = this.calculationHistory.reduce((sum, result) => sum + result.performance.objectsProcessed, 0);
    const totalBytesSaved = this.calculationHistory.reduce((sum, result) => sum + result.metrics.reductionAbsolute, 0);

    return {
      averageReduction: totalReduction / this.calculationHistory.length,
      averageCompressionRatio: totalCompressionRatio / this.calculationHistory.length,
      totalFieldsProcessed: totalFields,
      totalObjectsProcessed: totalObjects,
      totalBytesSaved
    };
  }

  /**
   * Clear calculation history
   */
  clearHistory(): void {
    this.calculationHistory = [];
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): string {
    const averages = this.getAverageMetrics();
    const recent = this.calculationHistory.slice(-10);

    return `
Size Calculator Performance Report
===================================

Overall Statistics:
- Average Size Reduction: ${averages.averageReduction.toFixed(2)}%
- Average Compression Ratio: ${averages.averageCompressionRatio.toFixed(2)}:1
- Total Fields Processed: ${averages.totalFieldsProcessed.toLocaleString()}
- Total Objects Processed: ${averages.totalObjectsProcessed.toLocaleString()}
- Total Bytes Saved: ${(averages.totalBytesSaved / 1024).toFixed(2)} KB

Recent Performance (Last 10 calculations):
${recent.map((result, index) => `
${index + 1}. ${result.timestamp}
   Reduction: ${result.metrics.reductionPercentage.toFixed(2)}%
   Fields: ${result.performance.fieldsProcessed} → ${result.metrics.fieldsReduced ? result.performance.fieldsProcessed - result.metrics.fieldsReduced : result.performance.fieldsProcessed}
   Time: ${result.performance.calculationTimeMs}ms
`).join('')}
    `.trim();
  }
}

/**
 * Default size calculator instance
 */
export const defaultSizeCalculator = new SizeCalculator();

/**
 * Utility functions for quick size calculations
 */
export function calculateSizeMetrics(result: TransformationResult): SizeCalculationResult {
  return defaultSizeCalculator.calculateMetrics(result);
}

export function calculateResponseMetrics(response: OptimizedResponse): SizeCalculationResult {
  return defaultSizeCalculator.calculateResponseMetrics(response);
}

/**
 * Quick size estimation
 */
export function estimateSize(value: unknown): number {
  return SizeEstimator.estimateSize(value);
}

/**
 * Calculate reduction percentage
 */
export function calculateReduction(originalSize: number, optimizedSize: number): number {
  return SizeEstimator.calculateReduction(originalSize, optimizedSize);
}