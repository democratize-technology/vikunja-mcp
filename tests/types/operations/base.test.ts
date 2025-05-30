/**
 * Tests for base operation types
 */

import type {
  BaseOperationRequest,
  BaseOperationResponse,
  OperationMetadata,
  OperationError,
  PaginatedMetadata,
  BulkOperationResult,
  BulkOperationFailure
} from '../../../src/types/operations/base';

describe('Base Operation Types', () => {
  describe('BaseOperationRequest', () => {
    it('should accept minimal request', () => {
      const request: BaseOperationRequest = {
        operation: 'test'
      };
      expect(request.operation).toBe('test');
      expect(request.timestamp).toBeUndefined();
    });

    it('should accept request with timestamp', () => {
      const request: BaseOperationRequest = {
        operation: 'test',
        timestamp: '2024-01-01T00:00:00Z'
      };
      expect(request.operation).toBe('test');
      expect(request.timestamp).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('BaseOperationResponse', () => {
    it('should represent successful response', () => {
      const response: BaseOperationResponse<string> = {
        success: true,
        operation: 'test',
        message: 'Operation successful',
        data: 'result',
        metadata: {
          timestamp: '2024-01-01T00:00:00Z'
        }
      };
      
      expect(response.success).toBe(true);
      expect(response.data).toBe('result');
      expect(response.error).toBeUndefined();
    });

    it('should represent failed response', () => {
      const response: BaseOperationResponse = {
        success: false,
        operation: 'test',
        message: 'Operation failed',
        metadata: {
          timestamp: '2024-01-01T00:00:00Z'
        },
        error: {
          code: 'TEST_ERROR',
          message: 'Test error occurred',
          details: { reason: 'test' }
        }
      };
      
      expect(response.success).toBe(false);
      expect(response.data).toBeUndefined();
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('TEST_ERROR');
    });
  });

  describe('OperationMetadata', () => {
    it('should support additional properties', () => {
      const metadata: OperationMetadata = {
        timestamp: '2024-01-01T00:00:00Z',
        requestId: 'abc123',
        duration: 150,
        custom: true
      };
      
      expect(metadata.timestamp).toBe('2024-01-01T00:00:00Z');
      expect(metadata.requestId).toBe('abc123');
      expect(metadata.duration).toBe(150);
      expect(metadata.custom).toBe(true);
    });
  });

  describe('PaginatedMetadata', () => {
    it('should represent first page', () => {
      const metadata: PaginatedMetadata = {
        page: 1,
        perPage: 50,
        totalPages: 5,
        totalItems: 230,
        hasNext: true,
        hasPrevious: false
      };
      
      expect(metadata.hasNext).toBe(true);
      expect(metadata.hasPrevious).toBe(false);
    });

    it('should represent middle page', () => {
      const metadata: PaginatedMetadata = {
        page: 3,
        perPage: 50,
        totalPages: 5,
        totalItems: 230,
        hasNext: true,
        hasPrevious: true
      };
      
      expect(metadata.hasNext).toBe(true);
      expect(metadata.hasPrevious).toBe(true);
    });

    it('should represent last page', () => {
      const metadata: PaginatedMetadata = {
        page: 5,
        perPage: 50,
        totalPages: 5,
        totalItems: 230,
        hasNext: false,
        hasPrevious: true
      };
      
      expect(metadata.hasNext).toBe(false);
      expect(metadata.hasPrevious).toBe(true);
    });
  });

  describe('BulkOperationResult', () => {
    it('should represent fully successful bulk operation', () => {
      const result: BulkOperationResult<string> = {
        successful: ['item1', 'item2', 'item3'],
        failed: []
      };
      
      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
    });

    it('should represent partially successful bulk operation', () => {
      const result: BulkOperationResult<string> = {
        successful: ['item1', 'item3'],
        failed: [
          {
            item: 'item2',
            error: 'Validation failed',
            index: 1
          }
        ]
      };
      
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].index).toBe(1);
    });

    it('should represent completely failed bulk operation', () => {
      const result: BulkOperationResult<string> = {
        successful: [],
        failed: [
          {
            item: 'item1',
            error: 'Error 1',
            index: 0
          },
          {
            item: 'item2',
            error: 'Error 2',
            index: 1
          }
        ]
      };
      
      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(2);
    });
  });

  describe('BulkOperationFailure', () => {
    it('should represent failure with index', () => {
      const failure: BulkOperationFailure = {
        item: { id: 1, name: 'Test' },
        error: 'Validation failed',
        index: 5
      };
      
      expect(failure.item).toEqual({ id: 1, name: 'Test' });
      expect(failure.error).toBe('Validation failed');
      expect(failure.index).toBe(5);
    });

    it('should represent failure without index', () => {
      const failure: BulkOperationFailure = {
        item: 'test-item',
        error: 'Network error'
      };
      
      expect(failure.item).toBe('test-item');
      expect(failure.error).toBe('Network error');
      expect(failure.index).toBeUndefined();
    });
  });
});