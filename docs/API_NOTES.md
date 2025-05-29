# Vikunja API Implementation Notes

This document captures important implementation details and API quirks discovered during development and testing.

## Known API Issues

### User Endpoint Authentication
The `/user` endpoint fails with authentication errors despite using a valid token that works for all other endpoints. This appears to be a server-side issue with the Vikunja API where the user endpoints have different authentication requirements or middleware.

**Symptoms:**
- Error: "missing, malformed, expired or otherwise invalid token provided"
- Occurs only on user-related endpoints (`/user`, `/users`)
- Same token works perfectly for projects, tasks, teams, etc.

**Current Workaround:**
- The MCP server detects this specific error and provides a helpful message
- Users should contact their Vikunja server administrator to resolve the issue

## API Quirks and Gotchas

### Task Object Properties

1. **Dual ID Properties**: Task objects contain both `project_id` and `projectId`
   - Both refer to the same value
   - API returns both for backwards compatibility
   - Use `project_id` when sending data to API
   - Both properties appear in responses

2. **Priority Range**: Tasks support priority values from 0-5 (inclusive)
   - Not 0-10 as might be expected
   - 0 = lowest priority
   - 5 = highest priority

3. **Recurring Tasks**: Tasks can repeat at regular intervals
   - **API Implementation**: 
     - `repeat_after`: Time in seconds between repetitions (0 = no repeat)
     - `repeat_mode`: Integer enum (0 = default, 1 = monthly, 2 = from current date)
   - **MCP Server Interface**: For ease of use, the MCP server accepts:
     - `repeatAfter`: Number of units (days, weeks, months, years)
     - `repeatMode`: String literals ("day", "week", "month", "year")
     - The server automatically converts these to the correct API format
   - When a recurring task is marked done, Vikunja automatically creates the next occurrence
   - Example: `repeatAfter: 7, repeatMode: "day"` = weekly task (converted to `repeat_after: 604800, repeat_mode: 0`)

### Date Handling

- All date fields must be valid ISO 8601 format
- Example: `2024-05-24T10:00:00Z`
- Invalid dates will cause validation errors
- Timezone information is preserved

### ID Validation

- All IDs must be positive integers
- Zero or negative values are rejected

### Project Sharing

Project sharing allows creating public or private links to share projects with external users.

1. **Share Properties**:
   - `right`: Permission level (0=Read, 1=Write, 2=Admin)
   - `password`: Optional password protection
   - `expires`: Optional expiration date (ISO 8601 format)
   - `label`: User-defined label for managing shares
   - `hash`: Unique identifier for the share link
   - `sharing_url`: Full URL for accessing the share (server-generated)

2. **Share Authentication**:
   - Public shares can be accessed without authentication
   - Password-protected shares require calling `auth-share` first
   - Authentication returns a token for accessing the shared project
   - The token should be used for subsequent API calls to the shared project

3. **Limitations**:
   - No update method for shares - must delete and recreate to modify
   - Passwords cannot be retrieved after creation
   - Share permissions are fixed at creation time

## Operation Patterns

### Assignee Management

The update operation uses diff-based logic for efficiency:
1. Get current assignees
2. Calculate additions and removals
3. Remove users no longer assigned
4. Add new users via bulk operation

This minimizes API calls compared to replacing all assignees.

### Multi-Step Operations

**Warning**: Operations are not atomic. For example, when creating a task with labels:
1. Task is created first
2. Labels are assigned in a separate call
3. If label assignment fails, the task already exists

This creates a race condition in task creation.

## MCP-Specific Limitations

1. **File Attachments**: Cannot be implemented due to MCP protocol limitations
   - The `attach` subcommand returns NOT_IMPLEMENTED error
   - This is a permanent limitation of the MCP context

2. **Response Format Inconsistency**: Different operations return data in slightly different formats
   - Future work needed for standardization

## Error Handling Patterns

### Error Types
- `AUTH_REQUIRED`: User needs to authenticate first
- `VALIDATION_ERROR`: Input validation failed
- `API_ERROR`: Vikunja API returned an error
- `NOT_IMPLEMENTED`: Feature not available in MCP context
- `INTERNAL_ERROR`: Unexpected errors

### Network Errors
- Rate limiting returns status 429
- Connection errors have code ECONNREFUSED
- Always wrap in meaningful error messages

## Testing Discoveries

1. **Mock Isolation**: All tests must mock the node-vikunja client completely
2. **Type Safety**: Current tests use `any` for mocks, but typed mocks would be better
3. **Edge Cases**: Empty arrays and undefined fields must be handled gracefully

## Bulk Operations

### Performance Characteristics

1. **Bulk Create**: Creates multiple tasks in a single project
   - Maximum: 100 tasks per operation (enforced)
   - Creates tasks sequentially (not parallel)
   - Handles partial failures gracefully
   - Automatic cleanup if label/assignee assignment fails

2. **Bulk Update**: Updates the same field across multiple tasks
   - Fetches each task to get current state
   - Applies updates individually
   - Returns all updated tasks
   - Performance: O(n) API calls where n = number of tasks

3. **Bulk Delete**: Deletes multiple tasks
   - Fetches task details before deletion for response
   - Deletes tasks individually
   - Handles partial failures
   - Recommended: Process in batches of 20 or fewer

### Implementation Notes

- No native bulk API endpoints in Vikunja
- All bulk operations are client-side implementations
- Consider rate limiting when processing large batches
- Each operation makes individual API calls

## Future Considerations

1. **Transaction Support**: Consider implementing rollback mechanisms for multi-step operations
2. **Native Batch Operations**: Future Vikunja API versions may support native bulk endpoints
3. **Caching**: Authentication tokens could be cached more efficiently
4. **Response Streaming**: Large result sets might benefit from streaming
5. **Parallel Processing**: Bulk operations could be parallelized with rate limiting

## Filter Implementation Notes

### SQL-like Filter Syntax
The Vikunja API supports SQL-like filter syntax as documented. Filters should be passed using the `filter` parameter (not `filter_by`).

**Supported Features:**
- Complex filters with parentheses: `(priority >= 4 && done = false)`
- Boolean operators: `&&`, `||`, `AND`, `OR`
- Comparison operators: `=`, `!=`, `>`, `>=`, `<`, `<=`
- Like operator: `~` or `LIKE`
- In operator: `IN`, `NOT IN`

**Implementation:**
- Filters are passed directly to the API via the `filter` parameter
- No conversion or preprocessing is performed on filter strings
- The API handles all filter parsing and validation

## Related Issues

---

*Last updated: 2025-05-26 - Added filter implementation notes*
