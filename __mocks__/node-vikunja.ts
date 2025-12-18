// Manual mock for node-vikunja
export enum RelationKind {
  UNKNOWN = 'unknown',
  SUBTASK = 'subtask',
  PARENTTASK = 'parenttask',
  RELATED = 'related',
  DUPLICATEOF = 'duplicateof',
  DUPLICATES = 'duplicates',
  BLOCKING = 'blocking',
  BLOCKED = 'blocked',
  PRECEDES = 'precedes',
  FOLLOWS = 'follows',
  COPIEDFROM = 'copiedfrom',
  COPIEDTO = 'copiedto'
}

export class VikunjaClient {
  constructor(url: string, token: string) {}
}

export interface Task {
  id?: number;
  title: string;
  project_id: number;
  related_tasks?: {
    task_id: number;
    relation_kind: RelationKind;
  }[];
}

export interface GetTasksParams {
  page?: number;
  per_page?: number;
  s?: string;
  filter_by?: string;
  sort_by?: string;
}

export interface User {
  id: number;
  username: string;
  email?: string;
}

export interface Team {
  id: number;
  name: string;
  description?: string;
}

export interface Label {
  id: number;
  title: string;
  hex_color?: string;
}

export interface Project {
  id: number;
  title: string;
  description?: string;
}

export interface Message {
  message: string;
}