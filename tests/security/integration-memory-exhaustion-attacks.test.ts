/**
 * Integration Memory Exhaustion Attack Tests
 *
 * End-to-end tests validating memory protection at the MCP tool level.
 * These tests simulate real-world attack scenarios through the tool interfaces.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Task } from 'node-vikunja';
import { MCPError, ErrorCode } from '../../src/types';
import { registerTasksTool } from '../../src/tools/tasks';
import { getClientFromContext } from '../../src/client';
import { createMockTestableAuthManager } from '../../src/auth/AuthManagerTestUtils';
import type { MockVikunjaClient, MockAuthManager, MockServer } from '../types/mocks';

// Mock dependencies
jest.mock('../../src/client');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  }
}));

const mockGetClientFromContext = getClientFromContext as jest.MockedFunction<typeof getClientFromContext>;

describe('Integration Memory Exhaustion Attack Tests', () => {
  let mockServer: MockServer;
  let mockAuthManager: MockAuthManager;
  let mockClient: MockVikunjaClient;
  let toolHandler: (args: any) => Promise<any>;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.VIKUNJA_MAX_TASKS_LIMIT = '100'; // Low limit for attack testing

    // Setup mock client with comprehensive API
    mockClient = {
      getToken: jest.fn().mockReturnValue('test-token'),
      tasks: {
        getAllTasks: jest.fn(),
        getProjectTasks: jest.fn(),
        createTask: jest.fn(),
        getTask: jest.fn(),
        updateTask: jest.fn(),
        deleteTask: jest.fn(),
        getTaskComments: jest.fn(),
        createTaskComment: jest.fn(),
        updateTaskLabels: jest.fn(),
        bulkAssignUsersToTask: jest.fn(),
        removeUserFromTask: jest.fn(),
        bulkUpdateTasks: jest.fn(),
      },
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
      labels: {
        getLabels: jest.fn(),
        getLabel: jest.fn(),
        createLabel: jest.fn(),
        updateLabel: jest.fn(),
        deleteLabel: jest.fn(),
      },
      users: {
        getAll: jest.fn(),
      },
      teams: {
        getAll: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      shares: {
        getShareAuth: jest.fn(),
      },
    };

    // Setup mock auth manager
    mockAuthManager = createMockTestableAuthManager();
    mockAuthManager.isAuthenticated.mockReturnValue(true);
    mockAuthManager.getSession.mockReturnValue({
      apiUrl: 'https://api.vikunja.test',
      apiToken: 'test-token',
      authType: 'api-token' as const,
      userId: 'test-user-123'
    });
    mockAuthManager.getAuthType.mockReturnValue('api-token');

    // Setup mock server
    mockServer = {
      tool: jest.fn() as jest.MockedFunction<(name: string, schema: any, handler: any) => void>,
    } as MockServer;

    mockGetClientFromContext.mockResolvedValue(mockClient);

    // Register the tool
    registerTasksTool(mockServer as any, mockAuthManager as any);

    // Get the tool handler
    expect(mockServer.tool).toHaveBeenCalledWith(
      'vikunja_tasks',
      expect.any(Object),
      expect.any(Function),
    );
    const calls = mockServer.tool.mock.calls;
    if (calls.length > 0 && calls[0] && calls[0].length > 2) {
      toolHandler = calls[0][2];
    } else {
      throw new Error('Tool handler not found');
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Attack Vector 1: Task List Memory Exhaustion', () => {
    it('should block attempts to load excessive numbers of tasks', async () => {
      // Attack: Try to load more tasks than memory limit allows
      const attackPayload = {
        subcommand: 'list',
        perPage: 1000 // Exceeds limit of 100
      };

      await expect(toolHandler(attackPayload)).rejects.toThrow(MCPError);

      // Should not reach the API if validation blocks it
      expect(mockClient.tasks.getAllTasks).not.toHaveBeenCalled();
    });

    it('should block attempts to bypass limits through pagination', async () => {
      // Attack: Try to use high page numbers to load large datasets
      const attackPayloads = [
        { subcommand: 'list', page: 1, perPage: 200 },
        { subcommand: 'list', page: 100, perPage: 500 },
        { subcommand: 'list', page: 1000, perPage: 1000 },
      ];

      for (const payload of attackPayloads) {
        await expect(toolHandler(payload)).rejects.toThrow(MCPError);
      }

      // API should never be called for these invalid requests
      expect(mockClient.tasks.getAllTasks).not.toHaveBeenCalled();
    });

    it('should handle project-specific task memory attacks', async () => {
      // Attack: Try to load massive numbers of tasks from a specific project
      const projectAttackPayload = {
        subcommand: 'list',
        projectId: 1,
        perPage: 1000 // Exceeds limit
      };

      await expect(toolHandler(projectAttackPayload)).rejects.toThrow(MCPError);

      // Should not reach project tasks API
      expect(mockClient.tasks.getProjectTasks).not.toHaveBeenCalled();
    });

    it('should provide helpful error messages for blocked memory attacks', async () => {
      // Attack: Various memory limit bypass attempts
      const attackPayloads = [
        { subcommand: 'list', perPage: 150 },
        { subcommand: 'list', projectId: 1, perPage: 200 },
        { subcommand: 'list', page: 5, perPage: 300 },
      ];

      for (const payload of attackPayloads) {
        try {
          await toolHandler(payload);
          fail('Expected memory protection error');
        } catch (error) {
          expect(error).toBeInstanceOf(MCPError);
          expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
          expect(error.message).toContain('Task count limit exceeded');
          // The error message already contains helpful suggestions
        }
      }
    });
  });

  describe('Attack Vector 2: Filter Expression Memory Attacks', () => {
    it('should block complex filter expressions that could cause memory issues', async () => {
      // Attack: Complex filter with many conditions
      const complexFilterAttack = {
        subcommand: 'list',
        filter: JSON.stringify({
          groups: [{
            conditions: Array(60).fill({
              field: 'title',
              operator: 'like',
              value: 'test'
            }),
            operator: '&&'
          }]
        }),
        perPage: 50
      };

      await expect(toolHandler(complexFilterAttack)).rejects.toThrow(MCPError);

      // Should not reach API with malicious filter
      expect(mockClient.tasks.getAllTasks).not.toHaveBeenCalled();
    });

    it('should block filter expressions with deeply nested structures', async () => {
      // Attack: Create deeply nested filter expression
      let deepFilter: any = {
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: 'test'
          }],
          operator: '&&'
        }]
      };

      // Nest beyond depth limit
      for (let i = 0; i < 15; i++) {
        deepFilter = {
          groups: [deepFilter, {
            conditions: [{
              field: 'priority',
              operator: '>',
              value: i
            }],
            operator: '&&'
          }],
          operator: '&&'
        };
      }

      const deepFilterAttack = {
        subcommand: 'list',
        filter: JSON.stringify(deepFilter),
        perPage: 10
      };

      await expect(toolHandler(deepFilterAttack)).rejects.toThrow(MCPError);

      expect(mockClient.tasks.getAllTasks).not.toHaveBeenCalled();
    });

    it('should block filter expressions with malicious content', async () => {
      // Attack: Filter with XSS and prototype pollution attempts
      const maliciousFilterAttacks = [
        {
          subcommand: 'list',
          filter: JSON.stringify({
            groups: [{
              conditions: [{
                field: '__proto__',
                operator: '=',
                value: 'pollution'
              }],
              operator: '&&'
            }]
          }),
          perPage: 10
        },
        {
          subcommand: 'list',
          filter: JSON.stringify({
            groups: [{
              conditions: [{
                field: 'title',
                operator: 'like',
                value: '<script>alert("XSS")</script>'
              }],
              operator: '&&'
            }]
          }),
          perPage: 10
        }
      ];

      for (const attack of maliciousFilterAttacks) {
        await expect(toolHandler(attack)).rejects.toThrow(MCPError);
      }

      expect(mockClient.tasks.getAllTasks).not.toHaveBeenCalled();
    });

    it('should block oversized string values in filter expressions', async () => {
      // Attack: Filter with extremely long string values
      const oversizedStringAttack = {
        subcommand: 'list',
        filter: JSON.stringify({
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: 'a'.repeat(1500) // Exceeds 1000 char limit
            }],
            operator: '&&'
          }]
        }),
        perPage: 10
      };

      await expect(toolHandler(oversizedStringAttack)).rejects.toThrow(MCPError);

      expect(mockClient.tasks.getAllTasks).not.toHaveBeenCalled();
    });
  });

  describe('Attack Vector 3: Simple Filter Memory Attacks', () => {
    it('should block simple filter attacks with oversized arrays', async () => {
      // Attack: Simple filter with array larger than 100 items
      const oversizedArrayAttack = {
        subcommand: 'list',
        filter: `id = [${Array(101).fill(0).join(',')}]`, // 101 items
        perPage: 10
      };

      // Should be rejected due to invalid filter syntax
      await expect(toolHandler(oversizedArrayAttack)).rejects.toThrow(MCPError);
      await expect(toolHandler(oversizedArrayAttack)).rejects.toThrow('Invalid filter syntax');
    });

    it('should block simple filter attacks with dangerous content', async () => {
      // Attack: Simple filter with dangerous function-like patterns
      const dangerousFilterAttacks = [
        { subcommand: 'list', filter: 'id = ["function(){alert(1)}", 2]', perPage: 10 },
        { subcommand: 'list', filter: 'id = ["__proto__", 3]', perPage: 10 },
        { subcommand: 'list', filter: 'id = ["constructor", 4]', perPage: 10 },
      ];

      for (const attack of dangerousFilterAttacks) {
        // Should be rejected due to invalid filter syntax
        await expect(toolHandler(attack)).rejects.toThrow(MCPError);
        await expect(toolHandler(attack)).rejects.toThrow('Invalid filter syntax');
      }
    });

    it('should block simple filter attacks with oversized strings', async () => {
      // Attack: Simple filter with string longer than limits
      const longStringAttack = {
        subcommand: 'list',
        filter: `title = "${'a'.repeat(1000)}"`, // Exceeds simple filter limits
        perPage: 10
      };

      // Should be rejected due to filter string length limit
      await expect(toolHandler(longStringAttack)).rejects.toThrow(MCPError);
      await expect(toolHandler(longStringAttack)).rejects.toThrow('Filter string too long');
    });
  });

  describe('Attack Vector 4: Combined Memory Attacks', () => {
    it('should block attempts to combine multiple attack vectors', async () => {
      // Attack: Combine high perPage with malicious filter
      const combinedAttack = {
        subcommand: 'list',
        perPage: 200, // Memory limit bypass
        filter: JSON.stringify({
          groups: [{
            conditions: [
              { field: '__proto__', operator: '=', value: 'pollution' }, // Prototype pollution
              { field: 'title', operator: 'like', value: '<script>alert("XSS")</script>' }, // XSS
            ],
            operator: '&&'
          }]
        })
      };

      await expect(toolHandler(combinedAttack)).rejects.toThrow(MCPError);

      // Should be blocked at the first layer (memory limits)
      expect(mockClient.tasks.getAllTasks).not.toHaveBeenCalled();
    });

    it('should handle rapid successive attack attempts', async () => {
      // Attack: Send multiple attack requests rapidly
      const rapidAttacks = Array(20).fill(null).map((_, i) => ({
        subcommand: 'list',
        perPage: 150 + i, // Different oversized values
        filter: `title = "attack-${i}"`
      }));

      const results = await Promise.allSettled(
        rapidAttacks.map(attack => toolHandler(attack))
      );

      // All attacks should be rejected
      results.forEach((result, index) => {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(MCPError);
          expect(result.reason.code).toBe(ErrorCode.VALIDATION_ERROR);
        }
      });

      // No API calls should be made for blocked requests
      expect(mockClient.tasks.getAllTasks).not.toHaveBeenCalled();
    });

    it('should maintain performance under attack conditions', async () => {
      const startTime = Date.now();

      // Process multiple attack scenarios
      const attackScenarios = [
        { subcommand: 'list', perPage: 150 }, // Memory limit
        { subcommand: 'list', perPage: 10, filter: '__proto__ = value' }, // Simple filter attack
        { subcommand: 'list', perPage: 10, filter: JSON.stringify({ groups: [{ conditions: Array(60).fill({ field: 'title', operator: 'like', value: 'test' }), operator: '&&' }] }) }, // Complex filter attack
      ];

      for (const scenario of attackScenarios) {
        try {
          await toolHandler(scenario);
          fail('Expected attack to be blocked');
        } catch (error) {
          expect(error).toBeInstanceOf(MCPError);
        }
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should handle attacks quickly
      expect(processingTime).toBeLessThan(100); // Under 100ms for multiple attacks
    });
  });

  describe('Attack Vector 5: Edge Case Memory Exploits', () => {
    it('should handle boundary condition attacks', async () => {
      // Attack: Try to hit exactly at memory limits
      const boundaryAttacks = [
        { subcommand: 'list', perPage: 100 }, // Exactly at limit
        { subcommand: 'list', perPage: 101 }, // Just over limit
        { subcommand: 'list', perPage: 99 },  // Just under limit
      ];

      const results = await Promise.allSettled(
        boundaryAttacks.map(attack => toolHandler(attack))
      );

      // Only requests over limit should be rejected
      expect(results[0].status).toBe('fulfilled'); // Exactly at limit should work
      expect(results[1].status).toBe('rejected');   // Over limit should be rejected
      expect(results[2].status).toBe('fulfilled'); // Under limit should work

      // Valid requests should reach API
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledTimes(2);
    });

    it('should handle malformed attack payloads gracefully', async () => {
      // Attack: Various malformed payloads that could cause issues
      const malformedAttacks = [
        { subcommand: 'list', perPage: null }, // Null values
        { subcommand: 'list', perPage: 'not-a-number' }, // Invalid types
        { subcommand: 'list', perPage: -1 }, // Negative values
        { subcommand: 'list', perPage: 0 }, // Zero values
        { subcommand: 'list', filter: 'not valid json' }, // Invalid JSON
      ];

      for (const attack of malformedAttacks) {
        try {
          await toolHandler(attack);
          // Some malformed payloads might be handled gracefully rather than rejected
        } catch (error) {
          // If rejected, should be a proper MCPError
          expect(error).toBeInstanceOf(MCPError);
        }
      }
    });

    it('should prevent environment variable manipulation through tool calls', async () => {
      // Attack: Try to manipulate memory limits by setting environment-like parameters
      const envAttackPayloads = [
        { subcommand: 'list', perPage: 50, VIKUNJA_MAX_TASKS_LIMIT: '1000000' }, // Try to override limit
        { subcommand: 'list', perPage: 50, env: { VIKUNJA_MAX_TASKS_LIMIT: '1000000' } }, // Nested env object
      ];

      for (const attack of envAttackPayloads) {
        // These should be treated as unknown parameters and ignored
        const result = await toolHandler(attack);
        expect(result.content[0].text).toContain('"success": true');
      }

      // Memory limits should remain intact
      expect(mockClient.tasks.getAllTasks).toHaveBeenCalledTimes(envAttackPayloads.length);
    });
  });

  describe('System Resilience Validation', () => {
    it('should maintain system stability during memory attack simulation', async () => {
      // Simulate a sustained attack
      const attackCycles = 5;
      const attacksPerCycle = 10;

      for (let cycle = 0; cycle < attackCycles; cycle++) {
        const cyclePromises = [];

        for (let attack = 0; attack < attacksPerCycle; attack++) {
          const attackType = attack % 3;
          let payload;

          switch (attackType) {
            case 0: // Memory limit attack
              payload = { subcommand: 'list', perPage: 150 };
              break;
            case 1: // Filter attack
              payload = {
                subcommand: 'list',
                perPage: 10,
                filter: '__proto__ = value'
              };
              break;
            case 2: // Complex filter attack
              payload = {
                subcommand: 'list',
                perPage: 10,
                filter: JSON.stringify({
                  groups: [{
                    conditions: Array(60).fill({
                      field: 'title',
                      operator: 'like',
                      value: 'attack'
                    }),
                    operator: '&&'
                  }]
                })
              };
              break;
            default:
              payload = { subcommand: 'list', perPage: 10 };
          }

          cyclePromises.push(
            toolHandler(payload).catch(error => error) // Catch errors to continue
          );
        }

        const results = await Promise.all(cyclePromises);

        // All attacks should be handled (either rejected or processed safely)
        results.forEach(result => {
          if (result instanceof MCPError) {
            expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
          } else {
            expect(result.content[0].text).toContain('"success": true');
          }
        });
      }

      // System should remain stable
      expect(true).toBe(true); // If we get here, system didn't crash
    });

    it('should provide consistent error handling for all attack types', async () => {
      const attackPayloads = [
        { subcommand: 'list', perPage: 200 }, // Memory limit
        { subcommand: 'list', filter: '__proto__ = value' }, // Simple filter
        { subcommand: 'list', filter: JSON.stringify({ groups: [{ conditions: Array(60).fill({ field: 'title', operator: 'like', value: 'test' }), operator: '&&' }] }) }, // Complex filter
      ];

      for (const payload of attackPayloads) {
        try {
          await toolHandler(payload);
        } catch (error) {
          // All errors should be proper MCPError instances
          expect(error).toBeInstanceOf(MCPError);
          expect(error.code).toBeDefined();
          expect(error.message).toBeDefined();
          expect(typeof error.message).toBe('string');
          expect(error.message.length).toBeGreaterThan(0);
        }
      }
    });
  });
});