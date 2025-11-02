/**
 * Projects Tool
 * Handles project operations for Vikunja
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import type { ResponseMetadata } from '../types/responses';
import { MCPError, ErrorCode, createStandardResponse } from '../types/index';
import { getClientFromContext } from '../client';
import { createOptimizedResponse, createAorpEnabledFactory } from '../utils/response-factory';
import { Verbosity } from '../transforms/index';
import type { Project, ProjectListParams, LinkSharing, LinkShareAuth } from 'node-vikunja';
import {
  handleStatusCodeError,
  transformApiError,
  createAuthRequiredError,
  createValidationError
} from '../utils/error-handler';

/**
 * Validates that an ID is a positive integer
 */
function validateId(id: number, fieldName: string): void {
  if (id <= 0 || !Number.isInteger(id)) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, `${fieldName} must be a positive integer`);
  }
}

/**
 * Validates that a hex color is in the correct format (#RRGGBB)
 */
function validateHexColor(hexColor: string): void {
  // Validates hex color in format #RRGGBB (6 hex digits)
  if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      'Invalid hex color format. Expected format: #RRGGBB (e.g., #4287f5, #FF0000, #00ff00)',
    );
  }
}

/**
 * Maximum allowed depth for project hierarchy to prevent excessive nesting
 */
const MAX_PROJECT_DEPTH = 10;

/**
 * Helper function to create response with optional optimization and AORP support
 */
function createProjectResponse(
  operation: string,
  message: string,
  data: unknown,
  metadata: Partial<ResponseMetadata> = {},
  verbosity?: string,
  useOptimizedFormat?: boolean,
  useAorp?: boolean
): unknown {
  // Default to standard verbosity if not specified
  const selectedVerbosity = verbosity || 'standard';

  // Use optimized format if requested or if verbosity is not standard
  const shouldOptimize = useOptimizedFormat || selectedVerbosity !== 'standard';

  // Use AORP if explicitly requested
  if (useAorp) {
    const aorpFactory = createAorpEnabledFactory();
    return aorpFactory.createResponse(operation, message, data, metadata, {
      verbosity: selectedVerbosity as Verbosity,
      useOptimization: shouldOptimize,
      useAorp: true,
      aorpOptions: {
        builderConfig: {
          confidenceMethod: 'adaptive',
          enableNextSteps: true,
          enableQualityIndicators: true
        },
        nextStepsConfig: {
          maxSteps: 5,
          enableContextual: true,
          templates: {
            [`${operation}`]: [
              "Verify the project data appears correctly in listings",
              "Check related tasks and subprojects",
              "Test any automated workflows or notifications"
            ],
            'list-projects': [
              "Review the returned projects for completeness",
              "Apply filters or pagination if needed",
              "Consider sorting by priority or due date"
            ],
            'get-project': [
              "Verify all required project fields are present",
              "Check project hierarchy and relationships",
              "Review project permissions and sharing settings"
            ],
            'create-project': [
              "Verify the created project appears in listings",
              "Set up project permissions and sharing",
              "Consider creating initial tasks or milestones"
            ],
            'update-project': [
              "Confirm changes are reflected in the UI",
              "Check related data for consistency",
              "Notify team members of important changes"
            ],
            'delete-project': [
              "Verify project no longer appears in searches",
              "Check for any orphaned tasks or subprojects",
              "Update documentation and references"
            ]
          }
        },
        qualityConfig: {
          completenessWeight: 0.6,
          reliabilityWeight: 0.4,
          customIndicators: {
            projectHierarchyDepth: (data: unknown) => {
              // Simple indicator based on project depth
              const dataObj = data as { project?: { parent_project_id?: number } };
              if (dataObj?.project?.parent_project_id) return 0.8;
              return 0.9; // Root projects are slightly "more complete"
            },
            taskCountEstimate: (data: unknown) => {
              // Estimate based on project complexity
              const dataObj = data as { project?: { description?: string } };
              if (!dataObj?.project) return 0.5;
              const desc = dataObj.project.description || '';
              if (desc.length > 200) return 0.8;
              if (desc.length > 50) return 0.6;
              return 0.4;
            }
          }
        }
      }
    });
  }

  if (shouldOptimize) {
    return createOptimizedResponse(
      operation,
      message,
      data,
      metadata,
      selectedVerbosity as Verbosity
    );
  }

  return createStandardResponse(operation, message, data, metadata);
}

/**
 * Calculates the depth of a project in the hierarchy
 */
function calculateProjectDepth(projectId: number, allProjects: Project[]): number {
  let depth = 0;
  let currentId: number | undefined = projectId;
  const visitedIds = new Set<number>();

  while (currentId !== undefined) {
    if (visitedIds.has(currentId)) {
      throw new MCPError(
        ErrorCode.INTERNAL_ERROR,
        'Circular reference detected in project hierarchy',
      );
    }
    visitedIds.add(currentId);

    const project = allProjects.find((p) => p.id === currentId);
    if (!project) {
      break;
    }

    currentId = project.parent_project_id;
    if (currentId !== undefined) {
      depth++;
    }
  }

  return depth;
}

/**
 * Gets the maximum depth of a project's subtree
 */
function getMaxSubtreeDepth(projectId: number, allProjects: Project[]): number {
  function getDepth(id: number, visited: Set<number> = new Set()): number {
    if (visited.has(id)) {
      return 0;
    }
    visited.add(id);

    const children = allProjects.filter((p) => p.parent_project_id === id);
    if (children.length === 0) {
      return 0;
    }

    const childDepths = children.map((child) => {
      if (child.id) {
        return getDepth(child.id, visited);
      }
      return 0;
    });

    return 1 + Math.max(...childDepths);
  }

  return getDepth(projectId);
}

export function registerProjectsTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
  server.tool(
    'vikunja_projects',
    {
      subcommand: z.enum([
        'create',
        'get',
        'update',
        'delete',
        'list',
        'archive',
        'unarchive',
        'create-share',
        'list-shares',
        'get-share',
        'delete-share',
        'auth-share',
        'get-children',
        'get-tree',
        'get-breadcrumb',
        'move',
      ]),
      // Project fields
      id: z.number().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      parentProjectId: z.number().optional(),
      isArchived: z.boolean().optional(),
      hexColor: z.string().optional(),
      // List parameters
      page: z.number().optional(),
      perPage: z.number().optional(),
      search: z.string().optional(),
      // Share fields
      shareId: z.number().optional(),
      shareHash: z.string().optional(),
      right: z.number().optional(),
      label: z.string().optional(),
      password: z.string().optional(),
      passwordEnabled: z.boolean().optional(),
      expires: z.string().optional(),
      // Response formatting options
      verbosity: z.enum(['minimal', 'standard', 'detailed', 'complete']).optional(),
      useOptimizedFormat: z.boolean().optional(),
      useAorp: z.boolean().optional(),
    },
    async (args) => {
      try {
        // Check authentication
        if (!authManager.isAuthenticated()) {
          throw createAuthRequiredError();
        }

        const client = await getClientFromContext();

        switch (args.subcommand) {
          case 'list': {
            try {
              // Build query parameters
              const params: ProjectListParams = {};
              if (args.page !== undefined) params.page = args.page;
              if (args.perPage !== undefined) params.per_page = args.perPage;
              if (args.search !== undefined) params.s = args.search;
              if (args.isArchived !== undefined) params.is_archived = args.isArchived;

              const projects = await client.projects.getProjects(params);

              const response = createProjectResponse(
                'list-projects',
                `Retrieved ${projects.length} project${projects.length !== 1 ? 's' : ''}`,
                { projects },
                { count: projects.length, params },
                args.verbosity,
                args.useOptimizedFormat,
                args.useAorp
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw transformApiError(error, 'Failed to list projects');
            }
          }

          case 'get': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            validateId(args.id, 'id');

            try {
              const project = await client.projects.getProject(args.id);

              const response = createProjectResponse(
                'get-project',
                `Retrieved project "${project.title}"`,
                { project },
                {},
                args.verbosity,
                args.useOptimizedFormat
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw handleStatusCodeError(error, 'get project', args.id);
            }
          }

          case 'create': {
            if (!args.title) {
              throw createValidationError('Project title is required');
            }

            try {
              const projectData: Partial<Project> = {
                title: args.title,
              };
              if (args.description !== undefined) projectData.description = args.description;
              if (args.parentProjectId !== undefined) {
                validateId(args.parentProjectId, 'parentProjectId');

                // Check depth validation
                const allProjects = await client.projects.getProjects({});
                const parentDepth = calculateProjectDepth(args.parentProjectId, allProjects);

                if (parentDepth >= MAX_PROJECT_DEPTH - 1) {
                  throw createValidationError(
                    `Cannot create project at this depth. Maximum allowed depth is ${MAX_PROJECT_DEPTH} levels. Parent project is already at depth ${parentDepth + 1}.`
                  );
                }

                projectData.parent_project_id = args.parentProjectId;
              }
              if (args.isArchived !== undefined) projectData.is_archived = args.isArchived;
              if (args.hexColor !== undefined) {
                validateHexColor(args.hexColor);
                // Normalize to lowercase for consistency
                projectData.hex_color = args.hexColor.toLowerCase();
              }

              const project = await client.projects.createProject(projectData as Project);

              const response = args.useAorp
                ? createProjectResponse(
                    'create-project',
                    `Project "${project.title}" created successfully`,
                    { project },
                    { affectedFields: Object.keys(projectData) },
                    args.verbosity,
                    args.useOptimizedFormat,
                    args.useAorp
                  )
                : createStandardResponse(
                    'create-project',
                    `Project "${project.title}" created successfully`,
                    { project },
                    { affectedFields: Object.keys(projectData) },
                  );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw transformApiError(error, 'Failed to create project');
            }
          }

          case 'update': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            validateId(args.id, 'id');

            try {
              // Build update data
              const updateData: Partial<Project> = {};
              if (args.title !== undefined) updateData.title = args.title;
              if (args.description !== undefined) updateData.description = args.description;
              if (args.parentProjectId !== undefined) {
                if (args.parentProjectId !== null) {
                  validateId(args.parentProjectId, 'parentProjectId');

                  // Check depth validation
                  const allProjects = await client.projects.getProjects({});
                  const parentDepth = calculateProjectDepth(args.parentProjectId, allProjects);

                  if (parentDepth >= MAX_PROJECT_DEPTH - 1) {
                    throw createValidationError(
                      `Cannot update project to this parent. Maximum allowed depth is ${MAX_PROJECT_DEPTH} levels. Target parent is already at depth ${parentDepth + 1}.`
                    );
                  }
                }
                updateData.parent_project_id = args.parentProjectId;
              }
              if (args.isArchived !== undefined) updateData.is_archived = args.isArchived;
              if (args.hexColor !== undefined) {
                validateHexColor(args.hexColor);
                // Normalize to lowercase for consistency
                updateData.hex_color = args.hexColor.toLowerCase();
              }

              if (Object.keys(updateData).length === 0) {
                throw createValidationError('No fields to update provided');
              }

              const project = await client.projects.updateProject(args.id, updateData as Project);

              const response = createStandardResponse(
                'update-project',
                `Project "${project.title}" updated successfully`,
                { project },
                { affectedFields: Object.keys(updateData) },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw handleStatusCodeError(error, 'update project', args.id);
            }
          }

          case 'delete': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            validateId(args.id, 'id');

            try {
              const result = await client.projects.deleteProject(args.id);

              const response = createStandardResponse(
                'delete-project',
                `Project with ID ${args.id} deleted successfully`,
                { result },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw handleStatusCodeError(error, 'delete project', args.id);
            }
          }

          case 'archive': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            validateId(args.id, 'id');

            try {
              // First get the current project to check its status
              const currentProject = await client.projects.getProject(args.id);

              if (currentProject.is_archived) {
                const response = createStandardResponse(
                  'archive-project',
                  `Project "${currentProject.title}" is already archived`,
                  { project: currentProject },
                );

                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(response, null, 2),
                    },
                  ],
                };
              }

              const project = await client.projects.updateProject(args.id, {
                title: currentProject.title,
                is_archived: true,
              } as Project);

              const response = createStandardResponse(
                'archive-project',
                `Project "${project.title}" archived successfully`,
                { project },
                { affectedFields: ['is_archived'] },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw handleStatusCodeError(error, 'archive project', args.id);
            }
          }

          case 'unarchive': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            validateId(args.id, 'id');

            try {
              // First get the current project to check its status
              const currentProject = await client.projects.getProject(args.id);

              if (!currentProject.is_archived) {
                const response = createStandardResponse(
                  'unarchive-project',
                  `Project "${currentProject.title}" is already active (not archived)`,
                  { project: currentProject },
                );

                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(response, null, 2),
                    },
                  ],
                };
              }

              const project = await client.projects.updateProject(args.id, {
                title: currentProject.title,
                is_archived: false,
              } as Project);

              const response = createStandardResponse(
                'unarchive-project',
                `Project "${project.title}" unarchived successfully`,
                { project },
                { affectedFields: ['is_archived'] },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw handleStatusCodeError(error, 'unarchive project', args.id);
            }
          }

          case 'create-share': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            validateId(args.id, 'id');

            try {
              // Build share data
              const shareData: Partial<LinkSharing> = {
                project_id: args.id,
              };

              // Set permission level (default to read-only)
              if (args.right !== undefined) {
                if (args.right < 0 || args.right > 2) {
                  throw createValidationError('Invalid permission level. Use: 0=Read, 1=Write, 2=Admin');
                }
                shareData.right = args.right;
              } else {
                shareData.right = 0; // Default to read-only
              }

              if (args.label !== undefined) shareData.label = args.label;
              if (args.passwordEnabled !== undefined)
                shareData.password_enabled = args.passwordEnabled;
              if (args.password !== undefined) {
                shareData.password = args.password;
                shareData.password_enabled = true;
              }
              if (args.expires !== undefined) shareData.expires = args.expires;

              const share = await client.projects.createLinkShare(args.id, shareData);

              const response = createStandardResponse(
                'create-project-share',
                `Share created successfully for project ID ${args.id}`,
                { share },
                { projectId: args.id },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
                throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${args.id} not found`);
              }
              throw transformApiError(error, 'Failed to create share');
            }
          }

          case 'list-shares': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            validateId(args.id, 'id');

            try {
              const params: { page?: number; per_page?: number } = {};
              if (args.page !== undefined) params.page = args.page;
              if (args.perPage !== undefined) params.per_page = args.perPage;

              const shares = await client.projects.getLinkShares(args.id, params);

              const response = createStandardResponse(
                'list-project-shares',
                `Retrieved ${shares.length} share${shares.length !== 1 ? 's' : ''} for project ID ${args.id}`,
                { shares },
                { count: shares.length, projectId: args.id, params },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
                throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${args.id} not found`);
              }
              throw transformApiError(error, 'Failed to list shares');
            }
          }

          case 'get-share': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            if (args.shareId === undefined) {
              throw createValidationError('Share ID is required');
            }

            validateId(args.id, 'id');
            validateId(args.shareId, 'shareId');

            try {
              const share = await client.projects.getLinkShare(args.id, args.shareId);

              const response = createStandardResponse(
                'get-project-share',
                `Retrieved share ID ${args.shareId} for project ID ${args.id}`,
                { share },
                { projectId: args.id, shareId: args.shareId },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw handleStatusCodeError(
                error, 
                'get share', 
                args.shareId, 
                `Share with ID ${args.shareId} not found for project ${args.id}`
              );
            }
          }

          case 'delete-share': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            if (args.shareId === undefined) {
              throw createValidationError('Share ID is required');
            }

            validateId(args.id, 'id');
            validateId(args.shareId, 'shareId');

            try {
              const result = await client.projects.deleteLinkShare(args.id, args.shareId);

              const response = createStandardResponse(
                'delete-project-share',
                `Share with ID ${args.shareId} deleted successfully`,
                { result },
                { projectId: args.id, shareId: args.shareId },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw handleStatusCodeError(
                error, 
                'delete share', 
                args.shareId, 
                `Share with ID ${args.shareId} not found for project ${args.id}`
              );
            }
          }

          case 'auth-share': {
            if (!args.shareHash) {
              throw createValidationError('Share hash is required');
            }

            try {
              // Build auth data
              const authData: LinkShareAuth = {
                password: args.password || '',
              };

              const authResult = await client.shares.getShareAuth(args.shareHash, authData);

              const response = createStandardResponse(
                'auth-project-share',
                'Successfully authenticated to share',
                { auth: authResult },
                {
                  shareHash: args.shareHash,
                  note: 'Use the returned token to access the shared project',
                },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              // Handle specific auth-share error cases
              if (error && typeof error === 'object' && 'statusCode' in error) {
                if (error.statusCode === 401) {
                  throw new MCPError(ErrorCode.AUTH_REQUIRED, 'Invalid password for share');
                }
                if (error.statusCode === 404) {
                  throw new MCPError(
                    ErrorCode.NOT_FOUND,
                    `Share with hash ${args.shareHash} not found`
                  );
                }
              }
              throw transformApiError(error, 'Failed to authenticate to share');
            }
          }

          case 'get-children': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            validateId(args.id, 'id');

            try {
              // Get all projects and filter for children of the specified project
              const allProjects = await client.projects.getProjects({});
              const children = allProjects.filter(
                (project) => project.parent_project_id === args.id,
              );

              const response = createStandardResponse(
                'get-project-children',
                `Found ${children.length} child project${children.length !== 1 ? 's' : ''} for project ID ${args.id}`,
                { children },
                { parentId: args.id, count: children.length },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw transformApiError(error, 'Failed to get project children');
            }
          }

          case 'get-tree': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            validateId(args.id, 'id');

            try {
              // Get all projects once
              const allProjects = await client.projects.getProjects({});

              interface ProjectTreeNode extends Project {
                children: ProjectTreeNode[];
              }

              // Helper function to build project tree recursively
              const buildProjectTree = (
                projectId: number,
                visitedIds: Set<number> = new Set(),
              ): ProjectTreeNode | null => {
                // Prevent infinite loops from circular references
                if (visitedIds.has(projectId)) {
                  return null;
                }
                visitedIds.add(projectId);

                const project = allProjects.find((p) => p.id === projectId);
                if (!project) {
                  return null;
                }

                const children = allProjects
                  .filter((p) => p.parent_project_id === projectId)
                  .map((child) =>
                    child.id ? buildProjectTree(child.id, new Set(visitedIds)) : null,
                  )
                  .filter((child): child is ProjectTreeNode => child !== null);

                return {
                  ...project,
                  children: children.length > 0 ? children : [],
                };
              };

              const tree = buildProjectTree(args.id);

              if (!tree) {
                throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${args.id} not found`);
              }

              // Count total projects in tree
              const countProjects = (node: ProjectTreeNode): number => {
                return (
                  1 +
                  node.children.reduce(
                    (sum: number, child: ProjectTreeNode) => sum + countProjects(child),
                    0,
                  )
                );
              };

              const totalCount = countProjects(tree);

              const response = createStandardResponse(
                'get-project-tree',
                `Retrieved project tree with ${totalCount} project${totalCount !== 1 ? 's' : ''} starting from project ID ${args.id}`,
                { tree },
                { rootId: args.id, totalProjects: totalCount },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw transformApiError(error, 'Failed to get project tree');
            }
          }

          case 'get-breadcrumb': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            validateId(args.id, 'id');

            try {
              // Get all projects once
              const allProjects = await client.projects.getProjects({});

              // Build breadcrumb path from project to root
              const breadcrumb: Project[] = [];
              let currentId: number | undefined = args.id;
              const visitedIds = new Set<number>();

              while (currentId !== undefined) {
                // Prevent infinite loops
                if (visitedIds.has(currentId)) {
                  throw new MCPError(
                    ErrorCode.INTERNAL_ERROR,
                    'Circular reference detected in project hierarchy',
                  );
                }
                visitedIds.add(currentId);

                const project = allProjects.find((p) => p.id === currentId);
                if (!project) {
                  if (breadcrumb.length === 0) {
                    throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${args.id} not found`);
                  }
                  break;
                }

                breadcrumb.unshift(project); // Add to beginning to maintain root-to-leaf order
                currentId = project.parent_project_id;
              }

              const response = createStandardResponse(
                'get-project-breadcrumb',
                `Retrieved breadcrumb path with ${breadcrumb.length} project${breadcrumb.length !== 1 ? 's' : ''} from root to project ID ${args.id}`,
                { breadcrumb },
                {
                  targetId: args.id,
                  depth: breadcrumb.length,
                  path: breadcrumb.map((p) => p.title).join(' > '),
                },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw transformApiError(error, 'Failed to get project breadcrumb');
            }
          }

          case 'move': {
            if (args.id === undefined) {
              throw createValidationError('Project ID is required');
            }

            validateId(args.id, 'id');

            // parentProjectId can be undefined (to move to root) or a valid ID
            if (args.parentProjectId !== undefined) {
              validateId(args.parentProjectId, 'parentProjectId');
            }

            try {
              // Get all projects to check for cycles
              const allProjects = await client.projects.getProjects({});

              // Check if the project exists
              const projectToMove = allProjects.find((p) => p.id === args.id);
              if (!projectToMove) {
                throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${args.id} not found`);
              }

              // Check if the new parent is a descendant of the project being moved
              const isDescendant = (ancestorId: number, targetId: number): boolean => {
                // Get all descendants of ancestorId
                const descendants = new Set<number>();
                const queue = [ancestorId];

                while (queue.length > 0) {
                  const currentId = queue.shift();
                  if (currentId === undefined) {
                    continue;
                  }
                  const children = allProjects.filter((p) => p.parent_project_id === currentId);

                  for (const child of children) {
                    if (child.id) {
                      if (child.id === targetId) {
                        return true;
                      }
                      if (!descendants.has(child.id)) {
                        descendants.add(child.id);
                        queue.push(child.id);
                      }
                    }
                  }
                }

                return false;
              };

              // Check if new parent exists (if specified)
              if (args.parentProjectId !== undefined) {
                const newParent = allProjects.find((p) => p.id === args.parentProjectId);
                if (!newParent) {
                  throw new MCPError(
                    ErrorCode.NOT_FOUND,
                    `Parent project with ID ${args.parentProjectId} not found`
                  );
                }

                // Check for circular reference
                // A project cannot be its own parent
                if (args.id === args.parentProjectId) {
                  throw createValidationError('A project cannot be its own parent');
                }

                if (isDescendant(args.id, args.parentProjectId)) {
                  throw createValidationError(
                    'Cannot move a project to one of its descendants (would create a circular reference)'
                  );
                }

                // Check depth validation
                const parentDepth = calculateProjectDepth(args.parentProjectId, allProjects);
                const projectSubtreeDepth = getMaxSubtreeDepth(args.id, allProjects);

                if (parentDepth + projectSubtreeDepth + 1 > MAX_PROJECT_DEPTH) {
                  throw createValidationError(
                    `Cannot move project to this location. The resulting hierarchy would exceed the maximum depth of ${MAX_PROJECT_DEPTH} levels. ` +
                      `Parent is at depth ${parentDepth + 1}, and the project's subtree has depth ${projectSubtreeDepth + 1}.`
                  );
                }
              }

              // Perform the move
              const updatedProject = await client.projects.updateProject(args.id, {
                parent_project_id: args.parentProjectId,
              } as Project);

              const response = createStandardResponse(
                'move-project',
                args.parentProjectId !== undefined
                  ? `Project "${updatedProject.title}" moved to parent project ID ${args.parentProjectId}`
                  : `Project "${updatedProject.title}" moved to root level`,
                { project: updatedProject },
                {
                  previousParentId: projectToMove.parent_project_id,
                  newParentId: args.parentProjectId,
                  affectedFields: ['parent_project_id'],
                },
              );

              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                  },
                ],
              };
            } catch (error) {
              throw transformApiError(error, 'Failed to move project');
            }
          }

          default:
            throw createValidationError(`Invalid subcommand: ${args.subcommand as string}`);
        }
      } catch (error) {
        if (error instanceof MCPError) {
          throw error;
        }
        throw new MCPError(
          ErrorCode.INTERNAL_ERROR,
          `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  );
}
