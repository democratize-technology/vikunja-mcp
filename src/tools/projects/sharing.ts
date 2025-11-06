/**
 * Project Link Sharing Module
 * Handles link sharing operations for projects
 */

import type { VikunjaClient } from 'node-vikunja';
import type { LinkSharing, LinkShareAuth } from 'node-vikunja';
import { MCPError, ErrorCode } from '../../types/index';
import { getClientFromContext } from '../../client';
import { transformApiError } from '../../utils/error-handler';
import { validateId } from './validation';
import { createProjectResponse } from './response-formatter';

/**
 * Arguments for creating a project share
 */
export interface CreateShareArgs {
  projectId: number;
  right: 'read' | 'write' | 'admin';
  name?: string;
  password?: string;
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
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Arguments for deleting a project share
 */
export interface DeleteShareArgs {
  shareId: string;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Arguments for authenticating a project share
 */
export interface AuthShareArgs {
  shareId: string;
  password?: string;
  verbosity?: string;
  useOptimizedFormat?: boolean;
  useAorp?: boolean;
}

/**
 * Creates a new link share for a project
 */
export async function createProjectShare(
  args: CreateShareArgs,
  context: any
): Promise<unknown> {
  const {
    projectId,
    right,
    name,
    password,
    shares,
    verbosity,
    useOptimizedFormat,
    useAorp
  } = args;

  try {
    validateId(projectId, 'project id');

    if (!['read', 'write', 'admin'].includes(right)) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Share right must be one of: read, write, admin'
      );
    }

    const client = await getClientFromContext(context);

    // Verify the project exists
    await client.getProject(projectId);

    const shareData: any = {
      project_id: projectId,
      right,
    };

    if (name !== undefined) {
      shareData.name = name.trim();
    }

    if (password !== undefined) {
      shareData.password = password;
    }

    if (shares !== undefined) {
      validateId(shares, 'shares');
      shareData.shares = shares;
    }

    const createdShare = await client.createLinkShare(shareData);

    const result = createProjectResponse(
      'create_project_share',
      `Created ${right} link share for project ${projectId}`,
      createdShare,
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
 * Lists all link shares for a project
 */
export async function listProjectShares(
  args: ListSharesArgs,
  context: any
): Promise<unknown> {
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

    const client = await getClientFromContext(context);

    // Verify the project exists
    await client.getProject(projectId);

    // Note: node-vikunja might not have a specific method for listing shares
    // This implementation may need to be adjusted based on the actual API
    const shares = await client.getLinkShares({
      project_id: projectId,
      page,
      per_page: perPage
    });

    const result = createProjectResponse(
      'list_project_shares',
      `Retrieved ${Array.isArray(shares) ? shares.length : 0} shares for project ${projectId}`,
      shares,
      {
        projectId,
        page,
        perPage,
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
 * Gets a specific link share by ID
 */
export async function getProjectShare(
  args: GetShareArgs,
  context: any
): Promise<unknown> {
  const { shareId, verbosity, useOptimizedFormat, useAorp } = args;

  try {
    if (!shareId || typeof shareId !== 'string' || shareId.trim().length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Share ID must be a non-empty string'
      );
    }

    const client = await getClientFromContext(context);
    const share = await client.getLinkShare(shareId);

    const result = createProjectResponse(
      'get_project_share',
      `Retrieved link share: ${share.name || shareId}`,
      share,
      { shareId },
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
 * Deletes a link share
 */
export async function deleteProjectShare(
  args: DeleteShareArgs,
  context: any
): Promise<unknown> {
  const { shareId, verbosity, useOptimizedFormat, useAorp } = args;

  try {
    if (!shareId || typeof shareId !== 'string' || shareId.trim().length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Share ID must be a non-empty string'
      );
    }

    const client = await getClientFromContext(context);

    // Get share details before deletion
    const share = await client.getLinkShare(shareId);

    await client.deleteLinkShare(shareId);

    const result = createProjectResponse(
      'delete_project_share',
      `Deleted link share: ${share.name || shareId}`,
      {
        deleted: true,
        shareId,
        shareName: share.name,
        projectId: share.projectId
      },
      {},
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
 * Authenticates access to a shared project
 */
export async function authProjectShare(
  args: AuthShareArgs,
  context: any
): Promise<unknown> {
  const { shareId, password, verbosity, useOptimizedFormat, useAorp } = args;

  try {
    if (!shareId || typeof shareId !== 'string' || shareId.trim().length === 0) {
      throw new MCPError(
        ErrorCode.VALIDATION_ERROR,
        'Share ID must be a non-empty string'
      );
    }

    const client = await getClientFromContext(context);

    const authData: LinkShareAuth = {
      share_id: shareId,
    };

    if (password !== undefined) {
      authData.password = password;
    }

    // This would authenticate and return project access
    // The exact method may vary based on the node-vikunja implementation
    const authResult = await client.authenticateLinkShare(authData);

    const result = createProjectResponse(
      'auth_project_share',
      `Successfully authenticated access to shared project`,
      authResult,
      {
        shareId,
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