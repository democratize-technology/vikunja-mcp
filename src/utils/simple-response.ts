/**
 * Simple Response Formatter
 * Replaces the over-engineered 2,925-line AORP system with direct, clean responses
 */

import type { ResponseMetadata } from '../types/responses';
import type { Task, Project, Label, User } from '../types/vikunja';

/**
 * Common data structures that can be passed to response formatters
 */
export interface ResponseData {
  /** Array of items with common identifiers */
  items?: Array<{
    id?: number | string;
    title?: string;
    name?: string;
    [key: string]: unknown;
  }>;
  /** Tasks collection */
  tasks?: Task[];
  /** Projects collection */
  projects?: Project[];
  /** Labels collection */
  labels?: Label[];
  /** Users collection */
  users?: User[];
  /** Generic key-value data */
  [key: string]: unknown;
}

/**
 * Individual data item that can be formatted for display
 */
export interface DataItem {
  id?: number | string;
  title?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Simple response structure - replaces complex AORP system
 */
export interface SimpleResponse {
  /** Response content */
  content: string;
  /** Response metadata */
  metadata?: ResponseMetadata;
}

/**
 * Create a simple success response
 * Replaces complex AORP factory with direct formatting
 */
export function createSuccessResponse(
  operation: string,
  message: string,
  data?: ResponseData,
  metadata?: ResponseMetadata
): SimpleResponse {
  const content = formatSuccessMessage(operation, message, data);

  return {
    content,
    metadata: {
      timestamp: new Date().toISOString(),
      success: true,
      operation,
      ...metadata,
    },
  };
}

/**
 * Create a simple error response
 * Replaces complex AORP error handling with direct formatting
 */
export function createErrorResponse(
  operation: string,
  message: string,
  errorCode: string = 'UNKNOWN_ERROR',
  metadata?: ResponseMetadata
): SimpleResponse {
  const content = formatErrorMessage(operation, message, errorCode);

  return {
    content,
    metadata: {
      timestamp: new Date().toISOString(),
      success: false,
      operation,
      error: {
        code: errorCode,
        message,
      },
      ...metadata,
    },
  };
}

/**
 * Format success message in clean markdown
 * Replaces complex AORP markdown formatting
 */
export function formatSuccessMessage(
  operation: string,
  message: string,
  data?: ResponseData
): string {
  let content = `## ✅ Success\n\n${message}\n\n`;

  if (data) {
    // Check for known collection types first
    const collection = data.tasks || data.projects || data.labels || data.users || data.items;

    if (collection && Array.isArray(collection)) {
      content += `**Results:** ${collection.length} item(s)\n\n`;
      if (collection.length > 0 && collection.length <= 10) {
        content += formatDataItems(collection as DataItem[]);
      }
    } else if (Array.isArray(data)) {
      content += `**Results:** ${data.length} item(s)\n\n`;
      if (data.length > 0 && data.length <= 10) {
        content += formatDataItems(data as DataItem[]);
      }
    } else if (data && typeof data === 'object') {
      content += formatObjectData(data as Record<string, unknown>);
    }
  }

  return content;
}

/**
 * Format error message in clean markdown
 * Replaces complex AORP error formatting
 */
export function formatErrorMessage(
  operation: string,
  message: string,
  errorCode: string
): string {
  return `## ❌ Error\n\n${message}\n\n**Error Code:** ${errorCode}\n\n`;
}

/**
 * Format array data items
 */
function formatDataItems(items: DataItem[]): string {
  return items.map((item, index) => {
    if (typeof item === 'object' && item !== null) {
      const id = item.id || index + 1;
      const title = item.title || item.name || JSON.stringify(item);
      return `${index + 1}. **${title}** (ID: ${id})`;
    }
    return `${index + 1}. ${JSON.stringify(item)}`;
  }).join('\n') + '\n\n';
}

/**
 * Format object data
 */
function formatObjectData(data: Record<string, unknown>): string {
  const entries = Object.entries(data);
  if (entries.length === 0) return '';

  return entries
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      const formattedValue = typeof value === 'object'
        ? JSON.stringify(value, null, 2)
        : String(value);
      return `**${key}:** ${formattedValue}`;
    })
    .join('\n') + '\n\n';
}

/**
 * Format response as MCP content array
 * Direct replacement for AORP formatting
 */
export function formatMcpResponse(response: SimpleResponse): Array<{ type: 'text'; text: string }> {
  return [{
    type: 'text' as const,
    text: response.content,
  }];
}

// Note: ResponseData and DataItem are exported from types/index.ts