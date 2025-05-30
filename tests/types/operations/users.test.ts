/**
 * Tests for user operation type guards
 */

import {
  isGetCurrentUserRequest,
  isGetUserRequest,
  isUpdateUserSettingsRequest,
  isSearchUsersRequest,
  isListProjectUsersRequest
} from '../../../src/types/operations/users';
import type { BaseOperationRequest } from '../../../src/types/operations/base';

describe('User Operation Type Guards', () => {
  describe('isGetCurrentUserRequest', () => {
    it('should return true for current operation', () => {
      const request: BaseOperationRequest = {
        operation: 'current'
      };
      expect(isGetCurrentUserRequest(request)).toBe(true);
    });

    it('should return false for other operations', () => {
      const request: BaseOperationRequest = {
        operation: 'get'
      };
      expect(isGetCurrentUserRequest(request)).toBe(false);
    });
  });

  describe('isGetUserRequest', () => {
    it('should return true for get operation with id', () => {
      const request = {
        operation: 'get',
        id: 1
      };
      expect(isGetUserRequest(request)).toBe(true);
    });

    it('should return false for get operation without id', () => {
      const request = {
        operation: 'get'
      };
      expect(isGetUserRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'current',
        id: 1
      };
      expect(isGetUserRequest(request)).toBe(false);
    });
  });

  describe('isUpdateUserSettingsRequest', () => {
    it('should return true for update-settings operation with settings', () => {
      const request = {
        operation: 'update-settings',
        settings: {}
      };
      expect(isUpdateUserSettingsRequest(request)).toBe(true);
    });

    it('should return false for update-settings operation without settings', () => {
      const request = {
        operation: 'update-settings'
      };
      expect(isUpdateUserSettingsRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'update',
        settings: {}
      };
      expect(isUpdateUserSettingsRequest(request)).toBe(false);
    });
  });

  describe('isSearchUsersRequest', () => {
    it('should return true for search operation with query', () => {
      const request = {
        operation: 'search',
        query: 'john'
      };
      expect(isSearchUsersRequest(request)).toBe(true);
    });

    it('should return false for search operation without query', () => {
      const request = {
        operation: 'search'
      };
      expect(isSearchUsersRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'list',
        query: 'john'
      };
      expect(isSearchUsersRequest(request)).toBe(false);
    });
  });

  describe('isListProjectUsersRequest', () => {
    it('should return true for list-project-users operation with projectId', () => {
      const request = {
        operation: 'list-project-users',
        projectId: 1
      };
      expect(isListProjectUsersRequest(request)).toBe(true);
    });

    it('should return false for list-project-users operation without projectId', () => {
      const request = {
        operation: 'list-project-users'
      };
      expect(isListProjectUsersRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'list',
        projectId: 1
      };
      expect(isListProjectUsersRequest(request)).toBe(false);
    });
  });
});