/**
 * Test helpers for working with AORP responses
 * Provides utility functions to extract legacy-style properties from AORP format
 */

/**
 * Extract legacy-style properties from AORP response for easier testing
 */
export function extractLegacyResponse(aorpResponse: any) {
  if (!aorpResponse) {
    throw new Error('AORP response is undefined');
  }

  // Handle the response structure from the factory
  const response = aorpResponse.response || aorpResponse;

  return {
    success: response.immediate?.status === 'success',
    operation: response.details?.metadata?.operation || 'unknown',
    message: response.details?.summary || response.details?.metadata?.originalMessage || '',
    data: response.details?.data,
    metadata: {
      count: response.details?.metadata?.count || 0,
      timestamp: response.details?.metadata?.timestamp,
      ...response.details?.metadata
    }
  };
}

/**
 * Extract task data from AORP response
 */
export function extractTasksData(aorpResponse: any) {
  const legacy = extractLegacyResponse(aorpResponse);
  return {
    ...legacy,
    tasks: legacy.data?.tasks || []
  };
}

/**
 * Extract single task from AORP response
 */
export function extractTaskData(aorpResponse: any) {
  const legacy = extractLegacyResponse(aorpResponse);
  return {
    ...legacy,
    task: legacy.data?.task || legacy.data
  };
}

/**
 * Expect AORP response to have success status
 */
export function expectAorpSuccess(aorpResponse: any, expectedOperation?: string) {
  const legacy = extractLegacyResponse(aorpResponse);

  expect(legacy.success).toBe(true);
  if (expectedOperation) {
    expect(legacy.operation).toBe(expectedOperation);
  }
}

/**
 * Expect AORP response to have error status
 */
export function expectAorpError(aorpResponse: any, expectedOperation?: string) {
  const legacy = extractLegacyResponse(aorpResponse);

  expect(legacy.success).toBe(false);
  if (expectedOperation) {
    expect(legacy.operation).toBe(expectedOperation);
  }
}

/**
 * Get data from AORP response
 */
export function getAorpData(aorpResponse: any) {
  return extractLegacyResponse(aorpResponse).data;
}

/**
 * Get metadata from AORP response
 */
export function getAorpMetadata(aorpResponse: any) {
  return extractLegacyResponse(aorpResponse).metadata;
}