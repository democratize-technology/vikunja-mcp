/**
 * Tool Registration
 * Registers all Vikunja tools with the MCP server
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../auth/AuthManager';

import { registerAuthTool } from './auth';
import { registerTasksTool } from './tasks';
import { registerProjectsTool } from './projects';
import { registerLabelsTool } from './labels';
import { registerTeamsTool } from './teams';
import { registerUsersTool } from './users';
import { registerFiltersTool } from './filters';
import { registerTemplatesTool } from './templates';
import { registerWebhooksTool } from './webhooks';
import { registerBatchImportTool } from './batch-import';
import { registerExportTool } from './export';

export function registerTools(server: McpServer, authManager: AuthManager): void {
  // Register all tool handlers
  registerAuthTool(server, authManager);
  registerTasksTool(server, authManager);
  registerProjectsTool(server, authManager);
  registerLabelsTool(server, authManager);
  registerTeamsTool(server, authManager);

  // Register filters tool (doesn't need auth manager)
  registerFiltersTool(server);

  // Register templates tool
  registerTemplatesTool(server, authManager);

  // Register webhooks tool last to avoid circular dependency issues
  registerWebhooksTool(server, authManager);

  // Register batch import tool
  registerBatchImportTool(server, authManager);

  // Only register user and export tools if authenticated with JWT
  // These tools require JWT authentication to function properly
  if (authManager.isAuthenticated() && authManager.getAuthType() === 'jwt') {
    registerUsersTool(server, authManager);
    registerExportTool(server, authManager);
  }
}
