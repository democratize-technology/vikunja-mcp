import { CircuitBreaker, CircuitState, CircuitOpenError, circuitBreakerManager } from '../../../src/utils/performance/circuit-breaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      resetTimeout: 1000, // 1 second for testing
      enableMetrics: true,
    });
  });

  describe('initialization', () => {
    it('should start in closed state', () => {
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.failures).toBe(0);
      expect(metrics.successes).toBe(0);
    });

    it('should accept custom options', () => {
      const customBreaker = new CircuitBreaker('custom', {
        failureThreshold: 5,
        resetTimeout: 2000,
      });
      
      const metrics = customBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('successful operations', () => {
    it('should execute successful operations normally', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.successes).toBe(1);
      expect(metrics.failures).toBe(0);
      expect(metrics.state).toBe(CircuitState.CLOSED);
    });

    it('should track multiple successful operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(mockOperation);
      await circuitBreaker.execute(mockOperation);
      await circuitBreaker.execute(mockOperation);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.successes).toBe(3);
      expect(metrics.failures).toBe(0);
      expect(metrics.requests).toBe(3);
    });
  });

  describe('failure handling', () => {
    it('should track failures without opening on threshold-1', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Fail 2 times (threshold is 3)
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failures).toBe(2);
      expect(metrics.state).toBe(CircuitState.CLOSED);
    });

    it('should open circuit when failure threshold is reached', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Fail 3 times to reach threshold
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failures).toBe(3);
      expect(metrics.state).toBe(CircuitState.OPEN);
    });

    it('should reject requests immediately when circuit is open', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Reach failure threshold
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      
      // Next request should be rejected immediately
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow(CircuitOpenError);
      
      // Mock operation should not have been called for the 4th time
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });
  });

  describe('half-open state and recovery', () => {
    it('should transition to half-open after reset timeout', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Open the circuit
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      
      expect(circuitBreaker.getMetrics().state).toBe(CircuitState.OPEN);
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100)); // slightly more than 1000ms
      
      // Next operation should be attempted (half-open state)
      mockOperation.mockResolvedValueOnce('recovery');
      const result = await circuitBreaker.execute(mockOperation);
      
      expect(result).toBe('recovery');
      expect(circuitBreaker.getMetrics().state).toBe(CircuitState.CLOSED);
    });

    it('should close circuit on successful operation in half-open state', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('error1'))
        .mockRejectedValueOnce(new Error('error2'))
        .mockRejectedValueOnce(new Error('error3'))
        .mockResolvedValueOnce('success');
      
      // Open the circuit
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Successful operation should close the circuit
      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBe('success');
      expect(circuitBreaker.getMetrics().state).toBe(CircuitState.CLOSED);
    });

    it('should reopen circuit on failure in half-open state', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValue(new Error('test error'));
      
      // Open the circuit
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Failed operation should reopen the circuit
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('test error');
      expect(circuitBreaker.getMetrics().state).toBe(CircuitState.OPEN);
    });
  });

  describe('manual control', () => {
    it('should reset circuit to closed state', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Open the circuit
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow();
      
      expect(circuitBreaker.getMetrics().state).toBe(CircuitState.OPEN);
      
      // Manual reset
      circuitBreaker.reset();
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.failures).toBe(0);
    });

    it('should force circuit to open state', () => {
      expect(circuitBreaker.getMetrics().state).toBe(CircuitState.CLOSED);
      
      circuitBreaker.forceOpen();
      
      expect(circuitBreaker.getMetrics().state).toBe(CircuitState.OPEN);
    });
  });

  describe('metrics', () => {
    it('should track comprehensive metrics', async () => {
      const successOp = jest.fn().mockResolvedValue('success');
      const failOp = jest.fn().mockRejectedValue(new Error('failure'));

      // Add small delay to ensure measurable uptime
      await new Promise(resolve => setTimeout(resolve, 10));

      await circuitBreaker.execute(successOp);
      await circuitBreaker.execute(successOp);
      await expect(circuitBreaker.execute(failOp)).rejects.toThrow();

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.successes).toBe(2);
      expect(metrics.failures).toBe(1);
      expect(metrics.requests).toBe(3);
      expect(metrics.stateChanges).toBeGreaterThanOrEqual(0);
      expect(metrics.uptime).toBeGreaterThan(0);
    });

    it('should track last failure and success times', async () => {
      const successOp = jest.fn().mockResolvedValue('success');
      const failOp = jest.fn().mockRejectedValue(new Error('failure'));
      
      await circuitBreaker.execute(successOp);
      const afterSuccess = circuitBreaker.getMetrics();
      expect(afterSuccess.lastSuccessTime).toBeDefined();
      
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await expect(circuitBreaker.execute(failOp)).rejects.toThrow();
      const afterFailure = circuitBreaker.getMetrics();
      expect(afterFailure.lastFailureTime).toBeDefined();
      expect(afterFailure.lastFailureTime!).toBeGreaterThanOrEqual(afterSuccess.lastSuccessTime!);
    });
  });
});

describe('CircuitBreakerManager', () => {
  beforeEach(() => {
    // Reset all breakers before each test
    circuitBreakerManager.resetAll();
  });

  it('should create and manage multiple circuit breakers', () => {
    const breaker1 = circuitBreakerManager.getBreaker('service1');
    const breaker2 = circuitBreakerManager.getBreaker('service2');
    
    expect(breaker1).toBeDefined();
    expect(breaker2).toBeDefined();
    expect(breaker1).not.toBe(breaker2);
  });

  it('should return same instance for same service name', () => {
    const breaker1 = circuitBreakerManager.getBreaker('service1');
    const breaker2 = circuitBreakerManager.getBreaker('service1');
    
    expect(breaker1).toBe(breaker2);
  });

  it('should get metrics for all breakers', async () => {
    const breaker1 = circuitBreakerManager.getBreaker('service1');
    const breaker2 = circuitBreakerManager.getBreaker('service2');
    
    const successOp = jest.fn().mockResolvedValue('success');
    await breaker1.execute(successOp);
    await breaker2.execute(successOp);
    
    const allMetrics = circuitBreakerManager.getAllMetrics();
    expect(allMetrics).toHaveProperty('service1');
    expect(allMetrics).toHaveProperty('service2');
    expect(allMetrics.service1.successes).toBe(1);
    expect(allMetrics.service2.successes).toBe(1);
  });

  it('should provide health status summary', async () => {
    const breaker1 = circuitBreakerManager.getBreaker('healthy-service');
    const breaker2 = circuitBreakerManager.getBreaker('failing-service', { failureThreshold: 1 });
    
    const successOp = jest.fn().mockResolvedValue('success');
    const failOp = jest.fn().mockRejectedValue(new Error('failure'));
    
    await breaker1.execute(successOp);
    await expect(breaker2.execute(failOp)).rejects.toThrow();
    
    const health = circuitBreakerManager.getHealthStatus();
    expect(health.healthy).toContain('healthy-service');
    expect(health.failed).toContain('failing-service');
  });

  it('should reset all circuit breakers', async () => {
    const breaker1 = circuitBreakerManager.getBreaker('service1-reset', { failureThreshold: 1 });
    const breaker2 = circuitBreakerManager.getBreaker('service2-reset', { failureThreshold: 1 });
    
    const failOp = jest.fn().mockRejectedValue(new Error('failure'));
    
    // Open both circuits by reaching failure threshold
    await expect(breaker1.execute(failOp)).rejects.toThrow('failure');
    await expect(breaker2.execute(failOp)).rejects.toThrow('failure');
    
    // Verify circuits are open
    expect(breaker1.getMetrics().state).toBe(CircuitState.OPEN);
    expect(breaker2.getMetrics().state).toBe(CircuitState.OPEN);
    
    // Reset all
    circuitBreakerManager.resetAll();
    
    // Verify circuits are closed after reset
    expect(breaker1.getMetrics().state).toBe(CircuitState.CLOSED);
    expect(breaker2.getMetrics().state).toBe(CircuitState.CLOSED);
  });
});