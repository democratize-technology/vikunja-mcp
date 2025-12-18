# Configuration Migration Plan

## Overview

This document outlines the step-by-step migration from scattered environment variable usage to centralized configuration management, addressing **TD-002: Environment Variable Sprawl** (57 hours of technical debt).

## Technical Debt Summary

- **Principal**: 57 hours
- **Interest Rate**: 18% APR
- **Scope**: 33 environment variables across 4 files
- **Problem**: Scattered configuration making the system hard to configure and test

## Migration Strategy

### Phase 1: Foundation (Completed)
- ✅ Created centralized configuration types and schemas (`src/config/types.ts`)
- ✅ Implemented ConfigurationManager with Zod validation (`src/config/ConfigurationManager.ts`) 
- ✅ Added comprehensive test suite (`tests/config/ConfigurationManager.test.ts`)
- ✅ Updated package.json with Zod dependency
- ✅ Enhanced .env.example with complete configuration documentation

### Phase 2: Gradual Migration (Next Steps)

#### 2.1 Update Rate Limiting Middleware
**File**: `src/middleware/rate-limiting.ts`
**Risk**: High (core functionality)
**Strategy**: Shadow migration with fallback

```typescript
// Before: Direct process.env usage
const DEFAULT_CONFIG: ToolRateLimits = {
  default: {
    requestsPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '60', 10),
    // ... 23 more environment variables
  }
};

// After: Centralized configuration with fallback
import { getRateLimitConfig } from '../config';

export class RateLimitingMiddleware {
  private static async createDefaultConfig(): Promise<ToolRateLimits> {
    try {
      return await getRateLimitConfig();
    } catch (error) {
      // Fallback to original behavior during migration
      logger.warn('Using fallback rate limiting configuration', { error });
      return LEGACY_DEFAULT_CONFIG;
    }
  }
}
```

#### 2.2 Update Logger Configuration
**File**: `src/utils/logger.ts`
**Risk**: Medium (widely used, but simple change)
**Strategy**: Direct replacement

```typescript
// Before: Constructor with direct process.env
constructor() {
  const debug = process.env.DEBUG === 'true';
  const logLevel = process.env.LOG_LEVEL?.toLowerCase();
  // ... manual parsing logic
}

// After: Async configuration loading
export async function createLogger() {
  const config = await getLoggingConfig();
  return new Logger(config);
}
```

#### 2.3 Update Main Application Entry Point
**File**: `src/index.ts`
**Risk**: High (startup logic)
**Strategy**: Early configuration initialization

```typescript
// Before: Scattered environment checks
if (process.env.VIKUNJA_URL && process.env.VIKUNJA_API_TOKEN) {
  authManager.connect(process.env.VIKUNJA_URL, process.env.VIKUNJA_API_TOKEN);
}

// After: Centralized configuration
async function main() {
  // Initialize configuration early
  const config = await getConfiguration();
  
  if (config.auth.vikunjaUrl && config.auth.vikunjaToken) {
    authManager.connect(config.auth.vikunjaUrl, config.auth.vikunjaToken);
  }
  
  // Rest of startup logic
}
```

#### 2.4 Update Feature Flag Usage
**File**: `src/utils/filtering/FilteringContext.ts`
**Risk**: Low (isolated feature)
**Strategy**: Direct replacement

```typescript
// Before: Direct environment checks
const shouldAttemptServerSideFiltering = config.enableServerSide && (
  process.env.NODE_ENV === 'production' || 
  process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING === 'true'
);

// After: Feature flag check
const shouldAttemptServerSideFiltering = config.enableServerSide && 
  await isFeatureEnabled('enableServerSideFiltering');
```

### Phase 3: Testing and Validation

#### 3.1 Update Test Suites
Replace environment manipulation with configuration injection:

```typescript
// Before: Environment manipulation in tests
beforeEach(() => {
  process.env.RATE_LIMIT_PER_MINUTE = '30';
  process.env.RATE_LIMIT_ENABLED = 'true';
});

// After: Configuration injection
beforeEach(() => {
  ConfigurationManager.reset();
  const testManager = ConfigurationManager.getInstance({
    sources: {
      rateLimiting: {
        enabled: true,
        default: { requestsPerMinute: 30 }
      }
    }
  });
});
```

#### 3.2 Regression Testing
- Run existing test suite to ensure no functionality breaks
- Test all environment variable combinations from .env.example
- Verify environment profile behavior (development/test/production)
- Test configuration error handling and validation

### Phase 4: Cleanup and Documentation

#### 4.1 Remove Legacy Code
- Remove direct process.env usage from migrated files
- Clean up test environment manipulation code
- Remove redundant configuration parsing logic

#### 4.2 Update Documentation
- Update README with new configuration approach
- Create configuration reference documentation
- Update deployment documentation with environment profiles

## Backward Compatibility Strategy

### Environment Variable Mapping
All existing environment variables continue to work through the mapping in `ConfigurationManager.ts`:

```typescript
const ENV_VAR_MAPPING = {
  'auth.vikunjaUrl': 'VIKUNJA_URL',
  'auth.vikunjaToken': 'VIKUNJA_API_TOKEN',
  'rateLimiting.default.requestsPerMinute': 'RATE_LIMIT_PER_MINUTE',
  // ... complete mapping of 33 variables
};
```

### Migration Timeline

| Phase | Duration | Risk Level | Validation Required |
|-------|----------|------------|-------------------|
| Phase 1: Foundation | Completed | None | ✅ Tests pass |
| Phase 2.1: Rate Limiting | 4 hours | High | Full integration tests |
| Phase 2.2: Logger | 2 hours | Medium | Logging verification |
| Phase 2.3: Main Entry | 3 hours | High | Startup testing |
| Phase 2.4: Feature Flags | 1 hour | Low | Feature testing |
| Phase 3: Testing | 8 hours | Medium | Comprehensive coverage |
| Phase 4: Cleanup | 2 hours | Low | Documentation review |
| **Total** | **20 hours** | | |

### Rollback Plan

If issues are discovered during migration:

1. **Immediate Rollback**: Revert specific file changes using git
2. **Fallback Mode**: Enable legacy configuration mode in ConfigurationManager
3. **Configuration Bypass**: Add emergency environment variable to skip centralized config

```typescript
// Emergency bypass mechanism
if (process.env.VIKUNJA_MCP_LEGACY_CONFIG === 'true') {
  logger.warn('Using legacy configuration mode');
  return legacyConfigurationLoad();
}
```

## Risk Mitigation

### High-Risk Areas
1. **Rate Limiting Middleware**: Core functionality, many environment variables
2. **Application Startup**: Critical path, authentication dependency
3. **Logger Configuration**: Used throughout application

### Mitigation Strategies
1. **Shadow Deployment**: Test new configuration alongside existing
2. **Feature Flags**: Gradual rollout with ability to revert
3. **Comprehensive Testing**: Unit, integration, and manual testing
4. **Monitoring**: Track configuration errors and fallbacks

## Success Metrics

### Technical Debt Reduction
- **57 hours of debt eliminated** through centralized management
- **33 environment variables** consolidated into 4 configuration sections
- **4 files** with scattered configuration unified

### Developer Experience Improvements
- **Type Safety**: All configuration strongly typed with Zod validation
- **Testing**: Easy configuration injection for unit tests
- **Documentation**: Comprehensive .env.example with all variables documented
- **Environment Profiles**: Automatic configuration for dev/test/prod environments

### Operational Benefits
- **Validation**: Early detection of configuration errors with detailed messages
- **Security**: Safer handling of sensitive configuration values
- **Maintainability**: Single source of truth for all configuration logic

## Post-Migration Validation

### Configuration Validation Test
```bash
# Test all environment variable combinations
npm run test:config-validation

# Test environment profile behavior
NODE_ENV=development npm test
NODE_ENV=test npm test  
NODE_ENV=production npm test

# Test error handling
VIKUNJA_URL=invalid-url npm test
```

### Performance Impact Assessment
- Measure configuration loading time
- Monitor memory usage of configuration system
- Validate no performance regression in tool execution

### Documentation Completeness Check
- All 33 environment variables documented in .env.example
- Migration examples cover all affected files
- Developer documentation updated with new patterns

This migration plan eliminates the 57 hours of technical debt while maintaining full backward compatibility and improving developer experience through type safety and better testing capabilities.