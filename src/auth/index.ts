/**
 * Auth Module Exports
 * Centralized exports for authentication components
 */

export { AuthManager } from './AuthManager';
export { Permission, PermissionManager, TOOL_PERMISSIONS, type PermissionCheckResult } from './permissions';
export {
  AuthManagerTestUtilsImpl,
  createTestableAuthManager,
  createMockTestableAuthManager,
  isTestableAuthManager
} from './AuthManagerTestUtils';
export type { TestableAuthManager } from './TestableAuthManager';