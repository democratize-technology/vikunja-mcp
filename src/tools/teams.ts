/**
 * Teams Tool
 * Handles team operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { MCPError, ErrorCode, createStandardResponse } from '../types/index';
import { getClientFromContext } from '../client';
import { wrapToolError, handleStatusCodeError } from '../utils/error-handler';
import type { Team } from 'node-vikunja';
import type { TypedVikunjaClient } from '../types/node-vikunja-extended';
import { validateAndConvertId } from '../utils/validation';
import { formatAorpAsMarkdown } from '../utils/response-factory';

interface TeamListParams {
  page?: number;
  per_page?: number;
  s?: string;
}

// Use shared validateAndConvertId from utils/validation

export function registerTeamsTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
  server.tool(
    'vikunja_teams',
    'Manage teams and team memberships for collaborative project management',
    {
      // List all teams
      subcommand: z.enum(['list', 'create', 'get', 'update', 'delete', 'members']),

      // List parameters
      page: z.number().positive().optional(),
      perPage: z.number().positive().max(100).optional(),
      search: z.string().optional(),

      // Team fields for create/update
      id: z.union([z.string(), z.number()]).optional(),
      name: z.string().optional(),
      description: z.string().optional(),

      // Member operations
      userId: z.union([z.string(), z.number()]).optional(),
      admin: z.boolean().optional(),
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
            const params: TeamListParams = {};
            if (args.page !== undefined) params.page = args.page;
            if (args.perPage !== undefined) params.per_page = args.perPage;
            if (args.search !== undefined) params.s = args.search;

            const teams = await client.teams.getTeams(params);

            const response = createStandardResponse(
              'list-teams',
              `Retrieved ${teams.length} team${teams.length !== 1 ? 's' : ''}`,
              { teams },
              { count: teams.length, params },
            );

            return {
              content: [
                {
                  type: 'text',
                  text: formatAorpAsMarkdown(response),
                },
              ],
            };
          }

          case 'create': {
            if (!args.name) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Team name is required');
            }

            const teamData: Partial<Team> = {
              name: args.name,
            };
            if (args.description !== undefined) {
              teamData.description = args.description;
            }

            const team = await client.teams.createTeam(teamData as Team);

            const response = createStandardResponse(
              'create-team',
              `Team "${team.name}" created successfully`,
              { team },
              { affectedFields: Object.keys(teamData) },
            );

            return {
              content: [
                {
                  type: 'text',
                  text: formatAorpAsMarkdown(response),
                },
              ],
            };
          }

          case 'get': {
            if (args.id === undefined) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Team ID is required');
            }

            validateAndConvertId(args.id, 'id');

            // Note: node-vikunja doesn't have getTeam method, this is a placeholder
            throw new MCPError(
              ErrorCode.NOT_IMPLEMENTED,
              'Get team by ID is not yet implemented in the node-vikunja library',
            );
          }

          case 'update': {
            if (args.id === undefined) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Team ID is required');
            }

            validateAndConvertId(args.id, 'id');

            if (!args.name && !args.description) {
              throw new MCPError(
                ErrorCode.VALIDATION_ERROR,
                'At least one field to update is required',
              );
            }

            // Note: node-vikunja doesn't have updateTeam method, this is a placeholder
            throw new MCPError(
              ErrorCode.NOT_IMPLEMENTED,
              'Update team is not yet implemented in the node-vikunja library',
            );
          }

          case 'delete': {
            if (args.id === undefined) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Team ID is required');
            }

            const teamId = validateAndConvertId(args.id, 'id');

            // Check if deleteTeam method exists and is a function
            if (!client.teams.deleteTeam || typeof client.teams.deleteTeam !== 'function') {
              // Fallback: Make direct API call if method doesn't exist
              const session = authManager.getSession();
              const response = await fetch(`${session.apiUrl}/teams/${teamId}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${session.apiToken}`,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                const errorText = await response.text();
                throw handleStatusCodeError(
                  { statusCode: response.status, message: errorText },
                  'leave team',
                  teamId,
                  `Failed to leave team ${teamId}: ${errorText}`
                );
              }

              const result = (await response.json()) as { message: string };

              const standardResponse = createStandardResponse(
                'delete-team',
                `Team deleted successfully`,
                { message: result.message },
                { teamId },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: formatAorpAsMarkdown(standardResponse),
                  },
                ],
              };
            }

            // Use the existing method if available
            const result = await client.teams.deleteTeam(teamId);

            const response = createStandardResponse(
              'delete-team',
              `Team deleted successfully`,
              { message: result.message },
              { teamId },
            );

            return {
              content: [
                {
                  type: 'text',
                  text: formatAorpAsMarkdown(response),
                },
              ],
            };
          }

          case 'members': {
            if (args.id === undefined) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Team ID is required');
            }

            validateAndConvertId(args.id, 'id');

            // Note: node-vikunja doesn't have team member methods, this is a placeholder
            throw new MCPError(
              ErrorCode.NOT_IMPLEMENTED,
              'Team member operations are not yet implemented in the node-vikunja library',
            );
          }

          default:
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Invalid subcommand: ${String(subcommand)}`,
            );
        }
      } catch (error) {
        throw wrapToolError(error, 'vikunja_teams', `${subcommand} team`, args.id);
      }
    },
  );
}
