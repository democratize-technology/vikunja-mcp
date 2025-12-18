# Configuration Management

## Overview

The Vikunja MCP server uses a centralized configuration system that replaces scattered `process.env` usage with type-safe, validated configuration management. This system addresses TD-002 (Environment Variable Sprawl) by consolidating 33 environment variables into a unified architecture.

## Quick Start

### Basic Usage

```typescript
import { getConfiguration, getAuthConfig, getRateLimitConfig } from './config';

// Get complete configuration
const config = await getConfiguration();

// Get specific sections
const authConfig = await getAuthConfig();
const rateLimiting = await getRateLimitConfig();

// Check feature flags
const isEnabled = await isFeatureEnabled('enableServerSideFiltering');
```

### Environment Setup

1. Copy `.env.example` to `.env`
2. Configure your Vikunja connection:
   ```env
   VIKUNJA_URL=https://your-vikunja-instance.com
   VIKUNJA_API_TOKEN=your-api-token-here
   ```
3. Set your environment:
   ```env
   NODE_ENV=development  # or test, production
   ```

## Configuration Architecture

### Configuration Sections

The configuration is organized into four main sections:

#### 1. Authentication (`AuthConfig`)
```typescript
interface AuthConfig {
  vikunjaUrl?: string;     // Vikunja server URL
  vikunjaToken?: string;   // API or JWT token
  mcpMode?: string;        // MCP server mode
}
```

#### 2. Logging (`LoggingConfig`)
```typescript
interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  debug: boolean;
  environment: Environment;
}
```

#### 3. Rate Limiting (`RateLimitConfig`)
```typescript
interface RateLimitConfig {
  enabled: boolean;
  default: RateLimitSettings;    // Standard tools
  expensive: RateLimitSettings;  // Resource-intensive operations
  bulk: RateLimitSettings;       // Batch operations
  export: RateLimitSettings;     // Export operations
}

interface RateLimitSettings {
  requestsPerMinute: number;
  requestsPerHour: number;
  maxRequestSize: number;
  maxResponseSize: number;
  executionTimeout: number;
}
```

#### 4. Feature Flags (`FeatureFlagsConfig`)
```typescript
interface FeatureFlagsConfig {
  enableServerSideFiltering: boolean;
  enableAdvancedMetrics: boolean;
  enableExperimentalFeatures: boolean;
}
```

### Environment Profiles

The system automatically applies environment-specific defaults:

#### Development Profile
- **Logging**: Debug level, verbose output
- **Rate Limiting**: Disabled for easier testing
- **Features**: Experimental features enabled

#### Test Profile
- **Logging**: Error level only to reduce noise
- **Rate Limiting**: Disabled for test performance
- **Features**: Conservative settings for consistent behavior

#### Production Profile
- **Logging**: Info level for operational visibility
- **Rate Limiting**: Full protection enabled
- **Features**: Only stable features enabled

## Configuration Priority

Configuration values are resolved in the following priority order (highest to lowest):

1. **Programmatic Sources** - Direct configuration objects
2. **Environment Variables** - System environment variables
3. **Environment Profiles** - Dev/test/production defaults
4. **Schema Defaults** - Fallback values defined in schema

## Environment Variables Reference

### Authentication Variables
```env
VIKUNJA_URL=https://vikunja.example.com
VIKUNJA_API_TOKEN=tk_your_token_here
MCP_MODE=server
```

### Logging Variables
```env
LOG_LEVEL=info                    # error, warn, info, debug
DEBUG=false                       # true/false
NODE_ENV=production              # development, test, production
```

### Rate Limiting Variables
```env
# Global control
RATE_LIMIT_ENABLED=true

# Default tool limits
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_PER_HOUR=1000
MAX_REQUEST_SIZE=1048576          # 1MB in bytes
MAX_RESPONSE_SIZE=10485760        # 10MB in bytes
TOOL_TIMEOUT=30000               # 30 seconds in milliseconds

# Expensive tool limits
EXPENSIVE_RATE_LIMIT_PER_MINUTE=10
EXPENSIVE_RATE_LIMIT_PER_HOUR=100
EXPENSIVE_MAX_REQUEST_SIZE=2097152
EXPENSIVE_MAX_RESPONSE_SIZE=52428800
EXPENSIVE_TOOL_TIMEOUT=120000

# Bulk operation limits
BULK_RATE_LIMIT_PER_MINUTE=5
BULK_RATE_LIMIT_PER_HOUR=50
BULK_MAX_REQUEST_SIZE=5242880
BULK_MAX_RESPONSE_SIZE=104857600
BULK_TOOL_TIMEOUT=300000

# Export operation limits
EXPORT_RATE_LIMIT_PER_MINUTE=2
EXPORT_RATE_LIMIT_PER_HOUR=10
EXPORT_MAX_REQUEST_SIZE=1048576
EXPORT_MAX_RESPONSE_SIZE=1073741824
EXPORT_TOOL_TIMEOUT=600000
```

### Feature Flag Variables
```env
VIKUNJA_ENABLE_SERVER_SIDE_FILTERING=true
```

## Usage Patterns

### Application Initialization

```typescript
import { ConfigurationManager, getConfiguration } from './config';

async function initializeApplication() {
  try {
    // Load and validate configuration early
    const config = await getConfiguration();
    
    // Use validated configuration
    if (config.auth.vikunjaUrl && config.auth.vikunjaToken) {
      await connectToVikunja(config.auth.vikunjaUrl, config.auth.vikunjaToken);
    }
    
    // Configure components
    const logger = await createLogger(config.logging);
    const rateLimiter = await createRateLimiter(config.rateLimiting);
    
  } catch (error) {
    console.error('Configuration error:', error);
    process.exit(1);
  }
}
```

### Component Configuration

```typescript
// Before: Direct environment usage
export class RateLimitingMiddleware {
  constructor() {
    this.requestsPerMinute = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '60', 10);
    this.enabled = process.env.RATE_LIMIT_ENABLED !== 'false';
  }
}

// After: Configuration injection
export class RateLimitingMiddleware {
  constructor(private config: RateLimitConfig) {
    // Configuration already validated and typed
  }
  
  static async create(): Promise<RateLimitingMiddleware> {
    const config = await getRateLimitConfig();
    return new RateLimitingMiddleware(config);
  }
}
```

### Feature Flag Checks

```typescript
// Simple boolean check
if (await isFeatureEnabled('enableServerSideFiltering')) {
  return useServerSideStrategy();
} else {
  return useClientSideStrategy();
}

// Configuration-dependent logic
const featureFlags = await getFeatureFlagsConfig();
const strategy = featureFlags.enableServerSideFiltering ? 
  'server-side' : 'client-side';
```

## Testing with Configuration

### Test Configuration Injection

```typescript
import { ConfigurationManager } from '../src/config';

describe('RateLimitingMiddleware', () => {
  beforeEach(() => {
    // Reset singleton for clean test state
    ConfigurationManager.reset();
  });

  it('should respect custom rate limits', async () => {
    // Inject test configuration
    const manager = ConfigurationManager.getInstance({
      sources: {
        rateLimiting: {
          enabled: true,
          default: {
            requestsPerMinute: 5,  // Very low for testing
            requestsPerHour: 50,
            maxRequestSize: 1000,
            maxResponseSize: 10000,
            executionTimeout: 5000,
          }
        }
      }
    });
    
    const config = await manager.getRateLimitConfig();
    expect(config.default.requestsPerMinute).toBe(5);
  });
});
```

### Environment-Specific Testing

```typescript
// Test development profile behavior
it('should disable rate limiting in development', async () => {
  const manager = ConfigurationManager.getInstance({
    environment: Environment.DEVELOPMENT
  });
  
  const config = await manager.getRateLimitConfig();
  expect(config.enabled).toBe(false);
});

// Test validation errors
it('should reject invalid configuration', async () => {
  const manager = ConfigurationManager.getInstance({
    sources: {
      rateLimiting: {
        default: {
          requestsPerMinute: -1  // Invalid negative value
        }
      }
    }
  });
  
  await expect(manager.getConfiguration()).rejects.toThrow(ConfigurationError);
});
```

## Error Handling

### Configuration Errors

The system provides detailed validation errors:

```typescript
try {
  const config = await getConfiguration();
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error('Configuration validation failed:');
    console.error(`Field: ${error.field}`);
    console.error(`Message: ${error.message}`);
    console.error(`Value: ${error.value}`);
  }
}
```

### Common Error Scenarios

1. **Invalid URL Format**
   ```
   Configuration error in validation: Configuration validation failed:
     - auth.vikunjaUrl: Invalid url
   ```

2. **Negative Rate Limits**
   ```
   Configuration error in validation: Configuration validation failed:
     - rateLimiting.default.requestsPerMinute: Number must be greater than 0
   ```

3. **Invalid Log Level**
   ```
   Configuration error in validation: Configuration validation failed:
     - logging.level: Invalid enum value. Expected 'error' | 'warn' | 'info' | 'debug', received 'verbose'
   ```

## Migration from Legacy Configuration

### Step 1: Update Imports
```typescript
// Before
const maxSize = parseInt(process.env.MAX_REQUEST_SIZE || '1048576', 10);

// After
import { getRateLimitConfig } from './config';
const config = await getRateLimitConfig();
const maxSize = config.default.maxRequestSize;
```

### Step 2: Handle Async Configuration
```typescript
// Before: Synchronous constructor
class Logger {
  constructor() {
    this.level = process.env.LOG_LEVEL || 'info';
  }
}

// After: Async factory
class Logger {
  constructor(private config: LoggingConfig) {}
  
  static async create(): Promise<Logger> {
    const config = await getLoggingConfig();
    return new Logger(config);
  }
}
```

### Step 3: Update Tests
```typescript
// Before: Environment manipulation
beforeEach(() => {
  process.env.RATE_LIMIT_PER_MINUTE = '30';
});

// After: Configuration injection
beforeEach(() => {
  ConfigurationManager.reset();
  ConfigurationManager.getInstance({
    sources: { rateLimiting: { default: { requestsPerMinute: 30 } } }
  });
});
```

## Performance Considerations

### Configuration Caching
- Configuration is loaded once and cached per ConfigurationManager instance
- Subsequent calls to `getConfiguration()` return cached values
- Use `ConfigurationManager.reset()` to clear cache (testing only)

### Memory Usage
- Configuration schemas use minimal memory overhead
- Zod validation occurs only during initial load
- No performance impact on application runtime

### Startup Performance
- Configuration loading adds ~1-5ms to application startup
- All validation errors are caught early in startup process
- Async loading prevents blocking main application logic

## Best Practices

### 1. Load Configuration Early
```typescript
// Good: Load configuration at application startup
async function main() {
  const config = await getConfiguration();
  // Initialize components with configuration
}

// Avoid: Loading configuration in hot paths
async function handleRequest() {
  const config = await getConfiguration(); // Cache hit, but still async
  // Handle request
}
```

### 2. Use Type-Safe Configuration
```typescript
// Good: Use typed configuration sections
const rateLimits = await getRateLimitConfig();
const limit = rateLimits.default.requestsPerMinute; // TypeScript knows this is number

// Avoid: Accessing nested properties without types
const config = await getConfiguration();
const limit = (config as any).rateLimiting.default.requestsPerMinute;
```

### 3. Handle Configuration Errors Gracefully
```typescript
// Good: Specific error handling
try {
  const config = await getConfiguration();
} catch (error) {
  if (error instanceof ConfigurationError) {
    logger.error('Configuration validation failed', { error: error.message });
    process.exit(1);
  }
  throw error; // Re-throw unexpected errors
}

// Avoid: Generic error handling
try {
  const config = await getConfiguration();
} catch (error) {
  console.error('Something went wrong:', error);
}
```

### 4. Test with Configuration Injection
```typescript
// Good: Inject test configuration
const testManager = ConfigurationManager.getInstance({
  sources: { /* test configuration */ }
});

// Avoid: Manipulating process.env in tests
process.env.RATE_LIMIT_PER_MINUTE = '30';
```

## Troubleshooting

### Common Issues

1. **Configuration Not Loading**
   - Check that `getConfiguration()` is awaited
   - Verify environment variables are set correctly
   - Check for validation errors in logs

2. **Environment Variables Not Recognized**
   - Verify variable names match `.env.example`
   - Check for typos in environment variable names
   - Ensure values are in correct format (numbers, booleans)

3. **Test Failures After Migration**
   - Reset ConfigurationManager in test setup
   - Replace environment manipulation with configuration injection
   - Update mocks to use new configuration patterns

### Debug Configuration Loading

```typescript
// Enable detailed configuration logging
const config = await ConfigurationManager.getInstance({
  sources: { logging: { level: 'debug' } }
}).getConfiguration();

// Configuration loading details will be logged
```

This centralized configuration system eliminates the 57 hours of technical debt from environment variable sprawl while providing type safety, better testing capabilities, and improved developer experience.