import { withRetry, isTransientError, RETRY_CONFIG } from '../../src/utils/retry';
import { isAuthenticationError } from '../../src/utils/auth-error-handler';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/auth-error-handler', () => ({
  isAuthenticationError: jest.fn()
}));

describe('retry utility', () => {
  const mockIsAuthenticationError = isAuthenticationError as jest.MockedFunction<typeof isAuthenticationError>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockIsAuthenticationError.mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('withRetry', () => {
    it('should return result on successful operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on authentication error', async () => {
      const authError = new Error('Authentication failed');
      mockIsAuthenticationError.mockReturnValue(true);
      
      const operation = jest.fn()
        .mockRejectedValueOnce(authError)
        .mockRejectedValueOnce(authError)
        .mockResolvedValueOnce('success');
      
      const promise = withRetry(operation);
      
      // First retry after 1000ms
      await jest.advanceTimersByTimeAsync(1000);
      // Second retry after 2000ms (1000 * 2^1)
      await jest.advanceTimersByTimeAsync(2000);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(logger.debug).toHaveBeenCalledTimes(2);
    });

    it('should retry on transient network error', async () => {
      const networkError = new Error('ECONNRESET: connection reset');
      
      const operation = jest.fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce('success');
      
      const promise = withRetry(operation);
      
      await jest.advanceTimersByTimeAsync(1000);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const authError = new Error('Authentication failed');
      mockIsAuthenticationError.mockReturnValue(true);
      
      const operation = jest.fn().mockRejectedValue(authError);
      
      const promise = withRetry(operation, { maxRetries: 2 });
      
      // Handle the rejection to avoid unhandled promise rejection
      promise.catch(() => {});
      
      // First retry
      await jest.advanceTimersByTimeAsync(1000);
      // Second retry
      await jest.advanceTimersByTimeAsync(2000);
      
      await expect(promise).rejects.toThrow('Authentication failed');
      expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should not retry on non-retryable error', async () => {
      const validationError = new Error('Invalid input');
      
      const operation = jest.fn().mockRejectedValue(validationError);
      
      await expect(withRetry(operation)).rejects.toThrow('Invalid input');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use custom retry options', async () => {
      const error = new Error('Custom error');
      const customShouldRetry = jest.fn().mockReturnValue(true);
      
      const operation = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');
      
      const promise = withRetry(operation, {
        maxRetries: 1,
        initialDelay: 500,
        maxDelay: 5000,
        backoffFactor: 3,
        shouldRetry: customShouldRetry
      });
      
      await jest.advanceTimersByTimeAsync(500);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(customShouldRetry).toHaveBeenCalledWith(error);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should respect max delay', async () => {
      const error = new Error('Error');
      mockIsAuthenticationError.mockReturnValue(true);
      
      const operation = jest.fn().mockRejectedValue(error);
      
      const promise = withRetry(operation, {
        maxRetries: 5,
        initialDelay: 1000,
        maxDelay: 3000,
        backoffFactor: 2
      });
      
      // Handle the rejection to avoid unhandled promise rejection
      promise.catch(() => {});
      
      // Delays should be: 1000, 2000, 3000 (capped), 3000 (capped), 3000 (capped)
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(3000);
      await jest.advanceTimersByTimeAsync(3000);
      await jest.advanceTimersByTimeAsync(3000);
      
      await expect(promise).rejects.toThrow('Error');
      expect(operation).toHaveBeenCalledTimes(6); // initial + 5 retries
    });

    it('should handle non-Error objects', async () => {
      const stringError = 'String error';
      
      const operation = jest.fn()
        .mockRejectedValueOnce(stringError)
        .mockResolvedValueOnce('success');
      
      // String errors are not retryable by default
      await expect(withRetry(operation)).rejects.toBe('String error');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should calculate exponential backoff correctly', async () => {
      const error = new Error('Error');
      mockIsAuthenticationError.mockReturnValue(true);
      
      const operation = jest.fn().mockRejectedValue(error);
      const debugCalls: any[] = [];
      
      (logger.debug as jest.Mock).mockImplementation((msg, data) => {
        debugCalls.push({ msg, data });
      });
      
      const promise = withRetry(operation, {
        maxRetries: 3,
        initialDelay: 100,
        backoffFactor: 2
      });
      
      // Handle the rejection to avoid unhandled promise rejection
      promise.catch(() => {});
      
      // First retry: 100ms
      await jest.advanceTimersByTimeAsync(100);
      expect(debugCalls[0].msg).toContain('Retrying operation after 100ms');
      
      // Second retry: 200ms (100 * 2^1)
      await jest.advanceTimersByTimeAsync(200);
      expect(debugCalls[1].msg).toContain('Retrying operation after 200ms');
      
      // Third retry: 400ms (100 * 2^2)
      await jest.advanceTimersByTimeAsync(400);
      expect(debugCalls[2].msg).toContain('Retrying operation after 400ms');
      
      await expect(promise).rejects.toThrow('Error');
    });
  });

  describe('isTransientError', () => {
    it('should identify timeout errors', () => {
      expect(isTransientError(new Error('Request timeout'))).toBe(true);
      expect(isTransientError(new Error('Operation timed out'))).toBe(true);
      expect(isTransientError(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('should identify connection reset errors', () => {
      expect(isTransientError(new Error('ECONNRESET'))).toBe(true);
      expect(isTransientError(new Error('Connection reset by peer'))).toBe(true);
    });

    it('should identify socket errors', () => {
      expect(isTransientError(new Error('socket hang up'))).toBe(true);
      expect(isTransientError(new Error('Socket closed unexpectedly'))).toBe(true);
    });

    it('should identify network errors', () => {
      expect(isTransientError(new Error('Network error'))).toBe(true);
      expect(isTransientError(new Error('Unable to connect to network'))).toBe(true);
    });

    it('should not identify non-transient errors', () => {
      expect(isTransientError(new Error('Invalid input'))).toBe(false);
      expect(isTransientError(new Error('Authentication failed'))).toBe(false);
      expect(isTransientError(new Error('Not found'))).toBe(false);
    });

    it('should handle non-Error objects', () => {
      expect(isTransientError('string error')).toBe(false);
      expect(isTransientError(null)).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
      expect(isTransientError({})).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isTransientError(new Error('TIMEOUT'))).toBe(true);
      expect(isTransientError(new Error('Network Error'))).toBe(true);
      expect(isTransientError(new Error('SOCKET HANG UP'))).toBe(true);
    });
  });

  describe('RETRY_CONFIG', () => {
    it('should have AUTH_ERRORS configuration', () => {
      expect(RETRY_CONFIG.AUTH_ERRORS).toEqual({
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2,
        enableCircuitBreaker: true,
        circuitBreakerName: 'vikunja-auth-connect'
      });
    });

    it('should have NETWORK_ERRORS configuration', () => {
      expect(RETRY_CONFIG.NETWORK_ERRORS).toEqual({
        maxRetries: 5,
        initialDelay: 500,
        maxDelay: 30000,
        backoffFactor: 1.5,
        enableCircuitBreaker: true,
        circuitBreakerName: 'vikunja-api-operations'
      });
    });
  });
});