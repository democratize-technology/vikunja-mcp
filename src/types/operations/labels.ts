/**
 * Label-specific operation types for type-safe label management
 */

import type { Label } from 'node-vikunja';
import type { BaseOperationRequest, BaseOperationResponse } from './base';

/**
 * Request to list labels
 */
export interface ListLabelsRequest extends BaseOperationRequest {
  operation: 'list';
}

/**
 * Response containing a list of labels
 */
export interface ListLabelsResponse extends BaseOperationResponse<Label[]> {
  /** The list of labels */
  labels: Label[];
  /** Metadata about the list operation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Number of labels returned */
    count: number;
  };
}

/**
 * Request to create a new label
 */
export interface CreateLabelRequest extends BaseOperationRequest {
  operation: 'create';
  /** Label title (required) */
  title: string;
  /** Label description */
  description?: string;
  /** Hex color code for the label */
  hexColor?: string;
}

/**
 * Response after creating a label
 */
export interface CreateLabelResponse extends BaseOperationResponse<Label> {
  /** The created label */
  label: Label;
}

/**
 * Request to get a specific label
 */
export interface GetLabelRequest extends BaseOperationRequest {
  operation: 'get';
  /** Label ID to retrieve */
  id: number;
}

/**
 * Response containing a single label
 */
export interface GetLabelResponse extends BaseOperationResponse<Label> {
  /** The label */
  label: Label;
}

/**
 * Request to update an existing label
 */
export interface UpdateLabelRequest extends BaseOperationRequest {
  operation: 'update';
  /** Label ID to update */
  id: number;
  /** New title */
  title?: string;
  /** New description */
  description?: string;
  /** New hex color code */
  hexColor?: string;
}

/**
 * Response after updating a label
 */
export interface UpdateLabelResponse extends BaseOperationResponse<Label> {
  /** The updated label */
  label: Label;
  /** Metadata about the update */
  metadata: BaseOperationResponse['metadata'] & {
    /** List of fields that were updated */
    affectedFields: string[];
  };
}

/**
 * Request to delete a label
 */
export interface DeleteLabelRequest extends BaseOperationRequest {
  operation: 'delete';
  /** Label ID to delete */
  id: number;
}

/**
 * Response after deleting a label
 */
export interface DeleteLabelResponse extends BaseOperationResponse<void> {
  /** Metadata about the deletion */
  metadata: BaseOperationResponse['metadata'] & {
    /** The ID of the deleted label */
    deletedLabelId: number;
  };
}

/**
 * Request to bulk create labels
 */
export interface BulkCreateLabelsRequest extends BaseOperationRequest {
  operation: 'bulk-create';
  /** Array of labels to create */
  labels: Array<{
    title: string;
    description?: string;
    hexColor?: string;
  }>;
}

/**
 * Response after bulk creating labels
 */
export interface BulkCreateLabelsResponse extends BaseOperationResponse<Label[]> {
  /** Successfully created labels */
  labels: Label[];
  /** Metadata about the bulk operation */
  metadata: BaseOperationResponse['metadata'] & {
    /** Number of successfully created labels */
    count: number;
    /** Number of failed labels */
    failedCount?: number;
  };
}

/**
 * Union type of all label operation requests
 */
export type LabelOperationRequest = 
  | ListLabelsRequest
  | CreateLabelRequest
  | GetLabelRequest
  | UpdateLabelRequest
  | DeleteLabelRequest
  | BulkCreateLabelsRequest;

/**
 * Union type of all label operation responses
 */
export type LabelOperationResponse =
  | ListLabelsResponse
  | CreateLabelResponse
  | GetLabelResponse
  | UpdateLabelResponse
  | DeleteLabelResponse
  | BulkCreateLabelsResponse;

/**
 * Type guards for request types
 */
export function isListLabelsRequest(req: BaseOperationRequest): req is ListLabelsRequest {
  return req.operation === 'list';
}

export function isCreateLabelRequest(req: BaseOperationRequest): req is CreateLabelRequest {
  return req.operation === 'create' && 'title' in req;
}

export function isGetLabelRequest(req: BaseOperationRequest): req is GetLabelRequest {
  return req.operation === 'get' && 'id' in req;
}

export function isUpdateLabelRequest(req: BaseOperationRequest): req is UpdateLabelRequest {
  return req.operation === 'update' && 'id' in req;
}

export function isDeleteLabelRequest(req: BaseOperationRequest): req is DeleteLabelRequest {
  return req.operation === 'delete' && 'id' in req;
}

export function isBulkCreateLabelsRequest(req: BaseOperationRequest): req is BulkCreateLabelsRequest {
  return req.operation === 'bulk-create' && 'labels' in req;
}