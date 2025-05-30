/**
 * Team-specific operation types for type-safe team management
 */

import type { Team } from 'node-vikunja';
import type { BaseOperationRequest, BaseOperationResponse } from './base';

/**
 * Request to list teams
 */
export interface ListTeamsRequest extends BaseOperationRequest {
  operation: 'list';
}

/**
 * Response containing a list of teams
 */
export interface ListTeamsResponse extends BaseOperationResponse<Team[]> {
  /** The list of teams */
  teams: Team[];
  /** Metadata about the list operation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Number of teams returned */
    count: number;
  };
}

/**
 * Request to create a new team
 */
export interface CreateTeamRequest extends BaseOperationRequest {
  operation: 'create';
  /** Team name (required) */
  name: string;
  /** Team description */
  description?: string;
}

/**
 * Response after creating a team
 */
export interface CreateTeamResponse extends BaseOperationResponse<Team> {
  /** The created team */
  team: Team;
}

/**
 * Request to get a specific team
 */
export interface GetTeamRequest extends BaseOperationRequest {
  operation: 'get';
  /** Team ID to retrieve */
  id: number;
}

/**
 * Response containing a single team
 */
export interface GetTeamResponse extends BaseOperationResponse<Team> {
  /** The team */
  team: Team;
}

/**
 * Request to update an existing team
 */
export interface UpdateTeamRequest extends BaseOperationRequest {
  operation: 'update';
  /** Team ID to update */
  id: number;
  /** New name */
  name?: string;
  /** New description */
  description?: string;
}

/**
 * Response after updating a team
 */
export interface UpdateTeamResponse extends BaseOperationResponse<Team> {
  /** The updated team */
  team: Team;
  /** Metadata about the update */
  metadata: BaseOperationResponse['metadata'] & {
    /** List of fields that were updated */
    affectedFields: string[];
  };
}

/**
 * Request to delete a team
 */
export interface DeleteTeamRequest extends BaseOperationRequest {
  operation: 'delete';
  /** Team ID to delete */
  id: number;
}

/**
 * Response after deleting a team
 */
export interface DeleteTeamResponse extends BaseOperationResponse<void> {
  /** Metadata about the deletion */
  metadata: BaseOperationResponse['metadata'] & {
    /** The ID of the deleted team */
    deletedTeamId: number;
  };
}

/**
 * Request to add a member to a team
 */
export interface AddTeamMemberRequest extends BaseOperationRequest {
  operation: 'add-member';
  /** Team ID */
  teamId: number;
  /** User ID to add */
  userId: number;
}

/**
 * Response after adding a team member
 */
export interface AddTeamMemberResponse extends BaseOperationResponse<void> {
  /** Metadata about the operation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Team ID */
    teamId: number;
    /** User ID that was added */
    userId: number;
  };
}

/**
 * Request to remove a member from a team
 */
export interface RemoveTeamMemberRequest extends BaseOperationRequest {
  operation: 'remove-member';
  /** Team ID */
  teamId: number;
  /** User ID to remove */
  userId: number;
}

/**
 * Response after removing a team member
 */
export interface RemoveTeamMemberResponse extends BaseOperationResponse<void> {
  /** Metadata about the operation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Team ID */
    teamId: number;
    /** User ID that was removed */
    userId: number;
  };
}

/**
 * Union type of all team operation requests
 */
export type TeamOperationRequest = 
  | ListTeamsRequest
  | CreateTeamRequest
  | GetTeamRequest
  | UpdateTeamRequest
  | DeleteTeamRequest
  | AddTeamMemberRequest
  | RemoveTeamMemberRequest;

/**
 * Union type of all team operation responses
 */
export type TeamOperationResponse =
  | ListTeamsResponse
  | CreateTeamResponse
  | GetTeamResponse
  | UpdateTeamResponse
  | DeleteTeamResponse
  | AddTeamMemberResponse
  | RemoveTeamMemberResponse;

/**
 * Type guards for request types
 */
export function isListTeamsRequest(req: BaseOperationRequest): req is ListTeamsRequest {
  return req.operation === 'list';
}

export function isCreateTeamRequest(req: BaseOperationRequest): req is CreateTeamRequest {
  return req.operation === 'create' && 'name' in req;
}

export function isGetTeamRequest(req: BaseOperationRequest): req is GetTeamRequest {
  return req.operation === 'get' && 'id' in req;
}

export function isUpdateTeamRequest(req: BaseOperationRequest): req is UpdateTeamRequest {
  return req.operation === 'update' && 'id' in req;
}

export function isDeleteTeamRequest(req: BaseOperationRequest): req is DeleteTeamRequest {
  return req.operation === 'delete' && 'id' in req;
}

export function isAddTeamMemberRequest(req: BaseOperationRequest): req is AddTeamMemberRequest {
  return req.operation === 'add-member' && 'teamId' in req && 'userId' in req;
}

export function isRemoveTeamMemberRequest(req: BaseOperationRequest): req is RemoveTeamMemberRequest {
  return req.operation === 'remove-member' && 'teamId' in req && 'userId' in req;
}