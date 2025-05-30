/**
 * Tests for label operation type guards
 */

import {
  isListLabelsRequest,
  isCreateLabelRequest,
  isGetLabelRequest,
  isUpdateLabelRequest,
  isDeleteLabelRequest,
  isBulkCreateLabelsRequest
} from '../../../src/types/operations/labels';
import type { BaseOperationRequest } from '../../../src/types/operations/base';

describe('Label Operation Type Guards', () => {
  describe('isListLabelsRequest', () => {
    it('should return true for list operation', () => {
      const request: BaseOperationRequest = {
        operation: 'list'
      };
      expect(isListLabelsRequest(request)).toBe(true);
    });

    it('should return false for other operations', () => {
      const request: BaseOperationRequest = {
        operation: 'create'
      };
      expect(isListLabelsRequest(request)).toBe(false);
    });
  });

  describe('isCreateLabelRequest', () => {
    it('should return true for create operation with title', () => {
      const request = {
        operation: 'create',
        title: 'New Label'
      };
      expect(isCreateLabelRequest(request)).toBe(true);
    });

    it('should return false for create operation without title', () => {
      const request = {
        operation: 'create'
      };
      expect(isCreateLabelRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'update',
        title: 'New Label'
      };
      expect(isCreateLabelRequest(request)).toBe(false);
    });
  });

  describe('isGetLabelRequest', () => {
    it('should return true for get operation with id', () => {
      const request = {
        operation: 'get',
        id: 1
      };
      expect(isGetLabelRequest(request)).toBe(true);
    });

    it('should return false for get operation without id', () => {
      const request = {
        operation: 'get'
      };
      expect(isGetLabelRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'list',
        id: 1
      };
      expect(isGetLabelRequest(request)).toBe(false);
    });
  });

  describe('isUpdateLabelRequest', () => {
    it('should return true for update operation with id', () => {
      const request = {
        operation: 'update',
        id: 1
      };
      expect(isUpdateLabelRequest(request)).toBe(true);
    });

    it('should return false for update operation without id', () => {
      const request = {
        operation: 'update'
      };
      expect(isUpdateLabelRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'delete',
        id: 1
      };
      expect(isUpdateLabelRequest(request)).toBe(false);
    });
  });

  describe('isDeleteLabelRequest', () => {
    it('should return true for delete operation with id', () => {
      const request = {
        operation: 'delete',
        id: 1
      };
      expect(isDeleteLabelRequest(request)).toBe(true);
    });

    it('should return false for delete operation without id', () => {
      const request = {
        operation: 'delete'
      };
      expect(isDeleteLabelRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'get',
        id: 1
      };
      expect(isDeleteLabelRequest(request)).toBe(false);
    });
  });

  describe('isBulkCreateLabelsRequest', () => {
    it('should return true for bulk-create operation with labels', () => {
      const request = {
        operation: 'bulk-create',
        labels: []
      };
      expect(isBulkCreateLabelsRequest(request)).toBe(true);
    });

    it('should return false for bulk-create operation without labels', () => {
      const request = {
        operation: 'bulk-create'
      };
      expect(isBulkCreateLabelsRequest(request)).toBe(false);
    });

    it('should return false for other operations', () => {
      const request = {
        operation: 'create',
        labels: []
      };
      expect(isBulkCreateLabelsRequest(request)).toBe(false);
    });
  });
});