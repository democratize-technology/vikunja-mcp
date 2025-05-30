/**
 * User-specific operation types for type-safe user management
 */

import type { User } from 'node-vikunja';
import type { BaseOperationRequest, BaseOperationResponse } from './base';

/**
 * Request to get current user info
 */
export interface GetCurrentUserRequest extends BaseOperationRequest {
  operation: 'current';
}

/**
 * Response containing current user info
 */
export interface GetCurrentUserResponse extends BaseOperationResponse<User> {
  /** The current user */
  user: User;
}

/**
 * Request to get a specific user
 */
export interface GetUserRequest extends BaseOperationRequest {
  operation: 'get';
  /** User ID to retrieve */
  id: number;
}

/**
 * Response containing a single user
 */
export interface GetUserResponse extends BaseOperationResponse<User> {
  /** The user */
  user: User;
}

/**
 * Request to update current user settings
 */
export interface UpdateUserSettingsRequest extends BaseOperationRequest {
  operation: 'update-settings';
  /** New settings values */
  settings: {
    name?: string;
    email?: string;
    emailRemindersEnabled?: boolean;
    overdueTasksRemindersEnabled?: boolean;
    defaultProjectId?: number;
    weekStart?: number;
    language?: string;
    timezone?: string;
  };
}

/**
 * Response after updating user settings
 */
export interface UpdateUserSettingsResponse extends BaseOperationResponse<User> {
  /** The updated user */
  user: User;
  /** Metadata about the update */
  metadata: BaseOperationResponse['metadata'] & {
    /** List of settings that were updated */
    updatedSettings: string[];
  };
}

/**
 * Request to search for users
 */
export interface SearchUsersRequest extends BaseOperationRequest {
  operation: 'search';
  /** Search query */
  query: string;
}

/**
 * Response containing search results
 */
export interface SearchUsersResponse extends BaseOperationResponse<User[]> {
  /** The list of matching users */
  users: User[];
  /** Metadata about the search */
  metadata: BaseOperationResponse['metadata'] & {
    /** Number of results */
    count: number;
    /** The search query used */
    query: string;
  };
}

/**
 * Request to list users for a project
 */
export interface ListProjectUsersRequest extends BaseOperationRequest {
  operation: 'list-project-users';
  /** Project ID */
  projectId: number;
}

/**
 * Response containing project users
 */
export interface ListProjectUsersResponse extends BaseOperationResponse<User[]> {
  /** The list of users with access to the project */
  users: User[];
  /** Metadata about the list */
  metadata: BaseOperationResponse['metadata'] & {
    /** Number of users */
    count: number;
    /** The project ID */
    projectId: number;
  };
}

/**
 * Union type of all user operation requests
 */
export type UserOperationRequest = 
  | GetCurrentUserRequest
  | GetUserRequest
  | UpdateUserSettingsRequest
  | SearchUsersRequest
  | ListProjectUsersRequest;

/**
 * Union type of all user operation responses
 */
export type UserOperationResponse =
  | GetCurrentUserResponse
  | GetUserResponse
  | UpdateUserSettingsResponse
  | SearchUsersResponse
  | ListProjectUsersResponse;

/**
 * Type guards for request types
 */
export function isGetCurrentUserRequest(req: BaseOperationRequest): req is GetCurrentUserRequest {
  return req.operation === 'current';
}

export function isGetUserRequest(req: BaseOperationRequest): req is GetUserRequest {
  return req.operation === 'get' && 'id' in req;
}

export function isUpdateUserSettingsRequest(req: BaseOperationRequest): req is UpdateUserSettingsRequest {
  return req.operation === 'update-settings' && 'settings' in req;
}

export function isSearchUsersRequest(req: BaseOperationRequest): req is SearchUsersRequest {
  return req.operation === 'search' && 'query' in req;
}

export function isListProjectUsersRequest(req: BaseOperationRequest): req is ListProjectUsersRequest {
  return req.operation === 'list-project-users' && 'projectId' in req;
}