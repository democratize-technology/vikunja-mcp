# Persistent Storage Architecture

This document describes the persistent storage implementation for the Vikunja MCP Server's filter storage system.

## Overview

The storage system has been enhanced from in-memory only to support multiple persistent backends while maintaining full API compatibility and providing graceful fallback mechanisms.

## Architecture

### Storage Adapter Pattern

The storage system uses the Adapter pattern to support multiple backends:

```typescript
interface StorageAdapter {
  initialize(session: StorageSession): Promise<void>;
  list(): Promise<SavedFilter[]>;
  get(id: string): Promise<SavedFilter | null>;
  create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter>;
  update(id: string, filter: Partial<SavedFilter>): Promise<SavedFilter>;
  delete(id: string): Promise<void>;
  findByName(name: string): Promise<SavedFilter | null>;
  getByProject(projectId: number): Promise<SavedFilter[]>;
  clear(): Promise<void>;
  getStats(): Promise<StorageStats>;
  close(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
}
```

### Supported Storage Backends

#### 1. In-Memory Storage (Default)
- **Type**: `memory`
- **Use Case**: Development, testing, or when persistence is not required
- **Features**: Fast, no external dependencies, data lost on restart
- **Configuration**: No additional configuration required

#### 2. SQLite Storage
- **Type**: `sqlite`
- **Use Case**: Production deployments with embedded database needs
- **Features**: Persistent, ACID transactions, no external server required
- **Configuration**: Requires database file path

#### 3. PostgreSQL Storage (Planned)
- **Type**: `postgresql`
- **Use Case**: Production deployments with external database
- **Features**: Scalable, concurrent access, enterprise features
- **Status**: Not yet implemented

#### 4. Redis Storage (Planned)
- **Type**: `redis`
- **Use Case**: High-performance caching with persistence
- **Features**: In-memory performance with optional persistence
- **Status**: Not yet implemented

## Configuration

### Environment Variables

Configure storage using environment variables:

```bash
# Storage type (memory, sqlite, postgresql, redis)
export VIKUNJA_MCP_STORAGE_TYPE=sqlite

# SQLite database file path
export VIKUNJA_MCP_STORAGE_DATABASE_PATH=/path/to/filters.db

# Connection string for PostgreSQL/Redis
export VIKUNJA_MCP_STORAGE_CONNECTION_STRING=postgresql://user:pass@host:port/db

# Connection pool size (1-100)
export VIKUNJA_MCP_STORAGE_POOL_SIZE=10

# Connection timeout in milliseconds (1000-60000)
export VIKUNJA_MCP_STORAGE_TIMEOUT=5000

# Enable debug logging
export VIKUNJA_MCP_STORAGE_DEBUG=true
```

### Default Paths

If no database path is specified for SQLite, the following default locations are used:

- **Linux/macOS**: `$XDG_DATA_HOME/vikunja-mcp/filters.db` or `~/.local/share/vikunja-mcp/filters.db`
- **Windows**: `%APPDATA%/vikunja-mcp/filters.db`

### Programmatic Configuration

```typescript
import { createStorageConfig, createFilterStorage } from '@democratize-technology/vikunja-mcp/storage';

// Create custom configuration
const config = createStorageConfig({
  type: 'sqlite',
  databasePath: '/custom/path/filters.db',
  timeout: 10000,
  debug: true,
});

// Create storage instance
const storage = await createFilterStorage('session-id', 'user-id', 'api-url');
```

## Features

### Session Isolation

Each storage session is completely isolated from others:

```typescript
const storage1 = await createFilterStorage('session-1');
const storage2 = await createFilterStorage('session-2');

// Filters created in storage1 are not visible in storage2
await storage1.create({ name: 'Filter 1', filter: 'done = false', isGlobal: false });
await storage2.create({ name: 'Filter 1', filter: 'priority = 1', isGlobal: false });

// Both operations succeed - names can be duplicated across sessions
```

### Thread Safety

All storage operations are thread-safe using mutex locks:

```typescript
// Multiple concurrent operations are safely serialized
const promises = Array.from({ length: 10 }, (_, i) =>
  storage.create({
    name: `Filter ${i}`,
    filter: `priority = ${i}`,
    isGlobal: false,
  })
);

const results = await Promise.all(promises);
// All 10 filters are created successfully
```

### Error Handling and Recovery

#### Automatic Recovery
- **Database Corruption**: Automatic integrity checks and repair attempts
- **Connection Loss**: Automatic reconnection with exponential backoff
- **Backup Creation**: Automatic backups before recovery operations

#### Graceful Degradation
- **Persistent Storage Failure**: Automatic fallback to in-memory storage
- **Configuration Errors**: Default to memory storage with warnings
- **Partial Failures**: Continue operating with reduced functionality

### Health Monitoring

```typescript
const healthCheck = await storage.healthCheck();

if (healthCheck.healthy) {
  console.log('Storage is healthy');
} else {
  console.error('Storage issues detected:', healthCheck.error);
  
  if (healthCheck.recoveryAttempted) {
    console.log('Automatic recovery was attempted');
  }
  
  if (healthCheck.backupCreated) {
    console.log('Backup was created before recovery');
  }
}
```

## Database Schema

### SQLite Schema

```sql
-- Schema version tracking
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  checksum TEXT
);

-- Saved filters with session isolation
CREATE TABLE saved_filters (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  filter TEXT NOT NULL,
  expression TEXT,
  project_id INTEGER,
  is_global INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  UNIQUE(session_id, name)
);

-- Performance indexes
CREATE INDEX idx_saved_filters_session ON saved_filters(session_id);
CREATE INDEX idx_saved_filters_project ON saved_filters(session_id, project_id);
CREATE INDEX idx_saved_filters_updated ON saved_filters(session_id, updated DESC);
```

### Schema Migrations

The system supports automatic schema migrations:

```typescript
import { MigrationRunner } from '@democratize-technology/vikunja-mcp/storage';

const migrationRunner = new MigrationRunner(database);

// Check current version
const currentVersion = migrationRunner.getCurrentVersion();

// Migrate to latest
await migrationRunner.migrateToLatest();

// Get migration status
const status = migrationRunner.getStatus();
console.log(`Current: ${status.currentVersion}, Latest: ${status.latestVersion}`);
```

## Usage Examples

### Basic Usage

```typescript
import { createFilterStorage } from '@democratize-technology/vikunja-mcp/storage';

// Create storage instance
const storage = await createFilterStorage('my-session');

// Create a filter
const filter = await storage.create({
  name: 'High Priority Tasks',
  description: 'Tasks with high priority',
  filter: 'priority > 3',
  isGlobal: false,
  projectId: 123,
});

// Retrieve the filter
const retrieved = await storage.get(filter.id);

// Update the filter
const updated = await storage.update(filter.id, {
  description: 'Updated description',
});

// List all filters
const filters = await storage.list();

// Find by name
const found = await storage.findByName('High Priority Tasks');

// Get project-specific filters
const projectFilters = await storage.getByProject(123);

// Delete the filter
await storage.delete(filter.id);
```

### Advanced Usage

```typescript
import { 
  createFilterStorage,
  getAllStorageStats,
  healthCheckAllStorage,
  migrateMemoryToPersistent,
} from '@democratize-technology/vikunja-mcp/storage';

// Get statistics for all storage sessions
const stats = await getAllStorageStats();
console.log(`Total sessions: ${stats.totalSessions}, Total filters: ${stats.totalFilters}`);

// Health check all storage systems
const health = await healthCheckAllStorage();
if (health.overall !== 'healthy') {
  console.warn('Storage issues detected:', health);
}

// Migrate from memory to persistent storage
const migration = await migrateMemoryToPersistent();
if (migration.success) {
  console.log(`Migrated ${migration.migratedFilters} filters from ${migration.migratedSessions} sessions`);
} else {
  console.error('Migration failed:', migration.errors);
}
```

### Custom Storage Adapter

```typescript
import { StorageAdapter, StorageSession, SavedFilter } from '@democratize-technology/vikunja-mcp/storage';

class CustomStorageAdapter implements StorageAdapter {
  async initialize(session: StorageSession): Promise<void> {
    // Initialize your custom storage backend
  }

  async list(): Promise<SavedFilter[]> {
    // Implement list operation
  }

  // ... implement other required methods
}

// Register with factory
import { storageAdapterFactory } from '@democratize-technology/vikunja-mcp/storage';
// Custom registration would require extending the factory
```

## Performance Considerations

### SQLite Optimizations

- **WAL Mode**: Enabled by default for better concurrency
- **Prepared Statements**: All queries use prepared statements for performance
- **Connection Pooling**: Reuse connections across operations
- **Indexes**: Optimized indexes for common query patterns

### Memory Usage

- **Automatic Cleanup**: Inactive sessions are cleaned up after 1 hour
- **Memory Monitoring**: Track memory usage with statistics
- **Lazy Loading**: Initialize storage only when needed

### Scaling

- **Session Isolation**: Each session operates independently
- **Concurrent Operations**: Thread-safe operations with mutex locks
- **Batch Operations**: Efficient bulk operations where possible

## Troubleshooting

### Common Issues

#### Database Locked Errors
```bash
# Check for other processes using the database
lsof /path/to/database.db

# Enable WAL mode to reduce lock contention
export VIKUNJA_MCP_STORAGE_DEBUG=true
```

#### Permission Errors
```bash
# Ensure directory exists and is writable
mkdir -p ~/.local/share/vikunja-mcp
chmod 755 ~/.local/share/vikunja-mcp

# Check file permissions
ls -la ~/.local/share/vikunja-mcp/filters.db
```

#### Memory Storage Fallback
```bash
# Check logs for storage initialization errors
export VIKUNJA_MCP_STORAGE_DEBUG=true

# Verify configuration
env | grep VIKUNJA_MCP_STORAGE
```

### Debug Logging

Enable debug logging to troubleshoot issues:

```bash
export VIKUNJA_MCP_STORAGE_DEBUG=true
```

Debug logs include:
- Storage adapter initialization
- Database operations
- Health check results
- Recovery attempts
- Performance metrics

## Migration Guide

### From In-Memory to Persistent Storage

1. **Stop the MCP server**
2. **Configure persistent storage**:
   ```bash
   export VIKUNJA_MCP_STORAGE_TYPE=sqlite
   export VIKUNJA_MCP_STORAGE_DATABASE_PATH=/path/to/filters.db
   ```
3. **Start the server**
4. **Optionally migrate existing data**:
   ```typescript
   const result = await migrateMemoryToPersistent();
   ```

### Backup and Restore

#### Create Backup
```bash
# SQLite backup
cp /path/to/filters.db /path/to/backup/filters.db.backup

# Or use SQLite backup command
sqlite3 /path/to/filters.db ".backup /path/to/backup/filters.db.backup"
```

#### Restore from Backup
```bash
# Stop the server
# Replace database file
cp /path/to/backup/filters.db.backup /path/to/filters.db
# Start the server
```

## Security Considerations

### File Permissions
- Database files should have restricted permissions (600 or 640)
- Database directory should be owned by the service user
- Backup files should be stored securely

### Data Encryption
- Consider filesystem-level encryption for sensitive data
- SQLite databases are stored as plain files
- Network connections (PostgreSQL/Redis) should use TLS

### Access Control
- Session isolation prevents cross-session data access
- No built-in user authentication (handled by MCP layer)
- Consider network-level access controls for external databases

## Future Enhancements

### Planned Features
- **PostgreSQL Support**: Full implementation with connection pooling
- **Redis Support**: High-performance caching with optional persistence
- **Encryption at Rest**: Built-in database encryption
- **Replication**: Master-slave replication for high availability
- **Metrics**: Prometheus metrics for monitoring
- **Compression**: Optional compression for large filter expressions

### Performance Improvements
- **Query Optimization**: Advanced indexing strategies
- **Caching Layer**: Multi-level caching for frequently accessed data
- **Bulk Operations**: Efficient batch insert/update operations
- **Connection Pooling**: Advanced connection management

## Contributing

### Adding New Storage Backends

1. **Implement StorageAdapter interface**
2. **Add configuration support**
3. **Implement tests**
4. **Update factory**
5. **Add documentation**

### Testing

```bash
# Run storage tests
npm test tests/storage/

# Run specific test file
npm test tests/storage/persistent-storage.test.ts

# Run with coverage
npm run test:coverage
```

### Debugging

Use the debug utilities:

```typescript
import { createFilterStorage } from '@democratize-technology/vikunja-mcp/storage';

const storage = await createFilterStorage('debug-session');
const stats = await storage.getStats();
const health = await storage.healthCheck();

console.log('Storage Stats:', stats);
console.log('Health Check:', health);
```