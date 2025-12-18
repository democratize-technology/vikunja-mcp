/**
 * Test for TaskFilteringOrchestrator type safety fix
 */

import type { SimpleFilterStorage } from '../../src/storage';
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