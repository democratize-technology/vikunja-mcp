/**
 * Authentication Tool
 * Handles authentication operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import { MCPError, ErrorCode, createStandardResponse } from '../types/index';
import { cleanupVikunjaClient } from '../client';
import { logger } from '../utils/logger';

export function registerAuthTool(server: McpServer, authManager: AuthManager): void {
  server.tool(
    'vikunja_auth',
    {
      subcommand: z.enum(['connect', 'status', 'refresh', 'disconnect']),
      apiUrl: z.string().url().optional(),
      apiToken: z.string().optional(),
    },
    (args) => {
      try {
        switch (args.subcommand) {
          case 'connect': {
            if (!args.apiUrl || !args.apiToken) {
              throw new MCPError(
                ErrorCode.VALIDATION_ERROR,
                'apiUrl and apiToken are required for connect',
              );
            }

            const tokenPreview = args.apiToken.substring(0, 10) + '...';
            logger.debug('Auth connect attempt - URL: %s, token preview: %s', args.apiUrl, tokenPreview);

            // Check if already authenticated
            const currentStatus = authManager.getStatus();
            if (currentStatus.authenticated && currentStatus.apiUrl === args.apiUrl) {
              const response = createStandardResponse(
                'auth-connect',
                'Already connected to Vikunja',
                { authenticated: true },
                { apiUrl: args.apiUrl },
              );
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            }

            // Auto-detect auth type will be handled by AuthManager
            logger.info('Attempting to connect to Vikunja');
            authManager.connect(args.apiUrl, args.apiToken);
            const detectedAuthType = authManager.getAuthType();
            logger.info('Successfully connected to Vikunja - authType: %s', detectedAuthType);

            const response = createStandardResponse(
              'auth-connect',
              'Successfully connected to Vikunja',
              { authenticated: true },
              { apiUrl: args.apiUrl, authType: authManager.getAuthType() },
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'status': {
            const status = authManager.getStatus();
            const response = createStandardResponse(
              'auth-status',
              status.authenticated ? 'Authentication status retrieved' : 'Not authenticated',
              status,
              status.authenticated ? { apiUrl: status.apiUrl } : undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'refresh': {
            // For now, tokens don't expire
            const response = createStandardResponse(
              'auth-refresh',
              'Token refresh not required - tokens do not expire',
              { refreshed: false },
              { reason: 'Tokens do not expire' },
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'disconnect': {
            authManager.disconnect();
            cleanupVikunjaClient();
            const response = createStandardResponse(
              'auth-disconnect',
              'Successfully disconnected from Vikunja',
              { authenticated: false },
              { previouslyConnected: true },
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          default:
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Unknown subcommand: ${args.subcommand as string}`,
            );
        }
      } catch (error) {
        if (error instanceof MCPError) {
          throw error;
        }
        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          `Authentication error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
