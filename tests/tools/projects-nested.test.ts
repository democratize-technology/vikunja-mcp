import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../../src/auth/AuthManager';
import { registerProjectsTool } from '../../src/tools/projects';
import type { Project, User } from 'node-vikunja';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';

// Import the function we're mocking
import { getClientFromContext } from '../../src/client';

// Mock the modules
jest.mock('../../src/client', () => ({
  getClientFromContext: jest.fn(),
  setGlobalClientFactory: jest.fn(),
  clearGlobalClientFactory: jest.fn(),
}));
jest.mock('../../src/auth/AuthManager');

describe('Projects Tool - Nested Project Features', () => {
  let mockClient: MockVikunjaClient;
  let mockAuthManager: MockAuthManager;
  let mockServer: MockServer;
  let toolHandler: (args: any) => Promise<any>;

  // Helper function to call a tool
  async function callTool(subcommand: string, args: Record<string, any> = {}) {
    return toolHandler({
      subcommand,
      ...args,
    });
  }

  // Mock data
  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  const mockProjects: Project[] = [
    {
      id: 1,
      title: 'Root Project',
      description: 'Root level project',
      parent_project_id: undefined,
      is_archived: false,
      hex_color: '#4287f5',
      owner: mockUser,
    },
    {
      id: 2,
      title: 'Child Project 1',
      description: 'First child',
      parent_project_id: 1,
      is_archived: false,
      hex_color: '#ff0000',
      owner: mockUser,
    },
    {
      id: 3,
      title: 'Child Project 2',
      description: 'Second child',
      parent_project_id: 1,
      is_archived: false,
      hex_color: '#00ff00',
      owner: mockUser,
    },
    {
      id: 4,
      title: 'Grandchild Project',
      description: 'Nested deeper',
      parent_project_id: 2,
      is_archived: false,
      hex_color: '#0000ff',
      owner: mockUser,
    },
    {
      id: 5,
      title: 'Orphan Project',
      description: 'No parent',
      parent_project_id: undefined,
      is_archived: false,
      hex_color: '#ffff00',
      owner: mockUser,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock client
    mockClient = {
      getToken: jest.fn().mockReturnValue('test-token'),
      getProjects: jest.fn(),
      createProject: jest.fn(),
      getProject: jest.fn(),
      updateProject: jest.fn(),
      deleteProject: jest.fn(),
      createLinkShare: jest.fn(),
      getLinkShares: jest.fn(),
      getLinkShare: jest.fn(),
      deleteLinkShare: jest.fn(),
      tasks: {} as any,
      projects: {
        getProjects: jest.fn(),
        createProject: jest.fn(),
        getProject: jest.fn(),
        updateProject: jest.fn(),
        deleteProject: jest.fn(),
        createLinkShare: jest.fn(),
        getLinkShares: jest.fn(),
        getLinkShare: jest.fn(),
        deleteLinkShare: jest.fn(),
      },
      labels: {} as any,
      users: {} as any,
      teams: {} as any,
      shares: {
        getShareAuth: jest.fn(),
      },
    } as unknown as MockVikunjaClient;

    // Setup auth manager
    mockAuthManager = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      logout: jest.fn(),
      saveSession: jest.fn(),
      loadSession: jest.fn(),
      getSession: jest.fn(),
    } as unknown as MockAuthManager;

    // Setup server with handler capture that handles both 3 and 4 parameter calls
    mockServer = {
      tool: jest.fn((name, param2, param3, param4) => {
        // Handle both 3-param (name, schema, handler) and 4-param (name, description, schema, handler) calls
        const handler = param4 || param3;
        toolHandler = handler;
      }) as jest.MockedFunction<any>,
    } as MockServer;

    // Mock getClientFromContext BEFORE registering tool (same as working test)
    (getClientFromContext as jest.Mock).mockResolvedValue(mockClient);

    // Register the tool
    registerProjectsTool(mockServer, mockAuthManager);

    // Debug: Check if toolHandler was set
    if (typeof toolHandler !== 'function') {
      throw new Error('toolHandler was not set properly by registerProjectsTool in projects-nested test');
    }

    // Helper function to find project by ID
    const findProjectById = (id: number) => mockProjects.find(p => p.id === id);

    // Setup getProject mock to return projects from mockProjects array
    mockClient.projects.getProject.mockImplementation((id: number) => {
      const project = findProjectById(id);
      if (project) {
        return Promise.resolve(project);
      }
      const error: any = new Error('Not found');
      error.statusCode = 404;
      return Promise.reject(error);
    });

    // Mirror the project methods to the top level for backward compatibility with new implementation
    mockClient.getProjects = mockClient.projects.getProjects;
    mockClient.getProject = mockClient.projects.getProject;
    mockClient.createProject = mockClient.projects.createProject;
    mockClient.updateProject = mockClient.projects.updateProject;
    mockClient.deleteProject = mockClient.projects.deleteProject;
    mockClient.createLinkShare = mockClient.projects.createLinkShare;
    mockClient.getLinkShares = mockClient.projects.getLinkShares;
    mockClient.getLinkShare = mockClient.projects.getLinkShare;
    mockClient.deleteLinkShare = mockClient.projects.deleteLinkShare;
  });

  describe('get-children', () => {
    it('should return direct children of a project', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      const result = await callTool('get-children', { id: 1 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('get-project-children');
      expect(response.message).toBe('Found 2 child projects for project ID 1');
      expect(response.data.children).toHaveLength(2);
      expect(response.data.children[0].title).toBe('Child Project 1');
      expect(response.data.children[1].title).toBe('Child Project 2');
      expect(response.metadata.parentId).toBe(1);
      expect(response.metadata.count).toBe(2);
    });

    it('should return empty array for projects with no children', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      const result = await callTool('get-children', { id: 4 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.message).toBe('Found 0 child projects for project ID 4');
      expect(response.data.children).toHaveLength(0);
    });

    it('should require project ID', async () => {
      await expect(callTool('get-children')).rejects.toThrow('Project ID is required');
    });

    it('should validate project ID', async () => {
      await expect(callTool('get-children', { id: -1 })).rejects.toThrow(
        'id must be a positive integer',
      );
    });

    it('should handle API errors', async () => {
      mockClient.projects.getProjects.mockRejectedValue(new Error('API Error'));

      await expect(callTool('get-children', { id: 1 })).rejects.toThrow(
        'Failed to get project children: API Error',
      );
    });
  });

  describe('get-tree', () => {
    it('should return complete project tree', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      const result = await callTool('get-tree', { id: 1 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('get-project-tree');
      expect(response.message).toBe(
        'Retrieved project tree with 4 nodes at depth 2',
      );
      expect(response.data.tree.title).toBe('Root Project');
      expect(response.data.tree.children).toHaveLength(2);
      expect(response.data.tree.children[0].title).toBe('Child Project 1');
      expect(response.data.tree.children[0].children).toHaveLength(1);
      expect(response.data.tree.children[0].children[0].title).toBe('Grandchild Project');
      expect(response.data.tree.children[1].title).toBe('Child Project 2');
      expect(response.data.tree.children[1].children).toHaveLength(0);
      expect(response.metadata.totalProjects).toBe(4);
    });

    it('should handle leaf nodes correctly', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      const result = await callTool('get-tree', { id: 4 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.data.tree.title).toBe('Grandchild Project');
      expect(response.data.tree.children).toHaveLength(0);
      expect(response.metadata.totalProjects).toBe(1);
    });

    it('should handle circular references', async () => {
      // Create a circular reference scenario
      const circularProjects = [
        { id: 1, title: 'A', parent_project_id: 2 },
        { id: 2, title: 'B', parent_project_id: 1 },
      ];
      mockClient.projects.getProjects.mockResolvedValue(circularProjects);

      const result = await callTool('get-tree', { id: 1 });
      const response = JSON.parse(result.content[0].text);

      // Should still work but prevent infinite loops
      expect(response.success).toBe(true);
      expect(response.data.tree).toBeDefined();
    });

    it('should throw error for non-existent project', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      await expect(callTool('get-tree', { id: 999 })).rejects.toThrow(
        'Project with ID 999 not found',
      );
    });

    it('should require project ID', async () => {
      await expect(callTool('get-tree')).rejects.toThrow('id must be a positive integer');
    });
  });

  describe('get-breadcrumb', () => {
    it('should return path from root to project', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      const result = await callTool('get-breadcrumb', { id: 4 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('get-project-breadcrumb');
      expect(response.message).toBe(
        'Retrieved breadcrumb path with 3 items',
      );
      expect(response.data.breadcrumb).toHaveLength(3);
      expect(response.data.breadcrumb[0].title).toBe('Root Project');
      expect(response.data.breadcrumb[1].title).toBe('Child Project 1');
      expect(response.data.breadcrumb[2].title).toBe('Grandchild Project');
      expect(response.metadata.path).toBe('Root Project > Child Project 1 > Grandchild Project');
      expect(response.metadata.depth).toBe(3);
    });

    it('should handle root level projects', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      const result = await callTool('get-breadcrumb', { id: 1 });
      const response = JSON.parse(result.content[0].text);

      expect(response.data.breadcrumb).toHaveLength(1);
      expect(response.data.breadcrumb[0].title).toBe('Root Project');
      expect(response.metadata.path).toBe('Root Project');
    });

    it('should detect circular references', async () => {
      const circularProjects = [
        { id: 1, title: 'A', parent_project_id: 3 },
        { id: 2, title: 'B', parent_project_id: 1 },
        { id: 3, title: 'C', parent_project_id: 2 },
      ];
      mockClient.projects.getProjects.mockResolvedValue(circularProjects);

      await expect(callTool('get-breadcrumb', { id: 1 })).rejects.toThrow(
        'Circular reference detected in project hierarchy',
      );
    });

    it('should throw error for non-existent project', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      await expect(callTool('get-breadcrumb', { id: 999 })).rejects.toThrow(
        'Project with ID 999 not found',
      );
    });

    it('should require project ID', async () => {
      await expect(callTool('get-breadcrumb')).rejects.toThrow('Project ID is required');
    });
  });

  describe('move', () => {
    it('should move project to new parent', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);
      mockClient.projects.updateProject.mockResolvedValue({
        ...mockProjects[4],
        parent_project_id: 1,
      });

      const result = await callTool('move', { id: 5, parentProjectId: 1 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.operation).toBe('move_project');
      expect(response.message).toBe('Moved project "Orphan Project" to parent project 1');
      expect(response.metadata.newParentProjectId).toBe(1);
      expect(mockClient.projects.updateProject).toHaveBeenCalledWith(5, { parent_project_id: 1 });
    });

    it('should move project to root level', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);
      mockClient.projects.updateProject.mockResolvedValue({
        ...mockProjects[1],
        parent_project_id: undefined,
      });

      const result = await callTool('move', { id: 2, parentProjectId: undefined });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.message).toBe('Moved project "Child Project 1" to root level');
      expect(response.metadata.previousParentId).toBe(1);
      expect(response.metadata.newParentId).toBeUndefined();
    });

    it('should prevent moving project to itself', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      await expect(callTool('move', { id: 1, parentProjectId: 1 })).rejects.toThrow(
        'Cannot move a project to be its own parent',
      );
    });

    it('should prevent circular references', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      // Try to move parent to its own child
      await expect(callTool('move', { id: 1, parentProjectId: 2 })).rejects.toThrow(
        'Move would create a circular reference in project hierarchy',
      );
    });

    it('should prevent excessive depth', async () => {
      // Create two separate deep hierarchies
      const deepProjects = [];

      // First hierarchy: 1->2->3->4->5->6 (6 levels total, depth 5)
      for (let i = 1; i <= 6; i++) {
        deepProjects.push({
          id: i,
          title: `Chain1-${i}`,
          parent_project_id: i > 1 ? i - 1 : undefined,
          owner: mockUser,
        });
      }

      // Second hierarchy: 11->12->13->14->15->16->17 (7 levels total, depth 6)
      for (let i = 11; i <= 17; i++) {
        deepProjects.push({
          id: i,
          title: `Chain2-${i}`,
          parent_project_id: i > 11 ? i - 1 : undefined,
          owner: mockUser,
        });
      }

      mockClient.projects.getProjects.mockResolvedValue(deepProjects);

      // Mock update (shouldn't be called)
      mockClient.projects.updateProject.mockResolvedValue({
        id: 1,
        title: 'Chain1-1',
        parent_project_id: 17,
        owner: mockUser,
      });

      // Try to move the first chain (6 nodes, depth 5) under the bottom of second chain (at depth 6)
      // This would create total depth of 6 + 1 + 5 = 12, exceeding max of 10
      await expect(callTool('move', { id: 1, parentProjectId: 17 })).rejects.toThrow(
        /maximum depth of 10 levels/,
      );
    });

    it('should throw error for non-existent project', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      await expect(callTool('move', { id: 999, parentProjectId: 1 })).rejects.toThrow(
        'Project with ID 999 not found',
      );
    });

    it('should throw error for non-existent parent', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);

      await expect(callTool('move', { id: 1, parentProjectId: 999 })).rejects.toThrow(
        'Parent project with ID 999 not found',
      );
    });

    it('should require project ID', async () => {
      await expect(callTool('move')).rejects.toThrow('Project ID is required');
    });

    it('should validate parent project ID', async () => {
      await expect(callTool('move', { id: 1, parentProjectId: -1 })).rejects.toThrow(
        'parentProjectId must be a positive integer',
      );
    });
  });

  describe('create with depth validation', () => {
    it('should allow creating project within depth limit', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);
      mockClient.projects.createProject.mockResolvedValue({
        id: 6,
        title: 'New Project',
        parent_project_id: 4,
      });

      const result = await callTool('create', { title: 'New Project', parentProjectId: 4 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(mockClient.projects.createProject).toHaveBeenCalled();
    });

    it('should prevent creating project beyond depth limit', async () => {
      // Create a hierarchy at max depth
      const deepProjects = [];
      for (let i = 1; i <= 10; i++) {
        deepProjects.push({
          id: i,
          title: `Level ${i}`,
          parent_project_id: i > 1 ? i - 1 : undefined,
        });
      }
      mockClient.projects.getProjects.mockResolvedValue(deepProjects);

      await expect(callTool('create', { title: 'Too Deep', parentProjectId: 10 })).rejects.toThrow(
        /Maximum allowed depth is 10 levels/,
      );
    });
  });

  describe('update with depth validation', () => {
    it('should allow updating parent within depth limit', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);
      mockClient.projects.updateProject.mockResolvedValue({
        ...mockProjects[4],
        parent_project_id: 3,
      });

      const result = await callTool('update', { id: 5, parentProjectId: 3 });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(mockClient.projects.updateProject).toHaveBeenCalled();
    });

    it('should prevent updating to parent beyond depth limit', async () => {
      // Create a hierarchy at max depth
      const deepProjects = [];
      for (let i = 1; i <= 10; i++) {
        deepProjects.push({
          id: i,
          title: `Level ${i}`,
          parent_project_id: i > 1 ? i - 1 : undefined,
        });
      }
      mockClient.projects.getProjects.mockResolvedValue(deepProjects);

      await expect(callTool('update', { id: 11, parentProjectId: 10 })).rejects.toThrow(
        /Maximum allowed depth is 10 levels/,
      );
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle circular references in calculateProjectDepth', async () => {
      // Create a circular reference: 1 -> 2 -> 3 -> 1
      const circularProjects = [
        { id: 1, title: 'A', parent_project_id: 3 },
        { id: 2, title: 'B', parent_project_id: 1 },
        { id: 3, title: 'C', parent_project_id: 2 },
      ];
      mockClient.projects.getProjects.mockResolvedValue(circularProjects);

      // This should throw when trying to create with parent that has circular ref
      await expect(callTool('create', { title: 'New', parentProjectId: 1 })).rejects.toThrow(
        'Circular reference detected in project hierarchy',
      );
    });

    it('should handle missing projects in hierarchy', async () => {
      // Project with parent that doesn't exist
      const brokenHierarchy = [{ id: 1, title: 'Orphan', parent_project_id: 999 }];
      mockClient.projects.getProjects.mockResolvedValue(brokenHierarchy);

      // Should still work - depth calculation stops at missing parent
      mockClient.projects.createProject.mockResolvedValue({
        id: 2,
        title: 'New',
        parent_project_id: 1,
      });

      const result = await callTool('create', { title: 'New', parentProjectId: 1 });
      expect(result).toBeDefined();
    });

    it('should handle empty children array in getMaxSubtreeDepth', async () => {
      mockClient.projects.getProjects.mockResolvedValue([
        { id: 1, title: 'Leaf Node', parent_project_id: undefined },
      ]);

      // Move should work fine with leaf node
      mockClient.projects.updateProject.mockResolvedValue({
        id: 1,
        title: 'Leaf Node',
        parent_project_id: undefined,
      });

      const result = await callTool('move', { id: 1, parentProjectId: undefined });
      expect(result).toBeDefined();
    });

    it('should handle projects without IDs in tree building', async () => {
      const projectsWithMissingIds = [
        { id: 1, title: 'Parent', parent_project_id: undefined },
        { title: 'No ID', parent_project_id: 1 }, // Missing ID - will be filtered out
        { id: 3, title: 'Child', parent_project_id: 1 },
      ];
      mockClient.projects.getProjects.mockResolvedValue(projectsWithMissingIds);

      const result = await callTool('get-tree', { id: 1 });
      const response = JSON.parse(result.content[0].text);

      // Only children with valid IDs will be included
      expect(response.data.tree.children).toHaveLength(1);
      expect(response.data.tree.children.find((c) => c.id === 3)).toBeDefined();
      expect(response.data.tree.children.find((c) => c.title === 'No ID')).toBeUndefined();
    });

    it('should prevent moving ancestor to its descendant', async () => {
      // Create a simple hierarchy: 1 -> 2 -> 3
      const hierarchyProjects = [
        { id: 1, title: 'Parent', parent_project_id: undefined, owner: mockUser },
        { id: 2, title: 'Child', parent_project_id: 1, owner: mockUser },
        { id: 3, title: 'Grandchild', parent_project_id: 2, owner: mockUser },
      ];
      mockClient.projects.getProjects.mockResolvedValue(hierarchyProjects);

      // Mock shouldn't be called but add it just in case
      mockClient.projects.updateProject.mockResolvedValue({
        id: 1,
        title: 'Parent',
        parent_project_id: 3,
        owner: mockUser,
      });

      // Should prevent moving parent (1) under its grandchild (3)
      await expect(callTool('move', { id: 1, parentProjectId: 3 })).rejects.toThrow(
        'Move would create a circular reference in project hierarchy',
      );

      // Should prevent moving parent (1) under its child (2)
      await expect(callTool('move', { id: 1, parentProjectId: 2 })).rejects.toThrow(
        'Move would create a circular reference in project hierarchy',
      );
    });

    it('should handle move operation with complex subtree depth calculation', async () => {
      // Create a project with deep subtree that would exceed max depth if moved
      const projectWithDeepSubtree = [
        { id: 1, title: 'Root', parent_project_id: undefined, owner: mockUser },
        { id: 2, title: 'Branch', parent_project_id: undefined, owner: mockUser },
        // Create subtree under project 2 first (4 levels deep from root)
        { id: 3, title: 'B1', parent_project_id: 2, owner: mockUser },
        { id: 4, title: 'B2', parent_project_id: 3, owner: mockUser },
        { id: 5, title: 'B3', parent_project_id: 4, owner: mockUser },
        { id: 12, title: 'B4', parent_project_id: 5, owner: mockUser },
        // Deep subtree under project 1 (7 levels)
        { id: 6, title: 'L1', parent_project_id: 1, owner: mockUser },
        { id: 7, title: 'L2', parent_project_id: 6, owner: mockUser },
        { id: 8, title: 'L3', parent_project_id: 7, owner: mockUser },
        { id: 9, title: 'L4', parent_project_id: 8, owner: mockUser },
        { id: 10, title: 'L5', parent_project_id: 9, owner: mockUser },
        { id: 11, title: 'L6', parent_project_id: 10, owner: mockUser },
        { id: 13, title: 'L7', parent_project_id: 11, owner: mockUser },
      ];
      mockClient.projects.getProjects.mockResolvedValue(projectWithDeepSubtree);

      // Mock update shouldn't be called since validation should fail
      mockClient.projects.updateProject.mockResolvedValue({
        id: 1,
        title: 'Root',
        parent_project_id: 12,
        owner: mockUser,
      });

      // Moving project 1 (with 7-level subtree) under project 12 (which is at depth 4) should fail
      // because total depth would be 4 (parent depth) + 1 (project 1) + 7 (subtree) = 12, which exceeds 10
      await expect(callTool('move', { id: 1, parentProjectId: 12 })).rejects.toThrow(
        /maximum depth of 10 levels/,
      );
    });

    it('should handle circular reference in getMaxSubtreeDepth', async () => {
      // Create projects with a diamond pattern that will trigger visited set
      // A -> B -> D
      // A -> C -> D  (D is reached from both B and C)
      const diamondProjects = [
        { id: 1, title: 'A', parent_project_id: undefined, owner: mockUser },
        { id: 2, title: 'B', parent_project_id: 1, owner: mockUser },
        { id: 3, title: 'C', parent_project_id: 1, owner: mockUser },
        { id: 4, title: 'D1', parent_project_id: 2, owner: mockUser },
        { id: 4, title: 'D2', parent_project_id: 3, owner: mockUser }, // Same ID, different parent - simulates data issue
        { id: 5, title: 'E', parent_project_id: 4, owner: mockUser },
        { id: 6, title: 'F', parent_project_id: 5, owner: mockUser },
      ];

      mockClient.projects.getProjects.mockResolvedValue(diamondProjects);
      mockClient.projects.updateProject.mockResolvedValue({
        id: 1,
        title: 'A',
        parent_project_id: undefined,
        owner: mockUser,
      });

      // The move should still work because getMaxSubtreeDepth handles duplicate IDs
      const result = await callTool('move', { id: 1, parentProjectId: undefined });
      expect(result).toBeDefined();
    });

    it('should handle projects without id in getMaxSubtreeDepth', async () => {
      const projectsWithMissingId = [
        { id: 1, title: 'Parent', parent_project_id: undefined, owner: mockUser },
        { id: 2, title: 'Child', parent_project_id: 1, owner: mockUser },
        { title: 'No ID Child', parent_project_id: 2, owner: mockUser }, // Missing ID
        { id: 4, title: 'Grandchild', parent_project_id: 2, owner: mockUser },
      ];

      mockClient.projects.getProjects.mockResolvedValue(projectsWithMissingId);
      mockClient.projects.updateProject.mockResolvedValue({
        id: 1,
        title: 'Parent',
        parent_project_id: undefined,
        owner: mockUser,
      });

      // Should handle missing ID gracefully
      const result = await callTool('move', { id: 1, parentProjectId: undefined });
      expect(result).toBeDefined();
    });

    it('should throw API_ERROR when get-tree fails with non-MCP error', async () => {
      mockClient.projects.getProjects.mockRejectedValue(new Error('Network error'));

      await expect(callTool('get-tree', { id: 1 })).rejects.toThrow(
        'Failed to get project tree: Network error',
      );
    });

    it('should throw API_ERROR when get-breadcrumb fails with non-MCP error', async () => {
      mockClient.projects.getProjects.mockRejectedValue(new Error('Database connection failed'));

      await expect(callTool('get-breadcrumb', { id: 1 })).rejects.toThrow(
        'Failed to get project breadcrumb: Database connection failed',
      );
    });

    it('should throw API_ERROR when move fails with non-MCP error', async () => {
      mockClient.projects.getProjects.mockResolvedValue(mockProjects);
      mockClient.projects.updateProject.mockRejectedValue(new Error('Permission denied'));

      await expect(callTool('move', { id: 5, parentProjectId: 1 })).rejects.toThrow(
        'Failed to move project: Permission denied',
      );
    });

    it('should handle empty breadcrumb array and break correctly', async () => {
      // Return empty projects list
      mockClient.projects.getProjects.mockResolvedValue([]);

      await expect(callTool('get-breadcrumb', { id: 999 })).rejects.toThrow(
        'Project with ID 999 not found',
      );
    });

    it('should handle project at root level for breadcrumb', async () => {
      // Project with no parent (root level)
      const rootProject = [{ id: 1, title: 'Root', parent_project_id: undefined, owner: mockUser }];
      mockClient.projects.getProjects.mockResolvedValue(rootProject);

      const result = await callTool('get-breadcrumb', { id: 1 });
      const response = JSON.parse(result.content[0].text);

      // Breadcrumb should contain only the root project itself
      expect(response.data.breadcrumb).toHaveLength(1);
      expect(response.data.breadcrumb[0].id).toBe(1);
    });
  });
});
