/**
 * Tests for filtering strategy pattern exports
 * Ensures all components are properly exported and accessible
 */

import { describe, it, expect } from '@jest/globals';
import { 
  ServerSideFilteringStrategy,
  ClientSideFilteringStrategy,
  HybridFilteringStrategy,
  FilteringContext
} from '../../../src/utils/filtering';

describe('Filtering Strategy Pattern Exports', () => {
  describe('strategy implementations', () => {
    it('should export ServerSideFilteringStrategy', () => {
      expect(ServerSideFilteringStrategy).toBeDefined();
      expect(typeof ServerSideFilteringStrategy).toBe('function');
    });

    it('should export ClientSideFilteringStrategy', () => {
      expect(ClientSideFilteringStrategy).toBeDefined();
      expect(typeof ClientSideFilteringStrategy).toBe('function');
    });

    it('should export HybridFilteringStrategy', () => {
      expect(HybridFilteringStrategy).toBeDefined();
      expect(typeof HybridFilteringStrategy).toBe('function');
    });
  });

  describe('context', () => {
    it('should export FilteringContext', () => {
      expect(FilteringContext).toBeDefined();
      expect(typeof FilteringContext).toBe('function');
    });
  });

  describe('integration verification', () => {
    it('should be able to instantiate all strategies', () => {
      // These should not throw during instantiation
      expect(() => new ServerSideFilteringStrategy()).not.toThrow();
      expect(() => new ClientSideFilteringStrategy()).not.toThrow();
      expect(() => new HybridFilteringStrategy()).not.toThrow();
    });

    it('should be able to instantiate FilteringContext with config', () => {
      const config = { enableServerSide: false };
      expect(() => new FilteringContext(config)).not.toThrow();
    });

    it('should create instances that have execute method', () => {
      const serverStrategy = new ServerSideFilteringStrategy();
      const clientStrategy = new ClientSideFilteringStrategy();
      const hybridStrategy = new HybridFilteringStrategy();

      expect(serverStrategy).toHaveProperty('execute');
      expect(clientStrategy).toHaveProperty('execute');
      expect(hybridStrategy).toHaveProperty('execute');
      expect(typeof serverStrategy.execute).toBe('function');
      expect(typeof clientStrategy.execute).toBe('function');
      expect(typeof hybridStrategy.execute).toBe('function');
    });

    it('should create FilteringContext that has execute method', () => {
      const context = new FilteringContext({ enableServerSide: false });
      expect(context).toHaveProperty('execute');
      expect(typeof context.execute).toBe('function');
    });
  });
});