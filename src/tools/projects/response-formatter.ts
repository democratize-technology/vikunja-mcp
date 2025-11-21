/**
 * Project Response Formatter Module
 * Handles AORP response creation and formatting for project operations
 */

import { createAorpResponse } from '../../utils/response-factory';
import type { ResponseMetadata } from '../../types/responses';
import type { Verbosity } from '../../transforms/index';
import type { AorpFactoryOptions, AorpFactoryResult } from '../../aorp/types';

/**
 * Creates an AORP response for project operations
 */
export function createProjectResponse(
  operation: string,
  message: string,
  data: unknown,
  metadata: Partial<ResponseMetadata> = {},
  verbosity?: string,
  _useOptimizedFormat?: boolean,
  _useAorp?: boolean
): AorpFactoryResult {
  // Default to standard verbosity if not specified
  const selectedVerbosity = verbosity || 'standard';

  // Always use AORP response format
  return createAorpResponse(operation, message, data, metadata, {
    verbosity: selectedVerbosity as Verbosity,
    aorpOptions: {
      builderConfig: {
        confidenceMethod: 'adaptive', // Next steps and quality indicators are always enabled
      },
      nextStepsConfig: {
        maxSteps: 5, // Contextual next steps are always enabled
        templates: {
          [operation]: [
            "Verify the project data appears correctly in listings",
            "Check related project dependencies and hierarchies",
            "Review project permissions and sharing settings"
          ]
        }
      }
    }
  });
}

/**
 * Creates a success response for project operations
 */
export function createProjectSuccessResponse(
  operation: string,
  data: unknown,
  options: {
    message?: string;
    verbosity?: string;
    useOptimizedFormat?: boolean;
    useAorp?: boolean;
    metadata?: Partial<ResponseMetadata>;
  } = {}
): AorpFactoryResult {
  const {
    message = `${operation} operation completed successfully`,
    verbosity,
    useOptimizedFormat,
    useAorp,
    metadata = {}
  } = options;

  return createProjectResponse(
    operation,
    message,
    data,
    metadata,
    verbosity,
    useOptimizedFormat,
    useAorp
  );
}

/**
 * Creates a project list response with pagination metadata
 */
export function createProjectListResponse(
  projects: unknown[],
  currentPage: number,
  totalPages: number,
  totalItems: number,
  options: {
    verbosity?: string;
    useOptimizedFormat?: boolean;
    useAorp?: boolean;
  } = {}
): AorpFactoryResult {
  const metadata: Partial<ResponseMetadata> = {
    pagination: {
      page: currentPage,
      totalPages,
      totalItems,
      hasMore: currentPage < totalPages,
      nextPage: currentPage < totalPages ? currentPage + 1 : undefined,
      prevPage: currentPage > 1 ? currentPage - 1 : undefined,
    },
  };

  const projectWord = projects.length === 1 ? 'project' : 'projects';
  const message = `Retrieved ${projects.length} ${projectWord}`;

  return createProjectSuccessResponse(
    'list_projects',
    projects,
    {
      message,
      ...options,
      metadata
    }
  );
}

/**
 * Creates a project tree response with hierarchy metadata
 */
export function createProjectTreeResponse(
  treeData: unknown,
  depth: number,
  totalNodes: number,
  options: {
    verbosity?: string;
    useOptimizedFormat?: boolean;
    useAorp?: boolean;
  } = {}
): AorpFactoryResult {
  const metadata: Partial<ResponseMetadata> = {
    hierarchy: {
      depth,
      totalNodes,
      maxDepth: 10, // From MAX_PROJECT_DEPTH
    },
    totalProjects: totalNodes,
  };

  const tree = treeData as any;
  return createProjectSuccessResponse(
    'get-project-tree',
    { tree: tree.length === 1 ? tree[0] : tree },
    {
      message: `Retrieved project tree with ${totalNodes} nodes at depth ${depth}`,
      ...options,
      metadata
    }
  );
}

/**
 * Creates a breadcrumb response for project hierarchy navigation
 */
export function createBreadcrumbResponse(
  breadcrumb: unknown[],
  options: {
    verbosity?: string;
    useOptimizedFormat?: boolean;
    useAorp?: boolean;
  } = {}
): AorpFactoryResult {
  const metadata: Partial<ResponseMetadata> = {
    navigation: {
      breadcrumbLength: breadcrumb.length,
      hasPath: breadcrumb.length > 0,
    },
    path: (breadcrumb as any[]).map((p: any) => p.title).join(' > ') || 'Root',
    depth: breadcrumb.length,
  };

  return createProjectSuccessResponse(
    'get-project-breadcrumb',
    { breadcrumb },
    {
      message: `Retrieved breadcrumb path with ${breadcrumb.length} items`,
      ...options,
      metadata
    }
  );
}