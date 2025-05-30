/**
 * Utility for handling Zod validation errors
 */

import type { z } from 'zod';
import { MCPError, ErrorCode } from '../types/errors';

/**
 * Convert a Zod error into an MCPError with a meaningful message
 */
export function handleZodError(error: z.ZodError): MCPError {
  const firstError = error.errors[0];
  
  if (!firstError) {
    return new MCPError(ErrorCode.VALIDATION_ERROR, 'Validation failed');
  }
  
  const path = firstError.path.join('.');
  const message = path 
    ? `${path}: ${firstError.message}`
    : firstError.message;
  
  return new MCPError(ErrorCode.VALIDATION_ERROR, message);
}

/**
 * Safe parse with error handling
 */
export function safeParse<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const error = handleZodError(result.error);
    if (context) {
      error.message = `${context}: ${error.message}`;
    }
    throw error;
  }
  
  return result.data;
}