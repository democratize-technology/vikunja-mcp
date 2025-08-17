/**
 * Tests for filters tool
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFiltersTool } from '../../src/tools/filters';
import { filterStorage, storageManager } from '../../src/storage/FilterStorage';
import type { SavedFilter } from '../../src/types/filters';
import type { MockServer } from '../types/mocks';
import { AuthManager } from '../../src/auth/AuthManager';

// Mock the logger
jest.mock('../../src/utils/logger');

describe('vikunja_filters tool', () => {
  let toolHandler: (args: any) => Promise<any>;
  let mockServer: MockServer;
  let mockAuthManager: AuthManager;

  // Utility to get the session storage used by the tool
  async function getTestStorage() {
    const session = mockAuthManager.getSession();
    const sessionId = `${session.apiUrl}:${session.apiToken?.substring(0, 8)}`;
    return storageManager.getStorage(sessionId, session.userId, session.apiUrl);
  }

  beforeEach(async () => {
    await filterStorage.clear();
    await storageManager.clearAll();

    // Create mock auth manager
    mockAuthManager = new AuthManager();
    mockAuthManager.connect('http://test-api.com', 'test-token-12345678');

    // Create mock server
    mockServer = {
      tool: jest.fn((name: string, schema: any, handler: any) => {
        toolHandler = handler;
      }),
    } as MockServer;

    // Register the tool
    registerFiltersTool(mockServer, mockAuthManager);
  });

  afterEach(async () => {
    // Clean up storage after each test
    await storageManager.clearAll();
    storageManager.stopCleanupTimer();
  });

  describe('list action', () => {
    it('should list all filters', async () => {
      // Create test filters using session storage
      const storage = await getTestStorage();
      await storage.create({
        name: 'Filter 1',
        filter: 'done = false',
        isGlobal: true,
      });

      await storage.create({
        name: 'Filter 2',
        filter: 'priority >= 3',
        projectId: 1,
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'list',
        parameters: {},
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list-saved-filters');
      expect(response.message).toBe('Found 2 saved filters');
      expect(response.data.filters).toHaveLength(2);
      expect(response.metadata.timestamp).toBeDefined();
      expect(response.metadata.count).toBe(2);
    });

    it('should filter by projectId', async () => {
      await (await getTestStorage()).create({
        name: 'Global',
        filter: 'done = false',
        isGlobal: true,
      });

      await (await getTestStorage()).create({
        name: 'Project 1',
        filter: 'priority = 1',
        projectId: 1,
        isGlobal: false,
      });

      await (await getTestStorage()).create({
        name: 'Project 2',
        filter: 'priority = 2',
        projectId: 2,
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'list',
        parameters: { projectId: 1 },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list-saved-filters');
      expect(response.message).toBe('Found 2 saved filters');
      expect(response.data.filters).toHaveLength(2); // Global + Project 1
      expect(response.data.filters.map((f: any) => f.name)).toContain('Global');
      expect(response.data.filters.map((f: any) => f.name)).toContain('Project 1');
      expect(response.metadata.count).toBe(2);
    });

    it('should filter by global flag', async () => {
      await (await getTestStorage()).create({
        name: 'Global',
        filter: 'done = false',
        isGlobal: true,
      });

      await (await getTestStorage()).create({
        name: 'Not Global',
        filter: 'priority = 1',
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'list',
        parameters: { global: true },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list-saved-filters');
      expect(response.message).toBe('Found 1 saved filter');
      expect(response.data.filters).toHaveLength(1);
      expect(response.data.filters[0].name).toBe('Global');
      expect(response.metadata.count).toBe(1);
    });
  });

  describe('get action', () => {
    it('should get a specific filter', async () => {
      const created = await (await getTestStorage()).create({
        name: 'Test Filter',
        description: 'Test description',
        filter: 'done = false',
        isGlobal: true,
      });

      const result = await toolHandler({
        action: 'get',
        parameters: { id: created.id },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('get-saved-filter');
      expect(response.message).toBe('Retrieved filter "Test Filter"');
      expect(response.data.filter.id).toBe(created.id);
      expect(response.data.filter.name).toBe('Test Filter');
      expect(response.data.filter.description).toBe('Test description');
      expect(response.metadata.timestamp).toBeDefined();
    });

    it('should return error for non-existent filter', async () => {
      const result = await toolHandler({
        action: 'get',
        parameters: { id: 'non-existent' },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('get-saved-filter');
      expect(response.message).toContain('not found');
    });
  });

  describe('create action', () => {
    it('should create a new filter', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          name: 'New Filter',
          description: 'A new filter',
          filter: 'priority >= 4',
          isGlobal: true,
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('create-saved-filter');
      expect(response.message).toBe('Filter "New Filter" saved successfully');
      expect(response.data.filter.id).toBeDefined();
      expect(response.data.filter.name).toBe('New Filter');
      expect(response.metadata.timestamp).toBeDefined();

      // Verify it was actually created
      const stored = await (await getTestStorage()).get(response.data.filter.id);
      expect(stored).not.toBeNull();
    });

    it('should create project-specific filter', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          name: 'Project Filter',
          filter: 'done = false',
          projectId: 42,
          isGlobal: false,
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('create-saved-filter');
      expect(response.message).toBe('Filter "Project Filter" saved successfully');
      expect(response.data.filter.projectId).toBe(42);
      expect(response.data.filter.isGlobal).toBe(false);
      expect(response.metadata.timestamp).toBeDefined();
    });

    it('should prevent duplicate names', async () => {
      await (await getTestStorage()).create({
        name: 'Existing',
        filter: 'done = true',
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'create',
        parameters: {
          name: 'Existing',
          filter: 'done = false',
          isGlobal: false,
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('create-saved-filter');
      expect(response.message).toContain('already exists');
    });

    it('should create filter from filters object format', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          title: '🔥 High Priority Tasks',
          description: 'All tasks with priority 4 or 5 that are not completed',
          filters: {
            filter_by: ['priority'],
            filter_value: ['5'],
            filter_comparator: ['>='],
            filter_concat: '',
          },
          is_favorite: true,
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('create-saved-filter');
      expect(response.message).toBe('Filter "🔥 High Priority Tasks" saved successfully');
      expect(response.data.filter.name).toBe('🔥 High Priority Tasks');
      expect(response.data.filter.filter).toBe('priority >= 5');
      expect(response.data.filter.isGlobal).toBe(true);
    });

    it('should handle multiple conditions in filters object', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          title: 'Complex Filter',
          filters: {
            filter_by: ['priority', 'done'],
            filter_value: ['3', 'false'],
            filter_comparator: ['>=', '='],
            filter_concat: '&&',
          },
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.filter.filter).toBe('(priority >= 3 && done = false)');
    });

    it('should skip empty values in filters object', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          title: 'Filter with empty values',
          filters: {
            filter_by: ['priority', 'done', 'title'],
            filter_value: ['3', '', 'test'],
            filter_comparator: ['>=', '=', 'like'],
            filter_concat: '&&',
          },
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      // Should skip the empty done value
      expect(response.data.filter.filter).toBe('(priority >= 3 && title like "test")');
    });

    it('should use name when both name and title are provided', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          name: 'Name takes precedence',
          title: 'This title is ignored',
          filter: 'done = false',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.filter.name).toBe('Name takes precedence');
    });

    it('should use title when name is not provided', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          title: 'Title is used',
          filter: 'done = false',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.filter.name).toBe('Title is used');
    });

    it('should error when neither name/title nor filter is provided', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          description: 'Just a description',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Invalid parameters');
    });

    it('should handle edge case with falsy name values', async () => {
      // Test with various falsy values that might slip through validation
      const falsyValues = [0, false, NaN];
      
      for (const value of falsyValues) {
        const result = await toolHandler({
          action: 'create',
          parameters: {
            name: value as any, // Force non-string type
            filter: 'done = false',
          },
        });

        const response = JSON.parse(result.content[0].text);
        // These should fail validation as non-string values
        expect(response.success).toBe(false);
        expect(response.message).toBe('Invalid parameters');
      }
    });

    it('should handle boolean field conversion in filters object', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          title: 'Boolean conversion',
          filters: {
            filter_by: ['done'],
            filter_value: ['true'],
            filter_comparator: ['='],
            filter_concat: '',
          },
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.filter.filter).toBe('done = true');
    });

    it('should handle numeric field conversion in filters object', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          title: 'Numeric conversion',
          filters: {
            filter_by: ['priority', 'percentDone'],
            filter_value: ['5', '75'],
            filter_comparator: ['=', '>='],
            filter_concat: '&&',
          },
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.filter.filter).toBe('(priority = 5 && percentDone >= 75)');
    });

    it('should handle OR conditions in filters object', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          title: 'OR Filter',
          filters: {
            filter_by: ['priority', 'priority'],
            filter_value: ['5', '1'],
            filter_comparator: ['=', '='],
            filter_concat: '||',
          },
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.filter.filter).toBe('(priority = 5 || priority = 1)');
    });

    it('should error when no filter conditions provided', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          title: 'Empty Filter',
          filters: {
            filter_by: [],
            filter_value: [],
            filter_comparator: [],
            filter_concat: '',
          },
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.message).toContain('No filter conditions provided');
    });

    it('should error when neither name nor title is provided with filter string', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          filter: 'done = false',
          isGlobal: true,
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Invalid parameters');
      expect(response.details.errors[0].message).toContain('Either name or title must be provided');
    });
  });

  describe('update action', () => {
    it('should update an existing filter', async () => {
      const created = await (await getTestStorage()).create({
        name: 'Original',
        filter: 'done = false',
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'update',
        parameters: {
          id: created.id,
          name: 'Updated',
          description: 'Now with description',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('update-saved-filter');
      expect(response.message).toBe('Filter "Updated" updated successfully');
      expect(response.data.filter.name).toBe('Updated');
      expect(response.data.filter.description).toBe('Now with description');
      expect(response.data.filter.filter).toBe('done = false'); // Unchanged
      expect(response.metadata.timestamp).toBeDefined();
      expect(response.metadata.affectedFields).toContain('name');
      expect(response.metadata.affectedFields).toContain('description');
    });

    it('should prevent duplicate names when updating', async () => {
      const filter1 = await filterStorage.create({
        name: 'Filter 1',
        filter: 'priority = 1',
        isGlobal: false,
      });

      await (await getTestStorage()).create({
        name: 'Filter 2',
        filter: 'priority = 2',
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'update',
        parameters: {
          id: filter1.id,
          name: 'Filter 2',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('update-saved-filter');
      expect(response.message).toContain('already exists');
    });

    it('should allow keeping same name when updating', async () => {
      const created = await (await getTestStorage()).create({
        name: 'Same Name',
        filter: 'done = false',
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'update',
        parameters: {
          id: created.id,
          name: 'Same Name',
          description: 'Added description',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('update-saved-filter');
      expect(response.message).toBe('Filter "Same Name" updated successfully');
      expect(response.data.filter.description).toBe('Added description');
      expect(response.metadata.affectedFields).toContain('description');
    });

    it('should update filter when only filter property is changed', async () => {
      const created = await (await getTestStorage()).create({
        name: 'Filter',
        filter: 'done = false',
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'update',
        parameters: {
          id: created.id,
          filter: 'priority > 3',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.filter.filter).toBe('priority > 3');
      expect(response.metadata.affectedFields).toEqual(['filter']);
    });

    it('should update projectId when changed', async () => {
      const created = await (await getTestStorage()).create({
        name: 'Project Filter',
        filter: 'done = false',
        projectId: 1,
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'update',
        parameters: {
          id: created.id,
          projectId: 2,
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.filter.projectId).toBe(2);
      expect(response.metadata.affectedFields).toEqual(['projectId']);
    });

    it('should update isGlobal when changed', async () => {
      const created = await (await getTestStorage()).create({
        name: 'Local Filter',
        filter: 'done = false',
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'update',
        parameters: {
          id: created.id,
          isGlobal: true,
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.filter.isGlobal).toBe(true);
      expect(response.metadata.affectedFields).toEqual(['isGlobal']);
    });

    it('should handle update with undefined values correctly', async () => {
      const created = await (await getTestStorage()).create({
        name: 'Filter',
        description: 'Original description',
        filter: 'done = false',
        projectId: 1,
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'update',
        parameters: {
          id: created.id,
          name: undefined,
          description: 'New description',
          filter: undefined,
          projectId: undefined,
          isGlobal: undefined,
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.filter.name).toBe('Filter'); // Unchanged
      expect(response.data.filter.description).toBe('New description'); // Changed
      expect(response.data.filter.filter).toBe('done = false'); // Unchanged
      expect(response.data.filter.projectId).toBe(1); // Unchanged
      expect(response.data.filter.isGlobal).toBe(false); // Unchanged
      expect(response.metadata.affectedFields).toEqual(['description']);
    });
  });

  describe('delete action', () => {
    it('should delete an existing filter', async () => {
      const created = await (await getTestStorage()).create({
        name: 'To Delete',
        filter: 'done = true',
        isGlobal: false,
      });

      const result = await toolHandler({
        action: 'delete',
        parameters: { id: created.id },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('delete-saved-filter');
      expect(response.message).toBe('Filter "To Delete" deleted successfully');
      expect(response.data.success).toBe(true);
      expect(response.metadata.timestamp).toBeDefined();

      // Verify it was deleted
      const stored = await (await getTestStorage()).get(created.id);
      expect(stored).toBeNull();
    });

    it('should return error for non-existent filter', async () => {
      const result = await toolHandler({
        action: 'delete',
        parameters: { id: 'non-existent' },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('delete-saved-filter');
      expect(response.message).toContain('not found');
    });
  });

  describe('build action', () => {
    it('should build a filter from conditions', async () => {
      const result = await toolHandler({
        action: 'build',
        parameters: {
          conditions: [
            { field: 'done', operator: '=', value: false },
            { field: 'priority', operator: '>=', value: 3 },
          ],
          groupOperator: '&&',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('build-filter');
      expect(response.message).toBe('Filter built successfully');
      expect(response.data.filter).toBe('(done = false && priority >= 3)');
      expect(response.metadata.timestamp).toBeDefined();
      expect(response.metadata.conditionCount).toBe(2);
    });

    it('should build OR conditions', async () => {
      const result = await toolHandler({
        action: 'build',
        parameters: {
          conditions: [
            { field: 'priority', operator: '=', value: 5 },
            { field: 'dueDate', operator: '<', value: 'now' },
          ],
          groupOperator: '||',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('build-filter');
      expect(response.message).toBe('Filter built successfully');
      expect(response.data.filter).toBe('(priority = 5 || dueDate < now)');
      expect(response.metadata.conditionCount).toBe(2);
    });

    it('should validate built filters', async () => {
      const result = await toolHandler({
        action: 'build',
        parameters: {
          conditions: [
            { field: 'done', operator: '>', value: true }, // Invalid operator for boolean
          ],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('build-filter');
      expect(response.message).toContain('Invalid');
    });
  });

  describe('validate action', () => {
    it('should validate non-empty filter strings', async () => {
      const result = await toolHandler({
        action: 'validate',
        parameters: {
          filter: 'done = false && priority >= 3',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('validate-filter');
      expect(response.message).toBe('Filter is valid');
      expect(response.data.valid).toBe(true);
      expect(response.data.warnings).toHaveLength(0);
      expect(response.metadata.timestamp).toBeDefined();
    });

    it('should reject empty filter strings', async () => {
      const result = await toolHandler({
        action: 'validate',
        parameters: {
          filter: '',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('validate-filter');
      expect(response.message).toContain('Invalid');
    });
  });

  describe('error handling', () => {
    it('should handle invalid action', async () => {
      const result = await toolHandler({
        action: 'invalid',
        parameters: {},
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('filters-error');
      expect(response.message).toContain('Unknown action');
    });

    it('should handle validation errors', async () => {
      const result = await toolHandler({
        action: 'create',
        parameters: {
          // Missing required fields
          description: 'Missing name and filter',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('create-saved-filter');
      expect(response.message).toBe('Invalid parameters');
      expect(response.details).toBeDefined();
      expect(response.details.errors).toBeDefined();
      expect(response.details.errors.length).toBeGreaterThan(0);
    });

    it('should handle validation errors for non-create actions', async () => {
      const result = await toolHandler({
        action: 'update',
        parameters: {
          // Missing required id field
          name: 'Updated name',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('update-filter');
      expect(response.message).toBe('Invalid parameters');
      expect(response.details).toBeDefined();
      expect(response.details.errors).toBeDefined();
      expect(response.details.errors[0].path).toBe('id');
    });

    it('should handle non-Error exceptions', async () => {
      // Mock storageManager to throw a non-Error object
      const originalGetStorage = storageManager.getStorage;
      storageManager.getStorage = jest.fn().mockRejectedValue('string error');

      const result = await toolHandler({
        action: 'list',
        parameters: {},
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.message).toBe('An unknown error occurred');

      // Restore original function
      storageManager.getStorage = originalGetStorage;
    });
  });
});
