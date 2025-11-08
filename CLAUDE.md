# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Development Commands

### Pre-Commit Requirements (ALL must pass)
```bash
npm run lint           # ESLint validation
npm run test:coverage  # Jest with 90%+ branches, 95%+ lines coverage requirement  
npm run typecheck      # TypeScript compilation check
```

### Development Workflow
```bash
npm run build          # TypeScript compilation to dist/
npm run dev            # Watch mode development server with tsx
npm run test:watch     # Jest in watch mode for TDD

# Single test execution
jest tests/tools/tasks.test.ts              # Specific test file
jest -t "should create task"                # Specific test case by pattern
jest tests/tools/tasks-filters.test.ts      # Test specific functionality
```

### Build and Release
```bash
npm run format         # Prettier formatting for src/ and tests/
npm run prepare        # Pre-publish build step
npm run version:patch  # Bump patch version
```

## Architecture Overview

### MCP Server Pattern
This is a **Model Context Protocol (MCP) server** that exposes Vikunja task management operations as tools for AI assistants. The architecture follows a modular design with dependency injection:

- **Entry Point**: `src/index.ts` - Initializes McpServer with stdio transport
- **Tool Registry**: `src/tools/index.ts` - Centralized registration with conditional loading
- **Client Factory**: `src/client.ts` - Session-aware Vikunja API client management
- **Auth Manager**: Centralized authentication with JWT/API token auto-detection

### Tool Design Pattern
Each Vikunja entity follows a consistent **subcommand-based pattern**:
```typescript
server.tool('vikunja_tasks', {
  subcommand: z.enum(['create', 'get', 'update', 'delete', 'list']),
  // ... Zod validation schema
}, async (args) => {
  // Route to specific operation handlers
})
```

### Critical Architecture Decisions

1. **Hybrid Filtering System**
   - Intelligent server-side filtering with client-side fallback
   - Automatic detection of server filtering capabilities
   - Enhanced memory protection with V8-specific memory estimation
   - Located in `src/tools/tasks/index.ts` and `src/utils/filters.ts`

2. **Enhanced Memory Protection System**
   - V8-specific memory estimation algorithms with 93%+ test coverage
   - Risk-based analysis (Low/Medium/High) with conservative 2.5x safety margins
   - Comprehensive task object modeling including nested arrays and dynamic properties
   - Backward compatible with legacy systems while providing improved accuracy
   - Located in `src/utils/memory.ts` with integration in `src/tools/tasks/filtering/FilterValidator.ts`

3. **Conditional Tool Registration**
   - Tools requiring JWT auth only registered when authenticated with JWT
   - API token authentication excludes `users` and `export` tools
   - Authentication type auto-detected by token format

4. **Session Management**
   - In-memory session persistence with client caching
   - Automatic client recreation on credential changes
   - No persistent storage - sessions reset on server restart

## Testing Philosophy & Requirements

### Strict Coverage Thresholds (ACHIEVED)
```json
"coverageThreshold": {
  "global": {
    "branches": 90,    // ✅ Current: 90%+
    "functions": 98,   // ✅ Current: 98.91% 
    "lines": 95,       // ✅ Current: 95%+
    "statements": 95   // ✅ Current: 95%+
  }
}
```

**Achievement**: All coverage thresholds have been met and are maintained through comprehensive test suites covering security scenarios, edge cases, and performance benchmarks.

### Defensive Programming Rule
**If code cannot be tested, it must be removed.** Every defensive pattern (like `|| ''` fallbacks) must have corresponding test cases that trigger those code paths.

Example pattern:
```typescript
// This defensive code MUST be testable
const message = error.message.toLowerCase() || '';
// Test MUST mock scenarios where error.message is undefined
```

### Test Organization
```
tests/
├── tools/           # Mirror src/tools structure exactly
├── auth/           # Authentication edge cases
├── utils/          # Utility function coverage  
└── types/          # Type definition validation
```

### Mock Strategy
- **External Dependencies**: All node-vikunja API calls mocked
- **Edge Cases**: Test malformed API responses, auth failures, network errors
- **Race Conditions**: Dedicated test files for concurrent operations

## Key Dependencies & Integration

### Core Dependencies
- **@modelcontextprotocol/sdk**: MCP server framework and transport layer
- **node-vikunja**: Vikunja API client (dynamically imported for testability)
- **zod**: Runtime validation for MCP tool arguments and responses
- **jest + ts-jest**: Testing with TypeScript support and coverage

### Authentication Strategy
- **API Token** (`tk_*`): Standard auth, excludes user-specific endpoints
- **JWT Token** (`eyJ*`): Full access including user management and export
- **Auto-Detection**: Token format determines authentication type and available tools
- **Security Layer**: Credential masking in logs, secure session management with `src/auth/AuthManager.ts`

### Security Architecture
- **Rate Limiting**: `src/middleware/rate-limiting.ts` - Configurable DoS protection
- **Input Validation**: `src/utils/security.ts` - Sanitization and allowlist validation  
- **Memory Protection**: `src/utils/memory.ts` - Enhanced V8-specific memory estimation with risk analysis and 93%+ test coverage
- **Thread Safety**: `src/storage/FilterStorage.ts` - Concurrent access protection with AsyncMutex

### Error Handling Architecture
- **Centralized Error Utilities**: `src/utils/error-handler.ts` provides standardized error processing
- **MCPError Types**: Structured errors with codes and messages
- **Retry Logic**: Exponential backoff for auth and network failures with `src/utils/retry.ts`
- **Security-Aware Errors**: Credential masking and safe error reporting with `src/utils/security.ts`
- **Batch Operations**: Transaction-like error handling with partial success reporting

## Development Workflow Requirements

### Git Workflow
```bash
git checkout -b feature/implement-new-tool
# Commit early and often during development
git commit -m "wip: add basic tool structure"
git commit -m "feat: implement tool validation"
git commit -m "test: add comprehensive test coverage"

# Before push: ALL checks must pass
npm run lint && npm run test:coverage && npm run typecheck
git push origin feature/implement-new-tool
```

### Adding New Tools
1. Create tool module in `src/tools/[entity]/`
2. Implement with subcommand pattern and Zod validation
3. Register in `src/tools/index.ts` with conditional logic if needed
4. Create test file in `tests/tools/[entity]/` with 100% coverage
5. Update README.md with tool documentation

### Error Handling Pattern
```typescript
try {
  // Vikunja API operation
} catch (error) {
  if (error instanceof MCPError) {
    throw error;  // Re-throw MCP errors
  }
  throw new MCPError(ErrorCode.API_ERROR, error.message);
}
```

## Known Architectural Constraints

1. **Vikunja API Limitations**: 
   - Hybrid filtering implemented to handle server-side inconsistencies
   - Team operations incomplete in node-vikunja library
   - Some user endpoints have authentication issues

2. **MCP Protocol Constraints**:
   - No file attachment support
   - Synchronous tool execution model
   - Limited context sharing between tool calls

3. **Performance Considerations**:
   - Hybrid filtering optimizes performance with server-side attempts first
   - Memory protection prevents unbounded resource consumption
   - Rate limiting with configurable limits per tool category
   - Bulk operations make individual API calls (no batch endpoints)
   - In-memory storage for filters and sessions with thread-safe access

## Version Requirements

- **Node.js**: 20+ LTS only (no EOL versions)
- **TypeScript**: Strict mode enabled
- **Vikunja**: Compatible with v0.22.1+ (with known API filter limitation)

## Repository Configuration

- **Owner**: democratize-technology
- **Branch Strategy**: Feature branches required, no direct main commits
- **PR Requirements**: Documentation updates, test coverage, passing checks