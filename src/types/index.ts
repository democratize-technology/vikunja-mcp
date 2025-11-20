/**
 * Type exports
 */

// Export from vikunja
export {
  type LoginCredentials,
  type AuthToken,
  type AuthSession,
  type StandardTaskResponse,
  type StandardProjectResponse,
  type MinimalTask,
  type TaskReminder,
  type Webhook,
} from './vikunja';

// Export from errors
export { MCPError, ErrorCode, type MCPResponse } from './errors';

// Export from filters
export {
  type FilterOperator,
  type LogicalOperator,
  type FilterField,
  type FilterCondition,
  type FilterGroup,
  type FilterExpression,
  type SavedFilter,
  type FilterValidationResult,
  type FilterStorage,
} from './filters';

// Export from responses (AORP-compatible)
export {
  type ResponseMetadata,
  type StandardErrorResponse,
  type TaskResponseData,
  type TaskResponseMetadata,
  type QualityIndicatorData,
  type QualityIndicatorFunction,
  createErrorResponse,
} from './responses';

// Export createStandardResponse for backward compatibility during transition
export { createStandardResponse } from '../utils/response-factory';

// Legacy response type - DEPRECATED
// Use AORP responses instead
export type StandardResponse = import('./index').AorpResponse;

// Export AORP types and interfaces
export {
  type AorpResponse,
  type AorpFactoryResult,
  type AorpFactoryOptions,
  type AorpImmediate,
  type AorpActionable,
  type AorpQuality,
  type AorpDetails,
  type AorpStatus,
  type AorpUrgency,
  type AorpBuilderConfig,
  type AorpTransformationContext,
  type NextStepsConfig,
  type QualityConfig,
  type AorpError
} from '../aorp/types';

// Export AORP factory for backwards compatibility during transition
export { AorpResponseFactory } from '../aorp/factory';
