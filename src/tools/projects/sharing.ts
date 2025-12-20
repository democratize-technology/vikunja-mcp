/**
 * Project Link Sharing Module
 * Handles link sharing operations for projects
 */

import type { LinkSharing } from 'node-vikunja';
import { MCPError, ErrorCode, type CreateShareRequest } from '../../types';
import { getClientFromContext } from '../../client';
import { transformApiError } from '../../utils/error-handler';
import { validateId } from './validation';
import { createProjectResponse } from './response-formatter';
import { formatAorpAsMarkdown } from '../../utils/response-factory';

// MCP response type
type McpResponse = {
  content: Array<{
    type: 'text';
    text: string;
  }>;
};

/**
 * Arguments for creating a project share
 */
export interface CreateShareArgs {
  projectId: number;
  right: 'read' | 'write' | 'admin' | 0 | 1 | 2;
  label?: string;
  password?: string;
  passwordEnabled?: boolean;
  expires?: string;
  shares?: number; // For public links
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Arguments for listing project shares
 */
export interface ListSharesArgs {
  projectId: number;
  page?: number;
  perPage?: number;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Arguments for getting a project share
 */
export interface GetShareArgs {
  shareId: string;
  projectId: number;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Arguments for deleting a project share
 */
export interface DeleteShareArgs {
  shareId: string;
  projectId: number;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Arguments for authenticating a project share
 */
export interface AuthShareArgs {
  shareHash: string;
  projectId?: number;
  password?: string;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Creates a new link share for a project
 */
export async function createProjectShare(
  args: CreateShareArgs
): Promise<McpResponse> {
  const {
    projectId,
    right,
    label,
    password,
    passwordEnabled,
    expires,
    shares,
    verbosity,
    useOptimizedFormat,
    useAorp
  } = args;

  try {
    validateId(projectId, 'project id');

    // Convert string rights to numeric rights for API
    let numericRight: number;
    if (right === undefined) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Share right is required'
      );
    } else if (typeof right === 'string') {
      const rightMap: Record<string, number> = { 'read': 0, 'write': 1, 'admin': 2 };
      const normalizedRight = right.trim().toLowerCase();

      if (!(normalizedRight in rightMap)) {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'Share right must be one of: read, write, admin'
        );
      }
      numericRight = rightMap[normalizedRight];
    } else if (typeof right === 'number') {
      if (![0, 1, 2].includes(right)) {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'Invalid permission level. Use: 0=Read, 1=Write, 2=Admin'
        );
      }
      numericRight = right;
    } else {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Share right must be a string or number'
      );
    }

    const client = await getClientFromContext();

    // Verify the project exists
    await client.projects.getProject(projectId);

    const shareData: CreateShareRequest = {
      project_id: projectId,
      right: numericRight,
    };

    if (label !== undefined) {
      shareData.label = label.trim();
    }

    if (password !== undefined) {
      shareData.password = password;
      // Automatically enable password when password is provided
      if (passwordEnabled === undefined) {
        shareData.password_enabled = true;
      }
    }

    if (passwordEnabled !== undefined) {
      shareData.password_enabled = passwordEnabled;
    }

    if (expires !== undefined) {
      shareData.expires = expires;
    }

    if (shares !== undefined) {
      validateId(shares, 'shares');
      shareData.shares = shares;
    }

    const createdShare = await client.projects.createLinkShare(projectId, shareData as LinkSharing);

    const result = createProjectResponse(
      'create_project_share',
      `Share created successfully for project ID ${projectId}`,
      { share: createdShare },
      {
        projectId,
        shareRight: right,
        hasPassword: !!password
      },
      verbosity,
      useOptimizedFormat,
      useAorp
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(result.response),
        }
      ]
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle 404 errors specifically for share creation
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${projectId} not found`);
    }

    throw transformApiError(error, 'Failed to create share');
  }
}

/**
 * Lists all link shares for a project
 */
export async function listProjectShares(
  args: ListSharesArgs
): Promise<McpResponse> {
  const {
    projectId,
    page = 1,
    perPage = 50,
    verbosity,
    useOptimizedFormat,
    useAorp
  } = args;

  try {
    validateId(projectId, 'project id');

    const client = await getClientFromContext();

    // Verify the project exists
    await client.projects.getProject(projectId);

    // Note: node-vikunja might not have a specific method for listing shares
    // This implementation may need to be adjusted based on the actual API
    const params: { page?: number; per_page?: number } = {};
    if (page !== 1 || perPage !== 50) {
      params.page = page;
      params.per_page = perPage;
    }
    const shares = await client.projects.getLinkShares(projectId, params);

    const result = createProjectResponse(
      'list_project_shares',
      `Retrieved ${Array.isArray(shares) ? shares.length : 0} shares for project ${projectId}`,
      { shares },
      {
        projectId,
        page,
        perPage,
        count: Array.isArray(shares) ? shares.length : 0,
        totalShares: Array.isArray(shares) ? shares.length : 0
      },
      verbosity,
      useOptimizedFormat,
      useAorp
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(result.response),
        }
      ]
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle 404 errors specifically for share listing
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      throw new MCPError(ErrorCode.NOT_FOUND, `Project with ID ${projectId} not found`);
    }

    throw transformApiError(error, 'Failed to list shares');
  }
}

/**
 * Gets a specific link share by ID
 */
export async function getProjectShare(
  args: GetShareArgs
): Promise<McpResponse> {
  const { shareId, projectId, verbosity, useOptimizedFormat, useAorp } = args;

  try {
    if (!shareId || typeof shareId !== 'string' || shareId.trim().length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Share ID must be a non-empty string'
      );
    }

    if (!projectId || typeof projectId !== 'number' || projectId <= 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Project ID is required'
      );
    }

    const client = await getClientFromContext();
    const share = await client.projects.getLinkShare(projectId, Number(shareId));

    const result = createProjectResponse(
      'get_project_share',
      `Retrieved link share: ${share.name || (typeof shareId === 'string' || typeof shareId === 'number' ? shareId : 'Unknown')}`,
      { share },
      { shareId },
      verbosity,
      useOptimizedFormat,
      useAorp
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(result.response),
        }
      ]
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle 404 errors specifically for share retrieval
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      throw new MCPError(ErrorCode.NOT_FOUND, `Share with ID ${shareId} not found for project ${projectId}`);
    }

    throw transformApiError(error, 'Failed to get share');
  }
}

/**
 * Deletes a link share
 */
export async function deleteProjectShare(
  args: DeleteShareArgs
): Promise<McpResponse> {
  const { shareId, projectId, verbosity, useOptimizedFormat, useAorp } = args;

  try {
    if (!shareId || typeof shareId !== 'string' || shareId.trim().length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Share ID must be a non-empty string'
      );
    }

    if (!projectId || typeof projectId !== 'number' || projectId <= 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Project ID is required'
      );
    }

    const client = await getClientFromContext();

    // Get share details before deletion
    const share = await client.projects.getLinkShare(projectId, Number(shareId));

    await client.projects.deleteLinkShare(projectId, Number(shareId));

    const result = createProjectResponse(
      'delete_project_share',
      `Share with ID ${shareId} deleted successfully`,
      {
        deleted: true,
        shareId,
        shareName: share.name,
        projectId: share.project_id
      },
      {
        projectId: share.project_id,
        shareId,
        shareName: share.name
      },
      verbosity,
      useOptimizedFormat,
      useAorp
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(result.response),
        }
      ]
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle 404 errors specifically for share deletion
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      throw new MCPError(ErrorCode.NOT_FOUND, `Share with ID ${shareId} not found for project ${projectId}`);
    }

    throw transformApiError(error, 'Failed to delete share');
  }
}

/**
 * Authenticates access to a shared project
 */
export async function authProjectShare(
  args: AuthShareArgs
): Promise<McpResponse> {
  const { shareHash, password, verbosity, useOptimizedFormat, useAorp } = args;

  try {
    if (!shareHash || typeof shareHash !== 'string' || shareHash.trim().length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Share hash must be a non-empty string'
      );
    }

    const client = await getClientFromContext();

    // The authentication is done via the shares API
    const authResult = await client.shares.getShareAuth(shareHash, {
      password: password || '',
    });

    const result = createProjectResponse(
      'auth_project_share',
      `Successfully authenticated to share`,
      { auth: authResult },
      {
        shareHash,
        hasPassword: !!password,
        authenticated: true
      },
      verbosity,
      useOptimizedFormat,
      useAorp
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: formatAorpAsMarkdown(result.response),
        }
      ]
    };
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }

    // Handle specific error status codes for share authentication
    if (error && typeof error === 'object' && 'statusCode' in error) {
      if (error.statusCode === 401) {
        throw new MCPError(ErrorCode.VALIDATION_ERROR, `Invalid password for share`);
      }
      if (error.statusCode === 404) {
        throw new MCPError(ErrorCode.NOT_FOUND, `Share with hash ${shareHash} not found`);
      }
    }

    throw transformApiError(error, 'Failed to authenticate to share');
  }
}