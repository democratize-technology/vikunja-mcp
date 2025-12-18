# Vikunja MCP Server Roadmap

This document outlines the development roadmap for the Vikunja MCP Server project.

## Current Status (as of May 25, 2025)

### ✅ Completed
- Project setup and infrastructure
- Authentication tool with session management
- **Full tasks tool implementation** (PR #2)
  - All CRUD operations
  - Comment management
  - Bulk user assignment
  - Task unassignment (PR #37)
  - Input validation
  - Efficient diff-based updates
- **Projects tool implementation**
  - Full CRUD operations (list, get, create, update, delete)
  - Project hierarchy support
  - Archived project filtering
- **Labels tool implementation**
  - Full CRUD operations
  - Label assignment to tasks
- **Teams tool implementation**
  - Limited by node-vikunja API
- **Users tool implementation**
  - User search and details
  - Settings management
- **100% test coverage achieved** (207+ tests)
- Structured logging system
- Hex color validation

### 🚧 In Progress
- Task assignment improvements

## Prioritized Feature Implementation

### 🔴 High Priority (Critical for usability)
1. **Fix test coverage gaps**
   - Currently at 99.62% (need 100%)
   - Uncovered lines: tasks.ts:421, users.ts:162, logger.ts:38
   
2. **Task assignment features** ✅ Complete
   - ✅ Assign users to tasks (already implemented)
   - ✅ Unassign users from tasks (PR #37)
   - ✅ List task assignees separately (list-assignees subcommand)
   
3. **Bulk operations** ✅ Complete
   - ✅ Bulk task updates (modify multiple tasks at once)
   - ✅ Bulk task deletion
   - ✅ Efficient batch API calls

### 🟡 Medium Priority (Significant value-add)
4. **Advanced filtering** ✅ Complete
   - ✅ Save custom task filters
   - ✅ Apply saved filters
   - ✅ Complex query support
   
5. **Task relations** ✅ Complete
   - ✅ Link related tasks together (relate/unrelate subcommands)
   - ✅ Manage task dependencies (all relation types supported)
   
6. **Recurring tasks** ✅ Complete
   - ✅ Support for repeating tasks (repeatAfter and repeatMode fields)
   - ✅ Recurrence patterns (day, week, month, year)
   
7. **Project archiving** ✅ Complete
   - ✅ Archive/unarchive projects
   - ✅ Filter archived projects (already supported in list)
   
8. **Project sharing** ✅ Complete
   - ✅ Create/manage project share links
   - ✅ Password protection for shares
   - ✅ Expiration dates for shares
   - ✅ Different permission levels (Read/Write/Admin)
   - ✅ Share authentication for accessing shared projects
   
9. **Project Templates** ✅ Complete
   - ✅ Create templates from existing projects
   - ✅ Variable substitution system
   - ✅ Template management (CRUD operations)
   - ✅ Instantiate new projects from templates
   
10. **Statistics and insights**
    - Project statistics
    - User productivity metrics
    - Task completion trends

### 🟢 Lower Priority (Nice-to-have)
11. **Quick add**
    - Natural language task creation
    - Parse due dates from text
    
12. **Import/Export**
    - Batch import from CSV/JSON
    - Export project data
    
13. **Integration tests**
    - Tests with real Vikunja instance
    - End-to-end workflows
    
14. **Response standardization**
    - Consistent formats across operations

## Features Not Planned (Technical Limitations)

These features were identified but cannot be implemented due to technical constraints:

1. **File Attachments**
   - Blocked by MCP protocol limitations
   - MCP doesn't support file upload/download operations
   
2. **Real-time Updates** 
   - Webhooks require persistent connections
   - MCP is request/response based
   
3. **Multi-instance Support**
   - MCP tools operate in single-instance context
   - Would require significant architecture changes

## Long-term Goals (Q3-Q4 2025 and beyond)

### Enhanced Features
1. **Bulk Operations**
   - Bulk task updates
   - Bulk task deletion
   - Batch API calls for efficiency

2. **Advanced Filtering**
   - Complex query support
   - Saved filters
   - Custom views

3. **Performance Optimizations**
   - Request caching
   - Parallel API calls where applicable
   - Response compression

### Integration Improvements
1. **Better Node-RED Integration**
   - Shared configuration
   - Event synchronization
   - Workflow templates

2. **AI-Optimized Responses**
   - Summarized responses for large datasets
   - Context-aware information
   - Natural language query support

3. **Real-time Features**
   - Webhook support
   - Live updates
   - Notification handling

## Future Considerations (2026+)

1. **Multi-instance Support**
   - Connection management
   - Instance switching
   - Credential vault

2. **Advanced Analytics**
   - Task statistics
   - Productivity insights
   - Team performance metrics

3. **Enterprise Features**
   - SSO integration
   - Audit logging
   - Advanced permissions

## Development Principles

- **Quality over Quantity**: Ensure each feature is thoroughly tested
- **API First**: Design for programmatic access
- **AI Friendly**: Optimize for LLM interactions
- **Backward Compatibility**: Minimize breaking changes
- **Security Focus**: Regular security audits

## Success Metrics

- 100% test coverage maintained
- Response time < 500ms for basic operations
- Zero critical security vulnerabilities
- Comprehensive documentation
- Active community engagement

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on how to contribute to this roadmap and the project.
