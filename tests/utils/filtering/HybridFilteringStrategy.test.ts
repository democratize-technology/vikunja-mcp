/**
 * Tests for HybridFilteringStrategy
 * Ensures hybrid filtering behavior (server attempt + client fallback) is properly tested
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HybridFilteringStrategy } from '../../../src/utils/filtering/HybridFilteringStrategy';
import type { FilteringParams, FilteringResult } from '../../../src/utils/filtering/types';
import type { Task } from 'node-vikunja';

// Mock the strategies
jest.mock('../../../src/utils/filtering/ServerSideFilteringStrategy', () => ({
  ServerSideFilteringStrategy: jest.fn().mockImplementation(() => ({
    execute: jest.fn()
  }))
}));

jest.mock('../../../src/utils/filtering/ClientSideFilteringStrategy', () => ({
  ClientSideFilteringStrategy: jest.fn().mockImplementation(() => ({
    execute: jest.fn()
  }))
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ServerSideFilteringStrategy } from '../../../src/utils/filtering/ServerSideFilteringStrategy';
import { ClientSideFilteringStrategy } from '../../../src/utils/filtering/ClientSideFilteringStrategy';
import { logger } from '../../../src/utils/logger';

describe('HybridFilteringStrategy', () => {
  let strategy: HybridFilteringStrategy;
  let mockServerStrategy: jest.Mocked<ServerSideFilteringStrategy>;
  let mockClientStrategy: jest.Mocked<ClientSideFilteringStrategy>;
  
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

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock instances
    mockServerStrategy = {
      execute: jest.fn()
    } as any;
    
    mockClientStrategy = {
      execute: jest.fn()
    } as any;
    
    // Mock the constructor calls
    (ServerSideFilteringStrategy as jest.MockedClass<typeof ServerSideFilteringStrategy>).mockImplementation(() => mockServerStrategy);
    (ClientSideFilteringStrategy as jest.MockedClass<typeof ClientSideFilteringStrategy>).mockImplementation(() => mockClientStrategy);
    
    strategy = new HybridFilteringStrategy();
  });

  describe('execute without filter string', () => {
    it('should delegate to client-side strategy when no filter string provided', async () => {
      const paramsNoFilter: FilteringParams = {
        ...baseParams,
        filterString: undefined
      };

      const clientResult: FilteringResult = {
        tasks: [mockTask],
        metadata: {
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: false,
          clientSideFiltering: false,
          filteringNote: 'No filtering applied'
        }
      };

      mockClientStrategy.execute.mockResolvedValue(clientResult);

      const result = await strategy.execute(paramsNoFilter);

      expect(mockClientStrategy.execute).toHaveBeenCalledWith(paramsNoFilter);
      expect(mockServerStrategy.execute).not.toHaveBeenCalled();
      expect(result).toEqual(clientResult);
    });

    it('should delegate to client-side strategy when filter string is empty', async () => {
      const paramsEmptyFilter: FilteringParams = {
        ...baseParams,
        filterString: ''
      };

      const clientResult: FilteringResult = {
        tasks: [mockTask],
        metadata: {
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: false,
          clientSideFiltering: false,
          filteringNote: 'No filtering applied'
        }
      };

      mockClientStrategy.execute.mockResolvedValue(clientResult);

      const result = await strategy.execute(paramsEmptyFilter);

      expect(mockClientStrategy.execute).toHaveBeenCalledWith(paramsEmptyFilter);
      expect(mockServerStrategy.execute).not.toHaveBeenCalled();
      expect(result).toEqual(clientResult);
    });
  });

  describe('server-side filtering success', () => {
    it('should return server-side result when server filtering succeeds', async () => {
      const serverResult: FilteringResult = {
        tasks: [mockTask],
        metadata: {
          serverSideFilteringUsed: true,
          serverSideFilteringAttempted: true,
          clientSideFiltering: false,
          filteringNote: 'Server-side filtering used (modern Vikunja)'
        }
      };

      mockServerStrategy.execute.mockResolvedValue(serverResult);

      const result = await strategy.execute(baseParams);

      expect(mockServerStrategy.execute).toHaveBeenCalledWith(baseParams);
      expect(mockClientStrategy.execute).not.toHaveBeenCalled();
      expect(result).toEqual(serverResult);
      expect(logger.info).toHaveBeenCalledWith(
        'Hybrid filtering: attempting server-side filtering first',
        { filter: 'priority >= 3' }
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Hybrid filtering: server-side filtering succeeded',
        { taskCount: 1, filter: 'priority >= 3' }
      );
    });

    it('should log correct information for server-side success', async () => {
      const serverResult: FilteringResult = {
        tasks: [mockTask, mockTask],
        metadata: {
          serverSideFilteringUsed: true,
          serverSideFilteringAttempted: true,
          clientSideFiltering: false,
          filteringNote: 'Server-side filtering used (modern Vikunja)'
        }
      };

      mockServerStrategy.execute.mockResolvedValue(serverResult);

      await strategy.execute(baseParams);

      expect(logger.info).toHaveBeenCalledWith(
        'Hybrid filtering: attempting server-side filtering first',
        { filter: 'priority >= 3' }
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Hybrid filtering: server-side filtering succeeded',
        { taskCount: 2, filter: 'priority >= 3' }
      );
    });
  });

  describe('server-side filtering failure with client-side fallback', () => {
    it('should fall back to client-side when server-side fails', async () => {
      const serverError = new Error('Server-side filtering not supported');
      mockServerStrategy.execute.mockRejectedValue(serverError);

      const clientResult: FilteringResult = {
        tasks: [mockTask],
        metadata: {
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: false,
          clientSideFiltering: true,
          filteringNote: 'Client-side filtering applied'
        }
      };
      mockClientStrategy.execute.mockResolvedValue(clientResult);

      const result = await strategy.execute(baseParams);

      expect(mockServerStrategy.execute).toHaveBeenCalledWith(baseParams);
      expect(mockClientStrategy.execute).toHaveBeenCalledWith(baseParams);
      
      // Should return client result with updated metadata
      expect(result.tasks).toEqual([mockTask]);
      expect(result.metadata.serverSideFilteringAttempted).toBe(true);
      expect(result.metadata.filteringNote).toBe('Server-side filtering failed, client-side filtering applied as fallback');
    });

    it('should preserve client-side result and update metadata correctly', async () => {
      const serverError = new Error('Network timeout');
      mockServerStrategy.execute.mockRejectedValue(serverError);

      const clientResult: FilteringResult = {
        tasks: [mockTask, mockTask],
        metadata: {
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: false,
          clientSideFiltering: true,
          filteringNote: 'Client-side filtering applied'
        }
      };
      mockClientStrategy.execute.mockResolvedValue(clientResult);

      const result = await strategy.execute(baseParams);

      expect(result).toEqual({
        tasks: [mockTask, mockTask],
        metadata: {
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: true, // Updated from false
          clientSideFiltering: true,
          filteringNote: 'Server-side filtering failed, client-side filtering applied as fallback' // Updated
        }
      });
    });

    it('should log correct warning for server-side failure', async () => {
      const serverError = new Error('Invalid filter syntax');
      mockServerStrategy.execute.mockRejectedValue(serverError);

      const clientResult: FilteringResult = {
        tasks: [mockTask],
        metadata: {
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: false,
          clientSideFiltering: true,
          filteringNote: 'Client-side filtering applied'
        }
      };
      mockClientStrategy.execute.mockResolvedValue(clientResult);

      await strategy.execute(baseParams);

      expect(logger.warn).toHaveBeenCalledWith(
        'Hybrid filtering: server-side filtering failed, falling back to client-side',
        { 
          error: 'Invalid filter syntax',
          filter: 'priority >= 3' 
        }
      );
    });

    it('should handle non-Error objects thrown by server strategy', async () => {
      const serverError = 'String error';
      mockServerStrategy.execute.mockRejectedValue(serverError);

      const clientResult: FilteringResult = {
        tasks: [mockTask],
        metadata: {
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: false,
          clientSideFiltering: true,
          filteringNote: 'Client-side filtering applied'
        }
      };
      mockClientStrategy.execute.mockResolvedValue(clientResult);

      await strategy.execute(baseParams);

      expect(logger.warn).toHaveBeenCalledWith(
        'Hybrid filtering: server-side filtering failed, falling back to client-side',
        { 
          error: 'String error',
          filter: 'priority >= 3' 
        }
      );
    });

    it('should handle undefined/null errors from server strategy', async () => {
      mockServerStrategy.execute.mockRejectedValue(null);

      const clientResult: FilteringResult = {
        tasks: [mockTask],
        metadata: {
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: false,
          clientSideFiltering: true,
          filteringNote: 'Client-side filtering applied'
        }
      };
      mockClientStrategy.execute.mockResolvedValue(clientResult);

      await strategy.execute(baseParams);

      expect(logger.warn).toHaveBeenCalledWith(
        'Hybrid filtering: server-side filtering failed, falling back to client-side',
        { 
          error: 'null',
          filter: 'priority >= 3' 
        }
      );
    });
  });

  describe('client-side fallback failure', () => {
    it('should propagate client-side errors when fallback also fails', async () => {
      const serverError = new Error('Server-side filtering not supported');
      const clientError = new Error('Client-side filtering failed');
      
      mockServerStrategy.execute.mockRejectedValue(serverError);
      mockClientStrategy.execute.mockRejectedValue(clientError);

      await expect(strategy.execute(baseParams)).rejects.toThrow(clientError);
      
      expect(mockServerStrategy.execute).toHaveBeenCalledWith(baseParams);
      expect(mockClientStrategy.execute).toHaveBeenCalledWith(baseParams);
    });
  });

  describe('edge cases', () => {
    it('should handle complex filter expressions', async () => {
      const complexParams: FilteringParams = {
        ...baseParams,
        filterString: '(priority >= 3 && done = false) || (priority = 5)'
      };

      const serverResult: FilteringResult = {
        tasks: [mockTask],
        metadata: {
          serverSideFilteringUsed: true,
          serverSideFilteringAttempted: true,
          clientSideFiltering: false,
          filteringNote: 'Server-side filtering used (modern Vikunja)'
        }
      };

      mockServerStrategy.execute.mockResolvedValue(serverResult);

      const result = await strategy.execute(complexParams);

      expect(mockServerStrategy.execute).toHaveBeenCalledWith(complexParams);
      expect(result).toEqual(serverResult);
    });

    it('should handle whitespace-only filter strings', async () => {
      const whitespaceParams: FilteringParams = {
        ...baseParams,
        filterString: '   '
      };

      const serverResult: FilteringResult = {
        tasks: [mockTask],
        metadata: {
          serverSideFilteringUsed: true,
          serverSideFilteringAttempted: true,
          clientSideFiltering: false,
          filteringNote: 'Server-side filtering used (modern Vikunja)'
        }
      };

      mockServerStrategy.execute.mockResolvedValue(serverResult);

      const result = await strategy.execute(whitespaceParams);

      expect(mockServerStrategy.execute).toHaveBeenCalledWith(whitespaceParams);
      expect(result).toEqual(serverResult);
    });

    it('should preserve all metadata fields during fallback', async () => {
      const serverError = new Error('Server error');
      mockServerStrategy.execute.mockRejectedValue(serverError);

      const clientResult: FilteringResult = {
        tasks: [mockTask],
        metadata: {
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: false,
          clientSideFiltering: true,
          filteringNote: 'Original client note',
          // Add any other metadata fields that might exist
          customField: 'custom value'
        } as any
      };
      mockClientStrategy.execute.mockResolvedValue(clientResult);

      const result = await strategy.execute(baseParams);

      expect(result.metadata).toEqual({
        serverSideFilteringUsed: false,
        serverSideFilteringAttempted: true, // Updated
        clientSideFiltering: true,
        filteringNote: 'Server-side filtering failed, client-side filtering applied as fallback', // Updated
        customField: 'custom value' // Preserved
      });
    });

    it('should handle empty task results from server-side', async () => {
      const serverResult: FilteringResult = {
        tasks: [],
        metadata: {
          serverSideFilteringUsed: true,
          serverSideFilteringAttempted: true,
          clientSideFiltering: false,
          filteringNote: 'Server-side filtering used (modern Vikunja)'
        }
      };

      mockServerStrategy.execute.mockResolvedValue(serverResult);

      const result = await strategy.execute(baseParams);

      expect(result.tasks).toEqual([]);
      expect(logger.info).toHaveBeenCalledWith(
        'Hybrid filtering: server-side filtering succeeded',
        { taskCount: 0, filter: 'priority >= 3' }
      );
    });

    it('should handle empty task results from client-side fallback', async () => {
      const serverError = new Error('Server error');
      mockServerStrategy.execute.mockRejectedValue(serverError);

      const clientResult: FilteringResult = {
        tasks: [],
        metadata: {
          serverSideFilteringUsed: false,
          serverSideFilteringAttempted: false,
          clientSideFiltering: true,
          filteringNote: 'Client-side filtering applied'
        }
      };
      mockClientStrategy.execute.mockResolvedValue(clientResult);

      const result = await strategy.execute(baseParams);

      expect(result.tasks).toEqual([]);
      expect(result.metadata.serverSideFilteringAttempted).toBe(true);
    });
  });
});