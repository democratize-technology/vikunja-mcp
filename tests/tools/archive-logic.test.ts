import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { archiveProject, unarchiveProject } from '../../src/tools/projects/crud';
import type { Project, User } from 'node-vikunja';

// Mock the modules
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
}));

// Import the function we're mocking
import { getClientFromContext } from '../../src/client';

describe('Archive/Unarchive Logic', () => {
  let mockClient: any;

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
    position: 1,
    identifier: 'TEST',
  };

  const archivedProject: Project = {
    ...mockProject,
    is_archived: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock client
    mockClient = {
      projects: {
        getProject: jest.fn(),
        updateProject: jest.fn(),
      },
    };

    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('archiveProject', () => {
    it('should check if project is already archived and return early if true', async () => {
      mockClient.projects.getProject.mockResolvedValue(archivedProject);

      const result = await archiveProject({ id: 1 }, null);

      expect(mockClient.projects.getProject).toHaveBeenCalledWith(1);
      expect(mockClient.projects.updateProject).not.toHaveBeenCalled();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe('Project "Test Project" is already archived');
      expect(parsed.data.project).toEqual(archivedProject);
    });

    it('should archive project if not already archived', async () => {
      mockClient.projects.getProject.mockResolvedValue(mockProject);
      mockClient.projects.updateProject.mockResolvedValue(archivedProject);

      const result = await archiveProject({ id: 1 }, null);

      expect(mockClient.projects.getProject).toHaveBeenCalledWith(1);
      expect(mockClient.projects.updateProject).toHaveBeenCalledWith(1, {
        title: 'Test Project',
        is_archived: true
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe('Project "Test Project" archived successfully');
    });
  });

  describe('unarchiveProject', () => {
    it('should check if project is already active and return early if true', async () => {
      mockClient.projects.getProject.mockResolvedValue(mockProject);

      const result = await unarchiveProject({ id: 1 }, null);

      expect(mockClient.projects.getProject).toHaveBeenCalledWith(1);
      expect(mockClient.projects.updateProject).not.toHaveBeenCalled();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe('Project "Test Project" is already active (not archived)');
      expect(parsed.data.project).toEqual(mockProject);
    });

    it('should unarchive project if currently archived', async () => {
      mockClient.projects.getProject.mockResolvedValue(archivedProject);
      mockClient.projects.updateProject.mockResolvedValue(mockProject);

      const result = await unarchiveProject({ id: 1 }, null);

      expect(mockClient.projects.getProject).toHaveBeenCalledWith(1);
      expect(mockClient.projects.updateProject).toHaveBeenCalledWith(1, {
        title: 'Test Project',
        is_archived: false
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe('Project "Test Project" unarchived successfully');
    });
  });
});