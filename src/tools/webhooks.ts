/**
 * Webhooks Tool
 * Handles webhook operations for Vikunja projects
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { MCPError, ErrorCode } from '../types/index';
import { getClientFromContext } from '../client';
import type { Webhook } from '../types/vikunja';
import { logger } from '../utils/logger';
import { validateAndConvertId } from '../utils/validation';

// Event cache for validation
let cachedEvents: string[] | null = null;
let cacheExpiry: Date | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Export for testing purposes
export function clearWebhookEventCache(): void {
  cachedEvents = null;
  cacheExpiry = null;
}

// Export for testing - expire cache but keep events
export function expireWebhookEventCache(): void {
  cacheExpiry = new Date(0); // Set to past date
}

// Use shared validateAndConvertId from utils/validation

// Get valid webhook events with caching
async function getValidEvents(authManager: AuthManager): Promise<string[]> {
  const now = new Date();

  // Return cached events if still valid
  if (cachedEvents && cacheExpiry && cacheExpiry > now) {
    logger.debug('Using cached webhook events', {
      eventsCount: cachedEvents.length,
      expiresIn: Math.round((cacheExpiry.getTime() - now.getTime()) / 1000) + 's',
    });
    return cachedEvents;
  }

  // Fetch fresh events
  logger.debug('Fetching fresh webhook events from API');
  try {
    const session = authManager.getSession();
    const response = await fetch(`${session.apiUrl}/webhooks/events`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // If webhook events endpoint doesn't exist or returns auth error, use default events
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        logger.warn('Webhook events endpoint not available, using default event list');
        // Default webhook events based on Vikunja documentation
        cachedEvents = [
          'task.created',
          'task.updated',
          'task.deleted',
          'task.assigned',
          'task.comment.created',
          'project.created',
          'project.updated',
          'project.deleted',
          'project.shared',
          'team.created',
          'team.deleted',
        ];
        cacheExpiry = new Date(now.getTime() + CACHE_DURATION_MS);
        return cachedEvents;
      }
      throw new Error(`Failed to fetch webhook events: ${response.statusText}`);
    }

    cachedEvents = (await response.json()) as string[];
    cacheExpiry = new Date(now.getTime() + CACHE_DURATION_MS);
    logger.info('Webhook events cached', {
      eventsCount: cachedEvents.length,
      expiresAt: cacheExpiry.toISOString(),
    });
    return cachedEvents;
  } catch (error) {
    logger.error('Failed to fetch webhook events', { error });
    // If we have stale cache, use it rather than failing
    if (cachedEvents) {
      logger.warn('Using stale cached webhook events due to API error');
      return cachedEvents;
    }
    // If no cache and fetch failed, use default events
    logger.warn('Using default webhook events due to API error');
    cachedEvents = [
      'task.created',
      'task.updated',
      'task.deleted',
      'task.assigned',
      'task.comment.created',
      'project.created',
      'project.updated',
      'project.deleted',
      'project.shared',
      'team.created',
      'team.deleted',
    ];
    cacheExpiry = new Date(now.getTime() + CACHE_DURATION_MS);
    return cachedEvents;
  }
}

// Validate webhook events against allowed list
async function validateWebhookEvents(authManager: AuthManager, events: string[]): Promise<void> {
  const validEvents = await getValidEvents(authManager);
  const invalidEvents = events.filter((event) => !validEvents.includes(event));

  if (invalidEvents.length > 0) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid webhook events: ${invalidEvents.join(', ')}. Valid events are: ${validEvents.join(', ')}`,
    );
  }
}

// Standardized webhook response type
interface StandardWebhookResponse {
  success: boolean;
  operation: 'create' | 'update' | 'delete' | 'list' | 'get' | 'list-events';
  message?: string;
  webhook?: Webhook;
  webhooks?: Webhook[];
  events?: string[];
  metadata?: {
    timestamp: string;
    count?: number;
    affectedFields?: string[];
  };
}

export function registerWebhooksTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
  server.tool(
    'vikunja_webhooks',
    'Manage webhooks for integrating Vikunja events with external services',
    {
      // Operation type
      subcommand: z.enum(['list', 'get', 'create', 'update', 'delete', 'list-events']).optional(),

      // Common parameters
      projectId: z.number().int().positive().optional(),
      webhookId: z.number().int().positive().optional(),

      // Create/Update parameters
      targetUrl: z.string().url().optional(),
      events: z.array(z.string()).optional(),
      secret: z.string().optional(),
    },
    async (args) => {
      if (!authManager.isAuthenticated()) {
        throw new MCPError(
          ErrorCode.AUTH_REQUIRED,
          'Authentication required. Please use vikunja_auth.connect first.',
        );
      }

      await getClientFromContext(); // Ensure client is initialized
      const subcommand = args.subcommand || 'list';
      const session = authManager.getSession();
      const baseUrl = session.apiUrl;
      const headers = {
        Authorization: `Bearer ${session.apiToken}`,
        'Content-Type': 'application/json',
      };

      logger.debug('Webhooks tool called', { subcommand, args });

      try {
        switch (subcommand) {
          case 'list': {
            const projectId = validateAndConvertId(args.projectId, 'projectId');

            const response = await fetch(`${baseUrl}/projects/${projectId}/webhooks`, {
              method: 'GET',
              headers,
            });

            if (!response.ok) {
              const errorData = (await response.json().catch(() => ({ message: null }))) as {
                message?: string;
              };
              // Check for webhook-specific authentication errors
              if (response.status === 401 || response.status === 403) {
                throw new MCPError(
                  ErrorCode.API_ERROR,
                  'Webhook operations require additional permissions. Please ensure your API token has webhook access rights.',
                );
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                errorData.message || `Failed to list webhooks: ${response.statusText}`,
              );
            }

            const webhooks = (await response.json()) as Webhook[];

            logger.info('Listed webhooks', { projectId, count: webhooks.length });

            const standardResponse: StandardWebhookResponse = {
              success: true,
              operation: 'list',
              webhooks,
              metadata: {
                timestamp: new Date().toISOString(),
                count: webhooks.length,
              },
            };

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(standardResponse, null, 2),
                },
              ],
            };
          }

          case 'get': {
            const projectId = validateAndConvertId(args.projectId, 'projectId');
            const webhookId = validateAndConvertId(args.webhookId, 'webhookId');

            // Get all webhooks and find the specific one
            const response = await fetch(`${baseUrl}/projects/${projectId}/webhooks`, {
              method: 'GET',
              headers,
            });

            if (!response.ok) {
              const errorData = (await response.json().catch(() => ({ message: null }))) as {
                message?: string;
              };
              // Check for webhook-specific authentication errors
              if (response.status === 401 || response.status === 403) {
                throw new MCPError(
                  ErrorCode.API_ERROR,
                  'Webhook operations require additional permissions. Please ensure your API token has webhook access rights.',
                );
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                errorData.message || `Failed to get webhooks: ${response.statusText}`,
              );
            }

            const webhooks = (await response.json()) as Webhook[];
            const webhook = webhooks.find((w: Webhook) => w.id === webhookId);

            if (!webhook) {
              throw new MCPError(
                ErrorCode.NOT_FOUND,
                `Webhook with ID ${webhookId} not found in project ${projectId}`,
              );
            }

            logger.info('Retrieved webhook', { projectId, webhookId });

            const standardResponse: StandardWebhookResponse = {
              success: true,
              operation: 'get',
              webhook,
              metadata: {
                timestamp: new Date().toISOString(),
              },
            };

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(standardResponse, null, 2),
                },
              ],
            };
          }

          case 'create': {
            const projectId = validateAndConvertId(args.projectId, 'projectId');

            if (!args.targetUrl) {
              throw new MCPError(
                ErrorCode.VALIDATION_ERROR,
                'targetUrl is required for creating a webhook',
              );
            }

            if (!args.events || args.events.length === 0) {
              throw new MCPError(
                ErrorCode.VALIDATION_ERROR,
                'At least one event is required for creating a webhook',
              );
            }

            // Validate events against allowed list
            await validateWebhookEvents(authManager, args.events);

            const webhookData: Partial<Webhook> = {
              target_url: args.targetUrl,
              events: args.events,
            };

            if (args.secret !== undefined) {
              webhookData.secret = args.secret;
            }

            const response = await fetch(`${baseUrl}/projects/${projectId}/webhooks`, {
              method: 'PUT',
              headers,
              body: JSON.stringify(webhookData),
            });

            if (!response.ok) {
              const errorData = (await response.json().catch(() => ({ message: null }))) as {
                message?: string;
              };
              // Check for webhook-specific authentication errors
              if (response.status === 401 || response.status === 403) {
                throw new MCPError(
                  ErrorCode.API_ERROR,
                  'Webhook operations require additional permissions. Please ensure your API token has webhook access rights.',
                );
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                errorData.message || `Failed to create webhook: ${response.statusText}`,
              );
            }

            const webhook = (await response.json()) as Webhook;

            logger.info('Created webhook', { projectId, webhookId: webhook.id });

            const standardResponse: StandardWebhookResponse = {
              success: true,
              operation: 'create',
              message: `Webhook created successfully with ID ${webhook.id}`,
              webhook,
              metadata: {
                timestamp: new Date().toISOString(),
              },
            };

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(standardResponse, null, 2),
                },
              ],
            };
          }

          case 'update': {
            const projectId = validateAndConvertId(args.projectId, 'projectId');
            const webhookId = validateAndConvertId(args.webhookId, 'webhookId');

            if (!args.events || args.events.length === 0) {
              throw new MCPError(
                ErrorCode.VALIDATION_ERROR,
                'At least one event is required for updating a webhook',
              );
            }

            // Validate events against allowed list
            await validateWebhookEvents(authManager, args.events);

            // The API only allows updating events
            const updateData = {
              events: args.events,
            };

            const response = await fetch(`${baseUrl}/projects/${projectId}/webhooks/${webhookId}`, {
              method: 'POST',
              headers,
              body: JSON.stringify(updateData),
            });

            if (!response.ok) {
              const errorData = (await response.json().catch(() => ({ message: null }))) as {
                message?: string;
              };
              // Check for webhook-specific authentication errors
              if (response.status === 401 || response.status === 403) {
                throw new MCPError(
                  ErrorCode.API_ERROR,
                  'Webhook operations require additional permissions. Please ensure your API token has webhook access rights.',
                );
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                errorData.message || `Failed to update webhook: ${response.statusText}`,
              );
            }

            const webhook = (await response.json()) as Webhook;

            logger.info('Updated webhook events', { projectId, webhookId, events: args.events });

            const standardResponse: StandardWebhookResponse = {
              success: true,
              operation: 'update',
              message: 'Webhook events updated successfully',
              webhook,
              metadata: {
                timestamp: new Date().toISOString(),
                affectedFields: ['events'],
              },
            };

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(standardResponse, null, 2),
                },
              ],
            };
          }

          case 'delete': {
            const projectId = validateAndConvertId(args.projectId, 'projectId');
            const webhookId = validateAndConvertId(args.webhookId, 'webhookId');

            const response = await fetch(`${baseUrl}/projects/${projectId}/webhooks/${webhookId}`, {
              method: 'DELETE',
              headers,
            });

            if (!response.ok) {
              const errorData = (await response.json().catch(() => ({ message: null }))) as {
                message?: string;
              };
              // Check for webhook-specific authentication errors
              if (response.status === 401 || response.status === 403) {
                throw new MCPError(
                  ErrorCode.API_ERROR,
                  'Webhook operations require additional permissions. Please ensure your API token has webhook access rights.',
                );
              }
              throw new MCPError(
                ErrorCode.API_ERROR,
                errorData.message || `Failed to delete webhook: ${response.statusText}`,
              );
            }

            logger.info('Deleted webhook', { projectId, webhookId });

            const standardResponse: StandardWebhookResponse = {
              success: true,
              operation: 'delete',
              message: `Webhook ${webhookId} deleted successfully`,
              metadata: {
                timestamp: new Date().toISOString(),
              },
            };

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(standardResponse, null, 2),
                },
              ],
            };
          }

          case 'list-events': {
            const events = await getValidEvents(authManager);

            logger.info('Listed available webhook events', { count: events.length });

            const standardResponse: StandardWebhookResponse = {
              success: true,
              operation: 'list-events',
              events,
              metadata: {
                timestamp: new Date().toISOString(),
                count: events.length,
              },
            };

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(standardResponse, null, 2),
                },
              ],
            };
          }

          default:
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Unknown subcommand: ${subcommand as string}`,
            );
        }
      } catch (error) {
        logger.error('Webhook operation failed', { error, subcommand, args });

        if (error instanceof MCPError) {
          throw error;
        }

        if (error instanceof Error) {
          throw new MCPError(ErrorCode.API_ERROR, `Webhook operation failed: ${error.message}`);
        }

        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          'An unexpected error occurred during webhook operation',
        );
      }
    },
  );
}
