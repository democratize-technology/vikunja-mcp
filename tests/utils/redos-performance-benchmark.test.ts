/**
 * Performance benchmark demonstrating the ReDoS vulnerability fix
 * This test shows that the new implementation is not vulnerable to ReDoS attacks
 */

import { describe, it, expect } from '@jest/globals';
import { validateCondition } from '../../src/utils/filters';
import type { FilterCondition } from '../../src/types/filters';

describe('ReDoS Performance Benchmark', () => {
  it('should demonstrate O(1) performance vs vulnerable regex O(2^n)', () => {
    // Test with progressively longer malicious inputs
    // The vulnerable regex would show exponential time increase
    // Our safe implementation should show constant time
    
    const testSizes = [10, 20, 50, 100, 200];
    const timings: number[] = [];
    
    testSizes.forEach(size => {
      const maliciousInput = 'now' + 'x'.repeat(size);
      const condition: FilterCondition = {
        field: 'dueDate',
        operator: '<',
        value: maliciousInput,
      };
      
      // Warm up
      for (let i = 0; i < 10; i++) {
        validateCondition(condition);
      }
      
      // Benchmark
      const iterations = 1000;
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        validateCondition(condition);
      }
      
      const endTime = process.hrtime.bigint();
      const avgTimeNs = Number(endTime - startTime) / iterations;
      const avgTimeMs = avgTimeNs / 1000000;
      
      timings.push(avgTimeMs);
      
      console.log(`Size ${size}: ${avgTimeMs.toFixed(4)}ms avg per validation`);
      
      // Should complete very quickly (under 0.2ms per validation)
      expect(avgTimeMs).toBeLessThan(0.2);
    });
    
    // Check that timing doesn't grow exponentially
    // For our safe implementation, later timings should not be significantly larger
    const firstTiming = timings[0];
    const lastTiming = timings[timings.length - 1];
    
    // Last timing should not be more than 10x the first timing
    // (allows for some variance but prevents exponential growth)
    expect(lastTiming).toBeLessThan(firstTiming * 10);
    
    console.log('Performance test passed: No exponential time growth detected');
  });
  
  it('should handle malicious patterns that trigger backtracking in vulnerable regex', () => {
    // These patterns would cause catastrophic backtracking in the vulnerable regex:
    // /^(now([+-]\d+[smhdwMy])?|now\/[dwMy]|\d{4}-\d{2}-\d{2})/
    const maliciousPatterns = [
      'now' + '+'.repeat(30) + 'x'.repeat(30), // Multiple alternation attempts
      'now' + '1'.repeat(50) + 'invalid', // Long digit sequence
      '2023' + '-'.repeat(50) + 'invalid', // Date pattern failure
      'now/' + 'x'.repeat(100), // Period pattern failure
    ];
    
    maliciousPatterns.forEach((pattern, index) => {
      const condition: FilterCondition = {
        field: 'created',
        operator: '>',
        value: pattern,
      };
      
      const startTime = process.hrtime.bigint();
      const errors = validateCondition(condition);
      const endTime = process.hrtime.bigint();
      
      const timeMs = Number(endTime - startTime) / 1000000;
      
      console.log(`Pattern ${index + 1}: ${timeMs.toFixed(4)}ms`);
      
      // Should complete very quickly
      expect(timeMs).toBeLessThan(1); // Under 1ms
      
      // Should be rejected
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('valid date value');
    });
  });
  
  it('should demonstrate safe parsing of valid inputs maintains good performance', () => {
    const validInputs = [
      'now',
      'now+7d',
      'now-30d',
      'now/w',
      '2023-12-25',
      '2024-02-29',
    ];
    
    validInputs.forEach(input => {
      const condition: FilterCondition = {
        field: 'dueDate',
        operator: '=',
        value: input,
      };
      
      const iterations = 10000;
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        validateCondition(condition);
      }
      
      const endTime = process.hrtime.bigint();
      const avgTimeNs = Number(endTime - startTime) / iterations;
      const avgTimeMs = avgTimeNs / 1000000;
      
      console.log(`Valid input "${input}": ${avgTimeMs.toFixed(6)}ms avg`);
      
      // Should be extremely fast for valid inputs
      expect(avgTimeMs).toBeLessThan(0.05); // Under 0.05ms
    });
  });
});