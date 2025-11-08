/**
 * Project Hierarchy Operations Module
 * Handles complex hierarchical operations like tree building, breadcrumbs, and moves
 */

import type { Project } from 'node-vikunja';
import { MCPError, ErrorCode } from '../../types/index';
import { getClientFromContext } from '../../client';
import { transformApiError } from '../../utils/error-handler';
import { validateId, validateMoveConstraints } from './validation';
import { createProjectResponse, createProjectTreeResponse, createBreadcrumbResponse } from './response-formatter';

/**
 * Arguments for getting project children
 */
export interface GetChildrenArgs {
  id: number;
  includeArchived?: boolean;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Arguments for getting project tree
 */
export interface GetTreeArgs {
  id?: number;
  maxDepth?: number;
  includeArchived?: boolean;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Arguments for getting project breadcrumb
 */
export interface GetBreadcrumbArgs {
  id: number;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Arguments for moving a project
 */
export interface MoveProjectArgs {
  id: number;
  parentProjectId?: number;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Project tree node interface
 */
interface ProjectTreeNode extends Project {
  children: ProjectTreeNode[];
  depth: number;
}

/**
 * Gets direct children of a project
 */
export async function getProjectChildren(
  args: GetChildrenArgs,
  context: any
): Promise<unknown> {
  const { id, includeArchived = false, verbosity, useOptimizedFormat, useAorp } = args;

  try {
    validateId(id, 'project id');

    const client = await getClientFromContext();

    // Verify the project exists
    await client.projects.getProject(id);

    // Get all projects and filter for children
    const allProjects = await client.projects.getProjects({ per_page: 1000 });
    let children = allProjects.filter((p: any) => p.parent_project_id === id);

    if (!includeArchived) {
      children = children.filter((p: any) => !p.is_archived);
    }

    const response = createProjectResponse(
      'get-project-children',
      `Found ${children.length} child projects for project ID ${id}`,
      { children },
      { parentId: id, count: children.length },
      verbosity,
      useOptimizedFormat,
      useAorp
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        }
      ]
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw transformApiError(error, 'Failed to get project children');
  }
}

/**
 * Builds a complete project tree
 */
export async function getProjectTree(
  args: GetTreeArgs,
  context: any
): Promise<unknown> {
  const { id, maxDepth = 10, includeArchived = false, verbosity, useOptimizedFormat, useAorp } = args;

  // Validate that project ID is provided for tree operations
  if (!id) {
    throw new MCPError(ErrorCode.VALIDATION_ERROR, 'Project ID is required');
  }

  try {
    const client = await getClientFromContext();

    // Get all projects
    const allProjects = await client.projects.getProjects({ per_page: 1000 });

    const rootProjects = allProjects.filter((p: any) => !p.parent_project_id);

    // If specific ID is provided, find that project and its subtree
    let rootNode: ProjectTreeNode | undefined;
    let treeData: ProjectTreeNode[];
    let totalNodes = 0;
    let actualDepth = 0;

    if (id) {
      validateId(id, 'project id');
      const rootProject = allProjects.find((p: any) => p.id === id);
      if (!rootProject) {
        throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${id} not found`);
      }

      rootNode = buildProjectTree(rootProject, allProjects, 0, maxDepth, includeArchived) || undefined;
      treeData = [rootNode!];
      totalNodes = countTreeNodes(rootNode!);
      actualDepth = getTreeDepth(rootNode!);
    } else {
      // Build forest of all root projects
      treeData = rootProjects
        .map((project: any) => buildProjectTree(project, allProjects, 0, maxDepth, includeArchived))
        .filter(Boolean) as ProjectTreeNode[];

      totalNodes = treeData.reduce((sum, node) => sum + countTreeNodes(node), 0);
      actualDepth = treeData.reduce((max, node) => Math.max(max, getTreeDepth(node)), 0);
    }

    // Build options object, only including defined properties to satisfy exactOptionalPropertyTypes
    const options1: { verbosity?: string; useOptimizedFormat?: boolean; useAorp?: boolean } = {};

    if (verbosity !== undefined) {
      options1.verbosity = verbosity;
    }

    if (useOptimizedFormat !== undefined) {
      options1.useOptimizedFormat = useOptimizedFormat;
    }

    if (useAorp !== undefined) {
      options1.useAorp = useAorp;
    }

    // Custom message to match test expectations
    const customMessage = id
      ? `Retrieved project tree with ${totalNodes} projects starting from project ID ${id}`
      : `Retrieved project tree with ${totalNodes} projects`;

    const result = createProjectTreeResponse(
      treeData,
      actualDepth,
      totalNodes,
      {
        ...options1,
        message: customMessage
      }
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }
      ]
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw transformApiError(error, 'Failed to get project tree');
  }
}

/**
 * Gets breadcrumb path from root to specified project
 */
export async function getProjectBreadcrumb(
  args: GetBreadcrumbArgs,
  context: any
): Promise<unknown> {
  const { id, verbosity, useOptimizedFormat, useAorp } = args;

  try {
    validateId(id, 'project id');

    const client = await getClientFromContext();

    // Get all projects for navigation
    const allProjects = await client.projects.getProjects({ per_page: 1000 });
    const targetProject = allProjects.find((p: any) => p.id === id);

    if (!targetProject) {
      throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${id} not found`);
    }

    const breadcrumb = buildBreadcrumb(id, allProjects);

    // Build options object, only including defined properties to satisfy exactOptionalPropertyTypes
    const options2: { verbosity?: string; useOptimizedFormat?: boolean; useAorp?: boolean } = {};

    if (verbosity !== undefined) {
      options2.verbosity = verbosity;
    }

    if (useOptimizedFormat !== undefined) {
      options2.useOptimizedFormat = useOptimizedFormat;
    }

    if (useAorp !== undefined) {
      options2.useAorp = useAorp;
    }

    // Custom message to match test expectations
    const customBreadcrumbMessage = `Retrieved breadcrumb path with ${breadcrumb.length} projects from root to project ID ${id}`;

    const result = createBreadcrumbResponse(
      breadcrumb,
      {
        ...options2,
        message: customBreadcrumbMessage
      }
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }
      ]
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw transformApiError(error, 'Failed to get project breadcrumb');
  }
}

/**
 * Moves a project to a new parent
 */
export async function moveProject(
  args: MoveProjectArgs,
  context: any
): Promise<unknown> {
  const { id, parentProjectId, verbosity, useOptimizedFormat, useAorp } = args;

  try {
    validateId(id, 'project id');

    const client = await getClientFromContext();

    // Get current project
    const currentProject = await client.projects.getProject(id);

    if (!currentProject) {
      throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${id} not found`);
    }

    // Get all projects for validation
    const allProjects = await client.projects.getProjects({ per_page: 1000 });

    // Validate move constraints
    validateMoveConstraints(id, parentProjectId, allProjects);

    // If parent is specified, validate it exists
    if (parentProjectId) {
      const parentProject = allProjects.find((p: any) => p.id === parentProjectId);
      if (!parentProject) {
        throw new MCPError(ErrorCode.NOT_FOUND, `Parent project with ID ${parentProjectId} not found`);
      }
    }

    // Perform the move
    const updateData: any = {};
    if (parentProjectId !== undefined) {
      updateData.parent_project_id = parentProjectId;
    }
    const updatedProject = await client.projects.updateProject(id, updateData);

    const parentInfo = parentProjectId
      ? ` to parent project ${parentProjectId}`
      : ' to root level';

    const result = createProjectResponse(
      'move_project',
      `Moved project "${updatedProject.title}"${parentInfo}`,
      updatedProject,
      {
        oldParentProjectId: currentProject.parent_project_id,
        newParentProjectId: parentProjectId,
        movedProjectId: id
      },
      verbosity,
      useOptimizedFormat,
      useAorp
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }
      ]
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw transformApiError(error, 'Failed to move project');
  }
}

/**
 * Builds a project tree recursively
 */
function buildProjectTree(
  project: Project,
  allProjects: Project[],
  currentDepth: number,
  maxDepth: number,
  includeArchived: boolean = false
): ProjectTreeNode | null {
  if (currentDepth >= maxDepth) {
    return null;
  }

  const children = allProjects
    .filter((p: any) => p.parent_project_id === project.id)
    .filter((p: any) => includeArchived || !p.is_archived)
    .map((child: any) =>
      buildProjectTree(child, allProjects, currentDepth + 1, maxDepth, includeArchived)
    )
    .filter(Boolean) as ProjectTreeNode[];

  return {
    ...project,
    children,
    depth: currentDepth,
  };
}

/**
 * Counts total nodes in a tree
 */
function countTreeNodes(node: ProjectTreeNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countTreeNodes(child), 0);
}

/**
 * Gets the maximum depth of a tree
 */
function getTreeDepth(node: ProjectTreeNode): number {
  if (node.children.length === 0) {
    return node.depth;
  }
  return Math.max(...node.children.map(child => getTreeDepth(child)));
}

/**
 * Builds breadcrumb path from root to target project
 */
function buildBreadcrumb(targetId: number, allProjects: Project[]): Project[] {
  const breadcrumb: Project[] = [];
  const visited = new Set<number>();
  let currentId: number | undefined = targetId;

  while (currentId !== undefined) {
    if (visited.has(currentId)) {
      throw new MCPError(
        ErrorCode.INTERNAL_ERROR,
        'Circular reference detected in project hierarchy while building breadcrumb'
      );
    }

    const project = allProjects.find((p: any) => p.id === currentId);
    if (!project) {
      break;
    }

    visited.add(currentId);
    breadcrumb.unshift(project);
    currentId = project.parent_project_id;
  }

  return breadcrumb;
}