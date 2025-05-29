# Vikunja MCP Testing Guide

This guide documents the testing approach and patterns established in PR #6 for the Vikunja MCP project.

## Testing Philosophy

- **100% coverage requirement**: If it can't be tested, it shouldn't exist
- **Mock all external dependencies**: Tests should be isolated and fast
- **Test-driven development**: Write tests first when possible
- **Both success and failure paths**: Every operation should test error cases

## Current Coverage Status

| Component | Statement Coverage | Line Coverage | Status |
|-----------|-------------------|---------------|---------|
| Tasks Tool | 96.71% | 99.24% | ✅ Complete |
| AuthManager | 93.33% | - | ✅ Complete |
| Overall Project | 66.91% | - | 🚧 In Progress |

## Testing Patterns

### 1. Mock Setup

```typescript
// Mock the modules
jest.mock('../../src/index', () => ({
  getVikunjaClient: jest.fn()
}));

// Setup mock client with all required methods
const mockClient = {
  getToken: jest.fn().mockReturnValue('test-token'),
  tasks: {
    getAllTasks: jest.fn(),
    getProjectTasks: jest.fn(),
    createTask: jest.fn(),
    // ... other methods
  }
};
```

### 2. Test Structure

Each tool should have tests organized by:
- Subcommand (using describe blocks)
- Success cases
- Validation errors
- API errors
- Edge cases

### 3. Common Test Cases

#### Input Validation
- Required fields missing
- Invalid data types
- Out of range values (e.g., priority must be 0-5)
- Invalid date formats (must be ISO 8601)
- Invalid IDs (must be positive integers)

#### Error Handling
- Authentication failures
- Network errors (ECONNREFUSED)
- Rate limiting (status 429)
- Malformed JSON responses
- API errors with meaningful messages

#### Edge Cases
- Empty responses
- Undefined optional fields
- Multiple operations (bulk updates)
- Concurrent operation considerations

### 4. Important Discoveries

Through testing, we discovered:
- Task priority range is 0-5 (not 0-10)
- Tasks have both `project_id` and `projectId` properties
- Date fields must be valid ISO 8601 format
- The `attach` subcommand cannot be implemented due to MCP limitations

### 5. Test Data Patterns

Create consistent mock data:
```typescript
const mockTask: Task = {
  id: 1,
  title: 'Test Task',
  description: 'Test Description',
  done: false,
  priority: 5,
  project_id: 1,
  projectId: 1, // Note: API returns both
  // ... other fields
};
```

### 6. Future Testing Improvements

1. **Type Safety**: Replace `any` types in mocks with proper typed mocks
2. **Special Characters**: Add tests for Unicode and special characters in text fields
3. **Timezone Handling**: Explicitly test date handling across timezones
4. **Large Datasets**: Test pagination with large result sets
5. **Integration Tests**: Once unit coverage is complete, add integration tests

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test tasks.test.ts
```

## Writing New Tests

When adding new tools or features:

1. Start with the test file in `tests/tools/[toolname].test.ts`
2. Mock all external dependencies
3. Test each subcommand thoroughly
4. Include both positive and negative test cases
5. Aim for >95% coverage

## Example Test Template

```typescript
describe('New Tool', () => {
  let mockClient: any;
  let toolHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup mocks
  });

  describe('subcommand', () => {
    it('should handle success case', async () => {
      // Arrange
      mockClient.method.mockResolvedValue(expectedResult);
      
      // Act
      const result = await callTool('subcommand', { /* args */ });
      
      // Assert
      expect(result).toBeDefined();
      // ... more assertions
    });

    it('should handle validation error', async () => {
      await expect(callTool('subcommand', { /* invalid args */ }))
        .rejects.toThrow('Expected error message');
    });
  });
});
```

## Continuous Improvement

As we discover new patterns or edge cases, update this guide to maintain consistency across the project.
