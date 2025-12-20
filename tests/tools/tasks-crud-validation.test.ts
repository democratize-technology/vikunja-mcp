/**
 * Targeted validation tests for tasks/crud.ts uncovered lines
 * This file specifically targets the remaining uncovered lines for complete coverage
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createTask, getTask, updateTask, deleteTask } from '../../src/tools/tasks/crud';
import { MCPError, ErrorCode } from '../../src/types';
import type { MockVikunjaClient } from '../types/mocks';
import { parseMarkdown } from '../utils/markdown';

// Mock the client module
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
}));

// Mock logger to suppress output during tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Tasks CRUD - Validation Coverage', () => {
  let mockClient: MockVikunjaClient;
  const { getClientFromContext } = require('../../src/client');

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock client with all required methods
    mockClient = {
      tasks: {
        createTask: jest.fn(),
        getTask: jest.fn(),
        updateTask: jest.fn(),
        deleteTask: jest.fn(),
        updateTaskLabels: jest.fn(),
        bulkAssignUsersToTask: jest.fn(),
        removeUserFromTask: jest.fn(),
      },
    } as any;

    getClientFromContext.mockResolvedValue(mockClient);
  });

  describe('missing validation error paths', () => {
    it('should handle missing title in createTask (line 36)', async () => {
      await expect(
        createTask({
          projectId: 1,
          title: undefined as any, // Missing title
        })
      ).rejects.toThrow('title is required to create a task');
    });

    it('should handle empty string title in createTask', async () => {
      await expect(
        createTask({
          projectId: 1,
          title: '', // Empty title
        })
      ).rejects.toThrow('title is required to create a task');
    });

    it('should handle missing projectId in createTask (line 30)', async () => {
      await expect(
        createTask({
          projectId: undefined as any, // Missing projectId
          title: 'Test Task',
        })
      ).rejects.toThrow('projectId is required to create a task');
    });

    it('should handle missing id in getTask (line 202)', async () => {
      await expect(
        getTask({
          id: undefined as any, // Missing id
        })
      ).rejects.toThrow('Task id is required for get operation');
    });

    it('should handle missing id in updateTask (line 252)', async () => {
      await expect(
        updateTask({
          id: undefined as any, // Missing id
          title: 'Updated Title',
        })
      ).rejects.toThrow('Task id is required for update operation');
    });

    it('should handle missing id in deleteTask (line 420)', async () => {
      await expect(
        deleteTask({
          id: undefined as any, // Missing id
        })
      ).rejects.toThrow('Task id is required for delete operation');
    });
  });

  describe('error propagation paths', () => {
    it('should handle generic Error in createTask (line 187)', async () => {
      // Mock createTask to throw a generic Error
      mockClient.tasks.createTask.mockRejectedValue(new Error('Generic error'));

      await expect(
        createTask({
          projectId: 1,
          title: 'Test Task',
        })
      ).rejects.toThrow('Failed to create task: Generic error');
    });

    it('should handle non-Error object in createTask (line 189)', async () => {
      // Mock createTask to throw a non-Error object
      mockClient.tasks.createTask.mockRejectedValue({ status: 500, message: 'Server error' });

      await expect(
        createTask({
          projectId: 1,
          title: 'Test Task',
        })
      ).rejects.toThrow('Failed to create task: Unknown error');
    });

    it('should handle generic Error in getTask (line 229)', async () => {
      // Mock getTask to throw a generic Error
      mockClient.tasks.getTask.mockRejectedValue(new Error('Database error'));

      await expect(
        getTask({
          id: 1,
        })
      ).rejects.toThrow('Failed to get task: Database error');
    });

    it('should handle non-Error object in getTask (line 231)', async () => {
      // Mock getTask to throw a non-Error object
      mockClient.tasks.getTask.mockRejectedValue({ code: 'DB_ERROR', details: 'Connection lost' });

      await expect(
        getTask({
          id: 1,
        })
      ).rejects.toThrow('Failed to get task: Unknown error');
    });

    it('should handle generic Error in updateTask (line 407)', async () => {
      // Mock initial getTask to succeed
      const mockTask = {
        id: 1,
        title: 'Original Title',
        description: 'Original Description',
        due_date: null,
        priority: 1,
        done: false,
        repeat_after: 0,
        repeat_mode: 0,
        assignees: [],
      };
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      
      // Mock updateTask to throw a generic Error
      mockClient.tasks.updateTask.mockRejectedValue(new Error('Update failed'));

      await expect(
        updateTask({
          id: 1,
          title: 'Updated Title',
        })
      ).rejects.toThrow('Failed to update task: Update failed');
    });

    it('should handle non-Error object in updateTask (line 409)', async () => {
      // Mock initial getTask to succeed
      const mockTask = {
        id: 1,
        title: 'Original Title',
        description: 'Original Description',
        due_date: null,
        priority: 1,
        done: false,
        repeat_after: 0,
        repeat_mode: 0,
        assignees: [],
      };
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      
      // Mock updateTask to throw a non-Error object
      mockClient.tasks.updateTask.mockRejectedValue('Update service unavailable');

      await expect(
        updateTask({
          id: 1,
          title: 'Updated Title',
        })
      ).rejects.toThrow('Failed to update task: Unknown error');
    });

    it('should handle generic Error in deleteTask (line 459)', async () => {
      // Mock getTask to succeed
      const mockTask = { id: 1, title: 'Test Task' };
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      
      // Mock deleteTask to throw a generic Error
      mockClient.tasks.deleteTask.mockRejectedValue(new Error('Delete failed'));

      await expect(
        deleteTask({
          id: 1,
        })
      ).rejects.toThrow('Failed to delete task: Delete failed');
    });

    it('should handle non-Error object in deleteTask (line 461)', async () => {
      // Mock getTask to succeed
      const mockTask = { id: 1, title: 'Test Task' };
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      
      // Mock deleteTask to throw a non-Error object
      mockClient.tasks.deleteTask.mockRejectedValue(null);

      await expect(
        deleteTask({
          id: 1,
        })
      ).rejects.toThrow('Failed to delete task: Unknown error');
    });
  });

  describe('MCPError propagation', () => {
    it('should re-throw MCPError in createTask without wrapping', async () => {
      const originalError = new MCPError(ErrorCode.VALIDATION_ERROR, 'Custom validation error');
      mockClient.tasks.createTask.mockRejectedValue(originalError);

      await expect(
        createTask({
          projectId: 1,
          title: 'Test Task',
        })
      ).rejects.toThrow(originalError);
    });

    it('should re-throw MCPError in updateTask without wrapping', async () => {
      const originalError = new MCPError(ErrorCode.API_ERROR, 'Custom API error');
      
      // Mock initial getTask to succeed
      const mockTask = {
        id: 1,
        title: 'Original Title',
        description: 'Original Description',
        due_date: null,
        priority: 1,
        done: false,
        repeat_after: 0,
        repeat_mode: 0,
        assignees: [],
      };
      mockClient.tasks.getTask.mockResolvedValue(mockTask);
      mockClient.tasks.updateTask.mockRejectedValue(originalError);

      await expect(
        updateTask({
          id: 1,
          title: 'Updated Title',
        })
      ).rejects.toThrow(originalError);
    });
  });

  describe('affectedFields tracking', () => {
    it('should track field changes correctly in updateTask', async () => {
      const mockTask = {
        id: 1,
        title: 'Original Title',
        description: 'Original Description',
        due_date: '2024-01-01T00:00:00Z',
        priority: 1,
        done: false,
        repeat_after: 0,
        repeat_mode: 0,
        assignees: [],
      };

      const updatedTask = {
        ...mockTask,
        title: 'New Title',
        priority: 5,
        done: true,
      };

      mockClient.tasks.getTask
        .mockResolvedValueOnce(mockTask) // Initial fetch
        .mockResolvedValueOnce(updatedTask); // Final fetch
      mockClient.tasks.updateTask.mockResolvedValue(updatedTask);

      const result = await updateTask({
        id: 1,
        title: 'New Title',
        priority: 5,
        done: true,
      });

      const markdown = result.content[0].text;
      const parsed = parseMarkdown(markdown);
      expect(markdown).toContain("## ✅ Success");
      expect(markdown).toContain('update-task');
      expect(markdown).toContain('Task updated successfully');
    });
  });
});