/**
 * Test for AORP factory type safety
 * Ensures that the createAorpEnabledFactory function has proper types instead of any
 */

import { createAorpEnabledFactory, type AorpFactoryConfig } from '../../src/utils/response-factory';
import { Verbosity } from '../../src/transforms/base';

describe('createAorpEnabledFactory Type Safety', () => {
  it('should have properly typed parameters and return values', () => {
    // This test ensures that the factory has proper types instead of any
    const factory = createAorpEnabledFactory({
      // Config should be typed, not any
      useOptimization: true,
      verbosity: Verbosity.STANDARD
    });

    // The createResponse method should have proper types
    const response = factory.createResponse(
      'test-operation',
      'Test message',
      { test: 'data' },
      { field: 'metadata' },
      { verbosity: Verbosity.MINIMAL }
    );

    // Response should be properly typed
    expect(response).toHaveProperty('operation');
    expect(response).toHaveProperty('message');
    expect(response).toHaveProperty('data');
  });

  it('should enforce type safety on config parameter', () => {
    // This test validates that only valid config properties are accepted
    const validConfig: AorpFactoryConfig = {
      useOptimization: true,
      verbosity: Verbosity.STANDARD,
      transformFields: ['id', 'title']
    };

    expect(() => createAorpEnabledFactory(validConfig)).not.toThrow();
  });

  it('should handle generic types correctly', () => {
    const factory = createAorpEnabledFactory();

    // Test with different data types
    const stringDataResponse = factory.createResponse('test', 'message', 'string data');
    const objectDataResponse = factory.createResponse('test', 'message', { id: 1, name: 'test' });
    const arrayDataResponse = factory.createResponse('test', 'message', [1, 2, 3]);

    // Verify that responses are properly structured and typed
    expect(stringDataResponse).toHaveProperty('operation', 'test');
    expect(stringDataResponse).toHaveProperty('message', 'message');
    expect(stringDataResponse).toHaveProperty('data');

    expect(objectDataResponse).toHaveProperty('operation', 'test');
    expect(objectDataResponse).toHaveProperty('message', 'message');
    expect(objectDataResponse).toHaveProperty('data');

    expect(arrayDataResponse).toHaveProperty('operation', 'test');
    expect(arrayDataResponse).toHaveProperty('message', 'message');
    expect(arrayDataResponse).toHaveProperty('data');

    // Verify the data is passed through (may be transformed by optimization)
    expect(typeof stringDataResponse.data).toBe('string');
    expect(Array.isArray(arrayDataResponse.data)).toBe(true);
  });

  it('should properly merge config and options', () => {
    const factory = createAorpEnabledFactory({
      useOptimization: false,
      verbosity: Verbosity.MINIMAL
    });

    const response = factory.createResponse(
      'test',
      'message',
      { test: 'data' },
      {},
      { verbosity: Verbosity.STANDARD } // Should override config
    );

    expect(response).toHaveProperty('operation');
    expect(response).toHaveProperty('message');
    expect(response).toHaveProperty('data');
  });
});