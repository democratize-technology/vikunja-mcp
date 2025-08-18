# Permission System Migration Guide

This guide outlines the steps to fully activate the new permission-based authentication system and eliminate all conditional tool registration complexity.

## Overview

The permission infrastructure is already implemented and tested. This migration will:
1. Enable unconditional tool registration
2. Replace manual auth checks with permission middleware
3. Simplify tool development going forward

## Migration Steps

### Step 1: Update Tool Registration (5 minutes)

**File:** `src/tools/index.ts`

```diff
  // Register batch import tool
  registerBatchImportTool(server, authManager, clientFactory);

- // Register user and export tools conditionally (preserving backward compatibility)
- // NOTE: The permission infrastructure is available for future migration
- if (authManager.isAuthenticated() && authManager.getAuthType() === 'jwt') {
-   registerUsersTool(server, authManager, clientFactory);
-   registerExportTool(server, authManager, clientFactory);
- }
+ // Register user and export tools unconditionally
+ // Permission checking now happens at runtime with helpful error messages
+ registerUsersTool(server, authManager, clientFactory);
+ registerExportTool(server, authManager, clientFactory);
```

### Step 2: Migrate Users Tool (10 minutes)

**File:** `src/tools/users.ts`

```diff
  import { handleAuthError } from '../utils/auth-error-handler';
+ import { withPermissions } from '../middleware/permission-wrapper';

  export function registerUsersTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
    server.tool(
      'vikunja_users',
      {
        // ... schema unchanged
      },
-     async (args) => {
-       if (!authManager.isAuthenticated()) {
-         throw new MCPError(
-           ErrorCode.AUTH_REQUIRED,
-           'Authentication required. Please use vikunja_auth.connect first.',
-         );
-       }
-
-       // User operations require JWT authentication
-       if (authManager.getAuthType() !== 'jwt') {
-         throw new MCPError(
-           ErrorCode.PERMISSION_DENIED,
-           'User operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.',
-         );
-       }
-
-       const client = await getClientFromContext();
+     withPermissions('vikunja_users', authManager, async (args) => {
+       const client = await getClientFromContext();

        try {
          // ... rest of handler unchanged
        }
-     },
+     }),
    );
  }
```

### Step 3: Migrate Export Tool (15 minutes)

**File:** `src/tools/export.ts`

```diff
  import { logger } from '../utils/logger';
+ import { withPermissions } from '../middleware/permission-wrapper';

  export function registerExportTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
    // Export project data
    server.tool(
      'vikunja_export_project',
      {
        projectId: z.number().int().positive(),
        includeChildren: z.boolean().optional().default(false),
      },
-     async (args) => {
-       if (!authManager.isAuthenticated()) {
-         throw new MCPError(
-           ErrorCode.AUTH_REQUIRED,
-           'Authentication required. Please use vikunja_auth.connect first.',
-         );
-       }
-
-       // Export operations require JWT authentication
-       if (authManager.getAuthType() !== 'jwt') {
-         throw new MCPError(
-           ErrorCode.PERMISSION_DENIED,
-           'Export operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.',
-         );
-       }
+     withPermissions('vikunja_export_project', authManager, async (args) => {

        try {
          // ... rest of handler unchanged
        }
-     },
+     }),
    );

    // Request user data export
    server.tool(
      'vikunja_request_user_export',
      {
        password: z.string().min(1),
      },
-     async (args) => {
+     withPermissions('vikunja_request_user_export', authManager, async (args) => {
        try {
          // ... handler unchanged (no auth checks to remove)
        }
-     },
+     }),
    );

    // Download user data export  
    server.tool(
      'vikunja_download_user_export',
      {
        password: z.string().min(1),
      },
-     async (args) => {
+     withPermissions('vikunja_download_user_export', authManager, async (args) => {
        try {
          // ... handler unchanged (no auth checks to remove)
        }
-     },
+     }),
    );
  }
```

### Step 4: Update Tests (15 minutes)

**File:** `tests/tools/index.test.ts`

```diff
  describe('registerTools', () => {
-   it('should register all tools except users and export when using API token auth', () => {
+   it('should register all tools unconditionally regardless of auth type', () => {
      // Arrange
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthType.mockReturnValue('api-token');

      // Act
      registerTools(mockServer, mockAuthManager, undefined);

      // Assert - ALL tools should be registered now
      expect(registerAuthTool).toHaveBeenCalledTimes(1);
      // ... other tools unchanged

-     // These should NOT be called with API token auth (backward compatibility)
-     expect(registerUsersTool).not.toHaveBeenCalled();
-     expect(registerExportTool).not.toHaveBeenCalled();
+     // These are NOW registered unconditionally - permission checking happens at runtime
+     expect(registerUsersTool).toHaveBeenCalledTimes(1);
+     expect(registerUsersTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);
+     expect(registerExportTool).toHaveBeenCalledTimes(1);
+     expect(registerExportTool).toHaveBeenCalledWith(mockServer, mockAuthManager, undefined);
    });

-   it('should not register users and export tools when not authenticated', () => {
+   it('should register all tools even when not authenticated', () => {
      // Arrange
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      // Act
      registerTools(mockServer, mockAuthManager, undefined);

      // Assert - ALL tools are registered regardless of auth status
      expect(registerAuthTool).toHaveBeenCalledTimes(1);
      // ... other tools unchanged

-     // These should NOT be called when not authenticated
-     expect(registerUsersTool).not.toHaveBeenCalled();
-     expect(registerExportTool).not.toHaveBeenCalled();
+     // These are NOW registered even when not authenticated - permission checking happens at runtime
+     expect(registerUsersTool).toHaveBeenCalledTimes(1);
+     expect(registerExportTool).toHaveBeenCalledTimes(1);
    });
  });
```

### Step 5: Update Tool-Specific Tests (Optional)

The existing tool tests may need minor updates to expect the new error messages from the permission system. However, the permission wrapper provides the same error codes and similar messages, so most tests should continue working.

If any test failures occur, update the expected error messages to match the new permission system format:

```diff
- 'Export operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.'
+ 'export operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication.'
```

## Verification Steps

### 1. Run Tests
```bash
npm run test:coverage
```
Ensure all tests pass and coverage remains high.

### 2. Test Functionality
```bash
# Test with API token (should reject users/export tools)
npm run dev  # Start server
# Try vikunja_users - should get helpful error message

# Test with JWT (should allow all tools)  
# Try vikunja_users - should work
```

### 3. Verify Error Messages
The new system should provide clearer, more helpful error messages:
- Before: "User operations require JWT authentication"
- After: "user operations require JWT authentication. Please reconnect using vikunja_auth.connect with JWT authentication."

## Benefits After Migration

### Immediate Benefits
1. **Simplified Tool Development**: New tools don't need auth-type awareness
2. **Better User Experience**: Consistent, helpful error messages
3. **Reduced Conditional Logic**: No more registration-time auth checks
4. **Easier Testing**: Simpler test scenarios

### Long-term Benefits
1. **Easier Authentication Expansion**: Add new auth methods without tool changes
2. **Better Debugging**: Permission status utilities available
3. **Consistent Architecture**: All tools follow same pattern
4. **Future-Proof**: Ready for advanced permission features

## Rollback Plan

If issues arise, rollback is simple since all changes are in defined locations:

1. **Revert Step 1**: Add back conditional registration
2. **Revert Step 2**: Remove `withPermissions` wrapper from users tool
3. **Revert Step 3**: Remove `withPermissions` wrapper from export tool
4. **Revert Step 4**: Restore original test expectations

The permission infrastructure can remain in place for future use.

## New Tool Development Pattern

After migration, new tools follow this simple pattern:

```typescript
export function registerNewTool(server: McpServer, authManager: AuthManager, clientFactory?: VikunjaClientFactory): void {
  server.tool(
    'vikunja_new_tool',
    {
      // schema definition
    },
    withPermissions('vikunja_new_tool', authManager, async (args) => {
      // No auth checks needed - permission wrapper handles everything
      const client = await getClientFromContext();
      
      try {
        // Tool logic here
      } catch (error) {
        // Error handling
      }
    }),
  );
}
```

Add the tool's permission requirements to `TOOL_PERMISSIONS` in `src/auth/permissions.ts`:

```typescript
export const TOOL_PERMISSIONS: Record<string, Permission[]> = {
  // existing tools...
  'vikunja_new_tool': [Permission.BASIC_AUTH, Permission.TASK_MANAGEMENT],
};
```

## Timeline Estimate

- **Step 1-3**: 30 minutes implementation
- **Step 4**: 15 minutes test updates  
- **Testing**: 15 minutes verification
- **Total**: ~1 hour for complete migration

## Risk Assessment

**Low Risk Migration** because:
- Infrastructure is already tested and working
- Changes are isolated and reversible
- Functionality remains identical
- Error handling is improved, not changed
- All existing tests provide regression protection

The migration primarily moves existing logic to a more centralized location while maintaining identical behavior.