/**
 * Authentication Tool
 * Handles authentication operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { MCPError, ErrorCode } from '../types/errors';
import { clearGlobalClientFactory } from '../client';
import { logger } from '../utils/logger';
import { applyRateLimiting } from '../middleware/direct-middleware';
import { createSecureConnectionMessage } from '../utils/security';
import { wrapAuthError } from '../utils/error-handler';
import { createStandardResponse } from '../utils/response-factory';
import { formatMcpResponse } from '../utils/simple-response';

interface AuthArgs {
  subcommand: 'connect' | 'status' | 'refresh' | 'disconnect';
  apiUrl?: string | undefined;
  apiToken?: string | undefined;
}

export function registerAuthTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
  server.tool(
    'vikunja_auth',
    'Manage authentication with Vikunja API (connect, status, refresh, disconnect)',
    {
      subcommand: z.enum(['connect', 'status', 'refresh', 'disconnect']),
      apiUrl: z.string().url().optional(),
      apiToken: z.string().optional(),
    },
    applyRateLimiting('vikunja_auth', async (args: AuthArgs) => {
      try {
        switch (args.subcommand) {
          case 'connect': {
            if (!args.apiUrl || !args.apiToken) {
              throw new MCPError(
                ErrorCode.VALIDATION_ERROR,
                'apiUrl and apiToken are required for connect',
              );
            }

            const secureMessage = createSecureConnectionMessage(args.apiUrl, args.apiToken);
            logger.debug('Auth connect attempt: %s', secureMessage);

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
                content: formatMcpResponse(response),
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
              content: formatMcpResponse(response),
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
              content: formatMcpResponse(response),
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
              content: formatMcpResponse(response),
            };
          }

          case 'disconnect': {
            authManager.disconnect();
            await clearGlobalClientFactory();
            const response = createStandardResponse(
              'auth-disconnect',
              'Successfully disconnected from Vikunja',
              { authenticated: false },
              { previouslyConnected: true },
            );
            return {
              content: formatMcpResponse(response),
            };
          }

          default:
            throw new MCPError(
              ErrorCode.VALIDATION_ERROR,
              `Unknown subcommand: ${args.subcommand as string}`,
            );
        }
      } catch (error) {
        throw wrapAuthError(error, args.subcommand);
      }
    })
  );
}
