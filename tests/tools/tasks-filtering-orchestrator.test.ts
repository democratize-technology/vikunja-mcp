/**
 * Test for TaskFilteringOrchestrator type safety fix
 */

import type { SimpleFilterStorage } from '../../src/storage';

// Mock the client module before importing TaskFilteringOrchestrator
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn().mockReturnValue({
    tasks: {
      list: jest.fn().mockResolvedValue({ results: [] }),
      getProjectTasks: jest.fn().mockResolvedValue({ results: [] }),
    },
  }),
  setGlobalClientFactory: jest.fn(),
  clearGlobalClientFactory: jest.fn(),
}));

// Mock the logger to reduce noise
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the retry module
jest.mock('../../src/utils/retry', () => ({
  withRetry: jest.fn((fn) => fn()),
  RETRY_CONFIG: {},
}));

// Mock the error handler
jest.mock('../../src/utils/error-handler', () => ({
  MCPError: class MCPError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
  ErrorCode: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    AUTH_REQUIRED: 'AUTH_REQUIRED',
  },
}));

// Mock the filtering strategies to prevent actual API calls
jest.mock('../../src/utils/filtering/HybridFilteringStrategy', () => ({
  HybridFilteringStrategy: jest.fn().mockImplementation(() => ({
    canHandle: jest.fn().mockReturnValue(false), // Always return false to skip server-side filtering
    execute: jest.fn().mockResolvedValue({
      tasks: [],
      totalCount: 0,
      metadata: {
        serverSideFilteringUsed: false,
        serverSideFilteringAttempted: false,
        optimizationApplied: 'none',
      }
    }),
  })),
}));

jest.mock('../../src/utils/filtering/ClientSideFilteringStrategy', () => ({
  ClientSideFilteringStrategy: jest.fn().mockImplementation(() => ({
    canHandle: jest.fn().mockReturnValue(true),
    execute: jest.fn().mockResolvedValue({
      tasks: [],
      totalCount: 0,
      metadata: {
        serverSideFilteringUsed: false,
        serverSideFilteringAttempted: false,
        optimizationApplied: 'client-side',
      }
    }),
  })),
}));

jest.mock('../../src/utils/filtering/ServerSideFilteringStrategy', () => ({
  ServerSideFilteringStrategy: jest.fn().mockImplementation(() => ({
    canHandle: jest.fn().mockReturnValue(false),
    execute: jest.fn().mockResolvedValue({
      tasks: [],
      totalCount: 0,
      metadata: {
        serverSideFilteringUsed: false,
        serverSideFilteringAttempted: false,
        optimizationApplied: 'server-side',
      }
    }),
  })),
}));

import { TaskFilteringOrchestrator } from '../../src/tools/tasks/filtering/TaskFilteringOrchestrator';

// Mock SimpleFilterStorage for testing
const mockStorage = {
  saveFilter: jest.fn(),
  getFilter: jest.fn(),
  getAllFilters: jest.fn(),
  deleteFilter: jest.fn(),
  clearAll: jest.fn(),
  getStats: jest.fn(),
} as unknown as SimpleFilterStorage;

describe('TaskFilteringOrchestrator Type Safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('type-safe storage parameters', () => {
    it('should accept SimpleFilterStorage parameter without type errors', () => {
      const mockArgs = {
        filter: undefined,
        filterId: undefined,
        projectId: 1,
        page: 1,
        perPage: 50,
        done: undefined,
        search: undefined,
        sort: undefined,
      };

      // This should compile without type errors
      expect(() => {
        TaskFilteringOrchestrator.executeTaskFiltering(mockArgs, mockStorage);
      }).not.toThrow();
    });

    it('should accept SimpleFilterStorage parameter for validation method', () => {
      const mockArgs = {
        filter: undefined,
        filterId: undefined,
        projectId: 1,
        page: 1,
        perPage: 50,
        done: undefined,
        search: undefined,
        sort: undefined,
      };

      // This should compile without type errors
      expect(() => {
        TaskFilteringOrchestrator.validateTaskFiltering(mockArgs, mockStorage);
      }).not.toThrow();
    });
  });
});