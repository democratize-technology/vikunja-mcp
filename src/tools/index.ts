/**
 * Tool Registration
 * Registers all Vikunja tools with the MCP server using conditional registration
 *
 * Registration Strategy:
 * - Core tools (auth, tasks): Always registered
 * - Client-dependent tools: Only registered when clientFactory is available
 * - JWT-restricted tools (users, export): Only registered with JWT authentication
 *
 * This approach ensures tool availability matches authentication capabilities
 * and prevents API errors from unsupported token types.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';

import { registerAuthTool } from './auth';
import { registerTasksTool } from './tasks';
import { registerTaskCrudTool } from './task-crud';
import { registerTaskBulkTool } from './task-bulk';
import { registerTaskAssigneesTool } from './task-assignees';
import { registerTaskCommentsTool } from './task-comments';
import { registerTaskRemindersTool } from './task-reminders';
import { registerTaskLabelsTool } from './task-labels';
import { registerTaskRelationsTool } from './task-relations';
import { registerProjectsTool } from './projects/index';
import { registerLabelsTool } from './labels';
import { registerTeamsTool } from './teams';
import { registerUsersTool } from './users';
import { registerFiltersTool } from './filters';
import { registerTemplatesTool } from './templates';
import { registerWebhooksTool } from './webhooks';
import { registerBatchImportTool } from './batch-import';
import { registerExportTool } from './export';

export function registerTools(
  server: McpServer, 
  authManager: AuthManager, 
  clientFactory?: VikunjaClientFactory
): void {
  // Register tools with conditional availability based on dependencies and authentication

  registerAuthTool(server, authManager);

  // Register the comprehensive tasks tool (expected by tests)
  registerTasksTool(server, authManager, clientFactory);

  // Register individual task tools for more granular operations
  registerTaskCrudTool(server, authManager, clientFactory);
  registerTaskBulkTool(server, authManager, clientFactory);
  registerTaskAssigneesTool(server, authManager, clientFactory);
  registerTaskCommentsTool(server, authManager, clientFactory);
  registerTaskRemindersTool(server, authManager, clientFactory);
  registerTaskLabelsTool(server, authManager, clientFactory);
  registerTaskRelationsTool(server, authManager, clientFactory);

  // Only register tools that require clientFactory if it's available
  if (clientFactory) {
    registerProjectsTool(server, authManager, clientFactory);
    registerLabelsTool(server, authManager, clientFactory);
    registerTeamsTool(server, authManager, clientFactory);

    // Register filters tool (needs auth manager for session-scoped storage)
    registerFiltersTool(server, authManager, clientFactory);

    // Register templates tool
    registerTemplatesTool(server, authManager, clientFactory);

    // Register webhooks tool
    registerWebhooksTool(server, authManager, clientFactory);

    // Register batch import tool
    registerBatchImportTool(server, authManager, clientFactory);

    // Register user and export tools conditionally (preserving backward compatibility)
    // NOTE: The permission infrastructure is available for future migration
    if (authManager.isAuthenticated() && authManager.getAuthType() === 'jwt') {
      registerUsersTool(server, authManager, clientFactory);
      registerExportTool(server, authManager, clientFactory);
    }
  }
}

