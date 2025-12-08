/**
 * Tool Blocklist Management
 * Allows users to disable specific tools via VIKUNJA_DISABLED_TOOLS environment variable
 * to reduce token usage in MCP clients.
 *
 * Core tools (auth, tasks) cannot be disabled as they are essential for basic functionality.
 */

/**
 * Core tools that cannot be disabled
 */
export const CORE_TOOLS = ['auth', 'tasks'] as const;

/**
 * Tools that can be disabled via blocklist
 */
export const BLOCKABLE_TOOLS = [
  'projects',
  'labels',
  'teams',
  'filters',
  'templates',
  'webhooks',
  'batch-import',
  'users',
  'export',
] as const;

/**
 * All known tool names (core + blockable)
 */
export const ALL_TOOLS = [...CORE_TOOLS, ...BLOCKABLE_TOOLS] as const;

export type CoreTool = (typeof CORE_TOOLS)[number];
export type BlockableTool = (typeof BLOCKABLE_TOOLS)[number];
export type ToolName = (typeof ALL_TOOLS)[number];

/**
 * Result of blocklist validation
 */
export interface BlocklistValidation {
  /** Valid blockable tools found in blocklist */
  valid: string[];
  /** Unknown tool names that don't exist */
  invalid: string[];
  /** Core tools that were attempted to be blocked (ignored) */
  protected: string[];
}

/**
 * Parse the VIKUNJA_DISABLED_TOOLS environment variable into a Set of tool names
 *
 * @param envVar - The raw environment variable value (comma-separated list)
 * @returns Set of tool names to block
 */
export function parseBlocklist(envVar?: string): Set<string> {
  if (!envVar || envVar.trim() === '') {
    return new Set();
  }

  const tools = envVar
    .split(',')
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0);

  return new Set(tools);
}

/**
 * Check if a tool is blocked
 *
 * Core tools (auth, tasks) are never blocked, even if they appear in the blocklist.
 *
 * @param toolName - The name of the tool to check
 * @param blocklist - Set of blocked tool names
 * @returns true if the tool should be blocked, false otherwise
 */
export function isToolBlocked(toolName: string, blocklist: Set<string>): boolean {
  // Core tools are never blocked
  if ((CORE_TOOLS as readonly string[]).includes(toolName)) {
    return false;
  }

  return blocklist.has(toolName);
}

/**
 * Validate a blocklist and categorize its entries
 *
 * @param blocklist - Set of tool names from the blocklist
 * @returns Categorized validation result
 */
export function validateBlocklist(blocklist: Set<string>): BlocklistValidation {
  const valid: string[] = [];
  const invalid: string[] = [];
  const protected_: string[] = [];

  for (const tool of blocklist) {
    if ((CORE_TOOLS as readonly string[]).includes(tool)) {
      protected_.push(tool);
    } else if ((BLOCKABLE_TOOLS as readonly string[]).includes(tool)) {
      valid.push(tool);
    } else {
      invalid.push(tool);
    }
  }

  return {
    valid,
    invalid,
    protected: protected_,
  };
}

/**
 * Log warnings for invalid blocklist entries
 *
 * @param validation - The validation result from validateBlocklist
 */
export function logBlocklistWarnings(validation: BlocklistValidation): void {
  if (validation.invalid.length > 0) {
    console.warn(
      `[WARN] Unknown tools in VIKUNJA_DISABLED_TOOLS will be ignored: ${validation.invalid.join(', ')}`
    );
    console.warn(`[WARN] Valid tool names are: ${BLOCKABLE_TOOLS.join(', ')}`);
  }

  if (validation.protected.length > 0) {
    console.warn(
      `[WARN] Core tools cannot be disabled and will remain active: ${validation.protected.join(', ')}`
    );
  }
}
