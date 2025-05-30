/**
 * Tests for project operation type guards
 */

import {
  isListProjectsRequest,
  isCreateProjectRequest,
  isGetProjectRequest,
  isUpdateProjectRequest,
  isDeleteProjectRequest,
  isArchiveProjectRequest
} from '../../../src/types/operations/projects';
import type { BaseOperationRequest } from '../../../src/types/operations/base';

describe('Project Operation Type Guards', () => {
  describe('isListProjectsRequest', () => {
    it('should return true for list operation', () => {
      const request: BaseOperationRequest = {
        operation: 'list'
      };
      expect(isListProjectsRequest(request)).toBe(true);
    });

    it('should return false for other operations', () => {
      const request: BaseOperationRequest = {
        operation: 'create'
      };
      expect(isListProjectsRequest(request)).toBe(false);
    });
  });

  describe('isCreateProjectRequest', () => {
    it('should return true for create operation with title', () => {
      const request = {
        operation: 'create',
        title: 'New Project'
      };
      expect(isCreateProjectRequest(request)).toBe(true);
    });

    it('should return false for create operation without title', () => {
      const request = {
        operation: 'create'
      };
      expect(isCreateProjectRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'update',
        title: 'New Project'
      };
      expect(isCreateProjectRequest(request)).toBe(false);
    });
  });

  describe('isGetProjectRequest', () => {
    it('should return true for get operation with id', () => {
      const request = {
        operation: 'get',
        id: 1
      };
      expect(isGetProjectRequest(request)).toBe(true);
    });

    it('should return false for get operation without id', () => {
      const request = {
        operation: 'get'
      };
      expect(isGetProjectRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'list',
        id: 1
      };
      expect(isGetProjectRequest(request)).toBe(false);
    });
  });

  describe('isUpdateProjectRequest', () => {
    it('should return true for update operation with id', () => {
      const request = {
        operation: 'update',
        id: 1
      };
      expect(isUpdateProjectRequest(request)).toBe(true);
    });

    it('should return false for update operation without id', () => {
      const request = {
        operation: 'update'
      };
      expect(isUpdateProjectRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'delete',
        id: 1
      };
      expect(isUpdateProjectRequest(request)).toBe(false);
    });
  });

  describe('isDeleteProjectRequest', () => {
    it('should return true for delete operation with id', () => {
      const request = {
        operation: 'delete',
        id: 1
      };
      expect(isDeleteProjectRequest(request)).toBe(true);
    });

    it('should return false for delete operation without id', () => {
      const request = {
        operation: 'delete'
      };
      expect(isDeleteProjectRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'archive',
        id: 1
      };
      expect(isDeleteProjectRequest(request)).toBe(false);
    });
  });

  describe('isArchiveProjectRequest', () => {
    it('should return true for archive operation with id and archive flag', () => {
      const request = {
        operation: 'archive',
        id: 1,
        archive: true
      };
      expect(isArchiveProjectRequest(request)).toBe(true);
    });

    it('should return false for archive operation without id', () => {
      const request = {
        operation: 'archive',
        archive: true
      };
      expect(isArchiveProjectRequest(request)).toBe(false);
    });

    it('should return false for archive operation without archive flag', () => {
      const request = {
        operation: 'archive',
        id: 1
      };
      expect(isArchiveProjectRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'update',
        id: 1,
        archive: true
      };
      expect(isArchiveProjectRequest(request)).toBe(false);
    });
  });
});