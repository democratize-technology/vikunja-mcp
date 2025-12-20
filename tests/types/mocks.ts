import { AuthManager } from '../../src/auth/AuthManager';
import type { TestableAuthManager } from '../utils/test-utils';
import { Server } from '@modelcontextprotocol/sdk/server';
import {
  Task,
  Project,
  Label,
  User,
  Team,
  GetTasksParams,
  Message,
  RelationKind,
} from 'node-vikunja';
import type { ZodSchema } from 'zod';
import type { TaskComment, ProjectShare, SavedFilter } from '../../src/types/vikunja';

// Type definitions for parameters that don't exist in node-vikunja
export interface GetProjectsParams {
  page?: number;
  per_page?: number;
  s?: string;
}

export interface GetLabelsParams {
  page?: number;
  per_page?: number;
  s?: string;
}

export interface GetUsersParams {
  page?: number;
  per_page?: number;
  s?: string;
}

export interface GetTeamsParams {
  page?: number;
  per_page?: number;
  s?: string;
}

export interface LinkShareData {
  right?: number;
  name?: string;
  password?: string;
}

export type LinkShare = ProjectShare;

export type MockedFunction<T extends (...args: unknown[]) => unknown> = jest.MockedFunction<T>;

export interface MockTaskService {
  getAllTasks: MockedFunction<(params?: GetTasksParams) => Promise<Task[]>>;
  getProjectTasks: MockedFunction<(projectId: number, params?: GetTasksParams) => Promise<Task[]>>;
  createTask: MockedFunction<(task: Task) => Promise<Task>>;
  getTask: MockedFunction<(taskId: number) => Promise<Task>>;
  updateTask: MockedFunction<(taskId: number, task: Partial<Task>) => Promise<Task>>;
  deleteTask: MockedFunction<(taskId: number) => Promise<Message>>;
  getTaskComments: MockedFunction<(taskId: number) => Promise<TaskComment[]>>;
  createTaskComment: MockedFunction<(taskId: number, comment: string) => Promise<TaskComment>>;
  updateTaskLabels: MockedFunction<(taskId: number, labels: Label[]) => Promise<Label[]>>;
  bulkAssignUsersToTask: MockedFunction<(taskId: number, assignees: User[]) => Promise<Message>>;
  removeUserFromTask: MockedFunction<(taskId: number, userId: number) => Promise<Message>>;
  bulkUpdateTasks: MockedFunction<(tasks: Task[]) => Promise<Task[]>>;
}

export interface MockProjectService {
  getProjects: MockedFunction<(params?: GetProjectsParams) => Promise<Project[]>>;
  createProject: MockedFunction<(project: Project) => Promise<Project>>;
  getProject: MockedFunction<(projectId: number) => Promise<Project>>;
  updateProject: MockedFunction<(projectId: number, project: Partial<Project>) => Promise<Project>>;
  deleteProject: MockedFunction<(projectId: number) => Promise<Message>>;
  createLinkShare: MockedFunction<(projectId: number, shareData: LinkShareData) => Promise<LinkShare>>;
  getLinkShares: MockedFunction<(projectId: number) => Promise<LinkShare[]>>;
  getLinkShare: MockedFunction<(projectId: number, shareId: number) => Promise<LinkShare>>;
  deleteLinkShare: MockedFunction<(projectId: number, shareId: number) => Promise<Message>>;
}

export interface MockLabelService {
  getLabels: MockedFunction<(params?: GetLabelsParams) => Promise<Label[]>>;
  getLabel: MockedFunction<(labelId: number) => Promise<Label>>;
  createLabel: MockedFunction<(label: Label) => Promise<Label>>;
  updateLabel: MockedFunction<(labelId: number, label: Partial<Label>) => Promise<Label>>;
  deleteLabel: MockedFunction<(labelId: number) => Promise<Message>>;
}

export interface MockUserService {
  getAll: MockedFunction<(params?: GetUsersParams) => Promise<User[]>>;
}

export interface MockTeamService {
  getAll: MockedFunction<() => Promise<Team[]>>;
  create: MockedFunction<(team: Team) => Promise<Team>>;
  delete: MockedFunction<(teamId: number) => Promise<Message>>;
  // Extended methods that might be available in newer versions
  getTeams?: MockedFunction<(params?: GetTeamsParams) => Promise<Team[]>>;
  createTeam?: MockedFunction<(team: Team) => Promise<Team>>;
  deleteTeam?: MockedFunction<(teamId: number) => Promise<Message>>;
}

export interface ShareAuthResponse {
  token?: string;
  user?: User;
  project?: Project;
}

export interface MockShareService {
  getShareAuth: MockedFunction<(linkShareHash: string, password?: string) => Promise<ShareAuthResponse>>;
}

export interface MockVikunjaClient {
  getToken: MockedFunction<() => string>;
  tasks: MockTaskService;
  projects: MockProjectService;
  labels: MockLabelService;
  users: MockUserService;
  teams: MockTeamService;
  shares: MockShareService;
}

export type MockAuthManager = jest.Mocked<TestableAuthManager>;

export interface MockServer {
  tool: MockedFunction<(name: string, schema: ZodSchema, handler: ToolHandler) => void>;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

export interface MockFilterStorage {
  getAllFilters: MockedFunction<() => SavedFilter[]>;
  getFilter: MockedFunction<(id: string) => SavedFilter | undefined>;
  saveFilter: MockedFunction<(filter: SavedFilter) => SavedFilter>;
  updateFilter: MockedFunction<(id: string, filter: SavedFilter) => SavedFilter>;
  deleteFilter: MockedFunction<(id: string) => boolean>;
  parseFilterQuery: MockedFunction<(query: string) => ParsedFilter>;
}

export interface ParsedFilter {
  conditions?: unknown[];
  sort?: string;
  limit?: number;
}
