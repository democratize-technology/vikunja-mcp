/**
 * Tests for AORP Helper Methods
 * These tests verify that the lightweight helper methods work correctly with real AORP content
 */

import { parseMarkdown } from '../utils/markdown';

describe('AORP Helper Methods', () => {
  let parser: ReturnType<typeof parseMarkdown>;

  beforeEach(() => {
    parser = parseMarkdown('');
  });

  describe('getAorpStatus()', () => {
    it('should detect success status with ✅ emoji', () => {
      const aorpContent = `
## ✅ Success: Operation Completed

Some content here
      `;
      parser = parseMarkdown(aorpContent);
      const status = parser.getAorpStatus();

      expect(status.type).toBe('success');
      expect(status.heading).toBe('✅ Success: Operation Completed');
    });

    it('should detect error status with ❌ emoji', () => {
      const aorpContent = `
## ❌ Error: Validation Failed

Some error content
      `;
      parser = parseMarkdown(aorpContent);
      const status = parser.getAorpStatus();

      expect(status.type).toBe('error');
      expect(status.heading).toBe('❌ Error: Validation Failed');
    });

    it('should return unknown for malformed status', () => {
      const aorpContent = `
## Some Other Heading

Content without status
      `;
      parser = parseMarkdown(aorpContent);
      const status = parser.getAorpStatus();

      expect(status.type).toBe('unknown');
      expect(status.heading).toBe('');
    });

    it('should return unknown for empty content', () => {
      parser = parseMarkdown('');
      const status = parser.getAorpStatus();

      expect(status.type).toBe('unknown');
      expect(status.heading).toBe('');
    });
  });

  describe('getSectionContent()', () => {
    it('should extract content from Primary Recommendation section', () => {
      const aorpContent = `
## ✅ Success: Operation Completed

### Primary Recommendation

This is the main recommendation content.
It spans multiple lines.

### Additional Information

Other content here.
      `;
      parser = parseMarkdown(aorpContent);
      const content = parser.getSectionContent('Primary Recommendation');

      expect(content).toBe('This is the main recommendation content.\nIt spans multiple lines.');
    });

    it('should return empty string for non-existent section', () => {
      const aorpContent = `
## ✅ Success

### Existing Section

Some content
      `;
      parser = parseMarkdown(aorpContent);
      const content = parser.getSectionContent('Non-Existent Section');

      expect(content).toBe('');
    });

    it('should be case-insensitive for section names', () => {
      const aorpContent = `
## ✅ Success

### workflow guidance

This should be found regardless of case.
      `;
      parser = parseMarkdown(aorpContent);
      const content = parser.getSectionContent('Workflow Guidance');

      expect(content).toBe('This should be found regardless of case.');
    });
  });

  describe('getSectionListItems()', () => {
    it('should extract list items from Next Steps section', () => {
      const aorpContent = `
## ✅ Success

### Next Steps

1. Review the implementation
2. Run tests to verify functionality
3. Deploy to production

### Other Section

Not a list item
      `;
      parser = parseMarkdown(aorpContent);
      const items = parser.getSectionListItems('Next Steps');

      expect(items).toEqual([
        'Review the implementation',
        'Run tests to verify functionality',
        'Deploy to production'
      ]);
    });

    it('should handle unordered list items', () => {
      const aorpContent = `
## ✅ Success

### Secondary Recommendations

- Consider using TypeScript
- Add comprehensive tests
- Document the API

### Other Content

Not list items
      `;
      parser = parseMarkdown(aorpContent);
      const items = parser.getSectionListItems('Secondary Recommendations');

      expect(items).toEqual([
        'Consider using TypeScript',
        'Add comprehensive tests',
        'Document the API'
      ]);
    });

    it('should return empty array for non-existent section', () => {
      const aorpContent = `
## ✅ Success

### Existing Section

- Some item
      `;
      parser = parseMarkdown(aorpContent);
      const items = parser.getSectionListItems('Non-Existent Section');

      expect(items).toEqual([]);
    });

    it('should handle mixed ordered and unordered lists', () => {
      const aorpContent = `
## ✅ Success

### Mixed List Section

1. First ordered item
- Unordered item
2. Second ordered item
  - Nested unordered item
3. Third ordered item
      `;
      parser = parseMarkdown(aorpContent);
      const items = parser.getSectionListItems('Mixed List Section');

      expect(items).toEqual([
        'First ordered item',
        'Unordered item',
        'Second ordered item',
        'Nested unordered item',
        'Third ordered item'
      ]);
    });
  });

  describe('getOperationMetadata()', () => {
    it('should extract operation metadata from main content', () => {
      const aorpContent = `
**Operation:** tasks-create
**Status:** success
**Duration:** 2.3s
**Items Processed:** 42

Some additional content that should be ignored.
      `;
      parser = parseMarkdown(aorpContent);
      const metadata = parser.getOperationMetadata();

      expect(metadata).toEqual({
        operation: 'tasks-create',
        status: 'success',
        duration: '2.3s',
        'items_processed': '42'
      });
    });

    it('should handle missing metadata gracefully', () => {
      const aorpContent = `
## ✅ Success

No metadata in this content.
Just regular paragraphs.
      `;
      parser = parseMarkdown(aorpContent);
      const metadata = parser.getOperationMetadata();

      expect(metadata).toEqual({});
    });

    it('should handle metadata with various formatting', () => {
      const aorpContent = `
**Operation:** projects-update
**Confidence:** 95%
**Session ID:** sess_abc123
**Urgency:** high
      `;
      parser = parseMarkdown(aorpContent);
      const metadata = parser.getOperationMetadata();

      expect(metadata).toEqual({
        operation: 'projects-update',
        confidence: '95%',
        'session_id': 'sess_abc123',
        urgency: 'high'
      });
    });

    it('should ignore malformed metadata lines', () => {
      const aorpContent = `
**Operation:** tasks-create
This is not a metadata line
**Status:** success
**Incomplete metadata line
**Valid Metadata:** value
      `;
      parser = parseMarkdown(aorpContent);
      const metadata = parser.getOperationMetadata();

      expect(metadata).toEqual({
        operation: 'tasks-create',
        status: 'success',
        'valid_metadata': 'value'
      });
    });
  });

  describe('Integration Test with Real AORP Content', () => {
    it('should parse complete AORP response using all helpers', () => {
      const realAorpContent = `
## ✅ Success: Task Created Successfully

**Operation:** tasks-create
**Status:** success
**Duration:** 1.2s
**Task ID:** 12345

### Primary Recommendation

The task has been successfully created and is now available in your project. You can proceed with assigning team members and setting due dates.

### Next Steps

1. Assign the task to appropriate team members
2. Set a realistic due date based on project timeline
3. Add any relevant tags or labels
4. Set up notifications for task updates

### Secondary Recommendations

- Consider breaking down the task into smaller subtasks if complex
- Add detailed description and acceptance criteria
- Link related tasks or dependencies

### Quality Indicators

**Task Completeness:** 85%
**Priority Assignment:** medium
**Timeline Alignment:** 92%
      `;

      parser = parseMarkdown(realAorpContent);

      // Test all helpers work together
      const status = parser.getAorpStatus();
      const primaryRec = parser.getSectionContent('Primary Recommendation');
      const nextSteps = parser.getSectionListItems('Next Steps');
      const secondaryRecs = parser.getSectionListItems('Secondary Recommendations');
      const metadata = parser.getOperationMetadata();

      expect(status.type).toBe('success');
      expect(status.heading).toBe('✅ Success: Task Created Successfully');

      expect(primaryRec).toContain('The task has been successfully created');

      expect(nextSteps).toHaveLength(4);
      expect(nextSteps[0]).toBe('Assign the task to appropriate team members');

      expect(secondaryRecs).toHaveLength(3);
      expect(secondaryRecs[0]).toContain('breaking down the task');

      const expectedMetadata = {
        operation: 'tasks-create',
        status: 'success',
        duration: '1.2s',
        'task_id': '12345'
      };

      // The actual metadata may include additional keys from the H2 heading
      Object.keys(expectedMetadata).forEach(key => {
        expect(metadata[key]).toBe(expectedMetadata[key]);
      });
    });
  });
});