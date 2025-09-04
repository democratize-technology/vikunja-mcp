# Rate Limiting and Request Size Controls

This document describes the rate limiting and request size control system implemented to protect against DoS attacks and resource exhaustion.

## Overview

The rate limiting system provides comprehensive protection against:
- **Request flooding** - Limits requests per minute and per hour
- **Large payload attacks** - Validates request and response sizes
- **Long-running operations** - Enforces timeout limits
- **Resource exhaustion** - Prevents memory and CPU abuse

## Architecture

The system consists of three main components:

1. **RateLimitingMiddleware** - Core rate limiting logic with sliding window algorithm
2. **Tool Wrapper** - Integration layer for MCP tool registration
3. **Configuration System** - Environment-based configuration with sensible defaults

### Design Principles

- **Non-intrusive** - Minimal changes to existing tool implementations
- **Configurable** - All limits adjustable via environment variables
- **Tool-aware** - Different limits for different tool categories
- **Session-based** - Per-session tracking with in-memory storage
- **Graceful degradation** - Clear error messages when limits exceeded

## Configuration

### Environment Variables

All rate limiting is controlled via environment variables with sensible defaults:

#### Global Settings
```bash
# Enable/disable rate limiting (default: true)
RATE_LIMIT_ENABLED=true
```

#### Default Tool Limits
```bash
# Requests per minute (default: 60)
RATE_LIMIT_PER_MINUTE=60

# Requests per hour (default: 1000) 
RATE_LIMIT_PER_HOUR=1000

# Maximum request size in bytes (default: 1MB)
MAX_REQUEST_SIZE=1048576

# Maximum response size in bytes (default: 10MB)
MAX_RESPONSE_SIZE=10485760

# Tool execution timeout in milliseconds (default: 30 seconds)
TOOL_TIMEOUT=30000
```

#### Expensive Tool Limits
For computationally expensive operations:
```bash
EXPENSIVE_RATE_LIMIT_PER_MINUTE=10
EXPENSIVE_RATE_LIMIT_PER_HOUR=100
EXPENSIVE_MAX_REQUEST_SIZE=2097152    # 2MB
EXPENSIVE_MAX_RESPONSE_SIZE=52428800  # 50MB
EXPENSIVE_TOOL_TIMEOUT=120000         # 2 minutes
```

#### Bulk Operation Limits
For bulk import/export operations:
```bash
BULK_RATE_LIMIT_PER_MINUTE=5
BULK_RATE_LIMIT_PER_HOUR=50
BULK_MAX_REQUEST_SIZE=5242880         # 5MB
BULK_MAX_RESPONSE_SIZE=104857600      # 100MB
BULK_TOOL_TIMEOUT=300000              # 5 minutes
```

#### Export Operation Limits
For data export operations:
```bash
EXPORT_RATE_LIMIT_PER_MINUTE=2
EXPORT_RATE_LIMIT_PER_HOUR=10
EXPORT_MAX_REQUEST_SIZE=1048576       # 1MB
EXPORT_MAX_RESPONSE_SIZE=1073741824   # 1GB
EXPORT_TOOL_TIMEOUT=600000            # 10 minutes
```

### Tool Categories

Tools are automatically categorized for rate limiting:

| Category | Tools | Characteristics |
|----------|-------|-----------------|
| `default` | `vikunja_auth`, `vikunja_tasks`, `vikunja_projects`, etc. | Standard CRUD operations |
| `bulk` | `vikunja_batch_import` | High-volume data operations |
| `export` | `vikunja_export`, `vikunja_export_tasks`, `vikunja_export_projects` | Large data exports |

## Implementation

### Integrating Rate Limiting

#### New Tool Registration
```typescript
import { registerToolWithRateLimit } from '../middleware/tool-wrapper';

export function registerMyTool(server: McpServer, authManager: AuthManager): void {
  registerToolWithRateLimit(
    server,
    'my_tool_name',
    {
      subcommand: z.enum(['create', 'read', 'update', 'delete']),
      // ... other schema fields
    },
    async (args) => {
      // Tool implementation
      return { success: true };
    }
  );
}
```

#### Existing Tool Migration
```typescript
// Before
server.tool('tool_name', schema, handler);

// After
import { registerToolWithRateLimit } from '../middleware/tool-wrapper';
registerToolWithRateLimit(server, 'tool_name', schema, handler);
```

#### Direct Handler Wrapping
```typescript
import { withRateLimit } from '../middleware/rate-limiting';

const handler = async (args) => {
  // Tool logic
};

const rateLimitedHandler = withRateLimit('tool_name', handler);
```

### Custom Rate Limiting
```typescript
import { RateLimitingMiddleware } from '../middleware/rate-limiting';

const customMiddleware = new RateLimitingMiddleware({
  default: {
    requestsPerMinute: 100,
    requestsPerHour: 2000,
    maxRequestSize: 2097152, // 2MB
    maxResponseSize: 20971520, // 20MB
    executionTimeout: 60000, // 1 minute
    enabled: true,
  },
});

const wrappedHandler = customMiddleware.withRateLimit('my_tool', handler);
```

## Error Responses

When rate limits are exceeded, the system returns structured error responses:

### Rate Limit Exceeded
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded: 60/60 requests per minute",
    "details": {
      "rateLimitType": "per_minute",
      "limit": 60,
      "current": 60,
      "resetTime": 45
    }
  }
}
```

### Request Too Large
```json
{
  "error": {
    "code": "REQUEST_TOO_LARGE", 
    "message": "Request size 2048000 bytes exceeds limit of 1048576 bytes",
    "details": {
      "requestSize": 2048000,
      "maxRequestSize": 1048576
    }
  }
}
```

### Timeout Error
```json
{
  "error": {
    "code": "TIMEOUT_ERROR",
    "message": "Tool execution timeout after 30000ms",
    "details": {
      "timeout": 30000,
      "toolName": "vikunja_tasks"
    }
  }
}
```

## Monitoring and Debugging

### Rate Limit Status
```typescript
import { rateLimitingMiddleware } from '../middleware/rate-limiting';

const status = rateLimitingMiddleware.getRateLimitStatus();
console.log({
  sessionId: status.sessionId,
  requestsLastMinute: status.requestsLastMinute,
  requestsLastHour: status.requestsLastHour,
  limits: status.limits
});
```

### Clearing Session Data
```typescript
// Clear rate limit data for current session
rateLimitingMiddleware.clearSession();

// Clear specific session
rateLimitingMiddleware.clearSession('specific-session-id');
```

### Configuration Inspection
```typescript
const config = rateLimitingMiddleware.getConfig();
console.log('Current rate limiting configuration:', config);
```

## Testing

### Unit Tests
```bash
# Run rate limiting tests
npm test tests/middleware/rate-limiting.test.ts

# Run integration tests  
npm test tests/integration/rate-limiting-integration.test.ts
```

### Testing with Disabled Rate Limiting
```bash
# Disable for testing
RATE_LIMIT_ENABLED=false npm test

# Or set very high limits
RATE_LIMIT_PER_MINUTE=10000 npm test
```

### Load Testing
```typescript
// Example load test
describe('Load Testing', () => {
  it('should handle burst requests gracefully', async () => {
    const promises = Array.from({ length: 100 }, () => 
      wrappedHandler({ test: 'data' })
    );
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled');
    const rateLimited = results.filter(r => 
      r.status === 'rejected' && 
      r.reason.code === 'RATE_LIMIT_EXCEEDED'
    );
    
    expect(successful.length).toBeLessThanOrEqual(60); // Per minute limit
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
```

## Security Considerations

### Session Management
- Sessions are identified by process ID (can be enhanced with proper client identification)
- In-memory storage (no persistent tracking across restarts)
- Automatic cleanup of old request timestamps

### Attack Mitigation
- **Burst protection** - Sliding window algorithm prevents quick bursts
- **Sustained attack protection** - Hourly limits prevent long-term abuse  
- **Memory protection** - Request/response size limits prevent memory exhaustion
- **CPU protection** - Execution timeouts prevent resource monopolization

### Production Deployment
```bash
# Recommended production settings
RATE_LIMIT_PER_MINUTE=30
RATE_LIMIT_PER_HOUR=500
MAX_REQUEST_SIZE=524288        # 512KB
MAX_RESPONSE_SIZE=5242880      # 5MB
TOOL_TIMEOUT=15000             # 15 seconds

# For high-traffic scenarios
EXPENSIVE_RATE_LIMIT_PER_MINUTE=5
BULK_RATE_LIMIT_PER_MINUTE=2
EXPORT_RATE_LIMIT_PER_MINUTE=1
```

## Performance Impact

### Minimal Overhead
- **Memory**: ~100 bytes per session for tracking
- **CPU**: O(1) rate limit checks with periodic O(n) cleanup
- **Latency**: <1ms overhead per request

### Scaling Considerations
- In-memory storage limits horizontal scaling
- For distributed deployments, consider Redis-based session storage
- Rate limit data automatically cleaned up every 30 seconds

## Troubleshooting

### Common Issues

#### Rate Limits Too Strict
```bash
# Check current limits
node -e "console.log(require('./src/middleware/rate-limiting').rateLimitingMiddleware.getConfig())"

# Increase limits temporarily
RATE_LIMIT_PER_MINUTE=120 npm start
```

#### Timeouts on Legitimate Operations
```bash
# Increase timeout for specific operations
TOOL_TIMEOUT=60000 npm start

# Or disable for debugging
RATE_LIMIT_ENABLED=false npm start
```

#### Large Response Sizes
```bash
# Check response size limits
MAX_RESPONSE_SIZE=20971520 npm start  # 20MB

# Monitor actual response sizes in logs
DEBUG=true npm start
```

### Debugging Tips
1. Enable debug logging: `DEBUG=true`
2. Monitor rate limit status in tool handlers
3. Use integration tests to verify limits
4. Check environment variable loading
5. Verify tool category mappings

## Future Enhancements

### Planned Features
- **Redis backend** - Distributed rate limiting
- **Per-user limits** - User-specific rate limiting
- **Dynamic limits** - Adjust limits based on server load
- **Metrics export** - Prometheus/CloudWatch integration
- **Rate limit headers** - HTTP-style rate limit information

### Contributing
When adding new tools:
1. Categorize the tool appropriately in `TOOL_CATEGORIES`
2. Use `registerToolWithRateLimit` for new tools
3. Add integration tests
4. Document any special rate limiting needs