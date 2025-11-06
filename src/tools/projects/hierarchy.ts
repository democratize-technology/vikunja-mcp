/**
 * Project Hierarchy Operations Module
 * Handles complex hierarchical operations like tree building, breadcrumbs, and moves
 */

import type { Project } from 'node-vikunja';
import { MCPError, ErrorCode } from '../../types/index';
import { getClientFromContext } from '../../client';
import { transformApiError } from '../../utils/error-handler';
import { validateId, validateMoveConstraints, getMaxSubtreeDepth } from './validation';
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

    const client = await getClientFromContext(context);

    // Verify the project exists
    await client.getProject(id);

    // Get all projects and filter for children
    const allProjects = await client.getProjects({ per_page: 1000 });
    let children = allProjects.filter((p) => p.parentProjectId === id);

    if (!includeArchived) {
      children = children.filter((p) => !p.isArchived);
    }

    const response = createProjectResponse(
      'get-project-children',
      `Found ${children.length} child projects for project ID ${id}`,
      children,
      { parentProjectId: id, childCount: children.length },
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
    throw transformApiError(error);
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

  try {
    const client = await getClientFromContext(context);

    // Get all projects
    const allProjects = await client.getProjects({ per_page: 1000 });

    let rootProjects = allProjects.filter((p) => !p.parentProjectId);

    // If specific ID is provided, find that project and its subtree
    let rootNode: ProjectTreeNode | undefined;
    let treeData: ProjectTreeNode[];
    let totalNodes = 0;
    let actualDepth = 0;

    if (id) {
      validateId(id, 'project id');
      const rootProject = allProjects.find((p) => p.id === id);
      if (!rootProject) {
        throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${id} not found`);
      }

      rootNode = buildProjectTree(rootProject, allProjects, 0, maxDepth, includeArchived);
      treeData = [rootNode];
      totalNodes = countTreeNodes(rootNode);
      actualDepth = getTreeDepth(rootNode);
    } else {
      // Build forest of all root projects
      treeData = rootProjects
        .map(project => buildProjectTree(project, allProjects, 0, maxDepth, includeArchived))
        .filter(Boolean) as ProjectTreeNode[];

      totalNodes = treeData.reduce((sum, node) => sum + countTreeNodes(node), 0);
      actualDepth = treeData.reduce((max, node) => Math.max(max, getTreeDepth(node)), 0);
    }

    const result = createProjectTreeResponse(
      treeData,
      actualDepth,
      totalNodes,
      { verbosity, useOptimizedFormat, useAorp }
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
    throw transformApiError(error);
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

    const client = await getClientFromContext(context);

    // Get all projects for navigation
    const allProjects = await client.getProjects({ per_page: 1000 });
    const targetProject = allProjects.find((p) => p.id === id);

    if (!targetProject) {
      throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${id} not found`);
    }

    const breadcrumb = buildBreadcrumb(id, allProjects);

    const result = createBreadcrumbResponse(
      breadcrumb,
      { verbosity, useOptimizedFormat, useAorp }
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
    throw transformApiError(error);
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

    const client = await getClientFromContext(context);

    // Get current project
    const currentProject = await client.getProject(id);

    // Get all projects for validation
    const allProjects = await client.getProjects({ per_page: 1000 });

    // Validate move constraints
    validateMoveConstraints(id, parentProjectId, allProjects);

    // If parent is specified, validate it exists
    if (parentProjectId) {
      const parentProject = allProjects.find((p) => p.id === parentProjectId);
      if (!parentProject) {
        throw new MCPError(ErrorCode.NOT_FOUND, `Parent project with ID ${parentProjectId} not found`);
      }
    }

    // Perform the move
    const updatedProject = await client.updateProject(id, {
      parent_project_id: parentProjectId
    });

    const parentInfo = parentProjectId
      ? ` to parent project ${parentProjectId}`
      : ' to root level';

    const result = createProjectResponse(
      'move_project',
      `Moved project "${updatedProject.title}"${parentInfo}`,
      updatedProject,
      {
        oldParentProjectId: currentProject.parentProjectId,
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
    throw transformApiError(error);
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
    .filter((p) => p.parentProjectId === project.id)
    .filter((p) => includeArchived || !p.isArchived)
    .map((child) =>
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

    const project = allProjects.find((p) => p.id === currentId);
    if (!project) {
      break;
    }

    visited.add(currentId);
    breadcrumb.unshift(project);
    currentId = project.parentProjectId;
  }

  return breadcrumb;
}