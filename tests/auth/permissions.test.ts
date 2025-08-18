/**
 * Tests for Permission System
 */

import { Permission, PermissionManager, TOOL_PERMISSIONS } from '../../src/auth/permissions';
import type { AuthSession } from '../../src/types/index';

describe('Permission System', () => {
  describe('Permission enum', () => {
    it('should define all required permissions', () => {
      expect(Permission.BASIC_AUTH).toBe('basic_auth');
      expect(Permission.USER_MANAGEMENT).toBe('user_management');
      expect(Permission.DATA_EXPORT).toBe('data_export');
      expect(Permission.TASK_MANAGEMENT).toBe('task_management');
    });
  });

  describe('TOOL_PERMISSIONS mapping', () => {
    it('should map all tools to appropriate permissions', () => {
      // Basic tools should only require basic auth and their specific permission
      expect(TOOL_PERMISSIONS['vikunja_tasks']).toEqual([
        Permission.BASIC_AUTH, 
        Permission.TASK_MANAGEMENT
      ]);
      expect(TOOL_PERMISSIONS['vikunja_projects']).toEqual([
        Permission.BASIC_AUTH, 
        Permission.PROJECT_MANAGEMENT
      ]);
      
      // JWT-only tools should require user management or data export
      expect(TOOL_PERMISSIONS['vikunja_users']).toEqual([
        Permission.BASIC_AUTH, 
        Permission.USER_MANAGEMENT
      ]);
      expect(TOOL_PERMISSIONS['vikunja_export_project']).toEqual([
        Permission.BASIC_AUTH, 
        Permission.DATA_EXPORT
      ]);
    });

    it('should include all expected tools', () => {
      const expectedTools = [
        'vikunja_auth',
        'vikunja_tasks',
        'vikunja_projects', 
        'vikunja_labels',
        'vikunja_teams',
        'vikunja_filters',
        'vikunja_templates',
        'vikunja_webhooks',
        'vikunja_batch_import',
        'vikunja_users',
        'vikunja_export_project',
        'vikunja_request_user_export',
        'vikunja_download_user_export',
      ];

      expectedTools.forEach(tool => {
        expect(TOOL_PERMISSIONS[tool]).toBeDefined();
        expect(Array.isArray(TOOL_PERMISSIONS[tool])).toBe(true);
      });
    });
  });

  describe('PermissionManager.checkToolPermission', () => {
    const createApiTokenSession = (): AuthSession => ({
      apiUrl: 'https://api.example.com',
      apiToken: 'tk_test123',
      authType: 'api-token',
    });

    const createJwtSession = (): AuthSession => ({
      apiUrl: 'https://api.example.com', 
      apiToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      authType: 'jwt',
    });

    describe('with no authentication', () => {
      it('should deny access to all tools when not authenticated', () => {
        const result = PermissionManager.checkToolPermission(null, 'vikunja_tasks');
        
        expect(result.hasPermission).toBe(false);
        expect(result.errorMessage).toBe('Authentication required. Please use vikunja_auth.connect first.');
        expect(result.missingPermissions).toEqual([Permission.BASIC_AUTH, Permission.TASK_MANAGEMENT]);
      });

      it('should deny access to JWT-only tools when not authenticated', () => {
        const result = PermissionManager.checkToolPermission(null, 'vikunja_users');
        
        expect(result.hasPermission).toBe(false);
        expect(result.errorMessage).toBe('Authentication required. Please use vikunja_auth.connect first.');
        expect(result.missingPermissions).toEqual([Permission.BASIC_AUTH, Permission.USER_MANAGEMENT]);
      });
    });

    describe('with API token authentication', () => {
      const session = createApiTokenSession();

      it('should allow access to basic tools', () => {
        const basicTools = ['vikunja_tasks', 'vikunja_projects', 'vikunja_labels', 'vikunja_teams'];
        
        basicTools.forEach(tool => {
          const result = PermissionManager.checkToolPermission(session, tool);
          expect(result.hasPermission).toBe(true);
          expect(result.missingPermissions).toEqual([]);
        });
      });

      it('should deny access to user management tools with helpful message', () => {
        const result = PermissionManager.checkToolPermission(session, 'vikunja_users');
        
        expect(result.hasPermission).toBe(false);
        expect(result.missingPermissions).toEqual([Permission.USER_MANAGEMENT]);
        expect(result.suggestedAuthType).toBe('jwt');
        expect(result.errorMessage).toBe(
          'user operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.'
        );
      });

      it('should deny access to export tools with helpful message', () => {
        const result = PermissionManager.checkToolPermission(session, 'vikunja_export_project');
        
        expect(result.hasPermission).toBe(false);
        expect(result.missingPermissions).toEqual([Permission.DATA_EXPORT]);
        expect(result.suggestedAuthType).toBe('jwt');
        expect(result.errorMessage).toBe(
          'export operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.'
        );
      });

      it('should handle both user and export operations in error message', () => {
        // Test with a hypothetical tool that requires both (doesn't exist but tests the logic)
        const result = PermissionManager.checkPermissions(session, [
          Permission.BASIC_AUTH,
          Permission.USER_MANAGEMENT, 
          Permission.DATA_EXPORT
        ]);
        
        expect(result.hasPermission).toBe(false);
        expect(result.missingPermissions).toEqual([Permission.USER_MANAGEMENT, Permission.DATA_EXPORT]);
        expect(result.suggestedAuthType).toBe('jwt');
        expect(result.errorMessage).toBe(
          'user operations and export operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.'
        );
      });
    });

    describe('with JWT authentication', () => {
      const session = createJwtSession();

      it('should allow access to all tools', () => {
        const allTools = Object.keys(TOOL_PERMISSIONS);
        
        allTools.forEach(tool => {
          const result = PermissionManager.checkToolPermission(session, tool);
          expect(result.hasPermission).toBe(true);
          expect(result.missingPermissions).toEqual([]);
        });
      });

      it('should allow access to JWT-only tools', () => {
        const jwtTools = ['vikunja_users', 'vikunja_export_project', 'vikunja_request_user_export'];
        
        jwtTools.forEach(tool => {
          const result = PermissionManager.checkToolPermission(session, tool);
          expect(result.hasPermission).toBe(true);
          expect(result.missingPermissions).toEqual([]);
        });
      });
    });

    describe('with unknown tools', () => {
      it('should require basic auth for unknown tools', () => {
        const session = createApiTokenSession();
        const result = PermissionManager.checkToolPermission(session, 'unknown_tool');
        
        expect(result.hasPermission).toBe(true); // Should allow with basic auth
        expect(result.missingPermissions).toEqual([]);
      });

      it('should deny unknown tools when not authenticated', () => {
        const result = PermissionManager.checkToolPermission(null, 'unknown_tool');
        
        expect(result.hasPermission).toBe(false);
        expect(result.missingPermissions).toEqual([Permission.BASIC_AUTH]);
      });
    });
  });

  describe('PermissionManager.checkPermissions', () => {
    const apiSession = { 
      apiUrl: 'test', 
      apiToken: 'tk_test', 
      authType: 'api-token' as const 
    };
    const jwtSession = { 
      apiUrl: 'test', 
      apiToken: 'eyJ0', 
      authType: 'jwt' as const 
    };

    it('should allow permissions available to auth type', () => {
      const result = PermissionManager.checkPermissions(apiSession, [
        Permission.BASIC_AUTH,
        Permission.TASK_MANAGEMENT
      ]);
      
      expect(result.hasPermission).toBe(true);
      expect(result.missingPermissions).toEqual([]);
    });

    it('should deny permissions not available to auth type', () => {
      const result = PermissionManager.checkPermissions(apiSession, [
        Permission.USER_MANAGEMENT
      ]);
      
      expect(result.hasPermission).toBe(false);
      expect(result.missingPermissions).toEqual([Permission.USER_MANAGEMENT]);
    });

    it('should allow all permissions for JWT', () => {
      const result = PermissionManager.checkPermissions(jwtSession, [
        Permission.BASIC_AUTH,
        Permission.USER_MANAGEMENT,
        Permission.DATA_EXPORT
      ]);
      
      expect(result.hasPermission).toBe(true);
      expect(result.missingPermissions).toEqual([]);
    });
  });

  describe('PermissionManager.getAvailablePermissions', () => {
    it('should return correct permissions for API token', () => {
      const permissions = PermissionManager.getAvailablePermissions('api-token');
      
      expect(permissions).toContain(Permission.BASIC_AUTH);
      expect(permissions).toContain(Permission.TASK_MANAGEMENT);
      expect(permissions).not.toContain(Permission.USER_MANAGEMENT);
      expect(permissions).not.toContain(Permission.DATA_EXPORT);
    });

    it('should return all permissions for JWT', () => {
      const permissions = PermissionManager.getAvailablePermissions('jwt');
      
      expect(permissions).toContain(Permission.BASIC_AUTH);
      expect(permissions).toContain(Permission.TASK_MANAGEMENT);
      expect(permissions).toContain(Permission.USER_MANAGEMENT);
      expect(permissions).toContain(Permission.DATA_EXPORT);
    });
  });
});