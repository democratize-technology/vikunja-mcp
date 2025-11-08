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

jest.mock('../../src/tools/projects/index', () => ({
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
import { registerProjectsTool } from '../../src/tools/projects/index';
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
    it('should register auth and tasks tools without clientFactory', () => {
      // Arrange - test without clientFactory (only auth and tasks tools registered)
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthType.mockReturnValue('api-token');

      // Act
      registerTools(mockServer, mockAuthManager, undefined);

      // Assert - verify only auth and tasks tools are registered when no clientFactory
      expect(registerAuthTool).toHaveBeenCalledTimes(1);
      expect(registerAuthTool).toHaveBeenCalledWith(mockServer, mockAuthManager);

      expect(registerTasksTool).toHaveBeenCalledTimes(1);
      expect(registerTasksTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);

      // These should NOT be called without clientFactory
      expect(registerProjectsTool).not.toHaveBeenCalled();
      expect(registerLabelsTool).not.toHaveBeenCalled();
      expect(registerTeamsTool).not.toHaveBeenCalled();
      expect(registerFiltersTool).not.toHaveBeenCalled();
      expect(registerTemplatesTool).not.toHaveBeenCalled();
      expect(registerWebhooksTool).not.toHaveBeenCalled();
      expect(registerBatchImportTool).not.toHaveBeenCalled();
      expect(registerUsersTool).not.toHaveBeenCalled();
      expect(registerExportTool).not.toHaveBeenCalled();
    });

    it('should register all tools except users and export when using API token auth with clientFactory', () => {
      // Arrange - test with API token auth and clientFactory
      const mockClientFactory = { test: 'factory' };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthType.mockReturnValue('api-token');

      // Act
      registerTools(mockServer, mockAuthManager, mockClientFactory);

      // Assert - verify all tools except users and export are registered
      expect(registerAuthTool).toHaveBeenCalledTimes(1);
      expect(registerAuthTool).toHaveBeenCalledWith(mockServer, mockAuthManager);

      expect(registerTasksTool).toHaveBeenCalledTimes(1);
      expect(registerTasksTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerProjectsTool).toHaveBeenCalledTimes(1);
      expect(registerProjectsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerLabelsTool).toHaveBeenCalledTimes(1);
      expect(registerLabelsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerTeamsTool).toHaveBeenCalledTimes(1);
      expect(registerTeamsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerFiltersTool).toHaveBeenCalledTimes(1);
      expect(registerFiltersTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerTemplatesTool).toHaveBeenCalledTimes(1);
      expect(registerTemplatesTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerWebhooksTool).toHaveBeenCalledTimes(1);
      expect(registerWebhooksTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerBatchImportTool).toHaveBeenCalledTimes(1);
      expect(registerBatchImportTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      // These should NOT be called with API token auth (backward compatibility)
      expect(registerUsersTool).not.toHaveBeenCalled();
      expect(registerExportTool).not.toHaveBeenCalled();
    });

    it('should register all tools including users and export when using JWT auth with clientFactory', () => {
      // Arrange - test with JWT auth and clientFactory
      const mockClientFactory = { test: 'factory' };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthType.mockReturnValue('jwt');

      // Act
      registerTools(mockServer, mockAuthManager, mockClientFactory);

      // Assert - verify all tools are registered
      expect(registerAuthTool).toHaveBeenCalledTimes(1);
      expect(registerAuthTool).toHaveBeenCalledWith(mockServer, mockAuthManager);

      expect(registerTasksTool).toHaveBeenCalledTimes(1);
      expect(registerTasksTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerProjectsTool).toHaveBeenCalledTimes(1);
      expect(registerProjectsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerLabelsTool).toHaveBeenCalledTimes(1);
      expect(registerLabelsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerTeamsTool).toHaveBeenCalledTimes(1);
      expect(registerTeamsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerFiltersTool).toHaveBeenCalledTimes(1);
      expect(registerFiltersTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerTemplatesTool).toHaveBeenCalledTimes(1);
      expect(registerTemplatesTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerWebhooksTool).toHaveBeenCalledTimes(1);
      expect(registerWebhooksTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerBatchImportTool).toHaveBeenCalledTimes(1);
      expect(registerBatchImportTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      // These SHOULD be called with JWT auth
      expect(registerUsersTool).toHaveBeenCalledTimes(1);
      expect(registerUsersTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);
      expect(registerExportTool).toHaveBeenCalledTimes(1);
      expect(registerExportTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);
    });

    it('should not register users and export tools when not authenticated with clientFactory', () => {
      // Arrange
      const mockClientFactory = { test: 'factory' };
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      // Act
      registerTools(mockServer, mockAuthManager, mockClientFactory);

      // Assert - other tools are registered but not users/export (backward compatibility)
      expect(registerAuthTool).toHaveBeenCalledTimes(1);
      expect(registerAuthTool).toHaveBeenCalledWith(mockServer, mockAuthManager);

      expect(registerTasksTool).toHaveBeenCalledTimes(1);
      expect(registerTasksTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerProjectsTool).toHaveBeenCalledTimes(1);
      expect(registerProjectsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerLabelsTool).toHaveBeenCalledTimes(1);
      expect(registerLabelsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerTeamsTool).toHaveBeenCalledTimes(1);
      expect(registerTeamsTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerFiltersTool).toHaveBeenCalledTimes(1);
      expect(registerFiltersTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerTemplatesTool).toHaveBeenCalledTimes(1);
      expect(registerTemplatesTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerWebhooksTool).toHaveBeenCalledTimes(1);
      expect(registerWebhooksTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      expect(registerBatchImportTool).toHaveBeenCalledTimes(1);
      expect(registerBatchImportTool).toHaveBeenCalledWith(mockServer, mockAuthManager, mockClientFactory);

      // These should NOT be called when not authenticated
      expect(registerUsersTool).not.toHaveBeenCalled();
      expect(registerExportTool).not.toHaveBeenCalled();
    });

    it('should register tools in the correct order with JWT auth and clientFactory', () => {
      // Arrange
      const mockClientFactory = { test: 'factory' };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthType.mockReturnValue('jwt');

      // Act
      registerTools(mockServer, mockAuthManager, mockClientFactory);

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
