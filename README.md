# Vikunja MCP Server

A Model Context Protocol (MCP) server that enables AI assistants to interact with Vikunja task management instances.

## Features

- **Subcommand-based tools** for intuitive AI interactions
- **Session-based authentication** with automatic token management
- **Full task management** operations implemented
- **Complete project management** with CRUD operations
- **Label management** for organizing tasks
- **Team operations** for collaboration (get/update/members limited by API)
- **User management** with settings and search
- **Webhook management** for project automation
- **Batch import** tasks from CSV or JSON files
- **Input validation** for dates, IDs, and hex colors
- **Efficient diff-based updates** for assignees
- **TypeScript with strict mode** for type safety
- **Comprehensive error handling** with typed errors and centralized utilities
- **Automatic retry logic** with exponential backoff for transient failures
- **Advanced security features** with credential masking and input validation
- **Rate limiting protection** against DoS attacks with configurable limits
- **Memory protection** with pagination limits and usage monitoring

## Requirements

- Node.js 20+ (LTS versions only)
- Vikunja instance with API access
- API token (starting with `tk_`) or JWT token for authentication

## Installation

### Option 1: Install from NPM (Recommended)

The easiest way to use vikunja-mcp is through npx in your Claude Desktop or other MCP-compatible client configuration:

```json
{
  "vikunja": {
    "command": "npx",
    "args": ["-y", "@democratize-technology/vikunja-mcp"],
    "env": {
      "VIKUNJA_URL": "https://your-vikunja-instance.com/api/v1",
      "VIKUNJA_API_TOKEN": "your-api-token"
    }
  }
}
```

### Option 2: Local Development

For development or customization:

```bash
git clone https://github.com/democratize-technology/vikunja-mcp.git
cd vikunja-mcp
npm install
npm run build
```

Then configure your MCP client:

```json
{
  "vikunja": {
    "command": "node",
    "args": ["/path/to/vikunja-mcp/dist/index.js"],
    "env": {
      "VIKUNJA_URL": "https://your-vikunja-instance.com/api/v1",
      "VIKUNJA_API_TOKEN": "your-api-token"
    }
  }
}
```

## Configuration

### Logging Configuration

The server includes a structured logging system. Configure it via environment variables:

```bash
# Enable debug logging (default: false)
DEBUG=true

# Set specific log level (error, warn, info, debug)
# If not set, defaults to 'info' (or 'debug' if DEBUG=true)
LOG_LEVEL=debug
```

Log output includes timestamps and log levels:
```
[2025-05-25T17:00:00.000Z] [INFO] Vikunja MCP server started
[2025-05-25T17:00:00.100Z] [DEBUG] Executing tasks tool { subcommand: 'list', args: {...} }
```

All logs are written to stderr to keep stdout reserved for MCP protocol communication.

## Authentication Methods

The Vikunja MCP server supports two authentication methods, each with different capabilities:

### API Token Authentication (Default)

API tokens are the standard authentication method for Vikunja:

- **How to obtain:** Go to Vikunja Settings → API Tokens → Create new token
- **Token format:** Starts with `tk_` (e.g., `tk_abc123def456`)
- **Capabilities:** Full access to tasks, projects, labels, teams, and webhooks
- **Limitations:** Cannot access user-specific endpoints (user profile, settings, export)
- **Best for:** Automation, CI/CD, and general task management

### JWT Authentication (Advanced)

JWT (JSON Web Token) authentication provides full access to all Vikunja endpoints:

- **How to obtain:** Extract from your browser session (see instructions below)
- **Token format:** Long string starting with `eyJ` (standard JWT format)
- **Capabilities:** Full access to all endpoints including user management and export
- **Limitations:** Tokens expire (typically after 24 hours)
- **Best for:** User management, data export, and operations requiring user context

#### How to Extract Your JWT Token

1. **Log into Vikunja** in your web browser
2. **Open Developer Tools** (F12 or right-click → Inspect)
3. **Go to the Application/Storage tab**
4. **Find the JWT token:**
   - Look in Local Storage → your Vikunja domain
   - Find the key named `token` or similar
   - The value is your JWT token
5. **Copy the entire token value** (it's quite long)

#### Using JWT Authentication

```typescript
// Connect with JWT token - automatically detected!
vikunja_auth.connect({
  apiUrl: "https://your-vikunja-instance.com/api/v1",
  apiToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
})
```

**Important Notes:**
- JWT tokens expire; you'll need to extract a new one when it expires
- Token type is automatically detected based on format (no flag needed)
- Some tools (users, export) are only available with JWT authentication

## Quick Start

1. **Set up authentication (if not using environment variables):**
   ```typescript
   vikunja_auth.connect({
     apiUrl: "https://your-vikunja-instance.com/api/v1",
     apiToken: "your-api-token"
   })
   ```

2. **Create your first task:**
   ```typescript
   vikunja_tasks.create({
     projectId: 1,
     title: "My first task via MCP!"
   })
   ```

3. **List all your tasks:**
   ```typescript
   vikunja_tasks.list({ allProjects: true })
   ```

## Usage

The MCP server exposes tools with subcommands. All operations require authentication first (either via environment variables or manual connection).

### Authentication

```typescript
// Connect with API token (automatically detected)
vikunja_auth.connect({
  apiUrl: "https://your-vikunja-instance.com/api/v1",
  apiToken: "tk_your-api-token"
})

// Connect with JWT token (automatically detected, enables additional tools: users, export)
vikunja_auth.connect({
  apiUrl: "https://your-vikunja-instance.com/api/v1",
  apiToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
})

// Check authentication status
vikunja_auth.status()

// Disconnect and clean up resources
vikunja_auth.disconnect()
```

### Task Management Examples

```typescript
// List all tasks across all projects
vikunja_tasks.list({ allProjects: true })

// List tasks for a specific project with pagination
vikunja_tasks.list({
  projectId: 1,
  page: 1,
  perPage: 20,
  sort: "due_date"
})

// List tasks with filters (high priority, not done)
vikunja_tasks.list({
  filter: "(priority >= 4 && done = false)"
})

// List tasks with simple filter
vikunja_tasks.list({
  filter: "priority >= 3"
})

// List tasks with complex filter conditions
vikunja_tasks.list({
  filter: "(priority >= 3 && priority <= 5) || (done = true && updated > '2024-01-01')"
})

// Combine filter with search
vikunja_tasks.list({
  filter: "priority >= 4",
  search: "urgent"
})

// Create a new task with labels and assignees
vikunja_tasks.create({
  projectId: 1,
  title: "Complete documentation",
  description: "Update README with examples",
  dueDate: "2024-12-31T23:59:59Z",
  priority: 3,
  labels: [1, 2],      // Label IDs
  assignees: [1, 3]    // User IDs
})

// Create a recurring task (repeats every week)
vikunja_tasks.create({
  projectId: 1,
  title: "Weekly team meeting",
  description: "Sync up with the team",
  dueDate: "2024-12-01T10:00:00Z",
  repeatAfter: 7,      // Number of units
  repeatMode: "day"    // Unit: "day", "week", "month", or "year"
})

// Create a monthly recurring task
vikunja_tasks.create({
  projectId: 1,
  title: "Monthly report",
  repeatAfter: 1,
  repeatMode: "month"
})

// Get detailed information about a task
vikunja_tasks.get({ id: 123 })

// Update a task (partial updates supported)
vikunja_tasks.update({
  id: 123,
  done: true,
  priority: 5
})

// Update recurring settings on an existing task
vikunja_tasks.update({
  id: 123,
  repeatAfter: 14,     // Change to bi-weekly
  repeatMode: "day"
})

// Update task assignees (uses efficient diff-based approach)
vikunja_tasks.update({
  id: 123,
  assignees: [1, 2, 4]  // Only adds/removes differences
})

// Delete a task
vikunja_tasks.delete({ id: 123 })

// Bulk assign users to a task
vikunja_tasks.assign({
  id: 123,
  assignees: [2, 3, 4]
})

// Remove users from a task
vikunja_tasks.unassign({
  id: 123,
  assignees: [2, 4]  // Removes only these users
})

// List all assignees for a task
vikunja_tasks.list-assignees({ id: 123 })

// Add a comment to a task
vikunja_tasks.comment({
  id: 123,
  comment: "This task is now complete!"
})

// List all comments on a task
vikunja_tasks.comment({ id: 123 })

// Create a task relation (e.g., subtask, blocking, related)
vikunja_tasks.relate({
  id: 123,
  otherTaskId: 124,
  relationKind: "subtask"  // 124 is a subtask of 123
})

// Available relation kinds:
// - subtask: Other task is a subtask of this task
// - parenttask: Other task is the parent of this task
// - related: Tasks are related
// - duplicateof: This task is a duplicate of the other
// - duplicates: Other task is a duplicate of this one
// - blocking: This task blocks the other
// - blocked: This task is blocked by the other
// - precedes: This task precedes the other
// - follows: This task follows the other
// - copiedfrom: This task was copied from the other
// - copiedto: Other task was copied from this one

// Remove a task relation
vikunja_tasks.unrelate({
  id: 123,
  otherTaskId: 124,
  relationKind: "subtask"
})

// Get all relations for a task
vikunja_tasks.relations({ id: 123 })

// Add a reminder to a task
vikunja_tasks.add-reminder({
  id: 123,
  reminderDate: "2024-12-25T10:00:00Z"
})

// List all reminders for a task
vikunja_tasks.list-reminders({ id: 123 })

// Remove a specific reminder from a task
vikunja_tasks.remove-reminder({
  id: 123,
  reminderId: 1
})

// Bulk create multiple tasks at once (max 100)
vikunja_tasks.bulk-create({
  projectId: 1,
  tasks: [
    {
      title: "Task 1",
      description: "First task",
      priority: 3,
      labels: [1, 2]
    },
    {
      title: "Task 2", 
      dueDate: "2024-12-31T23:59:59Z",
      assignees: [1]
    },
    {
      title: "Weekly standup",
      repeatAfter: 7,
      repeatMode: "day"
    }
  ]
})

// Bulk update multiple tasks with the same field value
vikunja_tasks.bulk-update({
  taskIds: [123, 124, 125],
  field: "done",          // Field to update
  value: true             // New value for all tasks
})

// Other bulk update examples
vikunja_tasks.bulk-update({
  taskIds: [123, 124, 125],
  field: "priority",
  value: 5
})

vikunja_tasks.bulk-update({
  taskIds: [123, 124],
  field: "project_id",
  value: 2               // Move tasks to different project
})

vikunja_tasks.bulk-update({
  taskIds: [123, 124, 125],
  field: "labels",
  value: [1, 3, 5]       // Set same labels on all tasks
})

// Bulk delete multiple tasks (max 100)
vikunja_tasks.bulk-delete({
  taskIds: [123, 124, 125]
})

// Batch import tasks from CSV or JSON
vikunja_batch_import({
  projectId: 1,
  format: "json",
  data: JSON.stringify([
    {
      title: "Task 1",
      description: "First imported task",
      priority: 3,
      dueDate: "2024-12-31T23:59:59Z"
    },
    {
      title: "Task 2",
      labels: ["bug", "urgent"],  // Will look up label IDs by name
      assignees: ["john.doe"]      // Will look up user IDs by username
    }
  ])
})

// Import from CSV with headers
vikunja_batch_import({
  projectId: 1,
  format: "csv",
  data: `title,description,priority,dueDate,labels,assignees
"Task 1","Description with, comma",3,2024-12-31T23:59:59Z,"bug;feature","john.doe"
"Task 2","Another task",5,,"urgent","john.doe;jane.smith"`
})

// Dry run to validate without creating tasks
vikunja_batch_import({
  projectId: 1,
  format: "json",
  data: JSON.stringify([...]),
  dryRun: true  // Only validates, doesn't create tasks
})

// Continue on errors instead of stopping
vikunja_batch_import({
  projectId: 1,
  format: "csv",
  data: csvData,
  skipErrors: true  // Skip invalid tasks and continue with valid ones
})
```

### Data Export Examples

```typescript
// Export a project with all its data
vikunja_export_project({
  projectId: 1,
  includeChildren: false  // Only export the specified project
})

// Export a project including all child projects
vikunja_export_project({
  projectId: 1,
  includeChildren: true  // Recursively export child projects
})

// The export returns JSON data with the following structure:
// {
//   project: { ... },        // Project details
//   tasks: [ ... ],          // All tasks in the project
//   labels: [ ... ],         // All labels used in tasks
//   child_projects: [ ... ], // Nested child project exports (if includeChildren: true)
//   exported_at: "...",      // ISO timestamp of export
//   version: "1.0.0"         // Export format version
// }

// Request a full user data export (sent via email)
vikunja_request_user_export({
  password: "your-password"  // Required for security
})

// Download a previously requested user data export
vikunja_download_user_export({
  password: "your-password"  // Required for security
})
```

### Project Management Examples

```typescript
// List all projects
vikunja_projects.list()

// List projects with search and pagination
vikunja_projects.list({
  search: "frontend",
  page: 1,
  perPage: 10,
  isArchived: false
})

// Get a specific project
vikunja_projects.get({ id: 1 })

// Create a new project
vikunja_projects.create({
  title: "New Frontend Project",
  description: "React-based web application",
  hexColor: "#4287f5"
})

// Update a project
vikunja_projects.update({
  id: 1,
  title: "Updated Project Name",
  isArchived: true
})

// Archive a project
vikunja_projects.archive({ id: 1 })

// Unarchive a project
vikunja_projects.unarchive({ id: 1 })

// Delete a project
vikunja_projects.delete({ id: 1 })

// --- Project Hierarchy Management ---

// Create a child project
vikunja_projects.create({
  title: "Frontend Module",
  description: "React components",
  parentProjectId: 1,  // Will be a child of project 1
  hexColor: "#3498db"
})

// Get all direct children of a project
vikunja_projects.get-children({ id: 1 })
// Returns: Array of projects that have parentProjectId = 1

// Get complete project hierarchy as a tree
vikunja_projects.get-tree({ id: 1 })
// Returns: Project with nested children structure
// {
//   id: 1,
//   title: "Main Project",
//   children: [
//     {
//       id: 2,
//       title: "Frontend Module",
//       children: [
//         { id: 4, title: "Components", children: [] },
//         { id: 5, title: "Styles", children: [] }
//       ]
//     },
//     {
//       id: 3,
//       title: "Backend Module",
//       children: []
//     }
//   ]
// }

// Get breadcrumb path from root to a project
vikunja_projects.get-breadcrumb({ id: 5 })
// Returns: Array of projects from root to target
// [
//   { id: 1, title: "Main Project" },
//   { id: 2, title: "Frontend Module" },
//   { id: 5, title: "Styles" }
// ]
// Also includes a formatted path: "Main Project > Frontend Module > Styles"

// Move a project to a new parent
vikunja_projects.move({ 
  id: 5,              // Project to move
  parentProjectId: 3  // New parent
})
// Validates against circular references and depth limits

// Move a project to root level (no parent)
vikunja_projects.move({ 
  id: 5,
  parentProjectId: undefined
})

// --- Project Sharing ---

// Create a read-only share link
vikunja_projects.create-share({ 
  id: 1,
  right: 0,  // 0=Read, 1=Write, 2=Admin
  label: "Public read-only access"
})

// Create a password-protected share with write access
vikunja_projects.create-share({ 
  id: 1,
  right: 1,
  password: "securepassword123",
  label: "Team collaboration link"
})

// Create an expiring share link
vikunja_projects.create-share({ 
  id: 1,
  right: 0,
  expires: "2025-12-31T23:59:59Z",
  label: "Temporary access until year end"
})

// List all shares for a project
vikunja_projects.list-shares({ id: 1 })

// Get details of a specific share
vikunja_projects.get-share({ 
  id: 1, 
  shareId: 123 
})

// Delete a share link
vikunja_projects.delete-share({ 
  id: 1, 
  shareId: 123 
})

// Authenticate to access a shared project
vikunja_projects.auth-share({ 
  shareHash: "abc123def456" 
})

// Authenticate to a password-protected share
vikunja_projects.auth-share({ 
  shareHash: "abc123def456",
  password: "securepassword123"
})
```

### Label Management Examples

```typescript
// List all labels
vikunja_labels.list()

// Search for labels
vikunja_labels.list({
  search: "bug",
  page: 1,
  perPage: 20
})

// Get a specific label
vikunja_labels.get({ id: 1 })

// Create a new label
vikunja_labels.create({
  title: "Critical",
  description: "Critical priority issues",
  hexColor: "#ff0000"
})

// Update a label
vikunja_labels.update({
  id: 1,
  title: "High Priority",
  hexColor: "#ff6600"
})

// Delete a label
vikunja_labels.delete({ id: 1 })

// --- Label Assignment to Tasks ---

// Apply multiple labels to a task
vikunja_tasks.apply-label({
  id: 123,
  labels: [1, 2, 3]  // Apply labels with IDs 1, 2, and 3
})

// Apply a single label
vikunja_tasks.apply-label({
  id: 123,
  labels: [1]  // Apply just the "research" label
})

// Remove specific labels from a task
vikunja_tasks.remove-label({
  id: 123,
  labels: [2, 3]  // Remove labels 2 and 3, keep others
})

// List all labels on a task
vikunja_tasks.list-labels({ id: 123 })
// Returns: Task info with detailed label data including colors and descriptions
```

### Team Management Examples

```typescript
// List all teams
vikunja_teams.list()

// Search for teams
vikunja_teams.list({
  search: "frontend",
  page: 1,
  perPage: 10
})

// Create a new team
vikunja_teams.create({
  name: "Frontend Team",
  description: "Responsible for UI/UX development"
})

// Delete a team
vikunja_teams.delete({ id: 1 })

// Note: get, update, and members operations are not yet
// implemented in the node-vikunja library
```

### User Management Examples

> ⚠️ **Known Issue**: User endpoints may fail with authentication errors even when using valid tokens. This is a known Vikunja API issue. The MCP server will provide helpful error messages when this occurs. If you encounter this issue, please contact your Vikunja server administrator.

```typescript
// Get current user information
vikunja_users.current()

// Search for users
vikunja_users.search({
  search: "john"
})

// Get current user settings
vikunja_users.settings()

// Update user settings
vikunja_users.update-settings({
  name: "John Doe",
  language: "en",
  timezone: "America/New_York",
  weekStart: 1  // Monday
})

// Update notification preferences
vikunja_users.update-settings({
  emailRemindersEnabled: true,  // Enable email reminders for tasks
  overdueTasksRemindersEnabled: true,  // Enable daily overdue task emails
  overdueTasksRemindersTime: "09:00"  // Time to send overdue task summary
})
```

### Webhook Management Examples

```typescript
// List all available webhook events
vikunja_webhooks.list-events()
// Returns: ["task.created", "task.updated", "task.deleted", "task.assigned", ...]

// List webhooks for a project
vikunja_webhooks.list({ projectId: 1 })

// Create a webhook for task events
vikunja_webhooks.create({
  projectId: 1,
  targetUrl: "https://example.com/webhook",
  events: ["task.created", "task.updated"],
  secret: "my-secret-key"  // Optional, for HMAC signing
})

// Create a webhook without secret
vikunja_webhooks.create({
  projectId: 1,
  targetUrl: "https://example.com/notifications",
  events: ["task.assigned", "task.comment.created"]
})

// Get a specific webhook
vikunja_webhooks.get({
  projectId: 1,
  webhookId: 123
})

// Update webhook events
vikunja_webhooks.update({
  projectId: 1,
  webhookId: 123,
  events: ["task.created", "task.updated", "task.deleted"]
})

// Delete a webhook
vikunja_webhooks.delete({
  projectId: 1,
  webhookId: 123
})
```

### Advanced Filtering Examples

```typescript
// Create a saved filter for high priority tasks
vikunja_filters.create({
  name: "High Priority Tasks",
  description: "All undone tasks with priority 4 or 5",
  filter: "done = false && priority >= 4",
  isGlobal: true
})

// Alternative format using title and filters object
vikunja_filters.create({
  title: "🔥 High Priority Tasks",
  description: "All tasks with priority 4 or 5 that are not completed",
  filters: {
    filter_by: ["priority"],
    filter_value: ["5"],
    filter_comparator: [">="],
    filter_concat: ""
  },
  is_favorite: true
})

// Create a filter with multiple conditions
vikunja_filters.create({
  title: "Urgent & Incomplete",
  filters: {
    filter_by: ["priority", "done"],
    filter_value: ["3", "false"],
    filter_comparator: [">=", "="],
    filter_concat: "&&"
  }
})

// Create a project-specific filter
vikunja_filters.create({
  name: "This Week's Tasks",
  filter: "dueDate >= now && dueDate < now+7d",
  projectId: 1,
  isGlobal: false
})

// List all saved filters
vikunja_filters.list()

// List filters for a specific project
vikunja_filters.list({ projectId: 1 })

// Apply a saved filter to task listing
vikunja_tasks.list({
  filterId: "550e8400-e29b-41d4-a716-446655440000"
})

// Build a filter programmatically
vikunja_filters.build({
  conditions: [
    { field: "done", operator: "=", value: false },
    { field: "priority", operator: ">=", value: 3 },
    { field: "assignees", operator: "in", value: ["user1", "user2"] }
  ],
  groupOperator: "&&"
})
// Returns: { filter: "(done = false && priority >= 3 && assignees in user1, user2)", valid: true }

// Update an existing filter
vikunja_filters.update({
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Critical Tasks",
  filter: "done = false && priority = 5"
})

// Validate a filter string
vikunja_filters.validate({
  filter: "done = false && priority >= 3"
})
// Returns: { valid: true, errors: [] }
```

#### Filter Syntax Reference

The Vikunja filter syntax supports SQL-like queries with the following:

**Fields:**
- `done` - Task completion status (boolean)
- `priority` - Task priority (1-5)
- `percentDone` - Completion percentage (0-100)
- `dueDate` - Task due date
- `assignees` - Task assignees
- `labels` - Associated labels
- `created` - Task creation time
- `updated` - Task update time

**Operators:**
- Comparison: `=`, `!=`, `>`, `>=`, `<`, `<=`
- Pattern matching: `like` (uses `%` wildcard)
- List matching: `in`, `not in`

**Date Math:**
- `now` - Current time
- `now+24h` - 24 hours from now
- `now-7d` - 7 days ago
- `now/d` - Start of current day
- Supports: s (seconds), m (minutes), h (hours), d (days), w (weeks), M (months), y (years)

**Examples:**
- `priority = 4`
- `dueDate < now`
- `done = false && priority >= 3`
- `assignees in user1, user2`
- `dueDate >= now && dueDate < now+7d`
- `title like "%urgent%"`

**Smart Hybrid Filtering:** This MCP server implements an intelligent hybrid filtering approach that combines server-side and client-side filtering for optimal performance and reliability:
- **Primary**: Attempts server-side filtering first for maximum performance
- **Fallback**: Falls back to client-side filtering if server-side filtering fails or is unavailable
- **Transparent**: Same filter syntax works regardless of which method is used
- **Optimized**: Includes memory protection with pagination limits to prevent unbounded loading
- **Metadata**: Response includes filtering method used (`serverSideFiltering` or `clientSideFiltering`)
- **Performance**: Server-side filtering significantly reduces network traffic and processing time

## Response Format

All operations in the Vikunja MCP server follow a standardized response format for consistency and predictability:

```typescript
interface StandardResponse {
  success: boolean;
  operation: string;      // The operation performed (e.g., 'create', 'update', 'list')
  message?: string;       // Human-readable description of the result
  data?: any;            // The primary data returned (task, project, label, etc.)
  metadata?: {
    timestamp: string;    // ISO 8601 timestamp of the operation
    [key: string]: any;  // Additional operation-specific metadata
  };
}
```

### Response Examples

**Success:**
```json
{
  "success": true,
  "operation": "create",
  "message": "Task created successfully",
  "data": { "id": 123, "title": "Complete documentation" },
  "metadata": { "timestamp": "2025-05-25T12:00:00Z" }
}
```

**Error:**
```json
{
  "success": false,
  "operation": "update",
  "message": "Task not found",
  "error": { "code": "TASK_NOT_FOUND", "details": "No task exists with ID 999" }
}
```

This standardized format ensures:
- **Consistency**: All tools return responses in the same structure
- **Predictability**: Clients always know what fields to expect
- **Debugging**: Metadata provides context for troubleshooting
- **Error Handling**: Clear error information with codes and messages

## Available Tools

### Authentication
- `vikunja_auth` - Authentication management
  - `connect` - Initialize connection with API token
  - `status` - Check authentication status
  - `refresh` - Refresh authentication token

### Task Management ✅
- `vikunja_tasks` - Task operations (fully implemented)
  - `list` - List tasks with filters
    - Filter by project or get all tasks
    - Support for pagination, search, sorting
    - Filter by completion status
    - Apply saved filters with `filterId` parameter
  - `create` - Create a new task
    - Required: title, projectId
    - Optional: description, dueDate, priority, labels, assignees
    - Validates date format (ISO 8601) and IDs
  - `get` - Get task details by ID
  - `update` - Update existing task
    - Supports partial updates
    - Can update title, description, dueDate, priority, done status
    - Can update labels and assignees (uses efficient diff-based approach)
  - `delete` - Delete a task by ID
  - `assign` - Bulk assign users to tasks
  - `unassign` - Remove users from tasks
  - `comment` - List or add comments to tasks
  - `bulk-update` - Update multiple tasks at once
    - Required: taskIds array, field name, value
    - Supported fields: done, priority, due_date, project_id, assignees, labels
    - Validates field types and values
    - ⚠️ Performance: Makes API calls to fetch each updated task
  - `bulk-delete` - Delete multiple tasks at once
    - Required: taskIds array
    - Returns deleted task details for confirmation
    - Handles partial failures gracefully
    - ⚠️ Performance: Makes individual delete calls for each task
    - Recommended: Process in batches of 20 or fewer tasks
  - `attach` - Not implemented (file handling not available in MCP)

### Batch Import ✅
- `vikunja_batch_import` - Import multiple tasks from CSV or JSON (fully implemented)
  - Required: projectId, format ('csv' or 'json'), data
  - Optional: skipErrors (continue on errors), dryRun (validate only)
  - **Batch Size Limit**: Maximum 100 tasks per import
  - **CSV Format**:
    - Requires header row with field names
    - Supports quoted values and escaped quotes
    - Fields: title, description, priority, dueDate, labels, assignees
    - Labels and assignees as semicolon-separated values (semicolons used to avoid conflicts with CSV commas)
  - **JSON Format**:
    - Array of task objects
    - Same fields as CSV, plus direct support for arrays
  - **Features**:
    - Automatic label lookup by name
    - Automatic user lookup by username
    - Validation before creation
    - Detailed error reporting
    - Dry run mode for testing
    - Skip errors option for partial imports

### Project Management ✅
- `vikunja_projects` - Project operations (fully implemented)
  - `list` - List all projects with filters
    - Support for pagination and search
    - Filter by archived status
  - `get` - Get project details by ID
  - `create` - Create new project
    - Required: title
    - Optional: description, parentProjectId, isArchived, hexColor (format: #RRGGBB)
    - Validates parent project hierarchy depth (max 10 levels)
  - `update` - Update existing project
    - Supports partial updates
    - Can update all project fields including hexColor (format: #RRGGBB)
    - Validates parent project hierarchy depth when changing parent
  - `delete` - Delete a project by ID
  - `archive` - Archive a project
  - `unarchive` - Unarchive a project
  - **Hierarchy Management** (New!)
    - `get-children` - List direct children of a project
    - `get-tree` - Get complete project hierarchy as a tree
    - `get-breadcrumb` - Get path from root to a project
    - `move` - Move a project to a new parent
      - Validates against circular references
      - Enforces maximum depth of 10 levels
  - **Project Sharing**
    - `create-share` - Create share link with permissions
    - `list-shares` - List all shares for a project
    - `get-share` - Get share details
    - `delete-share` - Remove a share link
    - `auth-share` - Authenticate to access a shared project

### Label Management ✅
- `vikunja_labels` - Label operations (fully implemented)
  - `list` - List all labels with filters
    - Support for pagination and search
  - `get` - Get label details by ID
  - `create` - Create new label
    - Required: title
    - Optional: description, hexColor (format: #RRGGBB)
  - `update` - Update existing label
    - Supports partial updates
    - Can update title, description, hexColor
  - `delete` - Delete a label by ID
  - `apply-label` - Apply one or more labels to a task
    - Required: task id, labels array
    - Supports bulk label application
  - `remove-label` - Remove one or more labels from a task
    - Required: task id, labels array
    - Supports bulk label removal
  - `list-labels` - List all labels assigned to a task
    - Required: task id
    - Returns detailed label information

### Project Templates ✅
- `vikunja_templates` - Template operations (fully implemented)
  - `create` - Create a template from existing project
    - Required: projectId, name
    - Optional: description, tags
    - Captures all project settings and tasks
  - `list` - List all available templates
    - Shows template name, tags, and author
  - `get` - Get template details by ID
  - `update` - Update template metadata
    - Can update name, description, tags
  - `delete` - Delete a template
  - `instantiate` - Create new project from template
    - Required: id (template ID), projectName
    - Optional: parentProjectId, variables
    - Supports variable substitution:
      - `{{PROJECT_NAME}}` - The new project name
      - `{{TODAY}}` - Current date (YYYY-MM-DD)
      - `{{NOW}}` - Current timestamp
      - Custom variables via the variables parameter
    - Creates all tasks with labels from template

### Team Management ✅
- `vikunja_teams` - Team operations (partially implemented)
  - `list` - List all teams with filters
    - Support for pagination and search
  - `create` - Create new team
    - Required: name
    - Optional: description
  - `delete` - Delete a team by ID (with fallback API support)
  - `get` - Not yet implemented in node-vikunja
  - `update` - Not yet implemented in node-vikunja
  - `members` - Not yet implemented in node-vikunja

### User Management ✅
- `vikunja_users` - User operations (fully implemented) **[Requires JWT authentication]**
  - `current` - Get current authenticated user info
  - `search` - Search for users
    - Optional: search query, pagination
  - `settings` - Get current user settings
  - `update-settings` - Update user settings
    - Optional: name, language, timezone, weekStart, frontendSettings
  - **Note:** User operations require JWT authentication. When using API token authentication, these tools will not be available.

### Webhook Management ✅
- `vikunja_webhooks` - Webhook operations for project automation (fully implemented)
  - `list-events` - Get all available webhook event types
  - `list` - List webhooks for a project
    - Required: projectId
  - `get` - Get a specific webhook
    - Required: projectId, webhookId
  - `create` - Create a new webhook
    - Required: projectId, targetUrl, events (array)
    - Optional: secret (for HMAC signing)
    - **Note**: Events are validated against available event types
  - `update` - Update webhook events
    - Required: projectId, webhookId, events (array)
    - **Note**: Events are validated against available event types
  - `delete` - Delete a webhook
    - Required: projectId, webhookId
  
  **Event Validation**: When creating or updating webhooks, the provided events are automatically validated against the list of available events from the API. Invalid events will result in a clear error message showing which events are invalid and listing all valid options. Valid events are cached for 5 minutes to improve performance.

### Filter Management ✅
- `vikunja_filters` - Advanced filtering for tasks (fully implemented)
  - `list` - List saved filters
    - Optional: projectId (for project-specific filters), global flag
  - `get` - Get a specific filter by ID
  - `create` - Create a new saved filter
    - Required: name, filter (query string)
    - Optional: description, projectId, isGlobal
  - `update` - Update an existing filter
    - Required: id
    - Optional: name, description, filter, projectId, isGlobal
  - `delete` - Delete a saved filter
  - `build` - Build a filter string from conditions
    - Required: conditions array
    - Optional: groupOperator (&&, ||)
  - `validate` - Validate a filter string
  
  **Note:** Saved filters are currently stored in memory and will be lost when the MCP server restarts. For production use, consider implementing persistent storage.

### Data Export ✅

> **⚠️ WARNING: Memory Usage**  
> Export operations load entire project hierarchies into memory. For very large projects with thousands of tasks or deeply nested structures, this may consume significant memory. Consider exporting smaller projects individually.
- `vikunja_export_project` - Export project data **[Requires JWT authentication]**
  - **Parameters:**
    - `projectId` (required) - ID of the project to export
    - `includeChildren` (optional) - Include child projects recursively (default: false)
  - **Returns:** Complete project data including tasks, labels, and metadata
  - **Features:**
    - Exports all tasks with full details
    - Includes all labels used in the project
    - Optionally includes complete child project hierarchy
    - Circular reference detection for nested projects
    - Export metadata includes timestamp and version
  - **Note:** Export operations require JWT authentication. When using API token authentication, this tool will not be available.
  
- `vikunja_request_user_export` - Request full user data export
  - **Parameters:**
    - `password` (required) - User password for security verification
  - **Returns:** Confirmation that export has been requested
  - **Note:** You will receive an email when the export is ready
  
- `vikunja_download_user_export` - Download previously requested user data export
  - **Parameters:**
    - `password` (required) - User password for security verification
  - **Returns:** Complete user data export
  - **Note:** Export must be requested first via `vikunja_request_user_export`




## Known Limitations

1. **File Attachments**: The `attach` subcommand is not implemented due to MCP protocol limitations
2. **Team Operations**: Limited functionality due to incomplete node-vikunja API support:
   - Cannot get team by ID
   - Cannot update team information
   - Cannot delete teams
   - Cannot manage team members
3. **Pagination**: Some endpoints may not fully support pagination parameters due to API limitations
4. **Authentication Issues**: Some Vikunja API endpoints have known authentication issues:
   - **User endpoints**: May fail with token errors even with valid tokens (known Vikunja API limitation)
   - **Bulk operations**: May have authentication issues with certain Vikunja API versions
   - **Label operations**: May fail with authentication errors on some server configurations
   - **Assignee operations**: May fail with authentication errors when creating/updating tasks with assignees
   - The server provides detailed error messages when these issues occur, suggesting workarounds

## Security & Performance Features

### Security Enhancements
- **Credential Protection**: Automatic masking of sensitive tokens and URLs in logs and error messages
- **Input Validation**: Comprehensive sanitization and allowlist validation to prevent injection attacks
- **Rate Limiting**: Configurable request rate limits and payload size restrictions to prevent DoS attacks
- **Memory Protection**: Pagination limits and memory usage monitoring to prevent resource exhaustion
- **Error Handling**: Structured error responses that avoid exposing sensitive system information

### Performance Optimizations
- **Hybrid Filtering**: Smart server-side filtering with client-side fallback for optimal performance
- **Connection Pooling**: Efficient session management with automatic client caching
- **Request Batching**: Optimized bulk operations with efficient diff-based updates
- **Memory Management**: Automatic cleanup and pagination to handle large datasets safely

## Configuration

### Environment Variables

The server supports various configuration options through environment variables:

#### Basic Configuration
```bash
# Vikunja instance URL (required)
VIKUNJA_URL=https://your-vikunja-instance.com/api/v1

# Authentication token (required)
VIKUNJA_API_TOKEN=your-api-token

# Enable debug logging (default: false)
DEBUG=true

# Set log level (error, warn, info, debug)
LOG_LEVEL=debug
```

#### Security & Performance Configuration
```bash
# Rate limiting (default: enabled)
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_MINUTE=60        # Requests per minute (default: 60)
RATE_LIMIT_PER_HOUR=1000        # Requests per hour (default: 1000)

# Request size limits (default: 1MB)
MAX_REQUEST_SIZE=1048576        # Maximum request payload size in bytes
MAX_RESPONSE_SIZE=10485760      # Maximum response size in bytes (default: 10MB)

# Execution timeout (default: 30 seconds)
EXECUTION_TIMEOUT=30000         # Tool execution timeout in milliseconds

# Memory protection (default: enabled)
MEMORY_PROTECTION_ENABLED=true
MAX_TASKS_PER_REQUEST=1000      # Maximum tasks to load per request
```

For detailed rate limiting configuration, see [`docs/RATE_LIMITING.md`](docs/RATE_LIMITING.md).

## Roadmap

- [x] ✅ **Security hardening** - Comprehensive vulnerability fixes implemented
- [x] ✅ **Performance optimization** - Hybrid filtering and memory protection
- [x] ✅ **Error handling** - Centralized error utilities and structured responses
- [x] ✅ **Test coverage** - 98.91% function coverage achieved
- [ ] Add webhook subscriptions for real-time updates
- [ ] Add caching for frequently accessed data
- [ ] Add integration tests with real Vikunja instance
- [ ] Implement persistent storage for saved filters

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and workflow.

## License

MIT
