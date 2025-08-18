/**
 * Tests for tool registration
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AuthManager } from '../../src/auth/AuthManager';
import { registerTools } from '../../src/tools';

// Mock all tool registration functions
jest.mock('../../src/tools/auth', () => ({
  registerAuthTool: jest.fn(),
}));

jest.mock('../../src/tools/tasks', () => ({
  registerTasksTool: jest.fn(),
}));

jest.mock('../../src/tools/projects', () => ({
  registerProjectsTool: jest.fn(),
}));

jest.mock('../../src/tools/labels', () => ({
  registerLabelsTool: jest.fn(),
}));

jest.mock('../../src/tools/teams', () => ({
  registerTeamsTool: jest.fn(),
}));

jest.mock('../../src/tools/users', () => ({
  registerUsersTool: jest.fn(),
}));

jest.mock('../../src/tools/filters', () => ({
  registerFiltersTool: jest.fn(),
}));

jest.mock('../../src/tools/templates', () => ({
  registerTemplatesTool: jest.fn(),
}));

jest.mock('../../src/tools/webhooks', () => ({
  registerWebhooksTool: jest.fn(),
}));

jest.mock('../../src/tools/batch-import', () => ({
  registerBatchImportTool: jest.fn(),
}));

jest.mock('../../src/tools/export', () => ({
  registerExportTool: jest.fn(),
}));

// Import mocked functions
import { registerAuthTool } from '../../src/tools/auth';
import { registerTasksTool } from '../../src/tools/tasks';
import { registerProjectsTool } from '../../src/tools/projects';
import { registerLabelsTool } from '../../src/tools/labels';
import { registerTeamsTool } from '../../src/tools/teams';
import { registerUsersTool } from '../../src/tools/users';
import { registerFiltersTool } from '../../src/tools/filters';
import { registerTemplatesTool } from '../../src/tools/templates';
import { registerWebhooksTool } from '../../src/tools/webhooks';
import { registerBatchImportTool } from '../../src/tools/batch-import';
import { registerExportTool } from '../../src/tools/export';

describe('Tool Registration', () => {
  let mockServer: jest.Mocked<McpServer>;
  let mockAuthManager: jest.Mocked<AuthManager>;

  beforeEach(() => {
    // Create mock instances
    mockServer = {
      tool: jest.fn(),
    } as any;

    mockAuthManager = {
      isAuthenticated: jest.fn(),
      getAuthType: jest.fn(),
    } as any;

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('registerTools', () => {
    it('should register all tools except users and export when using API token auth', () => {
      // Arrange
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthType.mockReturnValue('api-token');

      // Act
      registerTools(mockServer, mockAuthManager, undefined);

      // Assert - verify each tool registration function was called
      expect(registerAuthTool).toHaveBeenCalledTimes(1);
      expect(registerAuthTool).toHaveBeenCalledWith(mockServer, mockAuthManager);

      expect(registerTasksTool).toHaveBeenCalledTimes(1);
      expect(registerTasksTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);

      expect(registerProjectsTool).toHaveBeenCalledTimes(1);
      expect(registerProjectsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);

      expect(registerLabelsTool).toHaveBeenCalledTimes(1);
      expect(registerLabelsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);

      expect(registerTeamsTool).toHaveBeenCalledTimes(1);
      expect(registerTeamsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);

      expect(registerFiltersTool).toHaveBeenCalledTimes(1);
      expect(registerFiltersTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);

      expect(registerTemplatesTool).toHaveBeenCalledTimes(1);
      expect(registerTemplatesTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);

      expect(registerWebhooksTool).toHaveBeenCalledTimes(1);
      expect(registerWebhooksTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);

      expect(registerBatchImportTool).toHaveBeenCalledTimes(1);
      expect(registerBatchImportTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);

      // These should NOT be called with API token auth
      expect(registerUsersTool).not.toHaveBeenCalled();
      expect(registerExportTool).not.toHaveBeenCalled();
    });

    it('should register all tools including users and export when using JWT auth', () => {
      // Arrange
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthType.mockReturnValue('jwt');

      // Act
      registerTools(mockServer, mockAuthManager, undefined);

      // Assert - verify all tools are registered
      expect(registerAuthTool).toHaveBeenCalledTimes(1);
      expect(registerTasksTool).toHaveBeenCalledTimes(1);
      expect(registerProjectsTool).toHaveBeenCalledTimes(1);
      expect(registerLabelsTool).toHaveBeenCalledTimes(1);
      expect(registerTeamsTool).toHaveBeenCalledTimes(1);
      expect(registerFiltersTool).toHaveBeenCalledTimes(1);
      expect(registerTemplatesTool).toHaveBeenCalledTimes(1);
      expect(registerWebhooksTool).toHaveBeenCalledTimes(1);
      expect(registerBatchImportTool).toHaveBeenCalledTimes(1);

      // These SHOULD be called with JWT auth
      expect(registerUsersTool).toHaveBeenCalledTimes(1);
      expect(registerUsersTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);
      expect(registerExportTool).toHaveBeenCalledTimes(1);
      expect(registerExportTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);
    });

    it('should not register users and export tools when not authenticated', () => {
      // Arrange
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      // Act
      registerTools(mockServer, mockAuthManager, undefined);

      // Assert - other tools are registered but not users/export
      expect(registerAuthTool).toHaveBeenCalledTimes(1);
      expect(registerTasksTool).toHaveBeenCalledTimes(1);
      expect(registerProjectsTool).toHaveBeenCalledTimes(1);
      expect(registerLabelsTool).toHaveBeenCalledTimes(1);
      expect(registerTeamsTool).toHaveBeenCalledTimes(1);
      expect(registerFiltersTool).toHaveBeenCalledTimes(1);
      expect(registerTemplatesTool).toHaveBeenCalledTimes(1);
      expect(registerWebhooksTool).toHaveBeenCalledTimes(1);
      expect(registerBatchImportTool).toHaveBeenCalledTimes(1);

      // These should NOT be called when not authenticated
      expect(registerUsersTool).not.toHaveBeenCalled();
      expect(registerExportTool).not.toHaveBeenCalled();
    });

    it('should register tools in the correct order with JWT auth', () => {
      // Arrange
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthType.mockReturnValue('jwt');

      // Act
      registerTools(mockServer, mockAuthManager, undefined);

      // Assert - verify order by checking mock invocation order
      const callOrder = [
        (registerAuthTool as jest.Mock).mock.invocationCallOrder[0],
        (registerTasksTool as jest.Mock).mock.invocationCallOrder[0],
        (registerProjectsTool as jest.Mock).mock.invocationCallOrder[0],
        (registerLabelsTool as jest.Mock).mock.invocationCallOrder[0],
        (registerTeamsTool as jest.Mock).mock.invocationCallOrder[0],
        (registerFiltersTool as jest.Mock).mock.invocationCallOrder[0],
        (registerTemplatesTool as jest.Mock).mock.invocationCallOrder[0],
        (registerWebhooksTool as jest.Mock).mock.invocationCallOrder[0],
        (registerBatchImportTool as jest.Mock).mock.invocationCallOrder[0],
        (registerUsersTool as jest.Mock).mock.invocationCallOrder[0],
        (registerExportTool as jest.Mock).mock.invocationCallOrder[0],
      ];

      // Verify that each function was called in sequence
      for (let i = 1; i < callOrder.length; i++) {
        expect(callOrder[i]).toBeGreaterThan(callOrder[i - 1]);
      }
    });
  });
});
