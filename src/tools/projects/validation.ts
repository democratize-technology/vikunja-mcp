/**
 * Project Validation Module
 * Handles all validation logic for project operations
 */

import { MCPError, ErrorCode } from '../../types';
import type { Project } from 'node-vikunja';
import { validateId as validateSharedId } from '../../utils/validation';

/**
 * Maximum allowed depth for project hierarchy to prevent excessive nesting
 */
export const MAX_PROJECT_DEPTH = 10;

/**
 * Validates that an ID is a positive integer
 */
export const validateId = validateSharedId;

/**
 * Validates that a hex color is in the correct format (#RRGGBB)
 */
export function validateHexColor(hexColor: string): void {
  // Validates hex color in format #RRGGBB (6 hex digits)
  if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      'Invalid hex color format. Expected format: #RRGGBB (e.g., #4287f5, #FF0000, #00ff00)',
    );
  }
}

/**
 * Calculates the depth of a project in the hierarchy
 */
export function calculateProjectDepth(projectId: number, allProjects: Project[]): number {
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

    currentId = typeof project.parent_project_id === 'number' ? project.parent_project_id : undefined;
    depth++;
  }

  return depth;
}

/**
 * Gets the maximum depth of a project's subtree
 */
export function getMaxSubtreeDepth(projectId: number, allProjects: Project[]): number {
  const visited = new Set<number>();

  function dfs(currentId: number, currentDepth: number): number {
    if (visited.has(currentId)) {
      throw new MCPError(
        ErrorCode.INTERNAL_ERROR,
        'Circular reference detected in project hierarchy',
      );
    }

    if (currentDepth > MAX_PROJECT_DEPTH) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Project hierarchy depth exceeds maximum allowed depth of ${MAX_PROJECT_DEPTH}`,
      );
    }

    visited.add(currentId);
    let maxDepth = currentDepth;

    const children = allProjects.filter((p) => p.parent_project_id === currentId);
    for (const child of children) {
      if (child.id === undefined) {
        continue; // Skip children without valid IDs
      }
      const childDepth = dfs(child.id, currentDepth + 1);
      maxDepth = Math.max(maxDepth, childDepth);
    }

    return maxDepth;
  }

  return dfs(projectId, 0);
}

/**
 * Validates move constraints for a project
 */
export function validateMoveConstraints(
  projectId: number,
  newParentId: number | undefined,
  allProjects: Project[]
): void {
  if (newParentId === projectId) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      'Cannot move a project to be its own parent',
    );
  }

  // Check if moving would create a circular reference
  const updatedProjects = allProjects.map((p) =>
    p.id === projectId ? { ...p, parent_project_id: newParentId } : p
  ) as Project[];

  try {
    getMaxSubtreeDepth(projectId, updatedProjects);
  } catch (error) {
    if (error instanceof MCPError && error.code === ErrorCode.INTERNAL_ERROR) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Move would create a circular reference in project hierarchy',
      );
    }
    throw error;
  }
}

/**
 * Validates project create/update data
 */
export function validateProjectData(data: {
  title?: string;
  hexColor?: string;
  parentProjectId?: number;
}, allProjects?: Project[]): void {
  if (data.title !== undefined) {
    if (typeof data.title !== 'string' || data.title.trim().length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Project title must be a non-empty string',
      );
    }

    if (data.title.length > 250) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Project title must not exceed 250 characters',
      );
    }
  }

  if (data.hexColor !== undefined) {
    validateHexColor(data.hexColor);
  }

  if (data.parentProjectId !== undefined && allProjects) {
    validateId(data.parentProjectId, 'parentProjectId');

    const parentProject = allProjects.find((p) => p.id === data.parentProjectId);
    if (!parentProject) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        `Parent project with ID ${data.parentProjectId} not found`,
      );
    }
  }
}