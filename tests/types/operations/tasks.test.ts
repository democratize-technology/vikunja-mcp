/**
 * Tests for task operation type guards
 */

import {
  isListTasksRequest,
  isCreateTaskRequest,
  isUpdateTaskRequest,
  isDeleteTaskRequest,
  isBulkCreateTasksRequest,
  isBulkUpdateTasksRequest,
  isBulkDeleteTasksRequest
} from '../../../src/types/operations/tasks';
import type { BaseOperationRequest } from '../../../src/types/operations/base';

describe('Task Operation Type Guards', () => {
  describe('isListTasksRequest', () => {
    it('should return true for list operation', () => {
      const request: BaseOperationRequest = {
        operation: 'list'
      };
      expect(isListTasksRequest(request)).toBe(true);
    });

    it('should return false for other operations', () => {
      const request: BaseOperationRequest = {
        operation: 'create'
      };
      expect(isListTasksRequest(request)).toBe(false);
    });
  });

  describe('isCreateTaskRequest', () => {
    it('should return true for create operation with required fields', () => {
      const request = {
        operation: 'create',
        projectId: 1,
        title: 'Test Task'
      };
      expect(isCreateTaskRequest(request)).toBe(true);
    });

    it('should return false for create operation without projectId', () => {
      const request = {
        operation: 'create',
        title: 'Test Task'
      };
      expect(isCreateTaskRequest(request)).toBe(false);
    });

    it('should return false for create operation without title', () => {
      const request = {
        operation: 'create',
        projectId: 1
      };
      expect(isCreateTaskRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'update',
        projectId: 1,
        title: 'Test Task'
      };
      expect(isCreateTaskRequest(request)).toBe(false);
    });
  });

  describe('isUpdateTaskRequest', () => {
    it('should return true for update operation with id', () => {
      const request = {
        operation: 'update',
        id: 1
      };
      expect(isUpdateTaskRequest(request)).toBe(true);
    });

    it('should return false for update operation without id', () => {
      const request = {
        operation: 'update'
      };
      expect(isUpdateTaskRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'delete',
        id: 1
      };
      expect(isUpdateTaskRequest(request)).toBe(false);
    });
  });

  describe('isDeleteTaskRequest', () => {
    it('should return true for delete operation with id', () => {
      const request = {
        operation: 'delete',
        id: 1
      };
      expect(isDeleteTaskRequest(request)).toBe(true);
    });

    it('should return false for delete operation without id', () => {
      const request = {
        operation: 'delete'
      };
      expect(isDeleteTaskRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'update',
        id: 1
      };
      expect(isDeleteTaskRequest(request)).toBe(false);
    });
  });

  describe('isBulkCreateTasksRequest', () => {
    it('should return true for bulk-create with required fields', () => {
      const request = {
        operation: 'bulk-create',
        projectId: 1,
        tasks: []
      };
      expect(isBulkCreateTasksRequest(request)).toBe(true);
    });

    it('should return false without projectId', () => {
      const request = {
        operation: 'bulk-create',
        tasks: []
      };
      expect(isBulkCreateTasksRequest(request)).toBe(false);
    });

    it('should return false without tasks', () => {
      const request = {
        operation: 'bulk-create',
        projectId: 1
      };
      expect(isBulkCreateTasksRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'create',
        projectId: 1,
        tasks: []
      };
      expect(isBulkCreateTasksRequest(request)).toBe(false);
    });
  });

  describe('isBulkUpdateTasksRequest', () => {
    it('should return true for bulk-update with required fields', () => {
      const request = {
        operation: 'bulk-update',
        taskIds: [1, 2, 3],
        field: 'done' as const
      };
      expect(isBulkUpdateTasksRequest(request)).toBe(true);
    });

    it('should return false without taskIds', () => {
      const request = {
        operation: 'bulk-update',
        field: 'done' as const
      };
      expect(isBulkUpdateTasksRequest(request)).toBe(false);
    });

    it('should return false without field', () => {
      const request = {
        operation: 'bulk-update',
        taskIds: [1, 2, 3]
      };
      expect(isBulkUpdateTasksRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'update',
        taskIds: [1, 2, 3],
        field: 'done' as const
      };
      expect(isBulkUpdateTasksRequest(request)).toBe(false);
    });
  });

  describe('isBulkDeleteTasksRequest', () => {
    it('should return true for bulk-delete with taskIds', () => {
      const request = {
        operation: 'bulk-delete',
        taskIds: [1, 2, 3]
      };
      expect(isBulkDeleteTasksRequest(request)).toBe(true);
    });

    it('should return false without taskIds', () => {
      const request = {
        operation: 'bulk-delete'
      };
      expect(isBulkDeleteTasksRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'delete',
        taskIds: [1, 2, 3]
      };
      expect(isBulkDeleteTasksRequest(request)).toBe(false);
    });
  });
});