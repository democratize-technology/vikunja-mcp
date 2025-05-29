import { AuthManager } from '../../src/auth/AuthManager';
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

export type MockedFunction<T extends (...args: any[]) => any> = jest.MockedFunction<T>;

export interface MockTaskService {
  getAllTasks: MockedFunction<(params?: GetTasksParams) => Promise<Task[]>>;
  getProjectTasks: MockedFunction<(projectId: number, params?: GetTasksParams) => Promise<Task[]>>;
  createTask: MockedFunction<(task: Task) => Promise<Task>>;
  getTask: MockedFunction<(taskId: number) => Promise<Task>>;
  updateTask: MockedFunction<(taskId: number, task: Partial<Task>) => Promise<Task>>;
  deleteTask: MockedFunction<(taskId: number) => Promise<Message>>;
  getTaskComments: MockedFunction<(taskId: number) => Promise<any[]>>;
  createTaskComment: MockedFunction<(taskId: number, comment: string) => Promise<any>>;
  updateTaskLabels: MockedFunction<(taskId: number, labels: Label[]) => Promise<Label[]>>;
  bulkAssignUsersToTask: MockedFunction<(taskId: number, assignees: User[]) => Promise<any>>;
  removeUserFromTask: MockedFunction<(taskId: number, userId: number) => Promise<Message>>;
  bulkUpdateTasks: MockedFunction<(tasks: Task[]) => Promise<Task[]>>;
}

export interface MockProjectService {
  getProjects: MockedFunction<(params?: any) => Promise<Project[]>>;
  createProject: MockedFunction<(project: Project) => Promise<Project>>;
  getProject: MockedFunction<(projectId: number) => Promise<Project>>;
  updateProject: MockedFunction<(projectId: number, project: Partial<Project>) => Promise<Project>>;
  deleteProject: MockedFunction<(projectId: number) => Promise<Message>>;
  createLinkShare: MockedFunction<(projectId: number, shareData: any) => Promise<any>>;
  getLinkShares: MockedFunction<(projectId: number) => Promise<any[]>>;
  getLinkShare: MockedFunction<(projectId: number, shareId: number) => Promise<any>>;
  deleteLinkShare: MockedFunction<(projectId: number, shareId: number) => Promise<Message>>;
}

export interface MockLabelService {
  getLabels: MockedFunction<(params?: any) => Promise<Label[]>>;
  getLabel: MockedFunction<(labelId: number) => Promise<Label>>;
  createLabel: MockedFunction<(label: Label) => Promise<Label>>;
  updateLabel: MockedFunction<(labelId: number, label: Partial<Label>) => Promise<Label>>;
  deleteLabel: MockedFunction<(labelId: number) => Promise<Message>>;
}

export interface MockUserService {
  getAll: MockedFunction<(params?: any) => Promise<User[]>>;
}

export interface MockTeamService {
  getAll: MockedFunction<() => Promise<Team[]>>;
  create: MockedFunction<(team: Team) => Promise<Team>>;
  delete: MockedFunction<(teamId: number) => Promise<Message>>;
  // Extended methods that might be available in newer versions
  getTeams?: MockedFunction<(params?: any) => Promise<Team[]>>;
  createTeam?: MockedFunction<(team: Team) => Promise<Team>>;
  deleteTeam?: MockedFunction<(teamId: number) => Promise<Message>>;
}

export interface MockShareService {
  getShareAuth: MockedFunction<(linkShareHash: string, password?: string) => Promise<any>>;
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

export type MockAuthManager = jest.Mocked<AuthManager>;

export interface MockServer {
  tool: MockedFunction<(name: string, schema: any, handler: any) => void>;
}

export interface MockFilterStorage {
  getAllFilters: MockedFunction<() => any[]>;
  getFilter: MockedFunction<(id: string) => any | undefined>;
  saveFilter: MockedFunction<(filter: any) => any>;
  updateFilter: MockedFunction<(id: string, filter: any) => any>;
  deleteFilter: MockedFunction<(id: string) => boolean>;
  parseFilterQuery: MockedFunction<(query: string) => any>;
}
