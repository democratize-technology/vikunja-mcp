/**
 * Labels Tool
 * Handles label operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { MCPError, ErrorCode, createStandardResponse } from '../types/index';
import { validateAndConvertId } from '../utils/validation';
import { wrapToolError } from '../utils/error-handler';
import { getClientFromContext } from '../client';
import type { Label } from 'node-vikunja';
import type { TypedVikunjaClient } from '../types/node-vikunja-extended';
import { formatAorpAsMarkdown } from '../utils/response-factory';

// Use shared validateAndConvertId from utils/validation

export function registerLabelsTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
  server.tool(
    'vikunja_labels',
    'Manage task labels with full CRUD operations for organizing and categorizing tasks',
    {
      // Operation type
      subcommand: z.enum(['list', 'get', 'create', 'update', 'delete']),

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

      const client = await getClientFromContext() as TypedVikunjaClient;

      const subcommand = args.subcommand;

      try {

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
                  text: formatAorpAsMarkdown(response),
                },
              ],
            };
          }

          case 'get': {
            if (args.id === undefined) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Label ID is required');
            }
            validateAndConvertId(args.id, 'id');

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
                  text: formatAorpAsMarkdown(response),
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
                  text: formatAorpAsMarkdown(response),
                },
              ],
            };
          }

          case 'update': {
            if (args.id === undefined) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Label ID is required');
            }
            validateAndConvertId(args.id, 'id');

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
                  text: formatAorpAsMarkdown(response),
                },
              ],
            };
          }

          case 'delete': {
            if (args.id === undefined) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Label ID is required');
            }
            validateAndConvertId(args.id, 'id');

            const result = await client.labels.deleteLabel(args.id);

            const response = createStandardResponse('delete-label', `Label deleted successfully`, {
              result,
            });

            return {
              content: [
                {
                  type: 'text' as const,
                  text: formatAorpAsMarkdown(response),
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
      } catch (error) {
        throw wrapToolError(error, 'vikunja_labels', `${subcommand} label`, args.id);
      }
    },
  );
}
