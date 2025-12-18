import { describe, it, expect } from '@jest/globals';
import { parseMarkdown } from '../tests/utils/markdown';

describe('AORP Helper Methods - Quick Validation', () => {
  it('should getAorpStatus correctly', () => {
    const aorpContent = `## ✅ Success: Task Created Successfully

**Operation:** tasks-create
**Status:** success

### Primary Recommendation

The task has been successfully created and is ready for use.

### Next Steps

1. Verify the task appears correctly in your project
2. Check that all team members have appropriate access
`;

    const parsed = parseMarkdown(aorpContent);
    const status = parsed.getAorpStatus();

    expect(status).toEqual({
      type: 'success',
      heading: '✅ Success: Task Created Successfully'
    });
  });

  it('should getSectionContent correctly', () => {
    const aorpContent = `## ✅ Success: Operation Completed

### Primary Recommendation

The task has been successfully updated with all requested changes.
The system has validated all inputs and confirmed data integrity.

### Next Steps

1. Verify the task appears correctly in your project
2. Check that all team members have appropriate access
`;

    const parsed = parseMarkdown(aorpContent);
    const content = parsed.getSectionContent('Primary Recommendation');

    expect(content).toBe('The task has been successfully updated with all requested changes.\nThe system has validated all inputs and confirmed data integrity.');
  });

  it('should getSectionListItems correctly', () => {
    const aorpContent = `## ✅ Success: Multi-Step Operation

### Next Steps

1. Initialize the project structure
2. Configure development environment
3. Implement core functionality
4. Add comprehensive tests
5. Prepare deployment package
`;

    const parsed = parseMarkdown(aorpContent);
    const items = parsed.getSectionListItems('Next Steps');

    expect(items).toEqual([
      'Initialize the project structure',
      'Configure development environment',
      'Implement core functionality',
      'Add comprehensive tests',
      'Prepare deployment package'
    ]);
  });

  it('should getOperationMetadata correctly', () => {
    const aorpContent = `## ✅ Success: Task Management Operation

**Operation:** tasks-create
**Status:** success
**Duration:** 1.2s
**Task ID:** 12345
**Project ID:** 678
**User ID:** user_abc123

### Primary Recommendation

The task has been successfully created and assigned to the project.
`;

    const parsed = parseMarkdown(aorpContent);
    const metadata = parsed.getOperationMetadata();

    expect(metadata).toEqual({
      duration: '1.2s',
      operation: 'tasks-create',
      project_id: '678',
      status: 'success',
      success: 'Task Management Operation',
      task_id: '12345',
      user_id: 'user_abc123'
    });
  });
});