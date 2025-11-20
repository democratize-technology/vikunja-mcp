/**
 * ARCH-002: Snapshot Tests for AORP Functionality
 * Regression detection for AI-Optimized Response Protocol helpers and formatting
 */

import { describe, it, expect } from '@jest/globals';
import { parseMarkdown } from '../utils/markdown';
import type { AorpResponse } from '../../src/aorp/types';
import { formatAorpAsMarkdown } from '../../src/aorp/markdown';

describe('AORP Helper Methods - Snapshot Tests', () => {
  describe('getAorpStatus() snapshots', () => {
    it('should extract success status consistently', () => {
      const successAorp = `
## ✅ Success: Task Created Successfully

**Operation:** tasks-create
**Status:** success

### Primary Recommendation

The task has been successfully created and is ready for use.
      `;

      const parsed = parseMarkdown(successAorp);
      const status = parsed.getAorpStatus();

      expect(status).toMatchInlineSnapshot(`
        {
          "heading": "✅ Success: Task Created Successfully",
          "type": "success",
        }
      `);
    });

    it('should extract error status consistently', () => {
      const errorAorp = `
## ❌ Error: Validation Failed

**Operation:** tasks-create
**Status:** error

### Primary Recommendation

Please check your input and try again.
      `;

      const parsed = parseMarkdown(errorAorp);
      const status = parsed.getAorpStatus();

      expect(status).toMatchInlineSnapshot(`
        {
          "heading": "❌ Error: Validation Failed",
          "type": "error",
        }
      `);
    });

    it('should handle unknown status consistently', () => {
      const unknownAorp = `
## Some Other Heading

**Operation:** tasks-create
**Status:** unknown

### Primary Recommendation

This is not a standard AORP status.
      `;

      const parsed = parseMarkdown(unknownAorp);
      const status = parsed.getAorpStatus();

      expect(status).toMatchInlineSnapshot(`
        {
          "heading": "",
          "type": "unknown",
        }
      `);
    });
  });

  describe('getSectionContent() snapshots', () => {
    it('should extract Primary Recommendation section consistently', () => {
      const aorpWithRecommendations = `
## ✅ Success: Operation Completed

**Operation:** tasks-update
**Status:** success

### Primary Recommendation

The task has been successfully updated with all requested changes.
The system has validated all inputs and confirmed data integrity.

### Next Steps

1. Verify the task appears correctly in your project
2. Check that all team members have appropriate access
3. Test the updated functionality if applicable
      `;

      const parsed = parseMarkdown(aorpWithRecommendations);
      const content = parsed.getSectionContent('Primary Recommendation');

      expect(content).toMatchInlineSnapshot(`
        "The task has been successfully updated with all requested changes.
        The system has validated all inputs and confirmed data integrity."
      `);
    });

    it('should extract Next Steps section consistently', () => {
      const aorpWithNextSteps = `
## ✅ Success: Complex Operation

### Next Steps

1. Review the implementation details
2. Run comprehensive test suite
3. Deploy to staging environment
4. Monitor system performance
5. Plan production rollout

### Secondary Recommendations

- Consider adding additional monitoring
- Update documentation for new features
      `;

      const parsed = parseMarkdown(aorpWithNextSteps);
      const content = parsed.getSectionContent('Next Steps');

      expect(content).toMatchInlineSnapshot(`
        "Review the implementation details
        Run comprehensive test suite
        Deploy to staging environment
        Monitor system performance
        Plan production rollout"
      `);
    });

    it('should return empty string for missing section', () => {
      const aorpWithoutSection = `
## ✅ Success: Simple Operation

**Operation:** tasks-delete
**Status:** success

### Primary Recommendation

The task has been successfully deleted.
      `;

      const parsed = parseMarkdown(aorpWithoutSection);
      const content = parsed.getSectionContent('NonExistent Section');

      expect(content).toMatchInlineSnapshot('""');
    });
  });

  describe('getSectionListItems() snapshots', () => {
    it('should extract ordered list items consistently', () => {
      const aorpWithOrderedList = `
## ✅ Success: Multi-Step Operation

### Next Steps

1. Initialize the project structure
2. Configure development environment
3. Implement core functionality
4. Add comprehensive tests
5. Prepare deployment package
      `;

      const parsed = parseMarkdown(aorpWithOrderedList);
      const items = parsed.getSectionListItems('Next Steps');

      expect(items).toMatchInlineSnapshot(`
        [
          "Initialize the project structure",
          "Configure development environment",
          "Implement core functionality",
          "Add comprehensive tests",
          "Prepare deployment package",
        ]
      `);
    });

    it('should extract unordered list items consistently', () => {
      const aorpWithUnorderedList = `
## ✅ Success: Recommendations Generated

### Secondary Recommendations

- Consider implementing additional validation
- Add comprehensive error handling
- Improve user experience with better feedback
- Optimize performance for large datasets
- Enhance security measures
      `;

      const parsed = parseMarkdown(aorpWithUnorderedList);
      const items = parsed.getSectionListItems('Secondary Recommendations');

      expect(items).toMatchInlineSnapshot(`
        [
          "Consider implementing additional validation",
          "Add comprehensive error handling",
          "Improve user experience with better feedback",
          "Optimize performance for large datasets",
          "Enhance security measures",
        ]
      `);
    });

    it('should handle mixed list types consistently', () => {
      const aorpWithMixedList = `
## ✅ Success: Comprehensive Analysis

### Recommendations

1. Review the current implementation
- Identify performance bottlenecks
2. Create optimization plan
- Implement critical improvements
3. Test and validate changes
      `;

      const parsed = parseMarkdown(aorpWithMixedList);
      const items = parsed.getSectionListItems('Recommendations');

      expect(items).toMatchInlineSnapshot(`
        [
          "Review the current implementation",
          "Identify performance bottlenecks",
          "Create optimization plan",
          "Implement critical improvements",
          "Test and validate changes",
        ]
      `);
    });

    it('should return empty array for section without lists', () => {
      const aorpWithoutLists = `
## ✅ Success: Text Content

### Details

This section contains only text content without any list items.
It should return an empty array when we try to extract list items.
      `;

      const parsed = parseMarkdown(aorpWithoutLists);
      const items = parsed.getSectionListItems('Details');

      expect(items).toMatchInlineSnapshot('[]');
    });
  });

  describe('getOperationMetadata() snapshots', () => {
    it('should extract metadata from AORP format consistently', () => {
      const aorpWithMetadata = `
## ✅ Success: Task Management Operation

**Operation:** tasks-create
**Status:** success
**Duration:** 1.2s
**Task ID:** 12345
**Project ID:** 678
**User ID:** user_abc123

### Primary Recommendation

The task has been successfully created and assigned to the project.
      `;

      const parsed = parseMarkdown(aorpWithMetadata);
      const metadata = parsed.getOperationMetadata();

      expect(metadata).toMatchInlineSnapshot(`
        {
          "duration": "1.2s",
          "operation": "tasks-create",
          "project_id": "678",
          "status": "success",
          "success": "Task Management Operation",
          "task_id": "12345",
          "user_id": "user_abc123",
        }
      `);
    });

    it('should handle metadata with various formats consistently', () => {
      const complexAorp = `
## ✅ Success: Complex Workflow Operation

**Operation:** workflow-execute
**Status:** success
**Duration:** 3.45s
**Confidence:** 95%
**Session ID:** sess_xyz789
**Workflow ID:** wf_456
**Items Processed:** 42
**Errors Encountered:** 0
**Warnings:** 2

### Primary Recommendation

The workflow completed successfully with high confidence.
      `;

      const parsed = parseMarkdown(complexAorp);
      const metadata = parsed.getOperationMetadata();

      expect(metadata).toMatchInlineSnapshot(`
        {
          "confidence": "95%",
          "duration": "3.45s",
          "errors_encountered": "0",
          "items_processed": "42",
          "operation": "workflow-execute",
          "session_id": "sess_xyz789",
          "status": "success",
          "success": "Complex Workflow Operation",
          "warnings": "2",
          "workflow_id": "wf_456",
        }
      `);
    });

    it('should return empty object for metadata-less AORP', () => {
      const simpleAorp = `
## ✅ Success

### Primary Recommendation

Simple success message without metadata.
      `;

      const parsed = parseMarkdown(simpleAorp);
      const metadata = parsed.getOperationMetadata();

      expect(metadata).toMatchInlineSnapshot('{}');
    });
  });
});

describe('AORP Formatting - Snapshot Tests', () => {
  describe('formatAorpAsMarkdown() snapshots', () => {
    it('should format minimal success AORP consistently', () => {
      const minimalAorp: AorpResponse = {
        immediate: {
          status: 'success' as const,
          key_insight: 'Operation completed successfully',
          confidence: 0.95,
        },
        actionable: {
          next_steps: ['Verify the result'],
          recommendations: {
            primary: 'Check system status',
          },
          workflow_guidance: 'Monitor for any issues',
        },
        quality: {
          completeness: 0.9,
          reliability: 0.95,
          urgency: 'low' as const,
        },
        details: {
          summary: 'Simple operation completed successfully',
          metadata: {
            timestamp: '2024-11-20T17:30:00.000Z',
            operation: 'simple-operation',
          },
        },
      };

      const formatted = formatAorpAsMarkdown(minimalAorp);

      expect(formatted).toMatchSnapshot('minimal-success-aorp');
    });

    it('should format comprehensive success AORP consistently', () => {
      const comprehensiveAorp: AorpResponse = {
        immediate: {
          status: 'success' as const,
          key_insight: 'Complex multi-entity operation completed successfully',
          confidence: 0.92,
          session_id: 'sess_abc123',
        },
        actionable: {
          next_steps: [
            'Review the operation results',
            'Validate all entity relationships',
            'Check system performance metrics',
            'Update relevant documentation',
          ],
          recommendations: {
            primary: 'Monitor system behavior for any anomalies',
            secondary: [
              'Consider implementing additional monitoring',
              'Plan for scalability improvements',
            ],
          },
          workflow_guidance:
            'The operation has completed successfully. Review the detailed results for any areas that may need additional attention.',
        },
        quality: {
          completeness: 0.98,
          reliability: 0.95,
          urgency: 'medium' as const,
          indicators: {
            performance: 0.88,
            data_integrity: 1.0,
          },
        },
        details: {
          summary:
            'Successfully processed and updated multiple related entities with full data validation.',
          metadata: {
            timestamp: '2024-11-20T17:30:00.000Z',
            operation: 'complex-batch-update',
            entities_affected: 15,
            processing_time: '2.1s',
          },
        },
      };

      const formatted = formatAorpAsMarkdown(comprehensiveAorp);

      expect(formatted).toMatchSnapshot('comprehensive-success-aorp');
    });

    it('should format error AORP consistently', () => {
      const errorAorp: AorpResponse = {
        immediate: {
          status: 'error' as const,
          key_insight: 'Operation failed due to validation errors',
          confidence: 0.65,
          session_id: 'sess_def456',
        },
        actionable: {
          next_steps: [
            'Review input validation rules',
            'Correct data format issues',
            'Retry the operation with corrected data',
          ],
          recommendations: {
            primary: 'Implement stricter client-side validation',
            secondary: [
              'Add more descriptive error messages',
              'Provide examples of correct data format',
            ],
          },
          workflow_guidance:
            'The operation encountered validation errors. Please review the error details and correct the input data before retrying.',
        },
        quality: {
          completeness: 0.15,
          reliability: 0.25,
          urgency: 'high' as const,
          indicators: {
            performance: 0.1,
            data_integrity: 0.05,
          },
        },
        details: {
          summary:
            'Validation failed due to malformed input data. Please ensure all required fields are properly formatted.',
          metadata: {
            timestamp: '2024-11-20T17:35:00.000Z',
            operation: 'entity-validation',
            validation_errors: 3,
            error_details: 'Missing required fields and invalid data format',
          },
        },
      };

      const formatted = formatAorpAsMarkdown(errorAorp);

      expect(formatted).toMatchSnapshot('error-aorp');
    });

    it('should format partial status AORP consistently', () => {
      const partialAorp: AorpResponse = {
        immediate: {
          status: 'partial' as const,
          key_insight: 'Operation completed with some warnings',
          confidence: 0.78,
          session_id: 'sess_ghi789',
        },
        actionable: {
          next_steps: [
            'Review warning messages',
            'Verify affected data integrity',
            'Address any remaining issues',
          ],
          recommendations: {
            primary: 'Investigate and resolve the warnings',
            secondary: [
              'Implement preventive measures',
              'Update monitoring to detect similar issues',
            ],
          },
          workflow_guidance:
            'The operation completed but with warnings. Please review the details and take corrective action if needed.',
        },
        quality: {
          completeness: 0.92,
          reliability: 0.88,
          urgency: 'medium' as const,
          indicators: {
            performance: 0.75,
            data_integrity: 0.98,
          },
        },
        details: {
          summary:
            'Operation successful with 2 warnings. Data integrity maintained, but some non-critical issues require attention.',
          metadata: {
            timestamp: '2024-11-20T17:40:00.000Z',
            operation: 'data-sync',
            warnings: 2,
            items_processed: 150,
            items_affected: 2,
          },
        },
      };

      const formatted = formatAorpAsMarkdown(partialAorp);

      expect(formatted).toMatchSnapshot('partial-aorp');
    });
  });
});
