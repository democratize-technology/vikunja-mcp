/**
 * Tests for Permission Wrapper Middleware
 */

import { withPermissions, createPermissionTool, PermissionStatus } from '../../src/middleware/permission-wrapper';
import { AuthManager } from '../../src/auth/AuthManager';
import { MCPError, ErrorCode } from '../../src/types/index';
import { z } from 'zod';

// Mock the permission manager
jest.mock('../../src/auth/permissions', () => ({
  PermissionManager: {
    checkToolPermission: jest.fn(),
  },
}));

import { PermissionManager } from '../../src/auth/permissions';

describe('Permission Wrapper Middleware', () => {
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockHandler: jest.Mock;

  beforeEach(() => {
    mockAuthManager = {
      isAuthenticated: jest.fn(),
      getSession: jest.fn(),
    } as any;

    mockHandler = jest.fn();
    jest.clearAllMocks();
  });

  describe('withPermissions', () => {
    it('should call handler when permission is granted', async () => {
      // Arrange
      const mockSession = { apiUrl: 'test', apiToken: 'test', authType: 'jwt' as const };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getSession.mockReturnValue(mockSession);
      
      (PermissionManager.checkToolPermission as jest.Mock).mockReturnValue({
        hasPermission: true,
        missingPermissions: [],
      });

      mockHandler.mockResolvedValue({ success: true });

      // Act
      const wrappedHandler = withPermissions('vikunja_tasks', mockAuthManager, mockHandler);
      const result = await wrappedHandler({ test: 'args' });

      // Assert
      expect(result).toEqual({ success: true });
      expect(mockHandler).toHaveBeenCalledWith({ test: 'args' });
      expect(PermissionManager.checkToolPermission).toHaveBeenCalledWith(mockSession, 'vikunja_tasks');
    });

    it('should throw AUTH_REQUIRED when not authenticated', async () => {
      // Arrange
      mockAuthManager.isAuthenticated.mockReturnValue(false);
      
      (PermissionManager.checkToolPermission as jest.Mock).mockReturnValue({
        hasPermission: false,
        missingPermissions: ['basic_auth'],
        errorMessage: 'Authentication required. Please use vikunja_auth.connect first.',
      });

      // Act & Assert
      const wrappedHandler = withPermissions('vikunja_tasks', mockAuthManager, mockHandler);
      
      await expect(wrappedHandler({ test: 'args' })).rejects.toThrow(
        new MCPError(ErrorCode.AUTH_REQUIRED, 'Authentication required. Please use vikunja_auth.connect first.')
      );

      expect(mockHandler).not.toHaveBeenCalled();
      expect(PermissionManager.checkToolPermission).toHaveBeenCalledWith(null, 'vikunja_tasks');
    });

    it('should throw PERMISSION_DENIED when authenticated but insufficient permissions', async () => {
      // Arrange
      const mockSession = { apiUrl: 'test', apiToken: 'tk_test', authType: 'api-token' as const };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getSession.mockReturnValue(mockSession);
      
      (PermissionManager.checkToolPermission as jest.Mock).mockReturnValue({
        hasPermission: false,
        missingPermissions: ['user_management'],
        errorMessage: 'user operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.',
      });

      // Act & Assert
      const wrappedHandler = withPermissions('vikunja_users', mockAuthManager, mockHandler);
      
      await expect(wrappedHandler({ test: 'args' })).rejects.toThrow(
        new MCPError(
          ErrorCode.PERMISSION_DENIED, 
          'user operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.'
        )
      );

      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should handle handler errors without interfering', async () => {
      // Arrange
      const mockSession = { apiUrl: 'test', apiToken: 'test', authType: 'jwt' as const };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getSession.mockReturnValue(mockSession);
      
      (PermissionManager.checkToolPermission as jest.Mock).mockReturnValue({
        hasPermission: true,
        missingPermissions: [],
      });

      const testError = new Error('Handler error');
      mockHandler.mockRejectedValue(testError);

      // Act & Assert
      const wrappedHandler = withPermissions('vikunja_tasks', mockAuthManager, mockHandler);
      
      await expect(wrappedHandler({ test: 'args' })).rejects.toThrow(testError);
      expect(mockHandler).toHaveBeenCalledWith({ test: 'args' });
    });

    it('should use default error message when none provided', async () => {
      // Arrange
      const mockSession = { apiUrl: 'test', apiToken: 'tk_test', authType: 'api-token' as const };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getSession.mockReturnValue(mockSession);
      
      (PermissionManager.checkToolPermission as jest.Mock).mockReturnValue({
        hasPermission: false,
        missingPermissions: ['unknown_permission'],
        // No errorMessage provided
      });

      // Act & Assert
      const wrappedHandler = withPermissions('vikunja_test', mockAuthManager, mockHandler);
      
      await expect(wrappedHandler({ test: 'args' })).rejects.toThrow(
        new MCPError(ErrorCode.PERMISSION_DENIED, 'Permission denied')
      );
    });
  });

  describe('PermissionStatus.getAllToolPermissions', () => {
    it('should return status for all tools when authenticated', () => {
      // Arrange
      const mockSession = { apiUrl: 'test', apiToken: 'test', authType: 'jwt' as const };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getSession.mockReturnValue(mockSession);

      // Mock permission checks - allow some, deny others
      (PermissionManager.checkToolPermission as jest.Mock)
        .mockImplementation((session, toolName) => {
          if (toolName === 'vikunja_tasks') {
            return { hasPermission: true, missingPermissions: [] };
          }
          if (toolName === 'vikunja_users') {
            return { 
              hasPermission: false, 
              missingPermissions: ['user_management'],
              suggestedAuthType: 'jwt'
            };
          }
          return { hasPermission: true, missingPermissions: [] };
        });

      // Act
      const status = PermissionStatus.getAllToolPermissions(mockAuthManager);

      // Assert
      expect(status['vikunja_tasks']).toEqual({
        hasAccess: true,
        authType: 'jwt',
        missingPermissions: [],
        suggestedAuthType: undefined,
      });

      expect(status['vikunja_users']).toEqual({
        hasAccess: false,
        authType: 'jwt',
        missingPermissions: ['user_management'],
        suggestedAuthType: 'jwt',
      });

      // Verify all expected tools are included
      const expectedTools = [
        'vikunja_auth', 'vikunja_tasks', 'vikunja_projects', 'vikunja_labels',
        'vikunja_teams', 'vikunja_filters', 'vikunja_templates', 'vikunja_webhooks',
        'vikunja_batch_import', 'vikunja_users', 'vikunja_export_project',
        'vikunja_request_user_export', 'vikunja_download_user_export'
      ];

      expectedTools.forEach(tool => {
        expect(status[tool]).toBeDefined();
      });
    });

    it('should return status for all tools when not authenticated', () => {
      // Arrange
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      (PermissionManager.checkToolPermission as jest.Mock).mockReturnValue({
        hasPermission: false,
        missingPermissions: ['basic_auth'],
      });

      // Act
      const status = PermissionStatus.getAllToolPermissions(mockAuthManager);

      // Assert
      Object.values(status).forEach((toolStatus: any) => {
        expect(toolStatus.hasAccess).toBe(false);
        expect(toolStatus.authType).toBeUndefined();
        expect(toolStatus.missingPermissions).toEqual(['basic_auth']);
      });
    });
  });

  describe('PermissionStatus.getAccessSummary', () => {
    it('should return correct summary for JWT authentication', () => {
      // Arrange
      const mockSession = { apiUrl: 'test', apiToken: 'test', authType: 'jwt' as const };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getSession.mockReturnValue(mockSession);

      // Mock all tools as accessible
      (PermissionManager.checkToolPermission as jest.Mock).mockReturnValue({
        hasPermission: true,
        missingPermissions: [],
      });

      // Act
      const summary = PermissionStatus.getAccessSummary(mockAuthManager);

      // Assert
      expect(summary.authenticated).toBe(true);
      expect(summary.authType).toBe('jwt');
      expect(summary.availableTools.length).toBeGreaterThan(0);
      expect(summary.restrictedTools).toEqual([]);
      expect(summary.upgradeMessage).toBeUndefined();
    });

    it('should return correct summary for API token authentication with upgrade message', () => {
      // Arrange  
      const mockSession = { apiUrl: 'test', apiToken: 'tk_test', authType: 'api-token' as const };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getSession.mockReturnValue(mockSession);

      // Mock some tools as restricted
      (PermissionManager.checkToolPermission as jest.Mock)
        .mockImplementation((session, toolName) => {
          const restrictedTools = ['vikunja_users', 'vikunja_export_project'];
          return {
            hasPermission: !restrictedTools.includes(toolName),
            missingPermissions: restrictedTools.includes(toolName) ? ['user_management'] : [],
          };
        });

      // Act
      const summary = PermissionStatus.getAccessSummary(mockAuthManager);

      // Assert
      expect(summary.authenticated).toBe(true);
      expect(summary.authType).toBe('api-token');
      expect(summary.restrictedTools.length).toBeGreaterThan(0);
      expect(summary.upgradeMessage).toBe(
        'Reconnect with JWT authentication to access user management and export features.'
      );
    });

    it('should return correct summary when not authenticated', () => {
      // Arrange
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      (PermissionManager.checkToolPermission as jest.Mock).mockReturnValue({
        hasPermission: false,
        missingPermissions: ['basic_auth'],
      });

      // Act
      const summary = PermissionStatus.getAccessSummary(mockAuthManager);

      // Assert
      expect(summary.authenticated).toBe(false);
      expect(summary.authType).toBeUndefined();
      expect(summary.availableTools).toEqual([]);
      expect(summary.restrictedTools.length).toBeGreaterThan(0);
      expect(summary.upgradeMessage).toBeUndefined();
    });
  });

  describe('createPermissionTool', () => {
    let mockSchema: z.ZodObject<any>;
    let mockToolHandler: jest.Mock;

    beforeEach(() => {
      mockSchema = z.object({
        test: z.string(),
      });

      // Use Object.defineProperty to set description since it's read-only
      Object.defineProperty(mockSchema, 'description', {
        value: 'Test tool schema',
        writable: false,
        configurable: true
      });

      mockToolHandler = jest.fn();
    });

    it('should create a complete tool definition with permission checking', () => {
      // Arrange
      const mockSession = { apiUrl: 'test', apiToken: 'test', authType: 'jwt' as const };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getSession.mockReturnValue(mockSession);

      (PermissionManager.checkToolPermission as jest.Mock).mockReturnValue({
        hasPermission: true,
        missingPermissions: [],
      });

      mockToolHandler.mockResolvedValue({ success: true });

      // Act
      const tool = createPermissionTool('test_tool', mockSchema, mockAuthManager, mockToolHandler);

      // Assert
      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBe('Test tool schema');
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.handler).toBe('function');
    });

    it('should create tool without description when schema has no description', () => {
      // Arrange
      const schemaWithoutDesc = z.object({ test: z.string() });
      // No description property

      // Act
      const tool = createPermissionTool('test_tool', schemaWithoutDesc, mockAuthManager, mockToolHandler);

      // Assert
      expect(tool.name).toBe('test_tool');
      expect(tool.description).toBeUndefined();
      expect(tool.inputSchema).toBeDefined();
    });

    it('should create tool with default input schema when schema has no inputSchema', () => {
      // Arrange
      const mockSchemaWithoutInputSchema = {
        description: 'Test schema',
        inputSchema: undefined,
      } as any;

      // Act
      const tool = createPermissionTool('test_tool', mockSchemaWithoutInputSchema, mockAuthManager, mockToolHandler);

      // Assert
      expect(tool.inputSchema).toEqual({
        type: 'object',
        properties: {},
      });
    });

    it('should wrap handler with permission checking', async () => {
      // Arrange
      const mockSession = { apiUrl: 'test', apiToken: 'test', authType: 'jwt' as const };
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getSession.mockReturnValue(mockSession);

      (PermissionManager.checkToolPermission as jest.Mock).mockReturnValue({
        hasPermission: true,
        missingPermissions: [],
      });

      mockToolHandler.mockResolvedValue({ result: 'success' });

      // Act
      const tool = createPermissionTool('test_tool', mockSchema, mockAuthManager, mockToolHandler);
      const result = await tool.handler({ test: 'args' });

      // Assert
      expect(result).toEqual({ result: 'success' });
      expect(mockToolHandler).toHaveBeenCalledWith({ test: 'args' });
      expect(PermissionManager.checkToolPermission).toHaveBeenCalledWith(mockSession, 'test_tool');
    });

    it('should enforce permissions through wrapped handler', async () => {
      // Arrange
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      (PermissionManager.checkToolPermission as jest.Mock).mockReturnValue({
        hasPermission: false,
        missingPermissions: ['basic_auth'],
        errorMessage: 'Authentication required',
      });

      // Act
      const tool = createPermissionTool('test_tool', mockSchema, mockAuthManager, mockToolHandler);

      // Assert
      await expect(tool.handler({ test: 'args' })).rejects.toThrow(
        new MCPError(ErrorCode.AUTH_REQUIRED, 'Authentication required')
      );
      expect(mockToolHandler).not.toHaveBeenCalled();
    });
  });
});