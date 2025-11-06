/**
 * Project Response Formatter Module
 * Handles response creation and formatting for project operations
 */

import { createStandardResponse } from '../../types/index';
import { createOptimizedResponse } from '../../utils/response-factory';
import type { ResponseMetadata } from '../../types/responses';
import type { Verbosity } from '../../transforms/index';

/**
 * Creates a standardized response for project operations with optional optimization
 */
export function createProjectResponse(
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
): unknown {
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
): unknown {
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

  return createProjectSuccessResponse(
    'list_projects',
    projects,
    {
      message: `Retrieved ${projects.length} projects`,
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
): unknown {
  const metadata: Partial<ResponseMetadata> = {
    hierarchy: {
      depth,
      totalNodes,
      maxDepth: 10, // From MAX_PROJECT_DEPTH
    },
  };

  return createProjectSuccessResponse(
    'get_project_tree',
    treeData,
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
): unknown {
  const metadata: Partial<ResponseMetadata> = {
    navigation: {
      breadcrumbLength: breadcrumb.length,
      hasPath: breadcrumb.length > 0,
    },
  };

  return createProjectSuccessResponse(
    'get_project_breadcrumb',
    breadcrumb,
    {
      message: `Retrieved breadcrumb path with ${breadcrumb.length} items`,
      ...options,
      metadata
    }
  );
}