import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerTemplatesTool } from '../../src/tools/templates';
import type { MockVikunjaClient, MockServer } from '../types/mocks';
import type { Project, Task, User } from 'node-vikunja';
import { MCPError, ErrorCode } from '../../src/types';
import { AuthManager } from '../../src/auth/AuthManager';

// Mock modules
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
  setGlobalClientFactory: jest.fn(),
  clearGlobalClientFactory: jest.fn(),
}));

jest.mock('../../src/storage/FilterStorage', () => ({
  storageManager: {
    getStorage: jest.fn(),
  },
}));

// Import mocked functions
import { getClientFromContext } from '../../src/client';
import { storageManager } from '../../src/storage/FilterStorage';

// Mock data
const mockUser: User = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
};

const mockProject: Project = {
  id: 1,
  title: 'Test Project',
  description: 'Test Description',
  parent_project_id: undefined,
  is_archived: false,
  hex_color: '#4287f5',
  owner: mockUser,
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
};

const mockTask: Task = {
  id: 1,
  title: 'Test Task with {{PROJECT_NAME}}',
  description: 'Description with {{START_DATE}}',
  project_id: 1,
  done: false,
  labels: [{ id: 1, title: 'Label 1' }],
  priority: 2,
  position: 1,
  due_date: '2025-06-01T12:00:00Z',
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
};

describe('Templates Tool', () => {
  let mockClient: MockVikunjaClient;
  let mockAuthManager: AuthManager;
  let mockServer: MockServer;
  let toolHandler: (args: any) => Promise<any>;
  let mockFilterStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock storage instance
    mockFilterStorage = {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByName: jest.fn(),
      clear: jest.fn(),
      getByProject: jest.fn(),
      getStats: jest.fn(),
      getSession: jest.fn(),
    };

    // Mock storageManager.getStorage to return our mock storage
    (storageManager.getStorage as jest.Mock).mockResolvedValue(mockFilterStorage);

    // Setup mock client
    mockClient = {
      projects: {
        getProject: jest.fn(),
        createProject: jest.fn(),
      },
      tasks: {
        getProjectTasks: jest.fn(),
        createTask: jest.fn(),
        updateTaskLabels: jest.fn(),
      },
    } as any;

    // Mock getClientFromContext
    (getClientFromContext as jest.MockedFunction<typeof getClientFromContext>).mockResolvedValue(
      mockClient,
    );

    // Setup mock auth manager
    mockAuthManager = new AuthManager();
    mockAuthManager.connect('https://test.vikunja.io', 'test-token-12345678');

    // Setup mock server
    mockServer = {
      tool: jest.fn((name: string, schema: any, handler: any) => {
        if (name === 'vikunja_templates') {
          toolHandler = handler;
        }
      }),
    } as any;

    // Register the tool
    registerTemplatesTool(mockServer, mockAuthManager);
  });

  describe('create subcommand', () => {
    it('should create a template from an existing project', async () => {
      mockClient.projects.getProject.mockResolvedValue(mockProject);
      mockClient.tasks.getProjectTasks.mockResolvedValue([mockTask]);
      (mockFilterStorage.create as jest.Mock).mockResolvedValue({
        id: 'filter-123',
        name: 'template_123',
        filter: '{}',
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });

      const result = await toolHandler({
        subcommand: 'create',
        projectId: 1,
        name: 'Sprint Template',
        description: 'Template for sprints',
        tags: ['agile', 'sprint'],
      });

      expect(mockClient.projects.getProject).toHaveBeenCalledWith(1);
      expect(mockClient.tasks.getProjectTasks).toHaveBeenCalledWith(1);
      expect(mockFilterStorage.create).toHaveBeenCalledWith({
        name: expect.stringMatching(/^template_\d+$/),
        filter: expect.any(String),
        isGlobal: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.operation).toBe('create-template');
      expect(response.message).toContain('Template "Sprint Template" created successfully');
    });

    it('should throw error if required fields are missing', async () => {
      await expect(
        toolHandler({
          subcommand: 'create',
          projectId: 1,
        }),
      ).rejects.toThrow('projectId and name are required');
    });

    it('should handle API errors', async () => {
      mockClient.projects.getProject.mockRejectedValue(new Error('API Error'));

      await expect(
        toolHandler({
          subcommand: 'create',
          projectId: 1,
          name: 'Template',
        }),
      ).rejects.toThrow('Failed to create template');
    });

    it('should create a template from project with minimal data', async () => {
      const minimalProject = { id: 1, title: 'Minimal Project' }; // No description or hex_color
      const minimalTasks = [
        { id: 1, title: 'Task 1' }, // No description, labels, due_date, priority, etc.
        { id: 2, title: 'Task 2', labels: [], assignees: [] }, // Empty arrays
      ];

      mockClient.projects.getProject.mockResolvedValue(minimalProject);
      mockClient.tasks.getProjectTasks.mockResolvedValue(minimalTasks);
      (mockFilterStorage.create as jest.Mock).mockResolvedValue({
        id: 'filter-123',
        name: 'template_123',
        filter: '{}',
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });

      const result = await toolHandler({
        subcommand: 'create',
        projectId: 1,
        name: 'Minimal Template',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('create-template');

      // Verify the template data structure
      const createCall = (mockFilterStorage.create as jest.Mock).mock.calls[0][0];
      const templateData = JSON.parse(createCall.filter);
      expect(templateData.projectData.description).toBeUndefined();
      expect(templateData.projectData.hex_color).toBeUndefined();
      expect(templateData.tasks[0].description).toBeUndefined();
      expect(templateData.tasks[0].labels).toBeUndefined();
      expect(templateData.tasks[1].labels).toBeUndefined(); // Empty array should be undefined
    });

    it('should create a template with tasks having undefined label IDs', async () => {
      const projectWithLabels = { id: 1, title: 'Test Project' };
      const tasksWithUndefinedIds = [
        { id: 1, title: 'Task 1', labels: [{ id: 1 }, { id: undefined }, { id: 2 }] }, // Label with undefined id
        { id: 2, title: 'Task 2', assignees: [{ id: 1 }, { id: undefined }] }, // Assignee with undefined id
      ];

      mockClient.projects.getProject.mockResolvedValue(projectWithLabels);
      mockClient.tasks.getProjectTasks.mockResolvedValue(tasksWithUndefinedIds);
      (mockFilterStorage.create as jest.Mock).mockResolvedValue({
        id: 'filter-123',
        name: 'template_123',
        filter: '{}',
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });

      const result = await toolHandler({
        subcommand: 'create',
        projectId: 1,
        name: 'Template with undefined IDs',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);

      // Verify undefined IDs are filtered out
      const createCall = (mockFilterStorage.create as jest.Mock).mock.calls[0][0];
      const templateData = JSON.parse(createCall.filter);
      expect(templateData.tasks[0].labels).toEqual([1, 2]); // undefined filtered out
      expect(templateData.tasks[1].assignees).toBeUndefined(); // assignees not included in templates
    });

    it('should handle tasks with various optional fields', async () => {
      const project = { id: 1, title: 'Project', description: 'Desc', hex_color: '#123456' };
      const tasks = [
        {
          id: 1,
          title: 'Task 1',
          due_date: '2025-12-31',
          priority: 2,
          done: true,
          labels: [{ id: 1 }],
          assignees: [{ id: 2 }],
        },
        {
          id: 2,
          title: 'Task 2',
          description: '', // Empty string
          labels: [{ id: undefined }], // All undefined IDs
          assignees: null, // Null assignees
        },
        {
          id: 3,
          title: 'Task 3',
          labels: [], // Empty labels array
        },
      ];

      mockClient.projects.getProject.mockResolvedValue(project);
      mockClient.tasks.getProjectTasks.mockResolvedValue(tasks);
      (mockFilterStorage.create as jest.Mock).mockResolvedValue({
        id: 'filter-123',
        name: 'template_123',
        filter: '{}',
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });

      const result = await toolHandler({
        subcommand: 'create',
        projectId: 1,
        name: 'Complex Template',
        description: '', // Empty description
        tags: [], // Empty tags
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);

      const createCall = (mockFilterStorage.create as jest.Mock).mock.calls[0][0];
      const templateData = JSON.parse(createCall.filter);

      // Task 1 should have all fields (except done and assignees which aren't saved)
      expect(templateData.tasks[0].due_date).toBe('2025-12-31');
      expect(templateData.tasks[0].priority).toBe(2);
      expect(templateData.tasks[0].done).toBeUndefined(); // done not included in templates

      // Task 2 should have minimal fields
      expect(templateData.tasks[1].description).toBeUndefined(); // Empty string not preserved (falsy check)
      expect(templateData.tasks[1].labels).toEqual([]); // Original array has items but all undefined IDs filtered out
      expect(templateData.tasks[1].assignees).toBeUndefined(); // assignees not included in templates

      // Task 3 with empty labels array
      expect(templateData.tasks[2].labels).toBeUndefined(); // Empty array not included
    });

    it('should skip invalid hex colors when creating templates', async () => {
      const projectWithInvalidColor = {
        id: 1,
        title: 'Project',
        hex_color: 'invalid-color', // Invalid hex color
      };
      const tasks = [{ id: 1, title: 'Task 1' }];

      mockClient.projects.getProject.mockResolvedValue(projectWithInvalidColor);
      mockClient.tasks.getProjectTasks.mockResolvedValue(tasks);
      (mockFilterStorage.create as jest.Mock).mockResolvedValue({
        id: 'filter-123',
        name: 'template_123',
        filter: '{}',
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });

      const result = await toolHandler({
        subcommand: 'create',
        projectId: 1,
        name: 'Template with Invalid Color',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);

      const createCall = (mockFilterStorage.create as jest.Mock).mock.calls[0][0];
      const templateData = JSON.parse(createCall.filter);

      // Invalid hex color should not be included
      expect(templateData.projectData.hex_color).toBeUndefined();
    });

    it('should handle create errors with non-Error objects', async () => {
      mockClient.projects.getProject.mockRejectedValue('String error');

      await expect(
        toolHandler({
          subcommand: 'create',
          projectId: 1,
          name: 'Template',
        }),
      ).rejects.toThrow('Failed to create template: Unknown error');
    });
  });

  describe('list subcommand', () => {
    it('should list all templates', async () => {
      const mockSavedFilters = [
        {
          id: 'filter_1',
          name: 'template_1',
          filter: JSON.stringify({ id: 'template_1', name: 'Sprint Template', tags: ['agile'] }),
          created: new Date(),
          updated: new Date(),
          isGlobal: true,
        },
        {
          id: 'filter_2',
          name: 'template_2',
          filter: JSON.stringify({ id: 'template_2', name: 'Onboarding Template', tags: ['hr'] }),
          created: new Date(),
          updated: new Date(),
          isGlobal: true,
        },
      ];
      (mockFilterStorage.list as jest.Mock).mockResolvedValue(mockSavedFilters);

      const result = await toolHandler({ subcommand: 'list' });

      expect(mockFilterStorage.list).toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.operation).toBe('list-templates');
      expect(response.data.templates).toHaveLength(2);
    });

    it('should handle templates with invalid JSON', async () => {
      const mockSavedFilters = [
        {
          id: 'filter_1',
          name: 'template_1',
          filter: 'invalid json',
          created: new Date(),
          updated: new Date(),
          isGlobal: true,
        },
        {
          id: 'filter_2',
          name: 'template_2',
          filter: JSON.stringify({ id: 'template_2', name: 'Valid Template' }),
          created: new Date(),
          updated: new Date(),
          isGlobal: true,
        },
      ];
      (mockFilterStorage.list as jest.Mock).mockResolvedValue(mockSavedFilters);

      const result = await toolHandler({ subcommand: 'list' });

      const response = JSON.parse(result.content[0].text);
      expect(response.data.templates).toHaveLength(1);
      expect(response.data.templates[0].name).toBe('Valid Template');
    });

    it('should handle list errors', async () => {
      (mockFilterStorage.list as jest.Mock).mockRejectedValue(new Error('Storage error'));

      await expect(toolHandler({ subcommand: 'list' })).rejects.toThrow('Failed to list templates');
    });

    it('should handle list errors with non-Error objects', async () => {
      (mockFilterStorage.list as jest.Mock).mockRejectedValue('String error');

      await expect(toolHandler({ subcommand: 'list' })).rejects.toThrow('Failed to list templates: Unknown error');
    });
  });

  describe('get subcommand', () => {
    it('should get a specific template', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Sprint Template',
        description: 'For sprints',
        tags: ['agile'],
        projectData: { title: 'Test Project' },
        tasks: [],
      };
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });

      const result = await toolHandler({
        subcommand: 'get',
        id: 'template_123',
      });

      expect(mockFilterStorage.findByName).toHaveBeenCalledWith('template_123');

      const response = JSON.parse(result.content[0].text);
      expect(response.operation).toBe('get-template');
      expect(response.data.template.name).toBe('Sprint Template');
    });

    it('should throw error if template not found', async () => {
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue(null);

      await expect(
        toolHandler({
          subcommand: 'get',
          id: 'nonexistent',
        }),
      ).rejects.toThrow('Template with ID nonexistent not found');
    });

    it('should throw error if id is missing', async () => {
      await expect(
        toolHandler({
          subcommand: 'get',
        }),
      ).rejects.toThrow('Template ID is required');
    });

    it('should handle get errors', async () => {
      (mockFilterStorage.findByName as jest.Mock).mockRejectedValue(new Error('Storage error'));

      await expect(
        toolHandler({
          subcommand: 'get',
          id: 'template_123',
        }),
      ).rejects.toThrow('Failed to get template');
    });

    it('should handle get errors with non-Error objects', async () => {
      (mockFilterStorage.findByName as jest.Mock).mockRejectedValue('String error');

      await expect(
        toolHandler({
          subcommand: 'get',
          id: 'template_123',
        }),
      ).rejects.toThrow('Failed to get template: Unknown error');
    });
  });

  describe('update subcommand', () => {
    it('should update template fields', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Old Name',
        description: 'Old description',
        tags: ['old'],
      };
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      (mockFilterStorage.update as jest.Mock).mockResolvedValue(undefined);

      const result = await toolHandler({
        subcommand: 'update',
        id: 'template_123',
        name: 'New Name',
        tags: ['new', 'updated'],
      });

      expect(mockFilterStorage.update).toHaveBeenCalledWith('filter_123', {
        filter: expect.any(String),
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toContain('Template "New Name" updated successfully');
    });

    it('should update all fields when provided', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Name',
        tags: ['tag'],
      };
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      (mockFilterStorage.update as jest.Mock).mockResolvedValue(undefined);

      const result = await toolHandler({
        subcommand: 'update',
        id: 'template_123',
        description: 'New description',
      });

      const updateCall = (mockFilterStorage.update as jest.Mock).mock.calls[0][1];
      const updatedTemplate = JSON.parse(updateCall.filter);
      expect(updatedTemplate.description).toBe('New description');
    });

    it('should throw error if id is missing', async () => {
      await expect(
        toolHandler({
          subcommand: 'update',
          name: 'New Name',
        }),
      ).rejects.toThrow('Template ID is required');
    });

    it('should throw error if template not found', async () => {
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue(null);

      await expect(
        toolHandler({
          subcommand: 'update',
          id: 'nonexistent',
          name: 'New Name',
        }),
      ).rejects.toThrow('Template with ID nonexistent not found');
    });

    it('should not update if filter not found during update', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Old Name',
        tags: ['old'],
      };
      (mockFilterStorage.findByName as jest.Mock)
        .mockResolvedValueOnce({
          id: 'filter_123',
          name: 'template_123',
          filter: JSON.stringify(mockTemplate),
          created: new Date(),
          updated: new Date(),
          isGlobal: true,
        })
        .mockResolvedValueOnce(null);

      const result = await toolHandler({
        subcommand: 'update',
        id: 'template_123',
        name: 'New Name',
      });

      // Should still return success even if the second findByName fails
      const response = JSON.parse(result.content[0].text);
      expect(response.message).toContain('Template "New Name" updated successfully');
    });

    it('should handle update errors', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Old Name',
      };
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      (mockFilterStorage.update as jest.Mock).mockRejectedValue(new Error('Update failed'));

      await expect(
        toolHandler({
          subcommand: 'update',
          id: 'template_123',
          name: 'New Name',
        }),
      ).rejects.toThrow('Failed to update template');
    });

    it('should handle update errors with non-Error objects', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Old Name',
      };
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      (mockFilterStorage.update as jest.Mock).mockRejectedValue('String error');

      await expect(
        toolHandler({
          subcommand: 'update',
          id: 'template_123',
          name: 'New Name',
        }),
      ).rejects.toThrow('Failed to update template: Unknown error');
    });
  });

  describe('delete subcommand', () => {
    it('should delete a template', async () => {
      const mockTemplate = { id: 'template_123', name: 'Template to delete' };
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      (mockFilterStorage.delete as jest.Mock).mockResolvedValue(undefined);

      const result = await toolHandler({
        subcommand: 'delete',
        id: 'template_123',
      });

      expect(mockFilterStorage.delete).toHaveBeenCalledWith('filter_123');

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toContain('Template "Template to delete" deleted successfully');
    });

    it('should throw error if id is missing', async () => {
      await expect(
        toolHandler({
          subcommand: 'delete',
        }),
      ).rejects.toThrow('Template ID is required');
    });

    it('should throw error if template not found', async () => {
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue(null);

      await expect(
        toolHandler({
          subcommand: 'delete',
          id: 'nonexistent',
        }),
      ).rejects.toThrow('Template with ID nonexistent not found');
    });

    it('should handle delete errors', async () => {
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify({ id: 'template_123', name: 'Template' }),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      (mockFilterStorage.delete as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      await expect(
        toolHandler({
          subcommand: 'delete',
          id: 'template_123',
        }),
      ).rejects.toThrow('Failed to delete template');
    });

    it('should handle delete errors with non-Error objects', async () => {
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify({ id: 'template_123', name: 'Template' }),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      (mockFilterStorage.delete as jest.Mock).mockRejectedValue('String error');

      await expect(
        toolHandler({
          subcommand: 'delete',
          id: 'template_123',
        }),
      ).rejects.toThrow('Failed to delete template: Unknown error');
    });
  });

  describe('instantiate subcommand', () => {
    it('should create a project from template', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Sprint Template',
        projectData: {
          title: 'Sprint {{SPRINT_NUM}}',
          description: 'Sprint starting {{START_DATE}}',
          hex_color: '#4287f5',
        },
        tasks: [
          {
            title: 'Planning for {{PROJECT_NAME}}',
            description: 'Plan sprint {{SPRINT_NUM}}',
            labels: [1, 2],
            priority: 3,
          },
        ],
      };

      const newProject = { ...mockProject, id: 100, title: 'Sprint 24' };
      const newTask = { ...mockTask, id: 200, project_id: 100 };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue(newProject);
      mockClient.tasks.createTask.mockResolvedValue(newTask);
      mockClient.tasks.updateTaskLabels.mockResolvedValue(undefined);

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Sprint 24',
        parentProjectId: 5,
        variables: {
          SPRINT_NUM: '24',
          START_DATE: '2025-06-01',
          PROJECT_NAME: 'Sprint 24',
        },
      });

      expect(mockClient.projects.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sprint 24',
          description: 'Sprint starting 2025-06-01',
          parent_project_id: 5,
        }),
      );

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          title: 'Planning for Sprint 24',
          description: 'Plan sprint 24',
        }),
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toContain('Project "Sprint 24" created from template');
    });

    it('should handle label assignment failures gracefully', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { title: 'Project' },
        tasks: [{ title: 'Task', labels: [999] }],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 200 });
      mockClient.tasks.updateTaskLabels.mockRejectedValue(new Error('Label not found'));

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'New Project',
      });

      // Should still succeed even if labels fail
      const response = JSON.parse(result.content[0].text);
      expect(response.data.createdTasks).toBe(1);
    });

    it('should throw error if required params missing', async () => {
      await expect(
        toolHandler({
          subcommand: 'instantiate',
          id: 'template_123',
        }),
      ).rejects.toThrow('id and projectName are required');

      await expect(
        toolHandler({
          subcommand: 'instantiate',
          projectName: 'New Project',
        }),
      ).rejects.toThrow('id and projectName are required');
    });

    it('should throw error if template not found', async () => {
      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue(null);

      await expect(
        toolHandler({
          subcommand: 'instantiate',
          id: 'nonexistent',
          projectName: 'New Project',
        }),
      ).rejects.toThrow('Template with ID nonexistent not found');
    });

    it('should handle project creation failure', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { title: 'Project' },
        tasks: [],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockRejectedValue(new Error('Project creation failed'));

      await expect(
        toolHandler({
          subcommand: 'instantiate',
          id: 'template_123',
          projectName: 'New Project',
        }),
      ).rejects.toThrow('Failed to instantiate template');
    });

    it('should handle task creation failures gracefully', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { title: 'Project' },
        tasks: [{ title: 'Task 1' }, { title: 'Task 2' }],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });

      // First task succeeds, second fails
      mockClient.tasks.createTask
        .mockResolvedValueOnce({ ...mockTask, id: 200 })
        .mockRejectedValueOnce(new Error('Task creation failed'));

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'New Project',
      });

      // Should still succeed but report the failure
      const response = JSON.parse(result.content[0].text);
      expect(response.data.createdTasks).toBe(1);
      expect(response.data.failedTasks).toBe(1);
    });

    it('should handle unexpected errors', async () => {
      // Non-MCPError
      (mockFilterStorage.findByName as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(
        toolHandler({
          subcommand: 'instantiate',
          id: 'template_123',
          projectName: 'New Project',
        }),
      ).rejects.toThrow('Failed to instantiate template');
    });

    it('should handle instantiate errors with non-Error objects', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { title: 'Project' },
        tasks: [],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockRejectedValue('String error');

      await expect(
        toolHandler({
          subcommand: 'instantiate',
          id: 'template_123',
          projectName: 'New Project',
        }),
      ).rejects.toThrow('Failed to instantiate template: Unknown error');
    });

    it('should apply variables including undefined text and empty variables', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: {
          title: 'Project {{NAME}}',
          description: undefined, // Undefined description
        },
        tasks: [
          {
            title: 'Task on {{TODAY}} at {{NOW}}',
            description: 'Task desc {{VAR}}', // Task with description to cover line 355
          },
        ],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 200 });

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Test Project',
        variables: { VAR: 'value' }, // Provide variable for task description
      });

      // Check that built-in variables are still applied
      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          title: expect.stringMatching(/Task on \d{4}-\d{2}-\d{2} at \d{4}-\d{2}-\d{2}T/),
          description: 'Task desc value',
        }),
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle tasks with position field', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { title: 'Project' },
        tasks: [
          {
            title: 'Task with position',
            position: 10, // Position field
          },
        ],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 200 });

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Test Project',
      });

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          title: 'Task with position',
          position: 10,
        }),
      );
    });

    it('should handle project with null ID', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { title: 'Project' },
        tasks: [{ title: 'Task 1' }],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });

      // Project created with null ID
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: null });
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 200 });

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Test Project',
      });

      // Should use 0 as fallback for null project ID
      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(
        0,
        expect.objectContaining({
          project_id: 0,
        }),
      );
    });

    it('should handle task with null ID when adding labels', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { title: 'Project' },
        tasks: [
          {
            title: 'Task with labels',
            labels: [1, 2],
          },
        ],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });

      // Task created with null ID
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: null });
      mockClient.tasks.updateTaskLabels.mockResolvedValue(undefined);

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Test Project',
      });

      // Should use 0 as fallback for null task ID
      expect(mockClient.tasks.updateTaskLabels).toHaveBeenCalledWith(0, { label_ids: [1, 2] });
    });

    it('should handle variable names with regex special characters', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: {
          title: 'Project {{$PROJ.NAME}}',
          description: 'Uses {{[VAR]}} and {{NAME*}}',
        },
        tasks: [
          {
            title: 'Task with {{^START}} and {{END$}}',
          },
        ],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 200 });

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Test Project',
        variables: {
          '$PROJ.NAME': 'MyProject',
          '[VAR]': 'TestVar',
          'NAME*': 'StarName',
          '^START': 'Beginning',
          END$: 'Finish',
        },
      });

      // Check that project was created with properly substituted variables
      expect(mockClient.projects.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Project', // Uses projectName, not template title
          description: 'Uses TestVar and StarName',
        }),
      );

      // Check that task was created with properly substituted variables
      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          title: 'Task with Beginning and Finish',
        }),
      );
    });

    it('should handle tasks with non-empty description', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { title: 'Project' },
        tasks: [
          {
            title: 'Task',
            description: 'Test {{VAR}}', // Non-empty description
          },
        ],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 200 });

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Test Project',
        variables: { VAR: 'Value' },
      });

      // Description with variables should be transformed
      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          description: 'Test Value',
        }),
      );
    });

    it('should preserve description when applying variables', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { 
          title: 'Project',
          description: 'Test {{TODAY}} and {{NOW}}', // Built-in variables
        },
        tasks: [],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'New Project',
      });

      // Built-in variables should be replaced
      const projectCall = mockClient.projects.createProject.mock.calls[0][0];
      expect(projectCall.description).toMatch(/Test \d{4}-\d{2}-\d{2} and \d{4}-\d{2}-\d{2}T/);
    });

    it('should handle instantiate with project hex color', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { 
          title: 'Project',
          hex_color: '#FF0000', // Hex color to test line 338
        },
        tasks: [],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Colored Project',
      });

      // Hex color should be included
      expect(mockClient.projects.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          hex_color: '#FF0000',
        }),
      );
    });

    it('should handle variables with empty values in applyVariables', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { 
          title: 'Project',
          description: 'Test {{VAR1}} and {{VAR2}}',
        },
        tasks: [],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Test',
        variables: { 
          VAR1: '', // Empty value
          VAR2: 'value2',
        },
      });

      // Empty variable value should be replaced with empty string
      expect(mockClient.projects.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test  and value2',
        }),
      );
    });

    it('should handle template with no description', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { 
          title: 'Project',
          // No description field at all
        },
        tasks: [{
          title: 'Task',
          // No description
        }],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 200 });

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Test Project',
        variables: {},
      });

      // Project should be created without description field
      const projectCall = mockClient.projects.createProject.mock.calls[0][0];
      expect(projectCall).not.toHaveProperty('description');
      
      // Task should be created without description field
      const taskCall = mockClient.tasks.createTask.mock.calls[0][1];
      expect(taskCall).not.toHaveProperty('description');
    });

    it('should handle empty variables object in applyVariables', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: { 
          title: 'Project {{TODAY}}',
          description: 'Desc {{NOW}}',
        },
        tasks: [{
          title: 'Task {{TODAY}}',
          description: 'Task desc {{NOW}}',
          due_date: '2025-12-31T00:00:00Z', // Add due_date to test line 357
        }],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 200 });

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Test Project',
        // No variables provided - will be undefined in the call
      });

      // Built-in variables should still be applied even without custom variables
      const projectCall = mockClient.projects.createProject.mock.calls[0][0];
      expect(projectCall.description).toMatch(/Desc \d{4}-\d{2}-\d{2}T/);
      
      const taskCall = mockClient.tasks.createTask.mock.calls[0][1];
      expect(taskCall.description).toMatch(/Task desc \d{4}-\d{2}-\d{2}T/);
      expect(taskCall.due_date).toBe('2025-12-31T00:00:00Z');
    });

    it('should handle undefined text in applyVariables', async () => {
      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: {
          title: undefined, // Undefined title
          description: 'Description',
        },
        tasks: [{
          title: undefined, // Undefined task title
        }],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 200 });

      const result = await toolHandler({
        subcommand: 'instantiate',
        id: 'template_123',
        projectName: 'Test Project',
        variables: { VAR: 'value' },
      });

      // Check that applyVariables returns empty string for undefined text
      expect(mockClient.projects.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Project', // Uses projectName directly
          description: 'Description',
        }),
      );

      expect(mockClient.tasks.createTask).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          title: '', // applyVariables returns empty string for undefined
          project_id: 100,
        }),
      );
    });

    it('should handle broken Date.toISOString that returns malformed date', async () => {
      // Save original Date
      const RealDate = global.Date;
      
      // Mock Date to return a broken ISO string that starts with T (edge case from bad API)
      const mockDate = {
        toISOString: jest.fn().mockReturnValue('T12:34:56.789Z'), // Starts with 'T' - missing date part!
      };
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = RealDate.now;

      const mockTemplate = {
        id: 'template_123',
        name: 'Template',
        projectData: {
          title: 'Project {{TODAY}}',
          description: 'Starting {{NOW}}',
        },
        tasks: [{
          title: 'Task for {{TODAY}}',
        }],
      };

      (mockFilterStorage.findByName as jest.Mock).mockResolvedValue({
        id: 'filter_123',
        name: 'template_123',
        filter: JSON.stringify(mockTemplate),
        created: new Date(),
        updated: new Date(),
        isGlobal: true,
      });
      mockClient.projects.createProject.mockResolvedValue({ ...mockProject, id: 100 });
      mockClient.tasks.createTask.mockResolvedValue({ ...mockTask, id: 200 });

      try {
        const result = await toolHandler({
          subcommand: 'instantiate',
          id: 'template_123',
          projectName: 'Test Project',
        });

        // Should handle the broken date format gracefully - TODAY becomes empty string due to || ''
        expect(mockClient.projects.createProject).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Test Project',
            description: 'Starting T12:34:56.789Z', // {{NOW}} replaced with full broken string
          }),
        );

        expect(mockClient.tasks.createTask).toHaveBeenCalledWith(
          100,
          expect.objectContaining({
            title: 'Task for ', // {{TODAY}} replaced with empty string because split('T')[0] is ''
          }),
        );
      } finally {
        // Restore original Date
        global.Date = RealDate;
      }
    });
  });

  describe('authentication', () => {
    it('should require authentication', async () => {
      mockAuthManager.disconnect(); // Simulate not being authenticated

      await expect(
        toolHandler({
          subcommand: 'list',
        }),
      ).rejects.toThrow('Authentication required');
    });
  });

  describe('unknown subcommand', () => {
    it('should throw error for unknown subcommand', async () => {
      await expect(
        toolHandler({
          subcommand: 'unknown',
        }),
      ).rejects.toThrow('Unknown subcommand: unknown');
    });
  });

  describe('unexpected errors', () => {
    afterEach(() => {
      // Reset getClientFromContext mock after error tests
      (getClientFromContext as jest.MockedFunction<typeof getClientFromContext>).mockResolvedValue(
        mockClient,
      );
    });

    it('should handle non-MCPError errors', async () => {
      // Mock getClientFromContext to throw an unexpected error
      (getClientFromContext as jest.MockedFunction<typeof getClientFromContext>).mockRejectedValue(
        new TypeError('Unexpected type error')
      );

      await expect(
        toolHandler({
          subcommand: 'list',
        }),
      ).rejects.toThrow('Unexpected error: Unexpected type error');
    });

    it('should handle non-Error objects thrown at top level', async () => {
      // Mock getClientFromContext to throw a non-Error object
      (getClientFromContext as jest.MockedFunction<typeof getClientFromContext>).mockRejectedValue(
        'String thrown' // eslint-disable-line no-throw-literal
      );

      await expect(
        toolHandler({
          subcommand: 'list',
        }),
      ).rejects.toThrow('Unexpected error: Unknown error');
    });
  });
});
