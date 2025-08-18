/**
 * Tests for Centralized Error Handling Utilities
 */

import { 
  handleStatusCodeError,
  transformApiError,
  wrapToolError,
  createAuthRequiredError,
  createValidationError,
  createInternalError
} from '../../src/utils/error-handler';
import { MCPError, ErrorCode } from '../../src/types/errors';

describe('Error Handler Utilities', () => {
  describe('handleStatusCodeError', () => {
    it('should convert 404 errors to NOT_FOUND with resource ID', () => {
      const error = { statusCode: 404 };
      const result = handleStatusCodeError(error, 'get project', 123);
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.NOT_FOUND);
      expect(result.message).toBe('Project with ID 123 not found');
    });

    it('should convert 404 errors to NOT_FOUND without resource ID', () => {
      const error = { statusCode: 404 };
      const result = handleStatusCodeError(error, 'get project');
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.NOT_FOUND);
      expect(result.message).toBe('Project not found');
    });

    it('should handle complex operation descriptions', () => {
      const error = { statusCode: 404 };
      const result = handleStatusCodeError(error, 'delete project share', 456);
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.NOT_FOUND);
      expect(result.message).toBe('Project share with ID 456 not found');
    });

    it('should convert non-404 status codes to API_ERROR', () => {
      const error = { statusCode: 500 };
      const result = handleStatusCodeError(error, 'update project', 123);
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.API_ERROR);
      expect(result.message).toBe('Failed to update project: Unknown error');
    });

    it('should handle Error objects with status codes', () => {
      const error = Object.assign(new Error('Server error'), { statusCode: 500 });
      const result = handleStatusCodeError(error, 'create project');
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.API_ERROR);
      expect(result.message).toBe('Failed to create project: Server error');
    });

    it('should handle objects without statusCode', () => {
      const error = { message: 'Network failure' };
      const result = handleStatusCodeError(error, 'list projects');
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.API_ERROR);
      expect(result.message).toBe('Failed to list projects: Unknown error');
    });

    it('should handle Error objects without statusCode', () => {
      const error = new Error('Connection timeout');
      const result = handleStatusCodeError(error, 'archive project', 789);
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.API_ERROR);
      expect(result.message).toBe('Failed to archive project: Connection timeout');
    });

    it('should handle null and undefined errors', () => {
      const result1 = handleStatusCodeError(null, 'get project');
      const result2 = handleStatusCodeError(undefined, 'get project');
      
      expect(result1.code).toBe(ErrorCode.API_ERROR);
      expect(result1.message).toBe('Failed to get project: Unknown error');
      expect(result2.code).toBe(ErrorCode.API_ERROR);
      expect(result2.message).toBe('Failed to get project: Unknown error');
    });

    it('should use custom not found message when provided', () => {
      const error = { statusCode: 404 };
      const customMessage = 'Share with ID 123 not found for project 456';
      const result = handleStatusCodeError(error, 'get share', 123, customMessage);
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.NOT_FOUND);
      expect(result.message).toBe(customMessage);
    });
  });

  describe('transformApiError', () => {
    it('should preserve existing MCPError instances', () => {
      const originalError = new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid input');
      const result = transformApiError(originalError, 'Creating task');
      
      expect(result).toBe(originalError); // Same instance
      expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.message).toBe('Invalid input');
    });

    it('should convert Error objects to API_ERROR', () => {
      const error = new Error('Network connection failed');
      const result = transformApiError(error, 'Fetching projects');
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.API_ERROR);
      expect(result.message).toBe('Fetching projects: Network connection failed');
    });

    it('should handle non-Error objects', () => {
      const error = { status: 'failed', reason: 'timeout' };
      const result = transformApiError(error, 'Updating task');
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.API_ERROR);
      expect(result.message).toBe('Updating task: Unknown error');
    });

    it('should handle primitive error values', () => {
      const result1 = transformApiError('String error', 'Processing request');
      const result2 = transformApiError(42, 'Calculating result');
      
      expect(result1.code).toBe(ErrorCode.API_ERROR);
      expect(result1.message).toBe('Processing request: Unknown error');
      expect(result2.code).toBe(ErrorCode.API_ERROR);
      expect(result2.message).toBe('Calculating result: Unknown error');
    });
  });

  describe('wrapToolError', () => {
    it('should preserve MCPError instances', () => {
      const originalError = new MCPError(ErrorCode.AUTH_REQUIRED, 'Not authenticated');
      const result = wrapToolError(originalError, 'vikunja_projects', 'create');
      
      expect(result).toBe(originalError);
      expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
      expect(result.message).toBe('Not authenticated');
    });

    it('should handle status code errors using handleStatusCodeError', () => {
      const error = { statusCode: 404 };
      const result = wrapToolError(error, 'vikunja_projects', 'get project', 123);
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.NOT_FOUND);
      expect(result.message).toBe('Project with ID 123 not found');
    });

    it('should handle generic API errors', () => {
      const error = new Error('Database connection lost');
      const result = wrapToolError(error, 'vikunja_tasks', 'update');
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.API_ERROR);
      expect(result.message).toBe('vikunja_tasks.update failed: Database connection lost');
    });

    it('should handle unknown error types', () => {
      const error = { unexpected: 'format' };
      const result = wrapToolError(error, 'vikunja_labels', 'delete label', 'abc');
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.API_ERROR);
      expect(result.message).toBe('vikunja_labels.delete label failed: Unknown error');
    });

    it('should handle custom not found messages', () => {
      const error = { statusCode: 404 };
      const result = wrapToolError(
        error, 
        'vikunja_projects', 
        'get share', 
        123, 
        'Share with ID 123 not found for project 456'
      );
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.NOT_FOUND);
      expect(result.message).toBe('Share with ID 123 not found for project 456');
    });
  });

  describe('createAuthRequiredError', () => {
    it('should create standardized auth required error', () => {
      const result = createAuthRequiredError();
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
      expect(result.message).toBe('Authentication required. Please use vikunja_auth.connect first.');
    });
  });

  describe('createValidationError', () => {
    it('should create validation error with custom message', () => {
      const result = createValidationError('Project ID must be a positive integer');
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.message).toBe('Project ID must be a positive integer');
    });
  });

  describe('createInternalError', () => {
    it('should create internal error with message only', () => {
      const result = createInternalError('Unexpected condition occurred');
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(result.message).toBe('Unexpected condition occurred');
    });

    it('should create internal error with original Error', () => {
      const originalError = new Error('Stack overflow');
      const result = createInternalError('Processing failed', originalError);
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(result.message).toBe('Processing failed: Stack overflow');
    });

    it('should handle non-Error original errors', () => {
      const originalError = { type: 'system_failure' };
      const result = createInternalError('System error occurred', originalError);
      
      expect(result).toBeInstanceOf(MCPError);
      expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(result.message).toBe('System error occurred');
    });
  });

  describe('Backward Compatibility', () => {
    it('should produce exact same errors as original projects.ts patterns', () => {
      // Test the exact pattern used in projects.ts for 404 errors
      const error = { statusCode: 404 };
      
      // Original pattern: "Project with ID {id} not found"
      const result = handleStatusCodeError(error, 'get project', 123);
      expect(result.message).toBe('Project with ID 123 not found');
      
      // Test for other operations
      const updateResult = handleStatusCodeError(error, 'update project', 456);
      expect(updateResult.message).toBe('Project with ID 456 not found');
      
      const deleteResult = handleStatusCodeError(error, 'delete project', 789);
      expect(deleteResult.message).toBe('Project with ID 789 not found');
    });

    it('should match original API error patterns', () => {
      const error = new Error('Connection refused');
      
      // Original pattern: "Failed to {operation}: {error.message}"
      const result = handleStatusCodeError(error, 'create project');
      expect(result.message).toBe('Failed to create project: Connection refused');
      
      const listResult = handleStatusCodeError(error, 'list projects');
      expect(listResult.message).toBe('Failed to list projects: Connection refused');
    });

    it('should handle share-specific operations correctly', () => {
      const error = { statusCode: 404 };
      
      // Test share operations that have different message patterns
      const shareResult = handleStatusCodeError(error, 'get share', 123);
      expect(shareResult.message).toBe('Share with ID 123 not found');
      
      const deleteShareResult = handleStatusCodeError(error, 'delete share', 456);
      expect(deleteShareResult.message).toBe('Share with ID 456 not found');
    });

    it('should handle operations with resource type detection fallbacks', () => {
      const error = { statusCode: 404 };
      
      // Test fallback logic for operations that don't have space-separated resource types
      // These should trigger the includes() logic since they don't match the regex
      const projectResult = handleStatusCodeError(error, 'someprojectoperation', 123);
      expect(projectResult.message).toBe('Project with ID 123 not found');
      
      const taskResult = handleStatusCodeError(error, 'dotaskstuff', 456);
      expect(taskResult.message).toBe('Task with ID 456 not found');
      
      const shareResult = handleStatusCodeError(error, 'handlesharething', 789);
      expect(shareResult.message).toBe('Share with ID 789 not found');
      
      const labelResult = handleStatusCodeError(error, 'processlabeldata', 101);
      expect(labelResult.message).toBe('Label with ID 101 not found');
      
      // Test completely unknown operation that falls through to generic resource
      const unknownResult = handleStatusCodeError(error, 'unknown', 999);
      expect(unknownResult.message).toBe('Resource with ID 999 not found');
    });

  });
});