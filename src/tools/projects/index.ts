/**
 * Projects Tool Module - Main Orchestrator
 * Coordinates all project-related operations through specialized submodules
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../../auth/AuthManager';
import type { VikunjaClientFactory } from '../../client/VikunjaClientFactory';

// Import all submodule operations
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  unarchiveProject,
  type ListProjectsArgs,
  type GetProjectArgs,
  type CreateProjectArgs,
  type UpdateProjectArgs,
  type DeleteProjectArgs,
  type ArchiveProjectArgs
} from './crud';

import {
  getProjectChildren,
  getProjectTree,
  getProjectBreadcrumb,
  moveProject,
  type GetChildrenArgs,
  type GetTreeArgs,
  type GetBreadcrumbArgs,
  type MoveProjectArgs
} from './hierarchy';

import {
  createProjectShare,
  listProjectShares,
  getProjectShare,
  deleteProjectShare,
  authProjectShare,
  type CreateShareArgs,
  type ListSharesArgs,
  type GetShareArgs,
  type DeleteShareArgs,
  type AuthShareArgs
} from './sharing';

/**
 * Legacy single-tool interface for backward compatibility
 * Registers a single tool with all subcommands like the original implementation
 */
export function registerProjectsTool(
  server: McpServer,
  authManager: AuthManager,
  clientFactory: VikunjaClientFactory
): void {
  server.tool(
    'vikunja_projects',
    {
      subcommand: z.enum([
        'list', 'get', 'create', 'update', 'delete', 'archive', 'unarchive',
        'get-children', 'get-tree', 'get-breadcrumb', 'move',
        'create-share', 'list-shares', 'get-share', 'delete-share', 'auth-share'
      ]),
      // CRUD arguments
      id: z.number().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      parentProjectId: z.number().optional(),
      isArchived: z.boolean().optional(),
      hexColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      page: z.number().min(1).optional(),
      perPage: z.number().min(1).max(100).optional(),
      search: z.string().optional(),
      // Hierarchy arguments
      maxDepth: z.number().min(1).max(20).optional(),
      includeArchived: z.boolean().optional(),
      // Sharing arguments
      projectId: z.number().optional(),
      shareId: z.string().optional(),
      right: z.enum(['read', 'write', 'admin']).optional(),
      name: z.string().optional(),
      password: z.string().optional(),
      shares: z.number().min(1).optional(),
      // Common arguments
      verbosity: z.enum(['minimal', 'standard', 'detailed']).optional(),
      useOptimizedFormat: z.boolean().optional(),
      useAorp: z.boolean().optional(),
    },
    async (args, context) => {
      switch (args.subcommand) {
        // CRUD operations
        case 'list':
          return await listProjects(args as ListProjectsArgs, context);

        case 'get':
          if (!args.id) {
            throw new Error('Project ID is required for get operation');
          }
          return await getProject(args as GetProjectArgs, context);

        case 'create':
          if (!args.title) {
            throw new Error('Project title is required for create operation');
          }
          return await createProject(args as CreateProjectArgs, context);

        case 'update':
          if (!args.id) {
            throw new Error('Project ID is required for update operation');
          }
          return await updateProject(args as UpdateProjectArgs, context);

        case 'delete':
          if (!args.id) {
            throw new Error('Project ID is required for delete operation');
          }
          return await deleteProject(args as DeleteProjectArgs, context);

        case 'archive':
          if (!args.id) {
            throw new Error('Project ID is required for archive operation');
          }
          return await archiveProject(args as ArchiveProjectArgs, context);

        case 'unarchive':
          if (!args.id) {
            throw new Error('Project ID is required for unarchive operation');
          }
          return await unarchiveProject(args as ArchiveProjectArgs, context);

        // Hierarchy operations
        case 'get-children':
          if (!args.id) {
            throw new Error('Project ID is required for get-children operation');
          }
          return await getProjectChildren(args as GetChildrenArgs, context);

        case 'get-tree':
          return await getProjectTree(args as GetTreeArgs, context);

        case 'get-breadcrumb':
          if (!args.id) {
            throw new Error('Project ID is required for get-breadcrumb operation');
          }
          return await getProjectBreadcrumb(args as GetBreadcrumbArgs, context);

        case 'move':
          if (!args.id) {
            throw new Error('Project ID is required for move operation');
          }
          return await moveProject(args as MoveProjectArgs, context);

        // Sharing operations
        case 'create-share':
          if (!args.projectId) {
            throw new Error('Project ID is required for create-share operation');
          }
          if (!args.right) {
            throw new Error('Share right is required for create-share operation');
          }
          return await createProjectShare(args as CreateShareArgs, context);

        case 'list-shares':
          if (!args.projectId) {
            throw new Error('Project ID is required for list-shares operation');
          }
          return await listProjectShares(args as ListSharesArgs, context);

        case 'get-share':
          if (!args.shareId) {
            throw new Error('Share ID is required for get-share operation');
          }
          return await getProjectShare(args as GetShareArgs, context);

        case 'delete-share':
          if (!args.shareId) {
            throw new Error('Share ID is required for delete-share operation');
          }
          return await deleteProjectShare(args as DeleteShareArgs, context);

        case 'auth-share':
          if (!args.shareId) {
            throw new Error('Share ID is required for auth-share operation');
          }
          return await authProjectShare(args as AuthShareArgs, context);

        default:
          throw new Error(`Unknown subcommand: ${args.subcommand}`);
      }
    }
  );
}

/**
 * Registers separate project tools with the MCP server (new modular interface)
 * Use registerProjectsTool for backward compatibility
 */
export function registerProjectTools(
  server: McpServer,
  authManager: AuthManager,
  clientFactory: VikunjaClientFactory
): void {
  // CRUD Operations
  server.tool(
    'vikunja_projects_crud',
    {
      subcommand: z.enum(['list', 'get', 'create', 'update', 'delete', 'archive', 'unarchive']),
      id: z.number().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      parentProjectId: z.number().optional(),
      isArchived: z.boolean().optional(),
      hexColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      page: z.number().min(1).optional(),
      perPage: z.number().min(1).max(100).optional(),
      search: z.string().optional(),
      verbosity: z.enum(['minimal', 'standard', 'detailed']).optional(),
      useOptimizedFormat: z.boolean().optional(),
      useAorp: z.boolean().optional(),
    },
    async (args, context) => {
      switch (args.subcommand) {
        case 'list':
          return await listProjects(args as ListProjectsArgs, context);

        case 'get':
          if (!args.id) {
            throw new Error('Project ID is required for get operation');
          }
          return await getProject(args as GetProjectArgs, context);

        case 'create':
          if (!args.title) {
            throw new Error('Project title is required for create operation');
          }
          return await createProject(args as CreateProjectArgs, context);

        case 'update':
          if (!args.id) {
            throw new Error('Project ID is required for update operation');
          }
          return await updateProject(args as UpdateProjectArgs, context);

        case 'delete':
          if (!args.id) {
            throw new Error('Project ID is required for delete operation');
          }
          return await deleteProject(args as DeleteProjectArgs, context);

        case 'archive':
          if (!args.id) {
            throw new Error('Project ID is required for archive operation');
          }
          return await archiveProject(args as ArchiveProjectArgs, context);

        case 'unarchive':
          if (!args.id) {
            throw new Error('Project ID is required for unarchive operation');
          }
          return await unarchiveProject(args as ArchiveProjectArgs, context);

        default:
          throw new Error(`Unknown CRUD subcommand: ${args.subcommand}`);
      }
    }
  );

  // Hierarchy Operations
  server.tool(
    'vikunja_projects_hierarchy',
    {
      subcommand: z.enum(['children', 'tree', 'breadcrumb', 'move']),
      id: z.number().optional(),
      maxDepth: z.number().min(1).max(20).optional(),
      includeArchived: z.boolean().optional(),
      parentProjectId: z.number().optional(),
      verbosity: z.enum(['minimal', 'standard', 'detailed']).optional(),
      useOptimizedFormat: z.boolean().optional(),
      useAorp: z.boolean().optional(),
    },
    async (args, context) => {
      switch (args.subcommand) {
        case 'children':
          if (!args.id) {
            throw new Error('Project ID is required for children operation');
          }
          return await getProjectChildren(args as GetChildrenArgs, context);

        case 'tree':
          return await getProjectTree(args as GetTreeArgs, context);

        case 'breadcrumb':
          if (!args.id) {
            throw new Error('Project ID is required for breadcrumb operation');
          }
          return await getProjectBreadcrumb(args as GetBreadcrumbArgs, context);

        case 'move':
          if (!args.id) {
            throw new Error('Project ID is required for move operation');
          }
          return await moveProject(args as MoveProjectArgs, context);

        default:
          throw new Error(`Unknown hierarchy subcommand: ${args.subcommand}`);
      }
    }
  );

  // Link Sharing Operations
  server.tool(
    'vikunja_projects_sharing',
    {
      subcommand: z.enum(['create_share', 'list_shares', 'get_share', 'delete_share', 'auth_share']),
      projectId: z.number().optional(),
      shareId: z.string().optional(),
      right: z.enum(['read', 'write', 'admin']).optional(),
      name: z.string().optional(),
      password: z.string().optional(),
      shares: z.number().min(1).optional(),
      page: z.number().min(1).optional(),
      perPage: z.number().min(1).max(100).optional(),
      verbosity: z.enum(['minimal', 'standard', 'detailed']).optional(),
      useOptimizedFormat: z.boolean().optional(),
      useAorp: z.boolean().optional(),
    },
    async (args, context) => {
      switch (args.subcommand) {
        case 'create_share':
          if (!args.projectId) {
            throw new Error('Project ID is required for create_share operation');
          }
          if (!args.right) {
            throw new Error('Share right is required for create_share operation');
          }
          return await createProjectShare(args as CreateShareArgs, context);

        case 'list_shares':
          if (!args.projectId) {
            throw new Error('Project ID is required for list_shares operation');
          }
          return await listProjectShares(args as ListSharesArgs, context);

        case 'get_share':
          if (!args.shareId) {
            throw new Error('Share ID is required for get_share operation');
          }
          return await getProjectShare(args as GetShareArgs, context);

        case 'delete_share':
          if (!args.shareId) {
            throw new Error('Share ID is required for delete_share operation');
          }
          return await deleteProjectShare(args as DeleteShareArgs, context);

        case 'auth_share':
          if (!args.shareId) {
            throw new Error('Share ID is required for auth_share operation');
          }
          return await authProjectShare(args as AuthShareArgs, context);

        default:
          throw new Error(`Unknown sharing subcommand: ${args.subcommand}`);
      }
    }
  );
}

// Export all types for external use
export type {
  ListProjectsArgs,
  GetProjectArgs,
  CreateProjectArgs,
  UpdateProjectArgs,
  DeleteProjectArgs,
  ArchiveProjectArgs,
  GetChildrenArgs,
  GetTreeArgs,
  GetBreadcrumbArgs,
  MoveProjectArgs,
  CreateShareArgs,
  ListSharesArgs,
  GetShareArgs,
  DeleteShareArgs,
  AuthShareArgs
};

// Export all functions for direct use if needed
export {
  // CRUD
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  unarchiveProject,

  // Hierarchy
  getProjectChildren,
  getProjectTree,
  getProjectBreadcrumb,
  moveProject,

  // Sharing
  createProjectShare,
  listProjectShares,
  getProjectShare,
  deleteProjectShare,
  authProjectShare
};