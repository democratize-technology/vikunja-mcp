/**
 * Tests for Tool Blocklist functionality
 */

import {
  parseBlocklist,
  isToolBlocked,
  validateBlocklist,
  logBlocklistWarnings,
  CORE_TOOLS,
  BLOCKABLE_TOOLS,
  ALL_TOOLS,
} from '../../src/tools/blocklist';

describe('Tool Blocklist', () => {
  describe('Constants', () => {
    it('should define core tools that cannot be blocked', () => {
      expect(CORE_TOOLS).toContain('auth');
      expect(CORE_TOOLS).toContain('tasks');
      expect(CORE_TOOLS).toHaveLength(2);
    });

    it('should define all blockable tools', () => {
      expect(BLOCKABLE_TOOLS).toContain('projects');
      expect(BLOCKABLE_TOOLS).toContain('labels');
      expect(BLOCKABLE_TOOLS).toContain('teams');
      expect(BLOCKABLE_TOOLS).toContain('filters');
      expect(BLOCKABLE_TOOLS).toContain('templates');
      expect(BLOCKABLE_TOOLS).toContain('webhooks');
      expect(BLOCKABLE_TOOLS).toContain('batch-import');
      expect(BLOCKABLE_TOOLS).toContain('users');
      expect(BLOCKABLE_TOOLS).toContain('export');
      expect(BLOCKABLE_TOOLS).toHaveLength(9);
    });

    it('should have ALL_TOOLS as combination of core and blockable', () => {
      expect(ALL_TOOLS).toHaveLength(CORE_TOOLS.length + BLOCKABLE_TOOLS.length);
      for (const tool of CORE_TOOLS) {
        expect(ALL_TOOLS).toContain(tool);
      }
      for (const tool of BLOCKABLE_TOOLS) {
        expect(ALL_TOOLS).toContain(tool);
      }
    });
  });

  describe('parseBlocklist', () => {
    it('should return empty set for undefined input', () => {
      const result = parseBlocklist(undefined);
      expect(result.size).toBe(0);
    });

    it('should return empty set for empty string', () => {
      const result = parseBlocklist('');
      expect(result.size).toBe(0);
    });

    it('should return empty set for whitespace-only string', () => {
      const result = parseBlocklist('   ');
      expect(result.size).toBe(0);
    });

    it('should parse single tool name', () => {
      const result = parseBlocklist('teams');
      expect(result.size).toBe(1);
      expect(result.has('teams')).toBe(true);
    });

    it('should parse multiple comma-separated tool names', () => {
      const result = parseBlocklist('teams,templates,webhooks');
      expect(result.size).toBe(3);
      expect(result.has('teams')).toBe(true);
      expect(result.has('templates')).toBe(true);
      expect(result.has('webhooks')).toBe(true);
    });

    it('should trim whitespace from tool names', () => {
      const result = parseBlocklist('  teams , templates  ,  webhooks  ');
      expect(result.size).toBe(3);
      expect(result.has('teams')).toBe(true);
      expect(result.has('templates')).toBe(true);
      expect(result.has('webhooks')).toBe(true);
    });

    it('should filter out empty entries from multiple commas', () => {
      const result = parseBlocklist('teams,,templates,,,webhooks');
      expect(result.size).toBe(3);
      expect(result.has('teams')).toBe(true);
      expect(result.has('templates')).toBe(true);
      expect(result.has('webhooks')).toBe(true);
    });

    it('should handle trailing comma', () => {
      const result = parseBlocklist('teams,templates,');
      expect(result.size).toBe(2);
      expect(result.has('teams')).toBe(true);
      expect(result.has('templates')).toBe(true);
    });

    it('should handle leading comma', () => {
      const result = parseBlocklist(',teams,templates');
      expect(result.size).toBe(2);
      expect(result.has('teams')).toBe(true);
      expect(result.has('templates')).toBe(true);
    });

    it('should deduplicate repeated tool names', () => {
      const result = parseBlocklist('teams,templates,teams,webhooks,teams');
      expect(result.size).toBe(3);
      expect(result.has('teams')).toBe(true);
      expect(result.has('templates')).toBe(true);
      expect(result.has('webhooks')).toBe(true);
    });
  });

  describe('isToolBlocked', () => {
    it('should return false for empty blocklist', () => {
      const blocklist = new Set<string>();
      expect(isToolBlocked('projects', blocklist)).toBe(false);
    });

    it('should return true for tool in blocklist', () => {
      const blocklist = new Set(['teams', 'templates']);
      expect(isToolBlocked('teams', blocklist)).toBe(true);
      expect(isToolBlocked('templates', blocklist)).toBe(true);
    });

    it('should return false for tool not in blocklist', () => {
      const blocklist = new Set(['teams', 'templates']);
      expect(isToolBlocked('projects', blocklist)).toBe(false);
      expect(isToolBlocked('labels', blocklist)).toBe(false);
    });

    it('should never block core tool "auth" even if in blocklist', () => {
      const blocklist = new Set(['auth', 'teams']);
      expect(isToolBlocked('auth', blocklist)).toBe(false);
    });

    it('should never block core tool "tasks" even if in blocklist', () => {
      const blocklist = new Set(['tasks', 'teams']);
      expect(isToolBlocked('tasks', blocklist)).toBe(false);
    });

    it('should protect all core tools', () => {
      const blocklist = new Set([...CORE_TOOLS, 'teams']);
      for (const coreTool of CORE_TOOLS) {
        expect(isToolBlocked(coreTool, blocklist)).toBe(false);
      }
    });

    it('should block all blockable tools when in blocklist', () => {
      const blocklist = new Set([...BLOCKABLE_TOOLS]);
      for (const blockableTool of BLOCKABLE_TOOLS) {
        expect(isToolBlocked(blockableTool, blocklist)).toBe(true);
      }
    });
  });

  describe('validateBlocklist', () => {
    it('should return empty arrays for empty blocklist', () => {
      const blocklist = new Set<string>();
      const result = validateBlocklist(blocklist);
      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(0);
      expect(result.protected).toHaveLength(0);
    });

    it('should categorize valid blockable tools', () => {
      const blocklist = new Set(['teams', 'templates', 'webhooks']);
      const result = validateBlocklist(blocklist);
      expect(result.valid).toContain('teams');
      expect(result.valid).toContain('templates');
      expect(result.valid).toContain('webhooks');
      expect(result.valid).toHaveLength(3);
      expect(result.invalid).toHaveLength(0);
      expect(result.protected).toHaveLength(0);
    });

    it('should categorize unknown tools as invalid', () => {
      const blocklist = new Set(['unknown-tool', 'fake-tool', 'teams']);
      const result = validateBlocklist(blocklist);
      expect(result.valid).toContain('teams');
      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toContain('unknown-tool');
      expect(result.invalid).toContain('fake-tool');
      expect(result.invalid).toHaveLength(2);
      expect(result.protected).toHaveLength(0);
    });

    it('should categorize core tools as protected', () => {
      const blocklist = new Set(['auth', 'tasks', 'teams']);
      const result = validateBlocklist(blocklist);
      expect(result.valid).toContain('teams');
      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(0);
      expect(result.protected).toContain('auth');
      expect(result.protected).toContain('tasks');
      expect(result.protected).toHaveLength(2);
    });

    it('should handle mixed valid, invalid, and protected tools', () => {
      const blocklist = new Set([
        'teams', // valid
        'templates', // valid
        'auth', // protected
        'tasks', // protected
        'unknown1', // invalid
        'unknown2', // invalid
      ]);
      const result = validateBlocklist(blocklist);
      expect(result.valid).toHaveLength(2);
      expect(result.valid).toContain('teams');
      expect(result.valid).toContain('templates');
      expect(result.protected).toHaveLength(2);
      expect(result.protected).toContain('auth');
      expect(result.protected).toContain('tasks');
      expect(result.invalid).toHaveLength(2);
      expect(result.invalid).toContain('unknown1');
      expect(result.invalid).toContain('unknown2');
    });

    it('should validate all blockable tools correctly', () => {
      const blocklist = new Set([...BLOCKABLE_TOOLS]);
      const result = validateBlocklist(blocklist);
      expect(result.valid).toHaveLength(BLOCKABLE_TOOLS.length);
      for (const tool of BLOCKABLE_TOOLS) {
        expect(result.valid).toContain(tool);
      }
      expect(result.invalid).toHaveLength(0);
      expect(result.protected).toHaveLength(0);
    });
  });

  describe('logBlocklistWarnings', () => {
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('should not log anything when all entries are valid', () => {
      const validation = {
        valid: ['teams', 'templates'],
        invalid: [],
        protected: [],
      };
      logBlocklistWarnings(validation);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should log warning for invalid tools', () => {
      const validation = {
        valid: ['teams'],
        invalid: ['unknown-tool', 'fake-tool'],
        protected: [],
      };
      logBlocklistWarnings(validation);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown tools in VIKUNJA_DISABLED_TOOLS')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown-tool')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('fake-tool')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Valid tool names are')
      );
    });

    it('should log warning for protected core tools', () => {
      const validation = {
        valid: ['teams'],
        invalid: [],
        protected: ['auth', 'tasks'],
      };
      logBlocklistWarnings(validation);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Core tools cannot be disabled')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('auth'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('tasks'));
    });

    it('should log warnings for both invalid and protected tools', () => {
      const validation = {
        valid: ['teams'],
        invalid: ['unknown-tool'],
        protected: ['auth'],
      };
      logBlocklistWarnings(validation);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(3); // 2 for invalid (warning + valid list), 1 for protected
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown tools')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Core tools cannot be disabled')
      );
    });
  });

  describe('Integration: Full blocklist workflow', () => {
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('should handle realistic blocklist scenario', () => {
      // Simulate: VIKUNJA_DISABLED_TOOLS=teams,templates,webhooks,filters,batch-import
      const envValue = 'teams,templates,webhooks,filters,batch-import';
      const blocklist = parseBlocklist(envValue);
      const validation = validateBlocklist(blocklist);
      logBlocklistWarnings(validation);

      expect(validation.valid).toHaveLength(5);
      expect(validation.invalid).toHaveLength(0);
      expect(validation.protected).toHaveLength(0);
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      // Verify blocking behavior
      expect(isToolBlocked('teams', blocklist)).toBe(true);
      expect(isToolBlocked('templates', blocklist)).toBe(true);
      expect(isToolBlocked('webhooks', blocklist)).toBe(true);
      expect(isToolBlocked('filters', blocklist)).toBe(true);
      expect(isToolBlocked('batch-import', blocklist)).toBe(true);

      // Verify non-blocked tools
      expect(isToolBlocked('projects', blocklist)).toBe(false);
      expect(isToolBlocked('labels', blocklist)).toBe(false);
      expect(isToolBlocked('users', blocklist)).toBe(false);
      expect(isToolBlocked('export', blocklist)).toBe(false);

      // Verify core tools are never blocked
      expect(isToolBlocked('auth', blocklist)).toBe(false);
      expect(isToolBlocked('tasks', blocklist)).toBe(false);
    });

    it('should handle scenario with typos and core tools', () => {
      // Simulate user error: trying to block core tools and typos
      const envValue = 'auth,tasks,teams,templtes,webhooks'; // 'templtes' is typo
      const blocklist = parseBlocklist(envValue);
      const validation = validateBlocklist(blocklist);
      logBlocklistWarnings(validation);

      expect(validation.valid).toContain('teams');
      expect(validation.valid).toContain('webhooks');
      expect(validation.valid).toHaveLength(2);
      expect(validation.invalid).toContain('templtes');
      expect(validation.invalid).toHaveLength(1);
      expect(validation.protected).toContain('auth');
      expect(validation.protected).toContain('tasks');
      expect(validation.protected).toHaveLength(2);

      // Should have warned about invalid and protected
      expect(consoleWarnSpy).toHaveBeenCalled();

      // Core tools should still not be blocked
      expect(isToolBlocked('auth', blocklist)).toBe(false);
      expect(isToolBlocked('tasks', blocklist)).toBe(false);
    });

    it('should handle empty/no blocklist for backwards compatibility', () => {
      const blocklist = parseBlocklist(undefined);
      const validation = validateBlocklist(blocklist);
      logBlocklistWarnings(validation);

      expect(blocklist.size).toBe(0);
      expect(validation.valid).toHaveLength(0);
      expect(validation.invalid).toHaveLength(0);
      expect(validation.protected).toHaveLength(0);
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      // No tools should be blocked
      for (const tool of ALL_TOOLS) {
        // Core tools are never blocked anyway
        if (!(CORE_TOOLS as readonly string[]).includes(tool)) {
          expect(isToolBlocked(tool, blocklist)).toBe(false);
        }
      }
    });
  });
});
