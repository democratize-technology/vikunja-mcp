/**
 * Projects Tool - Backward Compatibility Layer
 *
 * This file maintains backward compatibility by re-exporting the modular
 * project operations. The actual implementation has been refactored into
 * separate modules in the ./projects/ directory.
 *
 * Refactored from 1,053-line god module into focused, single-responsibility modules:
 * - validation.ts: Input validation and hierarchy validation
 * - response-formatter.ts: Response creation and formatting
 * - crud.ts: Basic CRUD operations (list, get, create, update, delete, archive)
 * - hierarchy.ts: Complex tree operations (children, tree, breadcrumb, move)
 * - sharing.ts: Link sharing operations
 * - index.ts: Main orchestration and tool registration
 */

// Re-export all functionality from the modular structure
export {
  registerProjectsTool, // This is the backward compatibility single-tool function
  registerProjectTools, // This is the new multi-tool function
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  unarchiveProject,
  getProjectChildren,
  getProjectTree,
  getProjectBreadcrumb,
  moveProject,
  createProjectShare,
  listProjectShares,
  getProjectShare,
  deleteProjectShare,
  authProjectShare,
  type ListProjectsArgs,
  type GetProjectArgs,
  type CreateProjectArgs,
  type UpdateProjectArgs,
  type DeleteProjectArgs,
  type ArchiveProjectArgs,
  type GetChildrenArgs,
  type GetTreeArgs,
  type GetBreadcrumbArgs,
  type MoveProjectArgs,
  type CreateShareArgs,
  type ListSharesArgs,
  type GetShareArgs,
  type DeleteShareArgs,
  type AuthShareArgs
} from './projects/index';

// Re-export validation utilities for external use
export {
  validateId,
  validateHexColor,
  validateProjectData,
  calculateProjectDepth,
  getMaxSubtreeDepth,
  validateMoveConstraints,
  MAX_PROJECT_DEPTH
} from './projects/validation';

// Re-export response formatters for external use
export {
  createProjectResponse,
  createProjectSuccessResponse,
  createProjectListResponse,
  createProjectTreeResponse,
  createBreadcrumbResponse
} from './projects/response-formatter';