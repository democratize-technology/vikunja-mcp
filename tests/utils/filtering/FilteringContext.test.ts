/**
 * Tests for FilteringContext
 * Ensures strategy selection logic is properly tested
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { FilteringContext } from '../../../src/utils/filtering/FilteringContext';
import type { FilteringParams, FilteringResult, StrategyConfig } from '../../../src/utils/filtering/types';
import type { Task } from 'node-vikunja';

// Mock the strategies
jest.mock('../../../src/utils/filtering/ClientSideFilteringStrategy', () => ({
  ClientSideFilteringStrategy: jest.fn().mockImplementation(() => ({
    execute: jest.fn()
  }))
}));

jest.mock('../../../src/utils/filtering/HybridFilteringStrategy', () => ({
  HybridFilteringStrategy: jest.fn().mockImplementation(() => ({
    execute: jest.fn()
  }))
}));

import { ClientSideFilteringStrategy } from '../../../src/utils/filtering/ClientSideFilteringStrategy';
import { HybridFilteringStrategy } from '../../../src/utils/filtering/HybridFilteringStrategy';

describe('FilteringContext', () => {
  let mockClientStrategy: jest.Mocked<ClientSideFilteringStrategy>;
  let mockHybridStrategy: jest.Mocked<HybridFilteringStrategy>;
  
  const mockTask: Task = {
    id: 1,
    title: 'Test Task',
    description: 'Test Description',
    done: false,
    priority: 5,
    percent_done: 0,
    due_date: '2025-01-15T00:00:00Z',
    created: '2025-01-01T00:00:00Z',
    updated: '2025-01-01T00:00:00Z',
    project_id: 1,
    assignees: [],
    labels: [],
  } as Task;

  const baseParams: FilteringParams = {
    args: {},
    filterExpression: null,
    filterString: 'priority >= 3',
    params: { page: 1, per_page: 10 }
  };

  const mockResult: FilteringResult = {
    tasks: [mockTask],
    metadata: {
      serverSideFilteringUsed: false,
      serverSideFilteringAttempted: false,
      clientSideFiltering: true,
      filteringNote: 'Test filtering applied'
    }
  };

  // Store original environment variables
  let originalNodeEnv: string | undefined;
  let originalVikunjaEnv: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Store original environment variables
    originalNodeEnv = process.env.NODE_ENV;
    originalVikunjaEnv = process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING;

    // Create mock instances
    mockClientStrategy = {
      execute: jest.fn().mockResolvedValue(mockResult)
    } as any;
    
    mockHybridStrategy = {
      execute: jest.fn().mockResolvedValue(mockResult)
    } as any;
    
    // Mock the constructor calls
    (ClientSideFilteringStrategy as jest.MockedClass<typeof ClientSideFilteringStrategy>).mockImplementation(() => mockClientStrategy);
    (HybridFilteringStrategy as jest.MockedClass<typeof HybridFilteringStrategy>).mockImplementation(() => mockHybridStrategy);
  });

  afterEach(() => {
    // Restore original environment variables
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    
    if (originalVikunjaEnv === undefined) {
      delete process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING;
    } else {
      process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING = originalVikunjaEnv;
    }
  });

  describe('strategy selection', () => {
    describe('client-side only scenarios', () => {
      it('should use ClientSideFilteringStrategy when server-side is disabled', () => {
        const config: StrategyConfig = {
          enableServerSide: false
        };

        const context = new FilteringContext(config);
        
        expect(ClientSideFilteringStrategy).toHaveBeenCalled();
        expect(HybridFilteringStrategy).not.toHaveBeenCalled();
      });

      it('should use ClientSideFilteringStrategy in development without env var', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING;

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        expect(ClientSideFilteringStrategy).toHaveBeenCalled();
        expect(HybridFilteringStrategy).not.toHaveBeenCalled();
      });

      it('should use ClientSideFilteringStrategy in test environment without env var', () => {
        process.env.NODE_ENV = 'test';
        delete process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING;

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        expect(ClientSideFilteringStrategy).toHaveBeenCalled();
        expect(HybridFilteringStrategy).not.toHaveBeenCalled();
      });

      it('should use ClientSideFilteringStrategy when env var is false', () => {
        process.env.NODE_ENV = 'development';
        process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING = 'false';

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        expect(ClientSideFilteringStrategy).toHaveBeenCalled();
        expect(HybridFilteringStrategy).not.toHaveBeenCalled();
      });

      it('should use ClientSideFilteringStrategy when env var is empty string', () => {
        process.env.NODE_ENV = 'development';
        process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING = '';

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        expect(ClientSideFilteringStrategy).toHaveBeenCalled();
        expect(HybridFilteringStrategy).not.toHaveBeenCalled();
      });
    });

    describe('hybrid filtering scenarios', () => {
      it('should use HybridFilteringStrategy in production', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING;

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        expect(HybridFilteringStrategy).toHaveBeenCalled();
        expect(ClientSideFilteringStrategy).not.toHaveBeenCalled();
      });

      it('should use HybridFilteringStrategy when env var is true', () => {
        process.env.NODE_ENV = 'development';
        process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING = 'true';

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        expect(HybridFilteringStrategy).toHaveBeenCalled();
        expect(ClientSideFilteringStrategy).not.toHaveBeenCalled();
      });

      it('should use HybridFilteringStrategy in production even when env var is false', () => {
        process.env.NODE_ENV = 'production';
        process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING = 'false';

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        expect(HybridFilteringStrategy).toHaveBeenCalled();
        expect(ClientSideFilteringStrategy).not.toHaveBeenCalled();
      });

      it('should use HybridFilteringStrategy in test with env var true', () => {
        process.env.NODE_ENV = 'test';
        process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING = 'true';

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        expect(HybridFilteringStrategy).toHaveBeenCalled();
        expect(ClientSideFilteringStrategy).not.toHaveBeenCalled();
      });

      it('should use HybridFilteringStrategy with undefined NODE_ENV and env var true', () => {
        delete process.env.NODE_ENV;
        process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING = 'true';

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        expect(HybridFilteringStrategy).toHaveBeenCalled();
        expect(ClientSideFilteringStrategy).not.toHaveBeenCalled();
      });
    });

    describe('config override scenarios', () => {
      it('should use ClientSideFilteringStrategy when enableServerSide is false regardless of environment', () => {
        process.env.NODE_ENV = 'production';
        process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING = 'true';

        const config: StrategyConfig = {
          enableServerSide: false
        };

        const context = new FilteringContext(config);
        
        expect(ClientSideFilteringStrategy).toHaveBeenCalled();
        expect(HybridFilteringStrategy).not.toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      it('should handle case-sensitive env var values', () => {
        process.env.NODE_ENV = 'development';
        process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING = 'TRUE';

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        // Should use client-side since 'TRUE' !== 'true'
        expect(ClientSideFilteringStrategy).toHaveBeenCalled();
        expect(HybridFilteringStrategy).not.toHaveBeenCalled();
      });

      it('should handle whitespace in env var values', () => {
        process.env.NODE_ENV = 'development';
        process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING = ' true ';

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        // Should use client-side since ' true ' !== 'true'
        expect(ClientSideFilteringStrategy).toHaveBeenCalled();
        expect(HybridFilteringStrategy).not.toHaveBeenCalled();
      });

      it('should handle numeric env var values', () => {
        process.env.NODE_ENV = 'development';
        process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING = '1';

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        // Should use client-side since '1' !== 'true'
        expect(ClientSideFilteringStrategy).toHaveBeenCalled();
        expect(HybridFilteringStrategy).not.toHaveBeenCalled();
      });

      it('should handle mixed case NODE_ENV', () => {
        process.env.NODE_ENV = 'Production';
        delete process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING;

        const config: StrategyConfig = {
          enableServerSide: true
        };

        const context = new FilteringContext(config);
        
        // Should use client-side since 'Production' !== 'production'
        expect(ClientSideFilteringStrategy).toHaveBeenCalled();
        expect(HybridFilteringStrategy).not.toHaveBeenCalled();
      });
    });
  });

  describe('execute', () => {
    it('should delegate execution to the selected strategy', async () => {
      const config: StrategyConfig = {
        enableServerSide: false
      };

      const context = new FilteringContext(config);
      const result = await context.execute(baseParams);

      expect(mockClientStrategy.execute).toHaveBeenCalledWith(baseParams);
      expect(result).toEqual(mockResult);
    });

    it('should propagate strategy execution errors', async () => {
      const config: StrategyConfig = {
        enableServerSide: false
      };

      const executionError = new Error('Strategy execution failed');
      mockClientStrategy.execute.mockRejectedValue(executionError);

      const context = new FilteringContext(config);
      
      await expect(context.execute(baseParams)).rejects.toThrow(executionError);
    });

    it('should pass through all parameters unchanged', async () => {
      const config: StrategyConfig = {
        enableServerSide: false
      };

      const complexParams: FilteringParams = {
        args: { 
          projectId: 42, 
          page: 3, 
          perPage: 25,
          search: 'test',
          sort: 'priority',
          allProjects: true
        },
        filterExpression: {
          type: 'condition',
          field: 'priority',
          operator: '>=',
          value: 3
        },
        filterString: 'priority >= 3 && done = false',
        params: { 
          page: 3, 
          per_page: 25, 
          sort_by: 'priority',
          s: 'test'
        }
      };

      const context = new FilteringContext(config);
      await context.execute(complexParams);

      expect(mockClientStrategy.execute).toHaveBeenCalledWith(complexParams);
    });
  });

  describe('strategy instantiation', () => {
    it('should create strategy instances only once during construction', () => {
      const config: StrategyConfig = {
        enableServerSide: false
      };

      // Create multiple contexts
      const context1 = new FilteringContext(config);
      const context2 = new FilteringContext(config);

      // Each context should create its own strategy instance
      expect(ClientSideFilteringStrategy).toHaveBeenCalledTimes(2);
    });

    it('should create different strategy types based on config', () => {
      jest.clearAllMocks();
      
      const clientConfig: StrategyConfig = { enableServerSide: false };
      const hybridConfig: StrategyConfig = { enableServerSide: true };
      
      process.env.NODE_ENV = 'production';

      const clientContext = new FilteringContext(clientConfig);
      const hybridContext = new FilteringContext(hybridConfig);

      expect(ClientSideFilteringStrategy).toHaveBeenCalledTimes(1);
      expect(HybridFilteringStrategy).toHaveBeenCalledTimes(1);
    });
  });

  describe('config validation', () => {
    it('should handle undefined enableServerSide', () => {
      const config = {} as StrategyConfig;
      
      // Should not throw, should use falsy value
      const context = new FilteringContext(config);
      
      expect(ClientSideFilteringStrategy).toHaveBeenCalled();
      expect(HybridFilteringStrategy).not.toHaveBeenCalled();
    });

    it('should handle null enableServerSide', () => {
      const config = { enableServerSide: null } as any;
      
      // Should not throw, should use falsy value
      const context = new FilteringContext(config);
      
      expect(ClientSideFilteringStrategy).toHaveBeenCalled();
      expect(HybridFilteringStrategy).not.toHaveBeenCalled();
    });
  });
});