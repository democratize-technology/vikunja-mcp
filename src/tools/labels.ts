/**
 * Labels Tool
 * Handles label operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import { MCPError, ErrorCode, createStandardResponse } from '../types/index';
import { getVikunjaClient } from '../client';
import type { Label } from '../types/vikunja';

// Validation helpers
function validateId(id: unknown, fieldName: string): number {
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `${fieldName} must be a positive integer`);
  }
  return num;
}

export function registerLabelsTool(server: McpServer, authManager: AuthManager): void {
  server.tool(
    'vikunja_labels',
    {
      // Operation type
      subcommand: z.enum(['list', 'get', 'create', 'update', 'delete']).optional(),

      // Common parameters
      id: z.number().int().positive().optional(),

      // List parameters
      page: z.number().int().positive().optional(),
      perPage: z.number().int().positive().max(100).optional(),
      search: z.string().optional(),

      // Create/Update parameters
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      hexColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format')
        .optional(),
    },
    async (args) => {
      if (!authManager.isAuthenticated()) {
        throw new MCPError(
          ErrorCode.AUTH_REQUIRED,
          'Authentication required. Please use vikunja_auth.connect first.',
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const client = (await getVikunjaClient()) as any; // VikunjaClient type definitions are incomplete

      const subcommand = args.subcommand || 'list';

      try {
        /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */

        switch (subcommand) {
          case 'list': {
            const params: Record<string, string | number> = {};
            if (args.page) params.page = args.page;
            if (args.perPage) params.per_page = args.perPage;
            if (args.search) params.s = args.search;

            const labels = await client.labels.getLabels(params);

            const response = createStandardResponse(
              'list-labels',
              `Retrieved ${labels.length} label${labels.length !== 1 ? 's' : ''}`,
              { labels },
              { count: labels.length, params },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'get': {
            if (args.id === undefined) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Label ID is required');
            }
            validateId(args.id, 'id');

            const label = await client.labels.getLabel(args.id);

            const response = createStandardResponse(
              'get-label',
              `Retrieved label "${label.title}"`,
              { label },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'create': {
            if (!args.title) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Title is required');
            }

            const labelData: Partial<Label> = {
              title: args.title,
            };
            if (args.description) labelData.description = args.description;
            if (args.hexColor) labelData.hex_color = args.hexColor;

            const label = await client.labels.createLabel(labelData as Label);

            const response = createStandardResponse(
              'create-label',
              `Label "${label.title}" created successfully`,
              { label },
              { affectedFields: Object.keys(labelData) },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'update': {
            if (args.id === undefined) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Label ID is required');
            }
            validateId(args.id, 'id');

            if (!args.title && args.description === undefined && !args.hexColor) {
              throw new MCPError(
                ErrorCode.VALIDATION_ERROR,
                'At least one field to update is required',
              );
            }

            const updates: Partial<Label> = {};
            if (args.title) updates.title = args.title;
            if (args.description !== undefined) updates.description = args.description;
            if (args.hexColor) updates.hex_color = args.hexColor;

            const label = await client.labels.updateLabel(args.id, updates as Label);

            const response = createStandardResponse(
              'update-label',
              `Label "${label.title}" updated successfully`,
              { label },
              { affectedFields: Object.keys(updates) },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'delete': {
            if (args.id === undefined) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Label ID is required');
            }
            validateId(args.id, 'id');

            const result = await client.labels.deleteLabel(args.id);

            const response = createStandardResponse('delete-label', `Label deleted successfully`, {
              result,
            });

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          default:
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Invalid subcommand: ${String(subcommand)}`,
            );
        }
        /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
      } catch (error) {
        const errorResponse = error as Error & {
          response?: { status: number; data?: { message?: string } };
        };
        if (errorResponse.response?.status === 404) {
          throw new MCPError(ErrorCode.NOT_FOUND, `Label not found`);
        }
        if (errorResponse.response?.status === 403) {
          throw new MCPError(
            ErrorCode.PERMISSION_DENIED,
            'You do not have permission to perform this action',
          );
        }
        if (errorResponse.response?.status === 400) {
          throw new MCPError(
            ErrorCode.VALIDATION_ERROR,
            errorResponse.response?.data?.message || 'Invalid request',
          );
        }
        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          `Failed to ${subcommand} label: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
