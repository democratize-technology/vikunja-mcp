# Vikunja MCP Server Technical Specification

## Overview

The Vikunja MCP Server enables AI assistants (particularly Claude) to interact with Vikunja task management instances through the Model Context Protocol. This server acts as a bridge between AI assistants and the Vikunja API, providing intuitive tools for task management operations.

## Architecture

### Core Components

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   AI Assistant  │────▶│   MCP Server     │────▶│  Vikunja API    │
│    (Claude)     │◀────│  (TypeScript)    │◀────│   (REST API)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  node-vikunja    │
                        │   (NPM Package)  │
                        └──────────────────┘
```

### Technology Stack

- **Language**: TypeScript with strict mode
- **Runtime**: Node.js 20+ (LTS versions only - no EOL/zombie versions)
- **MCP SDK**: @modelcontextprotocol/sdk
- **API Client**: node-vikunja (NPM package)
- **Testing**: Jest with mocked responses
- **Code Quality**: ESLint + Prettier

## Tool Design

### Tool Structure with Subcommands

To optimize for Claude's understanding while conserving tokens, we'll use a hierarchical tool structure with subcommands:

```typescript
// Main tools with subcommands
vikunja_auth      // Authentication management
vikunja_tasks     // Task operations
vikunja_projects  // Project operations
vikunja_labels    // Label management
vikunja_teams     // Team operations
vikunja_users     // User operations
```

### Tool Definitions

#### 1. Authentication Tool
```typescript
tool: "vikunja_auth"
subcommands:
  - connect: Initialize connection with API token
  - status: Check authentication status
  - refresh: Refresh authentication token

parameters:
  connect:
    - apiUrl: string (required)
    - apiToken: string (required)
```

#### 2. Tasks Tool (✅ IMPLEMENTED)
```typescript
tool: "vikunja_tasks"
subcommands:
  - create: Create a new task
  - get: Get task details
  - update: Update task properties (including done status)
  - delete: Delete a task
  - list: List tasks with filters
  - assign: Bulk assign users to task
  - unassign: Remove specific users from task
  - attach: Add attachment to task (NOT IMPLEMENTED - MCP limitation)
  - comment: Add or list comments on task
  - relate: Create task relations
  - unrelate: Remove task relations
  - relations: List all task relations
  - bulk-create: Create multiple tasks at once (max 100)
  - bulk-update: Update same field across multiple tasks
  - bulk-delete: Delete multiple tasks at once

parameters:
  create:
    - title: string (required)
    - description?: string
    - projectId: number (required)
    - dueDate?: string (ISO 8601 - validated)
    - priority?: number (0-5)
    - labels?: number[]
    - assignees?: number[] (user IDs)

  list:
    - projectId?: number
    - allProjects?: boolean
    - filter?: string
    - page?: number
    - perPage?: number
    - sort?: string
    - search?: string
    - done?: boolean

  update:
    - id: number (required)
    - title?: string
    - description?: string
    - dueDate?: string (ISO 8601 - validated)
    - priority?: number (0-5)
    - done?: boolean
    - labels?: number[]
    - assignees?: number[] (uses diff-based updates)
    - repeatAfter?: number
    - repeatMode?: string (day, week, month, year)

  bulk-create:
    - projectId: number (required)
    - tasks: array (required, max 100 items)
      - title: string (required)
      - description?: string
      - dueDate?: string
      - priority?: number
      - labels?: number[]
      - assignees?: number[]
      - repeatAfter?: number
      - repeatMode?: string

  bulk-update:
    - taskIds: number[] (required)
    - field: string (required) - done, priority, due_date, project_id, assignees, labels
    - value: any (required) - new value for the field

  bulk-delete:
    - taskIds: number[] (required)

Implementation notes:
- Input validation: IDs must be positive integers, dates must be ISO 8601
- Assignee updates use efficient diff-based approach (only add/remove differences)
- Multi-step operations (create with labels/assignees) may need rollback handling
- All operations require authentication
```

#### 3. Projects Tool
```typescript
tool: "vikunja_projects"
subcommands:
  - create: Create a new project
  - get: Get project details
  - update: Update project
  - delete: Delete project
  - list: List all projects
  - share: Share project via link

parameters:
  create:
    - title: string (required)
    - description?: string
    - color?: string
    - isArchived?: boolean
```

#### 4. Labels Tool
```typescript
tool: "vikunja_labels"
subcommands:
  - create: Create a new label
  - get: Get label details
  - update: Update label
  - delete: Delete label
  - list: List all labels

parameters:
  create:
    - title: string (required)
    - description?: string
    - color?: string
```

#### 5. Teams Tool
```typescript
tool: "vikunja_teams"
subcommands:
  - create: Create a new team
  - get: Get team details
  - update: Update team
  - delete: Delete team
  - list: List teams
  - addMember: Add user to team
  - removeMember: Remove user from team

parameters:
  create:
    - name: string (required)
    - description?: string
```

#### 6. Users Tool
```typescript
tool: "vikunja_users"
subcommands:
  - get: Get user details
  - search: Search for users
  - current: Get current user info

parameters:
  search:
    - query: string (required)
```

## Authentication Flow

### Session-Based Authentication

1. **Initial Connection**
   ```typescript
   // User provides API token through vikunja_auth.connect
   // Token stored in MCP session context
   interface AuthSession {
     apiUrl: string;
     apiToken: string;
     tokenExpiry?: Date;
     userId?: string;
   }
   ```

2. **Token Storage**
   - Tokens stored in memory during MCP session
   - No persistence between sessions for security
   - User must re-authenticate on new sessions

3. **Automatic Token Refresh**
   ```typescript
   // Middleware to check token expiry before API calls
   async function ensureValidToken(session: AuthSession): Promise<void> {
     if (isTokenExpired(session)) {
       await refreshToken(session);
     }
   }
   ```

## Data Models

### Response Format

For v1, we'll return unmodified Vikunja API responses to maintain compatibility:

```typescript
interface TaskResponse {
  id: number;
  title: string;
  description: string;
  done: boolean;
  doneAt: string | null;
  dueDate: string | null;
  priority: number;
  labels: Label[];
  assignees: User[];
  // ... other Vikunja fields
}
```

### Error Handling

```typescript
interface MCPError {
  code: string;
  message: string;
  details?: {
    vikunjaError?: any;
    statusCode?: number;
    endpoint?: string;
  };
}

// Error codes
enum ErrorCode {
  AUTH_REQUIRED = "AUTH_REQUIRED",
  AUTH_FAILED = "AUTH_FAILED",
  NOT_FOUND = "NOT_FOUND",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  API_ERROR = "API_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR"
}
```

## Testing Strategy

### Testing Philosophy

**"If it can't be tested, it shouldn't exist"**

- Every line of code must be testable
- No untestable code patterns (e.g., unreachable branches)
- Remove code that cannot be meaningfully tested
- Test-driven development encouraged
- Coverage enforcement: builds fail below 100%

### Unit Testing with Mocked Responses

```typescript
// Mock Vikunja API responses
jest.mock('node-vikunja');

describe('Tasks Tool', () => {
  it('should create a task with valid data', async () => {
    // Mock the SDK response
    mockVikunjaClient.tasks.create.mockResolvedValue({
      id: 1,
      title: 'Test Task',
      // ... mocked response matching Vikunja API
    });

    // Test through MCP tool
    const result = await tasksTool.execute({
      subcommand: 'create',
      title: 'Test Task',
      projectId: 1
    });

    // Verify SDK was called correctly
    expect(mockVikunjaClient.tasks.create).toHaveBeenCalledWith({
      title: 'Test Task',
      projectId: 1
    });
  });
});
```

### Test Coverage Requirements

- **All Paths**: 100% coverage required
  - Every function must be tested
  - Every branch must be covered
  - Every error condition must be verified
  - If code cannot be tested, it must be removed
- **Integration Points**: Mock all external API calls
- **Edge Cases**: Invalid inputs, network errors, auth failures
- **Coverage Enforcement**: Build fails if coverage < 100%

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [x] Project setup and configuration
- [x] Authentication tool implementation
- [x] Basic tasks tool (create, get, list)
- [ ] Basic projects tool (create, get, list)
- [x] Error handling framework
- [ ] Unit tests for core functionality

### Phase 2: Core Features (Week 3-4)
- [x] Complete tasks tool (update, delete, assign, attach)
- [ ] Complete projects tool (update, delete, share)
- [ ] Labels tool implementation
- [x] Enhanced error messages for AI context
- [ ] Integration tests

### Phase 3: Collaboration (Week 5-6)
- [ ] Teams tool implementation
- [ ] Users tool implementation
- [ ] Advanced task operations (comments, relations)
- [ ] Bulk operations support
- [ ] Performance optimizations

### Phase 4: Polish (Week 7-8)
- [ ] Documentation and examples
- [ ] AI-specific usage guides
- [ ] Performance testing
- [ ] Security audit
- [ ] Deployment preparation

## Security Considerations

1. **Token Security**
   - Never log API tokens
   - Clear tokens from memory on disconnect
   - Validate token format before use

2. **Input Validation**
   - Sanitize all user inputs
   - Validate against Vikunja API schemas
   - Prevent injection attacks

3. **Rate Limiting**
   - Implement client-side rate limiting
   - Handle 429 responses gracefully
   - Exponential backoff for retries

## Performance Considerations

1. **Efficient API Usage**
   - Batch operations where possible
   - Use pagination for large datasets
   - Minimize redundant API calls

2. **Response Optimization**
   - Stream large attachments
   - Implement request timeouts
   - Handle partial failures gracefully

## Documentation Requirements

1. **API Documentation**
   - Full tool reference with examples
   - Common workflows and patterns
   - Troubleshooting guide

2. **AI Assistant Guide**
   - Optimal prompting strategies
   - Common task scenarios
   - Integration examples

3. **Developer Documentation**
   - Architecture overview
   - Contributing guidelines
   - Testing procedures

## Success Metrics

1. **Functionality**
   - 100% API coverage for core features
   - All tools accessible to AI assistants
   - Graceful error handling

2. **Quality**
   - 100% test coverage on ALL code paths
   - Zero critical security vulnerabilities
   - Response time < 500ms for basic operations
   - Only testable code in codebase

3. **Usability**
   - Intuitive tool naming and parameters
   - Clear error messages
   - Comprehensive documentation

## Future Enhancements (v2)

1. **Response Optimization**
   - AI-optimized response formats
   - Contextual information inclusion
   - Natural language summaries

2. **Advanced Features**
   - Webhook subscriptions
   - Real-time notifications
   - Complex task queries

3. **Multi-Instance Support**
   - Connection management
   - Instance switching
   - Credential storage

## Development History

### Completed Features

#### Tasks Tool (PR #2 - Merged)
- ✅ Full implementation of all task operations
- ✅ Input validation for dates (ISO 8601) and IDs (positive integers)
- ✅ Efficient diff-based assignee updates
- ✅ Comprehensive error handling with MCPError
- ✅ Authentication checks on all operations

### Outstanding Issues

#### High Priority
- Add comprehensive test suite for tasks tool
  - Unit tests for all operations
  - Integration tests for workflows
  - Edge case coverage

#### Medium Priority
- Handle race condition in task creation with labels/assignees
  - Implement rollback on failure
  - Or document limitation clearly

#### Low Priority
- Standardize response formats across all task operations
  - Create consistent response structure
  - Consider versioning for breaking changes

## Appendix: Example Interactions

### Creating a Task
```
User: "Create a task to review the MCP implementation"

Assistant uses: vikunja_tasks.create
Parameters: {
  title: "Review MCP implementation",
  projectId: 1,
  dueDate: "2024-02-01T17:00:00Z",
  priority: 3
}

Response: {
  id: 42,
  title: "Review MCP implementation",
  ...
}
```

### Listing Projects
```
User: "Show me all my Vikunja projects"

Assistant uses: vikunja_projects.list
Parameters: {}

Response: [
  { id: 1, title: "Personal Tasks", ... },
  { id: 2, title: "Work Projects", ... }
]
```
