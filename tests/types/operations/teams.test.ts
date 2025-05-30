/**
 * Tests for team operation type guards
 */

import {
  isListTeamsRequest,
  isCreateTeamRequest,
  isGetTeamRequest,
  isUpdateTeamRequest,
  isDeleteTeamRequest,
  isAddTeamMemberRequest,
  isRemoveTeamMemberRequest
} from '../../../src/types/operations/teams';
import type { BaseOperationRequest } from '../../../src/types/operations/base';

describe('Team Operation Type Guards', () => {
  describe('isListTeamsRequest', () => {
    it('should return true for list operation', () => {
      const request: BaseOperationRequest = {
        operation: 'list'
      };
      expect(isListTeamsRequest(request)).toBe(true);
    });

    it('should return false for other operations', () => {
      const request: BaseOperationRequest = {
        operation: 'create'
      };
      expect(isListTeamsRequest(request)).toBe(false);
    });
  });

  describe('isCreateTeamRequest', () => {
    it('should return true for create operation with name', () => {
      const request = {
        operation: 'create',
        name: 'New Team'
      };
      expect(isCreateTeamRequest(request)).toBe(true);
    });

    it('should return false for create operation without name', () => {
      const request = {
        operation: 'create'
      };
      expect(isCreateTeamRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'update',
        name: 'New Team'
      };
      expect(isCreateTeamRequest(request)).toBe(false);
    });
  });

  describe('isGetTeamRequest', () => {
    it('should return true for get operation with id', () => {
      const request = {
        operation: 'get',
        id: 1
      };
      expect(isGetTeamRequest(request)).toBe(true);
    });

    it('should return false for get operation without id', () => {
      const request = {
        operation: 'get'
      };
      expect(isGetTeamRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'list',
        id: 1
      };
      expect(isGetTeamRequest(request)).toBe(false);
    });
  });

  describe('isUpdateTeamRequest', () => {
    it('should return true for update operation with id', () => {
      const request = {
        operation: 'update',
        id: 1
      };
      expect(isUpdateTeamRequest(request)).toBe(true);
    });

    it('should return false for update operation without id', () => {
      const request = {
        operation: 'update'
      };
      expect(isUpdateTeamRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'delete',
        id: 1
      };
      expect(isUpdateTeamRequest(request)).toBe(false);
    });
  });

  describe('isDeleteTeamRequest', () => {
    it('should return true for delete operation with id', () => {
      const request = {
        operation: 'delete',
        id: 1
      };
      expect(isDeleteTeamRequest(request)).toBe(true);
    });

    it('should return false for delete operation without id', () => {
      const request = {
        operation: 'delete'
      };
      expect(isDeleteTeamRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'get',
        id: 1
      };
      expect(isDeleteTeamRequest(request)).toBe(false);
    });
  });

  describe('isAddTeamMemberRequest', () => {
    it('should return true for add-member operation with teamId and userId', () => {
      const request = {
        operation: 'add-member',
        teamId: 1,
        userId: 100
      };
      expect(isAddTeamMemberRequest(request)).toBe(true);
    });

    it('should return false for add-member operation without teamId', () => {
      const request = {
        operation: 'add-member',
        userId: 100
      };
      expect(isAddTeamMemberRequest(request)).toBe(false);
    });

    it('should return false for add-member operation without userId', () => {
      const request = {
        operation: 'add-member',
        teamId: 1
      };
      expect(isAddTeamMemberRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'remove-member',
        teamId: 1,
        userId: 100
      };
      expect(isAddTeamMemberRequest(request)).toBe(false);
    });
  });

  describe('isRemoveTeamMemberRequest', () => {
    it('should return true for remove-member operation with teamId and userId', () => {
      const request = {
        operation: 'remove-member',
        teamId: 1,
        userId: 100
      };
      expect(isRemoveTeamMemberRequest(request)).toBe(true);
    });

    it('should return false for remove-member operation without teamId', () => {
      const request = {
        operation: 'remove-member',
        userId: 100
      };
      expect(isRemoveTeamMemberRequest(request)).toBe(false);
    });

    it('should return false for remove-member operation without userId', () => {
      const request = {
        operation: 'remove-member',
        teamId: 1
      };
      expect(isRemoveTeamMemberRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'add-member',
        teamId: 1,
        userId: 100
      };
      expect(isRemoveTeamMemberRequest(request)).toBe(false);
    });
  });
});