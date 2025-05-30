/**
 * Project-specific operation types for type-safe project management
 */

import type { Project } from 'node-vikunja';
import type { BaseOperationRequest, BaseOperationResponse } from './base';

/**
 * Request to list projects
 */
export interface ListProjectsRequest extends BaseOperationRequest {
  operation: 'list';
  /** Include archived projects */
  isArchived?: boolean;
}

/**
 * Response containing a list of projects
 */
export interface ListProjectsResponse extends BaseOperationResponse<Project[]> {
  /** The list of projects */
  projects: Project[];
  /** Metadata about the list operation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Number of projects returned */
    count: number;
    /** Whether archived projects are included */
    includesArchived?: boolean;
  };
}

/**
 * Request to create a new project
 */
export interface CreateProjectRequest extends BaseOperationRequest {
  operation: 'create';
  /** Project title (required) */
  title: string;
  /** Project description */
  description?: string;
  /** Hex color code for the project */
  color?: string;
  /** Parent project ID for nesting */
  parentProjectId?: number;
}

/**
 * Response after creating a project
 */
export interface CreateProjectResponse extends BaseOperationResponse<Project> {
  /** The created project */
  project: Project;
  /** Metadata about the creation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Whether the project was nested */
    isNested?: boolean;
  };
}

/**
 * Request to get a specific project
 */
export interface GetProjectRequest extends BaseOperationRequest {
  operation: 'get';
  /** Project ID to retrieve */
  id: number;
}

/**
 * Response containing a single project
 */
export interface GetProjectResponse extends BaseOperationResponse<Project> {
  /** The project */
  project: Project;
}

/**
 * Request to update an existing project
 */
export interface UpdateProjectRequest extends BaseOperationRequest {
  operation: 'update';
  /** Project ID to update */
  id: number;
  /** New title */
  title?: string;
  /** New description */
  description?: string;
  /** New hex color code */
  color?: string;
  /** New parent project ID */
  parentProjectId?: number;
  /** Archive status */
  isArchived?: boolean;
}

/**
 * Response after updating a project
 */
export interface UpdateProjectResponse extends BaseOperationResponse<Project> {
  /** The updated project */
  project: Project;
  /** Metadata about the update */
  metadata: BaseOperationResponse['metadata'] & {
    /** List of fields that were updated */
    affectedFields: string[];
  };
}

/**
 * Request to delete a project
 */
export interface DeleteProjectRequest extends BaseOperationRequest {
  operation: 'delete';
  /** Project ID to delete */
  id: number;
}

/**
 * Response after deleting a project
 */
export interface DeleteProjectResponse extends BaseOperationResponse<void> {
  /** Metadata about the deletion */
  metadata: BaseOperationResponse['metadata'] & {
    /** The ID of the deleted project */
    deletedProjectId: number;
  };
}

/**
 * Request to archive/unarchive a project
 */
export interface ArchiveProjectRequest extends BaseOperationRequest {
  operation: 'archive';
  /** Project ID to archive/unarchive */
  id: number;
  /** Whether to archive (true) or unarchive (false) */
  archive: boolean;
}

/**
 * Response after archiving/unarchiving a project
 */
export interface ArchiveProjectResponse extends BaseOperationResponse<Project> {
  /** The updated project */
  project: Project;
  /** Metadata about the operation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Whether the project is now archived */
    isArchived: boolean;
  };
}

/**
 * Union type of all project operation requests
 */
export type ProjectOperationRequest = 
  | ListProjectsRequest
  | CreateProjectRequest
  | GetProjectRequest
  | UpdateProjectRequest
  | DeleteProjectRequest
  | ArchiveProjectRequest;

/**
 * Union type of all project operation responses
 */
export type ProjectOperationResponse =
  | ListProjectsResponse
  | CreateProjectResponse
  | GetProjectResponse
  | UpdateProjectResponse
  | DeleteProjectResponse
  | ArchiveProjectResponse;

/**
 * Type guards for request types
 */
export function isListProjectsRequest(req: BaseOperationRequest): req is ListProjectsRequest {
  return req.operation === 'list';
}

export function isCreateProjectRequest(req: BaseOperationRequest): req is CreateProjectRequest {
  return req.operation === 'create' && 'title' in req;
}

export function isGetProjectRequest(req: BaseOperationRequest): req is GetProjectRequest {
  return req.operation === 'get' && 'id' in req;
}

export function isUpdateProjectRequest(req: BaseOperationRequest): req is UpdateProjectRequest {
  return req.operation === 'update' && 'id' in req;
}

export function isDeleteProjectRequest(req: BaseOperationRequest): req is DeleteProjectRequest {
  return req.operation === 'delete' && 'id' in req;
}

export function isArchiveProjectRequest(req: BaseOperationRequest): req is ArchiveProjectRequest {
  return req.operation === 'archive' && 'id' in req && 'archive' in req;
}