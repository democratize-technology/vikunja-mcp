/**
 * Tests for error types
 */

import { MCPError, ErrorCode } from '../../src/types/errors';

describe('MCPError', () => {
  it('should create error with code and message', () => {
    const error = new MCPError(ErrorCode.AUTH_FAILED, 'Authentication failed');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MCPError);
    expect(error.code).toBe(ErrorCode.AUTH_FAILED);
    expect(error.message).toBe('Authentication failed');
    expect(error.name).toBe('MCPError');
    expect(error.details).toBeUndefined();
  });

  it('should create error with details', () => {
    const details = { userId: 123, reason: 'invalid token' };
    const error = new MCPError(ErrorCode.AUTH_FAILED, 'Authentication failed', details);

    expect(error.code).toBe(ErrorCode.AUTH_FAILED);
    expect(error.message).toBe('Authentication failed');
    expect(error.details).toEqual(details);
  });

  it('should serialize to JSON without details', () => {
    const error = new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid input');
    const json = error.toJSON();

    expect(json).toEqual({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid input',
        details: undefined,
      },
    });
  });

  it('should serialize to JSON with details', () => {
    const details = { field: 'email', value: 'invalid' };
    const error = new MCPError(ErrorCode.VALIDATION_ERROR, 'Invalid input', details);
    const json = error.toJSON();

    expect(json).toEqual({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid input',
        details: details,
      },
    });
  });

  it('should have correct error codes', () => {
    expect(ErrorCode.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
    expect(ErrorCode.AUTH_FAILED).toBe('AUTH_FAILED');
    expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
    expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCode.API_ERROR).toBe('API_ERROR');
    expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(ErrorCode.NOT_IMPLEMENTED).toBe('NOT_IMPLEMENTED');
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });
});
