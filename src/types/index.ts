/**
 * Type exports
 */

import type { SimpleResponse } from '../utils/simple-response';
import type { ResponseMetadata } from './responses';

// Export from vikunja
export {
  type LoginCredentials,
  type AuthToken,
  type AuthSession,
  type StandardTaskResponse,
  type StandardProjectResponse,
  type MinimalTask,
  type Task,
  type TaskReminder,
  type Webhook,
  type TaskCreationData,
  type TaskUpdateData,
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

// Export from responses (Simple responses)
export {
  type ResponseMetadata,
  type StandardErrorResponse,
  type TaskResponseData,
  type TaskResponseMetadata,
  type QualityIndicatorData,
  type QualityIndicatorFunction,
} from './responses';

// Export SimpleResponse and related types from utils
export type { SimpleResponse, ResponseData, DataItem } from '../utils/simple-response';

// MCP Tool Context interface for type-safe tool handlers
export interface McpToolContext {
  /** Session identifier for the current tool execution */
  sessionId?: string;
  /** Authentication information if available */
  authInfo?: {
    /** Authentication method used */
    method: 'api_token' | 'jwt';
    /** User identifier if available */
    userId?: string;
    /** Username if available */
    username?: string;
  };
  /** Function to send notifications to the client */
  sendNotification?: (method: string, params: unknown) => Promise<void>;
  /** Additional capabilities or metadata */
  [key: string]: unknown;
}

// Export Simple Response utilities (replaces AORP)
export {
  createSuccessResponse,
  createErrorResponse,
  formatMcpResponse,
  formatSuccessMessage,
  formatErrorMessage
} from '../utils/simple-response';

// Project API interfaces
export interface CreateShareRequest {
  project_id: number;
  right: number;
  label?: string;
  password?: string;
  password_enabled?: boolean;
  expires?: string;
  shares?: number;
}

export interface ProjectShare {
  id: string;
  hash: string;
  created: string;
  updated: string;
  project_id: number;
  right: number;
  label?: string;
  password_enabled: boolean;
  expires?: string;
  shares?: number;
}

export interface CreateProjectRequest {
  title: string;
  description?: string;
  parent_project_id?: number;
  identifier?: string;
  color?: string;
  hex_color?: string;
  is_archived?: boolean;
}

export interface UpdateProjectRequest {
  title?: string;
  description?: string;
  parent_project_id?: number;
  identifier?: string;
  color?: string;
  hex_color?: string;
  is_archived?: boolean;
}

// Task filtering types
export type FilterValue = string | number | boolean | Array<string | number> | null;

// Task and user interfaces
export interface Assignee {
  id: number;
  username: string;
  email?: string;
  name?: string;
  avatar_url?: string;
}

export interface TaskWithAssignees {
  id: number;
  title: string;
  assignees?: Assignee[];
  // Add other task properties as needed
}

// Comment interfaces
export interface Comment {
  id: string;
  author: Assignee;
  comment: string;
  created: string;
  updated: string;
}

// Legacy AORP compatibility exports
export {
  createStandardResponse,
  createTaskResponse as createTaskAorpResponse,
  createSimpleErrorResponse as createAorpErrorResponse,
  formatResponseForMcp as formatAorpAsMarkdown
} from '../utils/response-factory';

// AORP compatibility types (for migration)
export interface AorpTransformationContext {
  operation: string;
  success: boolean;
  dataSize: number;
  processingTime: number;
  verbosity?: string;
  [key: string]: unknown; // More specific than any, allows proper type checking
}

export interface AorpFactoryOptions {
  useAorp?: boolean;
  verbosity?: string;
  sessionId?: string;
  [key: string]: unknown; // More specific than any
}


export interface AorpFactoryResult {
  response: SimpleResponse; // Use proper SimpleResponse type
  metadata?: ResponseMetadata; // Use proper metadata type
  transformation?: {
    originalSize?: number;
    optimizedSize?: number;
    compressionRatio?: number;
    fieldsProcessed?: number;
    [key: string]: unknown;
  };
  metrics?: {
    processingTime: number;
    memoryUsage?: number;
    operationCount?: number;
    [key: string]: unknown;
  };
}

export interface AorpBuilderConfig {
  confidenceMethod?: string;
  enableCaching?: boolean;
  maxCacheSize?: number;
  confidenceWeights?: {
    success: number;
    dataSize: number;
    responseTime: number;
    completeness: number;
  };
  [key: string]: unknown;
}

// AORP verbosity levels for backwards compatibility
export type AorpVerbosityLevel = 'minimal' | 'standard' | 'detailed' | 'debug';

// Complexity factors for AORP processing
export interface ComplexityFactors {
  dataVolume: 'low' | 'medium' | 'high' | 'extreme';
  operationComplexity: 'simple' | 'moderate' | 'complex' | 'very-complex';
  networkLatency: 'low' | 'medium' | 'high';
  errorRate: 'low' | 'medium' | 'high';
}

// ParseResult for filter parsing (backward compatibility)
export interface ParseResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
  metadata?: {
    parseTime?: number;
    originalSize?: number;
    optimizedSize?: number;
    [key: string]: unknown;
  };
}
