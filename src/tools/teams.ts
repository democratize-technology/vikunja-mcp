/**
 * Teams Tool
 * Handles team operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { MCPError, ErrorCode, createStandardResponse } from '../types';
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
      subcommand: z.enum(['list', 'create', 'get', 'update', 'delete', 'members']).optional(),

      // List parameters
      page: z.number().positive().optional(),
      perPage: z.number().positive().max(100).optional(),
      search: z.string().optional(),

      // Team fields for create/update
      id: z.union([z.string(), z.number()]).optional(),
      name: z.string().optional(),
      description: z.string().optional(),

      // Member operations
      memberSubcommand: z.enum(['list', 'add', 'remove', 'update']).optional(),
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
      const subcommand = args.subcommand || 'list';

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
              { affectedFields: Object.keys(teamData).filter(key => typeof key === 'string') },
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

            const teamId = validateAndConvertId(args.id, 'id');
            const session = authManager.getSession();

            // Make direct API call to get team
            const response = await fetch(`${session.apiUrl}/teams/${teamId}`, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${session.apiToken}`,
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw handleStatusCodeError(
                { statusCode: response.status, message: errorText },
                'get team',
                teamId,
                `Failed to get team ${teamId}: ${errorText}`
              );
            }

            const team = (await response.json()) as Team;

            const standardResponse = createStandardResponse(
              'get-team',
              `Retrieved team "${team.name}"`,
              { team },
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

          case 'update': {
            if (args.id === undefined) {
              throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Team ID is required');
            }

            const teamId = validateAndConvertId(args.id, 'id');

            if (!args.name && !args.description) {
              throw new MCPError(
                ErrorCode.VALIDATION_ERROR,
                'At least one field to update is required',
              );
            }

            const session = authManager.getSession();
            const updateData: Partial<Team> = {};
            if (args.name !== undefined) updateData.name = args.name;
            if (args.description !== undefined) updateData.description = args.description;

            // Make direct API call to update team
            const response = await fetch(`${session.apiUrl}/teams/${teamId}`, {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${session.apiToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(updateData),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw handleStatusCodeError(
                { statusCode: response.status, message: errorText },
                'update team',
                teamId,
                `Failed to update team ${teamId}: ${errorText}`
              );
            }

            const team = (await response.json()) as Team;

            const standardResponse = createStandardResponse(
              'update-team',
              `Team "${team.name}" updated successfully`,
              { team },
              { teamId, affectedFields: Object.keys(updateData) },
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

            const teamId = validateAndConvertId(args.id, 'id');
            const session = authManager.getSession();
            const memberSubcommand = args.memberSubcommand || 'list';

            switch (memberSubcommand) {
              case 'list': {
                // Make direct API call to list team members
                const response = await fetch(`${session.apiUrl}/teams/${teamId}/members`, {
                  method: 'GET',
                  headers: {
                    Authorization: `Bearer ${session.apiToken}`,
                    'Content-Type': 'application/json',
                  },
                });

                if (!response.ok) {
                  const errorText = await response.text();
                  throw handleStatusCodeError(
                    { statusCode: response.status, message: errorText },
                    'list team members',
                    teamId,
                    `Failed to list members for team ${teamId}: ${errorText}`
                  );
                }

                const members = await response.json();

                const standardResponse = createStandardResponse(
                  'list-team-members',
                  `Retrieved ${Array.isArray(members) ? members.length : 1} member${(!Array.isArray(members) || members.length !== 1) ? 's' : ''}`,
                  { members: Array.isArray(members) ? members : [members] },
                  { teamId, count: Array.isArray(members) ? members.length : 1 },
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

              case 'add': {
                if (args.userId === undefined) {
                  throw new MCPError(ErrorCode.VALIDATION_ERROR, 'User ID is required');
                }

                const userId = validateAndConvertId(args.userId, 'userId');

                // Make direct API call to add member to team
                const memberData: { username: string; admin?: boolean } = {
                  username: String(userId),
                };
                if (args.admin !== undefined) memberData.admin = args.admin;

                const response = await fetch(`${session.apiUrl}/teams/${teamId}/members`, {
                  method: 'PUT',
                  headers: {
                    Authorization: `Bearer ${session.apiToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(memberData),
                });

                if (!response.ok) {
                  const errorText = await response.text();
                  throw handleStatusCodeError(
                    { statusCode: response.status, message: errorText },
                    'add team member',
                    teamId,
                    `Failed to add user ${userId} to team ${teamId}: ${errorText}`
                  );
                }

                const member = await response.json();

                const standardResponse = createStandardResponse(
                  'add-team-member',
                  `User ${userId} added to team successfully`,
                  { member },
                  { teamId, userId, admin: args.admin },
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

              case 'remove': {
                if (args.userId === undefined) {
                  throw new MCPError(ErrorCode.VALIDATION_ERROR, 'User ID is required');
                }

                const userId = validateAndConvertId(args.userId, 'userId');

                // Make direct API call to remove member from team
                const response = await fetch(`${session.apiUrl}/teams/${teamId}/members/${userId}`, {
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
                    'remove team member',
                    teamId,
                    `Failed to remove user ${userId} from team ${teamId}: ${errorText}`
                  );
                }

                const result = await response.json();

                const standardResponse = createStandardResponse(
                  'remove-team-member',
                  `User ${userId} removed from team successfully`,
                  { message: result },
                  { teamId, userId },
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

              case 'update': {
                if (args.userId === undefined) {
                  throw new MCPError(ErrorCode.VALIDATION_ERROR, 'User ID is required');
                }

                if (args.admin === undefined) {
                  throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Admin flag is required for updating member');
                }

                const userId = validateAndConvertId(args.userId, 'userId');

                // Make direct API call to update member (using PUT with updated admin flag)
                const memberData = {
                  username: String(userId),
                  admin: args.admin,
                };

                const response = await fetch(`${session.apiUrl}/teams/${teamId}/members/${userId}`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${session.apiToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(memberData),
                });

                if (!response.ok) {
                  const errorText = await response.text();
                  throw handleStatusCodeError(
                    { statusCode: response.status, message: errorText },
                    'update team member',
                    teamId,
                    `Failed to update user ${userId} in team ${teamId}: ${errorText}`
                  );
                }

                const member = await response.json();

                const standardResponse = createStandardResponse(
                  'update-team-member',
                  `User ${userId} updated in team successfully`,
                  { member },
                  { teamId, userId, admin: args.admin },
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

              default:
                throw new MCPError(
                  ErrorCode.VALIDATION_ERROR,
                  `Invalid member subcommand: ${String(memberSubcommand)}`,
                );
            }
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
