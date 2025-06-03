# Changelog

All notable changes to the Vikunja MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Automatic retry logic with exponential backoff for authentication and network errors
- Retry configuration for different error types (3 retries for auth, 5 for network)
- Error messages now include retry count information for transparency
- Comprehensive test coverage for retry utility
- Added label assignment operations for tasks

### Changed
- Refactored `src/tools/tasks.ts` from a single 2,300+ line file into a modular structure with separate files for:
  - CRUD operations (`crud.ts`)
  - Bulk operations (`bulk-operations.ts`)
  - Assignee management (`assignees.ts`)
  - Comment operations (`comments.ts`)
  - Reminder management (`reminders.ts`)
  - Filter evaluation (`filters.ts`)
  - Validation utilities (`validation.ts`)
  - Constants (`constants.ts`)
  - Type definitions (`types.ts`)
- Improved code organization and maintainability while preserving 100% functionality
- No breaking changes - all existing functionality remains intact

## [0.1.0] - 2025-05-29

### Initial Release

First public release of the Vikunja MCP Server for NPM.

Features:
- Full task management operations
- Project hierarchy and management
- Label and team operations
- JWT and API token authentication
- Webhook management
- Batch import/export functionality
- 99% test coverage

See README.md for full documentation.
