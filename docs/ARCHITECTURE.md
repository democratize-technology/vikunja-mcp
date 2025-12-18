# Architecture

The Vikunja MCP project follows MCP SDK best practices:

- **MCP Server**: Built with `@modelcontextprotocol/sdk`
- **Transport**: StdIO for Claude Desktop integration
- **Tools**: Zod-validated parameters with subcommand pattern
- **Authentication**: Session-based with AuthManager
- **Error Handling**: Custom MCPError with proper error codes
- **Type Safety**: Full TypeScript with strict mode

## Component Overview

### AuthManager
Handles session management and authentication state:
- Supports both API tokens and JWT authentication
- Maintains single instance throughout server lifetime
- Automatic token refresh for JWT sessions

### Tool Pattern
Each tool follows a consistent subcommand pattern:
- Main command with subcommands for related operations
- Zod validation for all parameters
- Standardized response formats
- Comprehensive error handling

### Client Management
Uses singleton pattern for Vikunja client:
- Single client instance per session
- Automatic cleanup on disconnect
- Thread-safe authentication state

### Error Hierarchy
- `MCPError` - Base error class with proper error codes
- Tool-specific error handling with helpful messages
- API error translation to user-friendly messages

### Retry Logic
Implements exponential backoff for transient failures:
- Authentication errors: 3 retries with 1s initial delay, doubling each time
- Network errors: 5 retries with 500ms initial delay, 1.5x backoff factor
- Maximum delay capped at 10s for auth errors, 30s for network errors
- Non-retryable errors (validation, not found) fail immediately
- Error messages include retry count for transparency