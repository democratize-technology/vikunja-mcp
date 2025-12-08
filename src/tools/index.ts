/**
 * Tool Registration
 * Registers all Vikunja tools with the MCP server using conditional registration
 *
 * Registration Strategy:
 * - Core tools (auth, tasks): Always registered (cannot be disabled)
 * - Client-dependent tools: Only registered when clientFactory is available
 * - JWT-restricted tools (users, export): Only registered with JWT authentication
 * - Blocklist support: Tools can be disabled via VIKUNJA_DISABLED_TOOLS env var
 *
 * This approach ensures tool availability matches authentication capabilities
 * and prevents API errors from unsupported token types.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';

import { registerAuthTool } from './auth';
import { registerTasksTool } from './tasks';
import { registerProjectsTool } from './projects/index';
import { registerLabelsTool } from './labels';
import { registerTeamsTool } from './teams';
import { registerUsersTool } from './users';
import { registerFiltersTool } from './filters';
import { registerTemplatesTool } from './templates';
import { registerWebhooksTool } from './webhooks';
import { registerBatchImportTool } from './batch-import';
import { registerExportTool } from './export';
import {
  parseBlocklist,
  validateBlocklist,
  logBlocklistWarnings,
  isToolBlocked,
} from './blocklist';

export function registerTools(
  server: McpServer,
  authManager: AuthManager,
  clientFactory?: VikunjaClientFactory
): void {
  // Parse and validate blocklist from environment variable
  const blocklist = parseBlocklist(process.env.VIKUNJA_DISABLED_TOOLS);
  const validation = validateBlocklist(blocklist);
  logBlocklistWarnings(validation);

  // Core tools - always registered (cannot be disabled)
  registerAuthTool(server, authManager);
  registerTasksTool(server, authManager, clientFactory);

  // Only register tools that require clientFactory if it's available
  if (clientFactory) {
    // Blockable tools - check blocklist before registering
    if (!isToolBlocked('projects', blocklist)) {
      registerProjectsTool(server, authManager, clientFactory);
    }

    if (!isToolBlocked('labels', blocklist)) {
      registerLabelsTool(server, authManager, clientFactory);
    }

    if (!isToolBlocked('teams', blocklist)) {
      registerTeamsTool(server, authManager, clientFactory);
    }

    if (!isToolBlocked('filters', blocklist)) {
      registerFiltersTool(server, authManager, clientFactory);
    }

    if (!isToolBlocked('templates', blocklist)) {
      registerTemplatesTool(server, authManager, clientFactory);
    }

    if (!isToolBlocked('webhooks', blocklist)) {
      registerWebhooksTool(server, authManager, clientFactory);
    }

    if (!isToolBlocked('batch-import', blocklist)) {
      registerBatchImportTool(server, authManager, clientFactory);
    }

    // Register user and export tools conditionally (preserving backward compatibility)
    // NOTE: The permission infrastructure is available for future migration
    if (authManager.isAuthenticated() && authManager.getAuthType() === 'jwt') {
      if (!isToolBlocked('users', blocklist)) {
        registerUsersTool(server, authManager, clientFactory);
      }

      if (!isToolBlocked('export', blocklist)) {
        registerExportTool(server, authManager, clientFactory);
      }
    }
  }
}

