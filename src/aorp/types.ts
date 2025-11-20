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
 * AORP Builder configuration
 */
export interface AorpBuilderConfig {
  /** Default confidence calculation method */
  confidenceMethod?: 'adaptive' | 'weighted' | 'simple';
  /** Enable next steps generation */
  enableNextSteps?: boolean;
  /** Enable quality indicators */
  enableQualityIndicators?: boolean;
  /** Custom confidence weights */
  confidenceWeights?: {
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
  /** Any errors that occurred */
  errors?: string[];
  /** Additional context */
  [key: string]: unknown;
}

/**
 * Next Steps Generator configuration
 */
export interface NextStepsConfig {
  /** Maximum number of next steps to generate */
  maxSteps?: number;
  /** Context-specific next step templates */
  templates?: Record<string, string[]>;
  /** Enable contextual next steps */
  enableContextual?: boolean;
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
 * AORP Response from factory - markdown output only
 */
export interface AorpFactoryResult {
  /** The generated AORP response */
  response: AorpResponse;
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
 * AORP Response factory options
 */
export interface AorpFactoryOptions {
  /** Builder configuration */
  builderConfig?: AorpBuilderConfig;
  /** Next steps configuration */
  nextStepsConfig?: NextStepsConfig;
  /** Quality configuration */
  qualityConfig?: QualityConfig;
  /** Include debug information */
  includeDebug?: boolean;
  /** Custom session ID */
  sessionId?: string;
}