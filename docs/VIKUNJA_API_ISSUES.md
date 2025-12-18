# Vikunja API Issues

This document tracks issues discovered with the Vikunja API that should be reported to the maintainer.

## 1. ~~SQL-like Filter Syntax Not Supported~~ RESOLVED

**Update (2025-05-26):** This issue has been resolved. The problem was that we were using the wrong parameter name. The API expects `filter` not `filter_by`. Complex filters with parentheses and boolean operators now work correctly.

**Original Issue:** The Vikunja API documentation suggested support for SQL-like filter syntax, but we were getting 500 Internal Server Error when using this format.

**Resolution:** Use the `filter` parameter instead of `filter_by`:
```bash
# This now works correctly
curl -X GET 'https://your-vikunja-instance.com/api/v1/tasks/all?filter=(priority%20%3E%3D%204%20%26%26%20done%20%3D%20false)' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

**Impact:** Users can now use complex filters with multiple conditions as documented.

## 2. User Endpoint Authentication Error - WORKAROUND AVAILABLE

**Status:** Partially resolved with JWT authentication workaround (2025-05-28)

**Description:** The `/user` endpoint and ALL user-related endpoints fail with authentication errors despite using a valid API token that works for all other endpoints.

**Affected Endpoints (verified 2025-05-28):**
- `/user` - Get current user
- `/users` - List all users
- `/users/{id}` - Get user by ID
- `/users?s=query` - Search users
- `/user/settings` - User settings
- `/user/timezones` - Available timezones
- `/user/tokens` - API tokens
- `/user/avatar` - User avatar
- `/user/export/request` - Request data export
- `/user/export/download` - Download data export

**Reproduction:**
```bash
# All of these fail with "missing, malformed, expired or otherwise invalid token provided"
curl -X GET 'https://your-vikunja-instance.com/api/v1/user' \
  -H 'Authorization: Bearer VALID_TOKEN'

curl -X GET 'https://your-vikunja-instance.com/api/v1/users' \
  -H 'Authorization: Bearer VALID_TOKEN'

curl -X GET 'https://your-vikunja-instance.com/api/v1/user/settings' \
  -H 'Authorization: Bearer VALID_TOKEN'

# Same token works for other endpoints
curl -X GET 'https://your-vikunja-instance.com/api/v1/tasks/all' \
  -H 'Authorization: Bearer SAME_VALID_TOKEN'

curl -X GET 'https://your-vikunja-instance.com/api/v1/projects' \
  -H 'Authorization: Bearer SAME_VALID_TOKEN'
```

**Expected:** User endpoints should accept the same API token authentication as other endpoints.

**Actual:** Returns 401 authentication error despite valid token.

**Root Cause (verified 2025-05-28):** User endpoints require JWT session tokens obtained via username/password login, NOT API tokens. API tokens (prefixed with `tk_`) are only valid for non-user resources. There is no endpoint to exchange an API token for a JWT token, making programmatic access to user data require storing credentials.

**Workaround (implemented 2025-05-28):** The Vikunja MCP server now supports JWT authentication:

1. **Extract JWT from browser session:**
   ```bash
   # In browser DevTools → Application → Local Storage → Find 'token' key
   # Copy the JWT token (starts with eyJ...)
   ```

2. **Use JWT authentication in MCP:**
   ```typescript
   vikunja_auth.connect({
     apiUrl: "https://your-vikunja-instance.com/api/v1",
     apiToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
     // Token type is automatically detected!
   })
   ```

3. **Available tools with JWT auth:**
   - `vikunja_users` - Full user management functionality
   - `vikunja_export_project` - Project data export
   - `vikunja_request_user_export` - User data export

**Note:** JWT tokens expire (typically after 24 hours), requiring re-extraction.

**Impact:** 
- Cannot retrieve current user information
- Cannot list or search users for task assignment
- Cannot manage user settings programmatically
- Cannot use data export features
- Batch import cannot assign tasks to users

## 3. Team API Limited Functionality

**Description:** The team-related endpoints have limited functionality compared to other resources.

**Missing Endpoints:**
- GET `/teams/{id}` - Cannot retrieve specific team details
- PUT `/teams/{id}` - Cannot update team information
- GET `/teams/{id}/members` - Cannot list team members

**Note:** DELETE `/teams/{id}` is available and has been implemented in the MCP server.

**Impact:** Team management is partially limited, making it difficult to build complete team-based features.

## 4. Bulk Operations Not Implemented

**Description:** The API lacks native bulk operations for tasks, requiring individual API calls for each operation.

**Missing Features:**
- Bulk create tasks
- Bulk update tasks
- Bulk delete tasks

**Impact:** Poor performance when working with multiple tasks, leading to rate limiting issues and slow operations.

## 5. Inconsistent Error Responses

**Description:** Error responses vary in format and detail across different endpoints.

**Examples:**
- Some endpoints return `{"message": "error details"}`
- Others return `{"error": "error details"}`
- Internal errors often lack helpful details

**Impact:** Difficult to provide consistent error handling and user feedback.

## 6. Missing Webhook/Event Support

**Description:** No webhook or event system for real-time updates.

**Impact:** Clients must poll for changes, leading to inefficient resource usage and delayed updates.

## Recommendations for Vikunja Maintainers

1. **Fix SQL-like filter syntax** or update documentation to reflect actual capabilities
2. **Standardize authentication** across all endpoints
3. **Complete team API** implementation
4. **Add native bulk operations** for better performance
5. **Standardize error response format** across all endpoints
6. **Consider adding webhook support** for real-time updates

---

## 7. Task Reminder Field Inconsistency

**Description:** The Vikunja API has an inconsistency between the field names used for creating/updating reminders versus what is returned in the response.

**Issue Details:**
- When creating/updating a reminder, the API expects the field name `reminder`
- When retrieving tasks, the API returns reminders with the field name `reminder_date`
- The node-vikunja library expects `reminder_date` in its type definitions

**Example:**
```javascript
// Creating a reminder - must use 'reminder'
{
  reminders: [
    { reminder: '2025-05-29T10:00:00Z' }
  ]
}

// Response from API - returns 'reminder_date'
{
  reminders: [
    { id: 1, reminder_date: '2025-05-29T10:00:00Z' }
  ]
}
```

**Impact:** Developers must handle different field names for input vs output, leading to confusion and potential bugs.

**Workaround:** The MCP server now uses `reminder` when sending data to the API and expects `reminder_date` in responses.

## 8. Webhook Events Endpoint Missing or Requires Special Permissions

**Description:** The `/api/v1/webhooks/events` endpoint returns 401 Unauthorized errors even with valid API tokens.

**Issue Details:**
- The endpoint is supposed to return a list of valid webhook event types
- Returns 401 error with message "missing, malformed, expired or otherwise invalid token provided"
- Same token works for other endpoints but not for webhook operations
- Webhook CRUD operations also fail with similar authentication errors

**Example:**
```bash
# This fails with 401 Unauthorized
curl -X GET 'https://your-vikunja-instance.com/api/v1/webhooks/events' \
  -H 'Authorization: Bearer VALID_TOKEN'

# Same token works for other endpoints
curl -X GET 'https://your-vikunja-instance.com/api/v1/tasks/all' \
  -H 'Authorization: Bearer SAME_VALID_TOKEN'
```

**Impact:** Webhook functionality may not be available depending on server configuration or API token permissions.

## 9. API Response Field Naming Convention

**Description:** The Vikunja API uses snake_case field naming convention in responses (e.g., `due_date`, `start_date`, `percent_done`), which matches the node-vikunja Task interface definition.

**Note:** This is not an issue but a clarification for developers who might expect camelCase fields. The API consistently uses snake_case for all task fields.

**Example Task Response:**
```json
{
  "id": 1,
  "title": "Example Task",
  "due_date": "2024-12-31T23:59:59Z",
  "start_date": "2024-01-01T00:00:00Z", 
  "percent_done": 50,
  "hex_color": "#FF0000",
  "repeat_after": 86400,
  "done_at": null,
  "created_by": {...}
}
```

**Impact:** Ensure your code uses snake_case field names when accessing task properties from API responses.

**Workaround:** The MCP server now uses a hardcoded list of common webhook events when the API endpoint is unavailable:
- task.created, task.updated, task.deleted, task.assigned, task.comment.created
- project.created, project.updated, project.deleted, project.shared
- team.created, team.deleted

## 9. Filter Parameter Ignored (Issue verified 2025-05-28)

**Description:** The `filter` parameter is completely ignored by the API, returning all tasks regardless of filter criteria.

**Affected Endpoints:**
- `/tasks/all?filter=...` - Returns all tasks
- `/projects/{id}/tasks?filter=...` - Returns all project tasks

**Reproduction:**
```bash
# These all return the same results (all tasks) despite different filters:
curl -X GET 'https://your-vikunja-instance.com/api/v1/tasks/all?filter=done%20%3D%20false' \
  -H 'Authorization: Bearer VALID_TOKEN'

curl -X GET 'https://your-vikunja-instance.com/api/v1/tasks/all?filter=priority%20%3E%3D%204' \
  -H 'Authorization: Bearer VALID_TOKEN'

curl -X GET 'https://your-vikunja-instance.com/api/v1/tasks/all?filter=(done%20%3D%20false%20%26%26%20priority%20%3E%3D%203)' \
  -H 'Authorization: Bearer VALID_TOKEN'
```

**Expected:** Tasks should be filtered according to the filter criteria.

**Actual:** All tasks are returned regardless of filter parameter.

**Verified on:** Vikunja v0.22.1

**Impact:** 
- Cannot filter tasks server-side
- Must retrieve all tasks and filter client-side (performance impact)
- Large task lists cause unnecessary data transfer

**MCP Server Workaround:** The vikunja-mcp server now implements comprehensive client-side filtering:
- Parses filter strings using the same syntax as Vikunja
- Evaluates filters against the fetched task list
- Supports all fields, operators, and complex expressions
- Adds `clientSideFiltering: true` to response metadata
- Works transparently - users can use filters normally

**Supported Client-Side Filter Features:**
- **Fields**: done, priority, percentDone, dueDate, created, updated, title, description, assignees, labels
- **Operators**: =, !=, >, >=, <, <=, like, in, not in
- **Logical**: &&, ||, parentheses for grouping
- **Date Math**: now, now+7d, now-1w, etc.
- **Complex Expressions**: (done = false && priority >= 4) || (dueDate < now+7d)

**Performance Considerations:**
- Small projects (<100 tasks): Negligible impact
- Medium projects (100-1000 tasks): Minor delay for initial fetch
- Large projects (1000+ tasks): Noticeable delay, consider pagination

*Last updated: 2025-05-28*
## 8. Project Archive/Unarchive Validation Error

**Status:** Workaround implemented (2025-05-28)

**Description:** The project archive and unarchive operations fail with "Struct is invalid. Invalid Data" error when only sending the `is_archived` field.

**Affected Endpoints:**
- `PUT /projects/{id}` - When archiving/unarchiving projects

**Reproduction:**
```bash
# This fails with "Struct is invalid" error
curl -X PUT 'https://your-vikunja-instance.com/api/v1/projects/1' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"is_archived": true}'
```

**Workaround:** Include the project title (and potentially other required fields) in the update request:
```bash
# This works
curl -X PUT 'https://your-vikunja-instance.com/api/v1/projects/1' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"title": "Project Title", "is_archived": true}'
```

**Impact:** The MCP server now includes the project title when archiving/unarchiving to work around this validation requirement.

*These issues were discovered during development of the Vikunja MCP Server*