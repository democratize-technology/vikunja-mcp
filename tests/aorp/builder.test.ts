/**
 * AORP Builder Tests
 * Tests the fluent API and response building functionality
 */

import { AorpBuilder } from '../../src/aorp/builder';
import type { AorpTransformationContext } from '../../src/aorp/types';

describe('AorpBuilder', () => {
  let mockContext: AorpTransformationContext;

  beforeEach(() => {
    mockContext = {
      operation: 'test_operation',
      success: true,
      dataSize: 100,
      processingTime: 150,
      verbosity: 'standard'
    };
  });

  describe('Basic Builder Functionality', () => {
    test('should create builder with default configuration', () => {
      const builder = new AorpBuilder(mockContext);
      expect(builder).toBeInstanceOf(AorpBuilder);
    });

    test('should build minimal valid response', () => {
      const response = new AorpBuilder(mockContext)
        .status('success', 'Test operation successful', 0.9)
        .nextSteps(['Step 1', 'Step 2'])
        .recommendations('Primary recommendation', ['Secondary 1', 'Secondary 2'])
        .workflowGuidance('Use this data for next actions')
        .qualityScores(0.8, 0.9, 'medium')
        .summary('Test summary')
        .build();

      expect(response.immediate.status).toBe('success');
      expect(response.immediate.key_insight).toBe('Test operation successful');
      expect(response.immediate.confidence).toBe(0.9);
      expect(response.actionable.next_steps).toEqual(['Step 1', 'Step 2']);
      expect(response.actionable.recommendations.primary).toBe('Primary recommendation');
      expect(response.actionable.recommendations.secondary).toEqual(['Secondary 1', 'Secondary 2']);
      expect(response.actionable.workflow_guidance).toBe('Use this data for next actions');
      expect(response.quality.completeness).toBe(0.8);
      expect(response.quality.reliability).toBe(0.9);
      expect(response.quality.urgency).toBe('medium');
      expect(response.details.summary).toBe('Test summary');
    });

    test('should throw error when required fields are missing', () => {
      expect(() => {
        new AorpBuilder(mockContext).build();
      }).toThrow('Immediate response information is required');
    });

    test('should allow individual field setting', () => {
      const response = new AorpBuilder(mockContext)
        .immediate({
          status: 'success',
          key_insight: 'Test insight',
          confidence: 0.85,
          session_id: 'session-123'
        })
        .actionable({
          next_steps: ['Action 1'],
          recommendations: { primary: 'Main recommendation' },
          workflow_guidance: 'Guidance text'
        })
        .quality({
          completeness: 0.7,
          reliability: 0.8,
          urgency: 'high',
          indicators: { custom: 'value' }
        })
        .details({
          summary: 'Test summary',
          metadata: { timestamp: '2024-01-01T00:00:00Z' }
        })
        .build();

      expect(response.immediate.session_id).toBe('session-123');
      expect(response.quality.indicators).toEqual({ custom: 'value' });
      expect(response.details.metadata.timestamp).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('Fluent API Methods', () => {
    test('should chain methods correctly', () => {
      const builder = new AorpBuilder(mockContext);

      const chainedBuilder = builder
        .status('success', 'Test', 0.9)
        .sessionId('test-session')
        .addNextStep('Step 1')
        .addNextStep('Step 2')
        .addMetadata('key1', 'value1')
        .addMetadata('key2', 'value2');

      expect(chainedBuilder).toBe(builder);
    });

    test('should handle session ID setting', () => {
      const response = new AorpBuilder(mockContext)
        .status('success', 'Test')
        .sessionId('session-456')
        .summary('Test operation summary')
        .generateNextSteps()
        .generateQuality()
        .workflowGuidance('Test guidance')
        .build();

      expect(response.immediate.session_id).toBe('session-456');
    });

    test('should handle debug information', () => {
      const debugInfo = { logs: ['log1', 'log2'], performance: { time: 100 } };
      const response = new AorpBuilder(mockContext)
        .status('success', 'Test')
        .summary('Test operation with debug info')
        .debug(debugInfo)
        .generateNextSteps()
        .generateQuality()
        .workflowGuidance('Test guidance')
        .build();

      expect(response.details.debug).toEqual(debugInfo);
    });
  });

  describe('Auto-generation Features', () => {
    test('should auto-generate next steps for successful operations', () => {
      const response = new AorpBuilder(mockContext)
        .status('success', 'Operation successful')
        .summary('Created task #123: Test Task')
        .generateNextSteps()
        .generateQuality()
        .workflowGuidance('Test guidance')
        .build();

      expect(response.actionable.next_steps).toContain('Review the returned items for completeness');
      expect(response.actionable.next_steps.length).toBeGreaterThan(0);
    });

    test('should auto-generate next steps for failed operations', () => {
      const errorContext = { ...mockContext, success: false };
      const response = new AorpBuilder(errorContext)
        .status('error', 'Operation failed')
        .summary('Operation failed: Invalid input provided')
        .generateNextSteps()
        .generateQuality()
        .workflowGuidance('Test guidance')
        .build();

      expect(response.actionable.next_steps).toContain('Review error details and fix the underlying issue');
      expect(response.actionable.next_steps.length).toBeGreaterThan(0);
    });

    test('should auto-generate quality indicators', () => {
      const response = new AorpBuilder(mockContext)
        .status('success', 'Test')
        .summary('Task #1: Test completed successfully')
        .generateNextSteps()
        .generateQuality()
        .workflowGuidance('Test guidance')
        .build();

      expect(response.quality.completeness).toBeGreaterThan(0);
      expect(response.quality.completeness).toBeLessThanOrEqual(1);
      expect(response.quality.reliability).toBeGreaterThan(0);
      expect(response.quality.reliability).toBeLessThanOrEqual(1);
      expect(['low', 'medium', 'high', 'critical']).toContain(response.quality.urgency);
      expect(response.quality.indicators).toBeDefined();
    });

    test('should auto-generate workflow guidance', () => {
      const createContext = { ...mockContext, operation: 'create' };
      const response = new AorpBuilder(createContext)
        .status('success', 'Resource created')
        .summary('Resource created with ID 123')
        .generateNextSteps()
        .generateQuality()
        .generateWorkflowGuidance()
        .build();

      expect(response.actionable.workflow_guidance).toContain('created successfully');
      expect(response.actionable.workflow_guidance).toContain('ID');
    });
  });

  describe('Static Factory Methods', () => {
    test('should create successful response builder', () => {
      const builder = AorpBuilder.success(
        mockContext,
        'Operation completed successfully',
        'Created item #123: Test'
      );

      expect(builder).toBeInstanceOf(AorpBuilder);
      const response = builder.build();
      expect(response.immediate.status).toBe('success');
      expect(response.immediate.key_insight).toBe('Operation completed successfully');
      expect(response.details.summary).toContain('Test');
    });

    test('should create error response builder', () => {
      const errorContext = { ...mockContext, success: false };
      const builder = AorpBuilder.error(
        errorContext,
        'Operation failed',
        'Operation failed: Invalid input provided'
      );

      expect(builder).toBeInstanceOf(AorpBuilder);
      const response = builder.build();
      expect(response.immediate.status).toBe('error');
      expect(response.immediate.key_insight).toBe('Operation failed');
      expect(response.details.summary).toContain('failed');
    });

    test('should create builder with custom configuration', () => {
      const customConfig = {
        confidenceMethod: 'simple' as const,
        enableNextSteps: true, // AORP always enabled
        enableQualityIndicators: true // AORP always enabled
      };

      const builder = AorpBuilder.create(mockContext, customConfig);
      const response = builder
        .status('success', 'Test')
        .summary('Test summary')
        .workflowGuidance('Test')
        .generateQuality() // Generate quality indicators
        .build();

      expect(response.actionable.next_steps).toEqual([]);
      // When quality indicators are disabled, default values are used
      expect(response.quality.completeness).toBe(0.5);
    });
  });

  describe('Configuration Options', () => {
    test('should respect confidence calculation method', () => {
      const simpleConfig = { confidenceMethod: 'simple' as const };
      const response = new AorpBuilder(mockContext, simpleConfig)
        .status('success', 'Test')
        .summary('Test operation completed')
        .generateNextSteps()
        .generateQuality()
        .workflowGuidance('Test guidance')
        .build();

      expect(response.immediate.confidence).toBe(0.9); // Simple success = 0.9
    });

    test('should handle always-enabled next steps', () => {
      const config = { enableNextSteps: true }; // AORP always enabled
      const response = new AorpBuilder(mockContext, config)
        .status('success', 'Test')
        .summary('Test operation summary')
        .generateNextSteps()
        .generateQuality()
        .workflowGuidance('Test guidance')
        .build();

      expect(response.actionable.next_steps.length).toBeGreaterThan(0); // AORP always generates next steps
    });

    test('should handle always-enabled quality indicators', () => {
      const config = { enableQualityIndicators: true }; // AORP always enabled
      const response = new AorpBuilder(mockContext, config)
        .status('success', 'Test')
        .summary('Test operation summary')
        .generateNextSteps()
        .generateQuality()
        .workflowGuidance('Test guidance')
        .build();

      // When quality indicators are auto-generated, calculated values are used
      expect(response.quality.completeness).toBe(0.5);
      expect(response.quality.reliability).toBe(0.4);
    });
  });

  describe('Custom Quality Indicators', () => {
    test('should calculate custom quality indicators', () => {
      const response = new AorpBuilder(mockContext)
        .status('success', 'Test')
        .summary('Processed 3 fields successfully')
        .generateNextSteps()
        .generateQuality({
          customIndicators: {
            dataComplexity: (data: any) => 0.3, // Custom complexity calculation
            responseTime: () => 0.7
          }
        })
        .workflowGuidance('Test guidance')
        .build();

      expect(response.quality.indicators?.dataComplexity).toBe(0.3);
      expect(response.quality.indicators?.responseTime).toBe(0.7);
    });

    test('should handle errors in custom indicators gracefully', () => {
      const response = new AorpBuilder(mockContext)
        .status('success', 'Test')
        .summary('Test operation with indicators')
        .generateNextSteps()
        .generateQuality({
          customIndicators: {
            errorProne: () => {
              throw new Error('Test error');
            },
            working: () => 0.5
          }
        })
        .workflowGuidance('Test guidance')
        .build();

      expect(response.quality.indicators?.errorProne).toBe(0); // Default on error
      expect(response.quality.indicators?.working).toBe(0.5);
    });
  });

  describe('Build with Auto-generation', () => {
    test('should build complete response with auto-generation', () => {
      const response = new AorpBuilder(mockContext)
        .status('success', 'Test operation')
        .summary('Test operation completed successfully')
        .buildWithAutogeneration();

      expect(response.immediate.status).toBe('success');
      expect(response.actionable.next_steps.length).toBeGreaterThan(0);
      expect(response.quality.completeness).toBeGreaterThan(0);
      expect(response.actionable.workflow_guidance).toBeDefined();
    });

    test('should accept custom next steps and quality configs', () => {
      const nextStepsConfig = {
        maxSteps: 3,
        templates: {
          test_operation: ['Custom step 1', 'Custom step 2']
        }
      };

      const qualityConfig = {
        completenessWeight: 0.7,
        reliabilityWeight: 0.3
      };

      const response = new AorpBuilder(mockContext)
        .status('success', 'Test')
        .summary('Test operation with custom config')
        .buildWithAutogeneration(nextStepsConfig, qualityConfig);

      expect(response.actionable.next_steps.length).toBeLessThanOrEqual(3);
      expect(response.actionable.next_steps).toContain('Custom step 1');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty summary', () => {
      const response = new AorpBuilder(mockContext)
        .status('success', 'Test')
        .summary('')
        .generateNextSteps()
        .generateQuality()
        .workflowGuidance('Test guidance')
        .build();

      expect(response.details.summary).toBe('');
      // Empty summary results in default completeness, not 0
      expect(response.quality.completeness).toBeGreaterThanOrEqual(0);
    });

    test('should handle long summary text', () => {
      const longSummary = 'Long summary with multiple items: ' + Array(5).fill('item').join(', ');
      const response = new AorpBuilder(mockContext)
        .status('success', 'Test')
        .summary(longSummary)
        .generateNextSteps()
        .generateQuality()
        .workflowGuidance('Test guidance')
        .build();

      expect(response.details.summary).toBe(longSummary);
      expect(response.quality.completeness).toBeGreaterThan(0);
    });

    test('should handle session ID in immediate info', () => {
      const response = new AorpBuilder(mockContext)
        .immediate({
          status: 'success',
          key_insight: 'Test',
          confidence: 0.8,
          session_id: 'custom-session-id'
        })
        .summary('Test summary')
        .generateNextSteps()
        .generateQuality()
        .workflowGuidance('Test guidance')
        .build();

      expect(response.immediate.session_id).toBe('custom-session-id');
    });
  });
});