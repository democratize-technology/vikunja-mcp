/**
 * AORP Integration Tests
 * Tests the integration of AORP with the existing response factory system
 */

import { ResponseFactory } from '../../src/utils/response-factory';
import { Verbosity } from '../../src/transforms/base';
import { createOptimizedResponse } from '../../src/utils/response-factory';

describe('AORP Integration', () => {
  let responseFactory: ResponseFactory;

  beforeEach(() => {
    responseFactory = new ResponseFactory({
      enableAorp: true,
      enableOptimization: true,
      defaultAorpOptions: {
        builderConfig: {
          confidenceMethod: 'adaptive',
          enableNextSteps: true,
          enableQualityIndicators: true
        }
      }
    });
  });

  describe('Response Factory with AORP', () => {
    test('should create AORP-enabled factory', () => {
      const aorpFactory = new ResponseFactory({
        enableAorp: true,
        enableOptimization: true
      });

      expect(aorpFactory).toBeInstanceOf(ResponseFactory);
      expect(aorpFactory.getConfig().enableAorp).toBe(true);
    });

    test('should create AORP response from optimized response', () => {
      const optimizedResponse = createOptimizedResponse(
        'test_operation',
        'Test operation successful',
        { id: 123, title: 'Test Task' },
        { count: 1 },
        Verbosity.STANDARD
      );

      const aorpResult = responseFactory.createAorpResponse(optimizedResponse);

      expect(aorpResult.response).toBeDefined();
      expect(aorpResult.transformation).toBeDefined();
      expect(aorpResult.response.immediate.status).toBe('success');
      expect(aorpResult.response.actionable.next_steps.length).toBeGreaterThan(0);
      expect(aorpResult.response.quality.completeness).toBeGreaterThan(0);
    });

    test('should throw error when AORP is not enabled', () => {
      const nonAorpFactory = new ResponseFactory({ enableAorp: false });
      const optimizedResponse = createOptimizedResponse('test', 'Test', {});

      expect(() => {
        nonAorpFactory.createAorpResponse(optimizedResponse);
      }).toThrow('AORP is not enabled in this factory configuration');
    });

    test('should create AORP response from data', () => {
      const aorpResult = responseFactory.createAorpFromData(
        'create',
        { id: 456, title: 'New Project' },
        true,
        'Project created successfully'
      );

      expect(aorpResult.response.immediate.status).toBe('success');
      expect(aorpResult.response.immediate.key_insight).toContain('Successfully created');
      expect(aorpResult.response.details.data).toEqual({ id: 456, title: 'New Project' });
    });

    test('should create AORP response from error', () => {
      const testError = new Error('Validation failed');

      const aorpResult = responseFactory.createAorpFromError('update', testError);

      expect(aorpResult.response.immediate.status).toBe('error');
      expect(aorpResult.response.immediate.key_insight).toContain('Validation failed');
      expect(aorpResult.transformation.context.errors).toContain('Validation failed');
    });
  });

  describe('Unified Response Creation', () => {
    test('should create standard response when useAorp is false', () => {
      const response = responseFactory.createResponse(
        'test_operation',
        'Test message',
        { id: 123 },
        { count: 1 },
        {
          useAorp: false,
          verbosity: Verbosity.STANDARD
        }
      );

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('operation');
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('metadata');
    });

    test('should create AORP response when useAorp is true', () => {
      const response = responseFactory.createResponse(
        'test_operation',
        'Test message',
        { id: 123 },
        { count: 1 },
        {
          useAorp: true,
          verbosity: Verbosity.STANDARD
        }
      );

      expect(response).toHaveProperty('response');
      expect(response).toHaveProperty('transformation');
      expect(response.response).toHaveProperty('immediate');
      expect(response.response).toHaveProperty('actionable');
      expect(response.response).toHaveProperty('quality');
      expect(response.response).toHaveProperty('details');
    });

    test('should merge AORP options correctly', () => {
      const response = responseFactory.createResponse(
        'test_operation',
        'Test message',
        { id: 123 },
        { count: 1 },
        {
          useAorp: true,
          verbosity: Verbosity.DETAILED,
          aorpOptions: {
            sessionId: 'test-session-123',
            includeDebug: true
          }
        }
      );

      expect(response.response.immediate.session_id).toBe('test-session-123');
      expect(response.response.details.debug).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain existing response factory methods', () => {
      const factory = new ResponseFactory();

      expect(() => {
        factory.createStandardResponse('test', 'message', {});
        factory.createTaskResponse('test', 'message', {});
      }).not.toThrow();
    });

    test('should work with existing optimized responses', () => {
      const factory = new ResponseFactory({ enableAorp: true });
      const optimizedResponse = createOptimizedResponse(
        'test',
        'Test message',
        { data: 'test' }
      );

      expect(() => {
        factory.createAorpResponse(optimizedResponse);
      }).not.toThrow();
    });
  });

  describe('Configuration Management', () => {
    test('should update AORP configuration', () => {
      const newConfig = {
        builderConfig: {
          confidenceMethod: 'simple' as const,
          enableNextSteps: false
        }
      };

      responseFactory.updateAorpConfig(newConfig);
      const retrievedConfig = responseFactory.getAorpConfig();

      expect(retrievedConfig.builderConfig?.confidenceMethod).toBe('simple');
      expect(retrievedConfig.builderConfig?.enableNextSteps).toBe(false);
    });
  });
});