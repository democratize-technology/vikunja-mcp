/**
 * Logger Tests
 * Tests for the structured logging system
 */

import { logger, LogLevel } from '../../src/utils/logger';

describe('Logger', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear any existing environment variables
    delete process.env.DEBUG;
    delete process.env.LOG_LEVEL;
    // Spy on console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  describe('Log Level Configuration', () => {
    it('should default to INFO level when no environment variables are set', () => {
      // Create a new logger instance by requiring the module fresh
      jest.resetModules();
      const { logger: testLogger } = require('../../src/utils/logger');

      testLogger.info('test info');
      testLogger.debug('test debug');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO] test info'));
    });

    it('should use DEBUG level when DEBUG=true', () => {
      process.env.DEBUG = 'true';
      jest.resetModules();
      const { logger: testLogger } = require('../../src/utils/logger');

      testLogger.debug('test debug');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] test debug'));
    });

    it('should respect LOG_LEVEL environment variable', () => {
      process.env.LOG_LEVEL = 'error';
      jest.resetModules();
      const { logger: testLogger } = require('../../src/utils/logger');

      testLogger.error('test error');
      testLogger.warn('test warn');
      testLogger.info('test info');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR] test error'));
    });

    it('should handle all log levels correctly', () => {
      const levels = ['error', 'warn', 'info', 'debug'];

      levels.forEach((level, index) => {
        consoleErrorSpy.mockClear();
        process.env.LOG_LEVEL = level;
        jest.resetModules();
        const { logger: testLogger } = require('../../src/utils/logger');

        testLogger.error('error message');
        testLogger.warn('warn message');
        testLogger.info('info message');
        testLogger.debug('debug message');

        // Should log this level and all more severe levels
        expect(consoleErrorSpy).toHaveBeenCalledTimes(index + 1);
      });
    });

    it('should handle invalid LOG_LEVEL gracefully', () => {
      process.env.LOG_LEVEL = 'invalid';
      process.env.DEBUG = 'false';
      jest.resetModules();
      const { logger: testLogger } = require('../../src/utils/logger');

      testLogger.info('test info');

      // Should default to INFO when invalid
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO] test info'));
    });

    it('should use DEBUG level when LOG_LEVEL is invalid but DEBUG=true', () => {
      process.env.LOG_LEVEL = 'invalid';
      process.env.DEBUG = 'true';
      jest.resetModules();
      const { logger: testLogger } = require('../../src/utils/logger');

      testLogger.debug('test debug');

      // Should default to DEBUG when invalid LOG_LEVEL but DEBUG=true
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] test debug'));
    });
  });

  describe('Log Formatting', () => {
    it('should include timestamp in ISO format', () => {
      logger.info('test message');

      const logCall = consoleErrorSpy.mock.calls[0][0];
      const timestampMatch = logCall.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/);
      expect(timestampMatch).toBeTruthy();

      // Verify it's a valid date
      const timestamp = new Date(timestampMatch[1]);
      expect(timestamp.toISOString()).toBe(timestampMatch[1]);
    });

    it('should include log level in output', () => {
      logger.error('error test');
      logger.warn('warn test');
      logger.info('info test');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO]'));
    });

    it('should format messages with util.format', () => {
      logger.info('User %s logged in with id %d', 'john', 123);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('User john logged in with id 123'),
      );
    });

    it('should handle objects and arrays in formatting', () => {
      const obj = { foo: 'bar', baz: 42 };
      const arr = [1, 2, 3];

      logger.info('Object: %j, Array: %j', obj, arr);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Object: {"foo":"bar","baz":42}, Array: [1,2,3]'),
      );
    });
  });

  describe('Log Methods', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'debug';
      jest.resetModules();
    });

    it('should log error messages', () => {
      const { logger: testLogger } = require('../../src/utils/logger');
      testLogger.error('Error occurred', new Error('Test error'));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Error occurred Error: Test error'),
      );
    });

    it('should log warning messages', () => {
      const { logger: testLogger } = require('../../src/utils/logger');
      testLogger.warn('Warning: %s', 'something suspicious');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] Warning: something suspicious'),
      );
    });

    it('should log info messages', () => {
      const { logger: testLogger } = require('../../src/utils/logger');
      testLogger.info('Server started on port %d', 3000);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] Server started on port 3000'),
      );
    });

    it('should log debug messages', () => {
      const { logger: testLogger } = require('../../src/utils/logger');
      testLogger.debug('Debug data:', { user: 'test', action: 'login' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[DEBUG] Debug data: { user: 'test', action: 'login' }"),
      );
    });
  });

  describe('Log Level Filtering', () => {
    it('should not log below configured level', () => {
      process.env.LOG_LEVEL = 'warn';
      jest.resetModules();
      const { logger: testLogger } = require('../../src/utils/logger');

      testLogger.error('error message');
      testLogger.warn('warn message');
      testLogger.info('info message');
      testLogger.debug('debug message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('info message'));
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('debug message'));
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined and null arguments', () => {
      logger.info('Values:', undefined, null);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Values: undefined null'),
      );
    });

    it('should handle circular references in objects', () => {
      const circular: any = { a: 1 };
      circular.self = circular;

      logger.info('Circular:', circular);

      // Should not throw an error
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle empty messages', () => {
      logger.info('');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/\[INFO\]\s*$/));
    });
  });
});
