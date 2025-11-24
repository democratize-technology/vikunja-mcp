/**
 * AI-Optimized Response Protocol (AORP) Types
 * Provides structured, AI-friendly response format with confidence scoring,
 * next steps generation, and quality indicators.
 */

import type { OptimizedResponse } from '../transforms/base';

/**
 * AORP Response status types
 */
export type AorpStatus = 'success' | 'error' | 'partial' | 'pending';

/**
 * Urgency levels for AORP responses
 */
export type AorpUrgency = 'low' | 'medium' | 'high' | 'critical';

/**
 * Immediate response information - the key takeaway at a glance
 */
export interface AorpImmediate {
  /** Status of the operation */
  status: AorpStatus;
  /** One-sentence primary takeaway */
  key_insight: string;
  /** Confidence score 0.0-1.0 */
  confidence: number;
  /** Session ID when applicable */
  session_id?: string;
}

/**
 * Actionable information for AI decision-making
 */
export interface AorpActionable {
  /** Prioritized action items */
  next_steps: string[];
  /** Recommendations based on the operation result */
  recommendations: {
    /** Most important recommendation */
    primary: string;
    /** Additional recommendations */
    secondary?: string[];
  };
  /** How AI should use this information */
  workflow_guidance: string;
}

/**
 * Quality indicators for response reliability
 */
export interface AorpQuality {
  /** Completeness score 0.0-1.0 */
  completeness: number;
  /** Reliability score 0.0-1.0 */
  reliability: number;
  /** Urgency level */
  urgency: AorpUrgency;
  /** Operation-specific quality metrics */
  indicators?: Record<string, unknown>;
}

/**
 * Detailed information - markdown output only, no data field
 */
export interface AorpDetails {
  /** Human-readable overview */
  summary: string;
  /** Metadata */
  metadata: {
    timestamp: string;
    [key: string]: unknown;
  };
  /** Debug information when needed */
  debug?: unknown;
}

/**
 * Complete AORP Response structure - markdown output only
 */
export interface AorpResponse {
  /** Immediate key information */
  immediate: AorpImmediate;
  /** Actionable insights and guidance */
  actionable: AorpActionable;
  /** Quality and reliability indicators */
  quality: AorpQuality;
  /** Detailed information */
  details: AorpDetails;
}

/**
 * AORP Builder configuration - AORP always enabled with fixed settings
 */
export interface AorpBuilderConfig {
  /** Default confidence calculation method */
  confidenceMethod?: 'adaptive' | 'weighted' | 'simple';
  /** Custom confidence weights */
  confidenceWeights?: {
    success: number;
    dataSize: number;
    responseTime: number;
    completeness: number;
  };
  // Note: Next steps and quality indicators are always enabled - no configuration option
}

/**
 * Complete AORP Builder configuration with all required defaults
 */
export interface CompleteAorpBuilderConfig {
  /** Default confidence calculation method */
  confidenceMethod: 'adaptive' | 'weighted' | 'simple';
  /** Custom confidence weights */
  confidenceWeights: {
    success: number;
    dataSize: number;
    responseTime: number;
    completeness: number;
  };
}

/**
 * AORP Transformation context
 */
export interface AorpTransformationContext {
  /** Original operation type */
  operation: string;
  /** Operation result */
  success: boolean;
  /** Data size */
  dataSize: number;
  /** Processing time in ms */
  processingTime: number;
  /** Verbosity level used */
  verbosity: string;
  /** Detected verbosity level */
  verbosityLevel: AorpVerbosityLevel;
  /** Complexity factors that influenced the decision */
  complexityFactors: ComplexityFactors;
  /** Any errors that occurred */
  errors?: string[];
  /** Additional context */
  [key: string]: unknown;
}

/**
 * Next Steps Generator configuration - AORP always enabled
 */
export interface NextStepsConfig {
  /** Maximum number of next steps to generate */
  maxSteps?: number;
  /** Context-specific next step templates */
  templates?: Record<string, string[]>;
  // Note: Contextual next steps are always enabled - no configuration option
}

/**
 * Quality Calculator configuration
 */
export interface QualityConfig {
  /** Weight for completeness in quality calculation */
  completenessWeight?: number;
  /** Weight for reliability in quality calculation */
  reliabilityWeight?: number;
  /** Custom quality indicators */
  customIndicators?: Record<string, (data: unknown, context: AorpTransformationContext) => number>;
}

/**
 * Type guard to check if response is SimpleAorpResponse
 */
export function isSimpleAorpResponse(response: AorpResponse | SimpleAorpResponse): response is SimpleAorpResponse {
  return 'summary' in response && !('actionable' in response);
}

/**
 * Runtime validation to ensure response structure is valid
 */
export function validateAorpResponse(response: unknown): response is AorpResponse | SimpleAorpResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }

  const resp = response as Record<string, unknown>;

  // Check for required immediate section
  if (!resp.immediate || typeof resp.immediate !== 'object') {
    return false;
  }

  const immediate = resp.immediate as Record<string, unknown>;
  if (typeof immediate.status !== 'string' ||
      typeof immediate.key_insight !== 'string' ||
      typeof immediate.confidence !== 'number') {
    return false;
  }

  // Check if it's a simple or full response
  if ('summary' in resp && typeof resp.summary === 'string' &&
      !('actionable' in resp)) {
    // SimpleAorpResponse
    if (!resp.metadata || typeof resp.metadata !== 'object') {
      return false;
    }
    const metadata = resp.metadata as Record<string, unknown>;
    return typeof metadata.timestamp === 'string' &&
           typeof metadata.operation === 'string' &&
           typeof metadata.success === 'boolean';
  } else if ('actionable' in resp && resp.details) {
    // Full AorpResponse
    if (!resp.actionable || typeof resp.actionable !== 'object' ||
        !resp.details || typeof resp.details !== 'object') {
      return false;
    }
    const actionable = resp.actionable as Record<string, unknown>;
    const details = resp.details as Record<string, unknown>;
    return Array.isArray(actionable.next_steps) &&
           typeof actionable.recommendations === 'object' &&
           typeof details.summary === 'string' &&
           typeof details.metadata === 'object';
  }

  return false;
}

/**
 * AORP Response from factory - can be full or simple format
 */
export interface AorpFactoryResult {
  /** The generated AORP response (full or simple format) */
  response: AorpResponse | SimpleAorpResponse;
  /** Transformation metadata */
  transformation: {
    /** Original optimized response */
    originalResponse: OptimizedResponse;
    /** Transformation context */
    context: AorpTransformationContext;
    /** Processing metrics */
    metrics: {
      /** AORP processing time in ms */
      aorpProcessingTime: number;
      /** Total processing time in ms */
      totalTime: number;
    };
  };
}

/**
 * Error information for AORP responses
 */
export interface AorpError {
  /** Error type */
  type: string;
  /** Error message */
  message: string;
  /** Error code if available */
  code?: string;
  /** Stack trace if available */
  stack?: string;
}

/**
 * Verbosity levels for AORP responses
 */
export type AorpVerbosityLevel = 'simple' | 'full';

/**
 * Simple AORP Response format for basic operations
 * Minimal structure with just essential information
 */
export interface SimpleAorpResponse {
  /** Immediate key information only */
  immediate: AorpImmediate;
  /** Minimal details - no complex sections */
  summary: string;
  /** Operation metadata */
  metadata: {
    timestamp: string;
    operation: string;
    success: boolean;
    [key: string]: unknown; // Allow additional metadata properties
  };
}

/**
 * Complexity factors that influence verbosity decisions
 */
export interface ComplexityFactors {
  /** Data size threshold exceeded */
  dataSize: boolean;
  /** Operation has warnings or errors */
  hasWarnings: boolean;
  /** Operation has errors */
  hasErrors: boolean;
  /** Bulk operation detected */
  isBulkOperation: boolean;
  /** Partial success detected */
  isPartialSuccess: boolean;
  /** Custom factors */
  custom: Record<string, boolean>;
}

/**
 * AORP Response factory options - Now with conditional verbosity
 */
export interface AorpFactoryOptions {
  /** Builder configuration */
  builderConfig?: AorpBuilderConfig;
  /** Next steps configuration */
  nextStepsConfig?: NextStepsConfig;
  /** Quality configuration */
  qualityConfig?: QualityConfig;
  /** Custom session ID */
  sessionId?: string;
  /** Force verbosity level - overrides auto-detection */
  useAorp?: boolean;
  /** Force specific verbosity level - overrides auto-detection */
  verbosityLevel?: AorpVerbosityLevel;
  // Note: Debug information is always included - no configuration option
}