/**
 * Test helpers for working with AORP responses
 * Direct AORP testing utilities - no backward compatibility needed
 */

import type { AorpFactoryResult, AorpResponse } from '../../src/aorp/types';

/**
 * Extract the AORP response from factory result
 */
export function getAorpResponse(result: AorpFactoryResult | AorpResponse): AorpResponse {
  return 'response' in result ? result.response : result;
}

/**
 * Check if AORP response indicates success
 */
export function isAorpSuccess(result: AorpFactoryResult | AorpResponse): boolean {
  const response = getAorpResponse(result);
  return response.immediate.status === 'success';
}

/**
 * Check if AORP response indicates error
 */
export function isAorpError(result: AorpFactoryResult | AorpResponse): boolean {
  const response = getAorpResponse(result);
  return response.immediate.status === 'error';
}

/**
 * Get the operation from AORP response
 */
export function getAorpOperation(result: AorpFactoryResult | AorpResponse): string {
  const response = getAorpResponse(result);
  return response.details.metadata.operation || 'unknown';
}

/**
 * Get the primary message from AORP response
 */
export function getAorpMessage(result: AorpFactoryResult | AorpResponse): string {
  const response = getAorpResponse(result);
  return response.details.summary;
}

/**
 * Get the key insight from AORP response
 */
export function getAorpKeyInsight(result: AorpFactoryResult | AorpResponse): string {
  const response = getAorpResponse(result);
  return response.immediate.key_insight;
}

/**
 * Get the confidence score from AORP response
 */
export function getAorpConfidence(result: AorpFactoryResult | AorpResponse): number {
  const response = getAorpResponse(result);
  return response.immediate.confidence;
}

/**
 * Get next steps from AORP response
 */
export function getAorpNextSteps(result: AorpFactoryResult | AorpResponse): string[] {
  const response = getAorpResponse(result);
  return response.actionable.next_steps;
}

/**
 * Get quality indicators from AORP response
 */
export function getAorpQuality(result: AorpFactoryResult | AorpResponse) {
  const response = getAorpResponse(result);
  return response.quality;
}

/**
 * Get debug information from AORP response
 */
export function getAorpDebug(result: AorpFactoryResult | AorpResponse): unknown {
  const response = getAorpResponse(result);
  return response.details.debug;
}

/**
 * Expect AORP response to have success status
 */
export function expectAorpSuccess(result: AorpFactoryResult | AorpResponse, expectedOperation?: string): void {
  const response = getAorpResponse(result);

  expect(response.immediate.status).toBe('success');
  expect(response.immediate.confidence).toBeGreaterThan(0);

  if (expectedOperation) {
    expect(response.details.metadata.operation).toBe(expectedOperation);
  }
}

/**
 * Expect AORP response to have error status
 */
export function expectAorpError(result: AorpFactoryResult | AorpResponse, expectedOperation?: string): void {
  const response = getAorpResponse(result);

  expect(response.immediate.status).toBe('error');
  expect(response.immediate.confidence).toBeLessThan(1);

  if (expectedOperation) {
    expect(response.details.metadata.operation).toBe(expectedOperation);
  }
}

/**
 * Get transformation metrics from AORP factory result
 */
export function getAorpMetrics(result: AorpFactoryResult) {
  if (!('transformation' in result)) {
    throw new Error('Result is not an AorpFactoryResult');
  }

  return result.transformation.metrics;
}

/**
 * Get transformation context from AORP factory result
 */
export function getAorpContext(result: AorpFactoryResult) {
  if (!('transformation' in result)) {
    throw new Error('Result is not an AorpFactoryResult');
  }

  return result.transformation.context;
}