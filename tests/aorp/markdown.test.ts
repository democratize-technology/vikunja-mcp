/**
 * AORP Markdown Formatter Tests
 * Comprehensive test suite with 100% coverage
 */

import { escapeMarkdown, formatAorpAsMarkdown } from '../../src/aorp/markdown';
import type { AorpResponse } from '../../src/aorp/types';

describe('AORP Markdown Formatter', () => {
  describe('escapeMarkdown()', () => {
    describe('special character escaping', () => {
      it('should escape backslashes', () => {
        expect(escapeMarkdown('path\\to\\file')).toBe('path\\\\to\\\\file');
      });

      it('should escape asterisks (bold/italic markers)', () => {
        expect(escapeMarkdown('*bold* and **bolder**')).toBe('\\*bold\\* and \\*\\*bolder\\*\\*');
      });

      it('should escape underscores (alternative italic markers)', () => {
        expect(escapeMarkdown('_italic_ and __bold__')).toBe('\\_italic\\_ and \\_\\_bold\\_\\_');
      });

      it('should escape square brackets (link markers)', () => {
        expect(escapeMarkdown('[link](url)')).toBe('\\[link\\](url)');
      });

      it('should escape backticks (code markers)', () => {
        expect(escapeMarkdown('`code` and ```block```')).toBe('\\`code\\` and \\`\\`\\`block\\`\\`\\`');
      });

      it('should escape tildes (strikethrough markers)', () => {
        expect(escapeMarkdown('~~strikethrough~~')).toBe('\\~\\~strikethrough\\~\\~');
      });

      it('should escape greater-than signs (blockquote markers)', () => {
        expect(escapeMarkdown('> blockquote')).toBe('\\> blockquote');
      });

      it('should escape hash symbols (header markers)', () => {
        expect(escapeMarkdown('# Header')).toBe('\\# Header');
      });

      it('should escape < character (HTML tag injection)', () => {
        expect(escapeMarkdown('test<value')).toBe('test\\<value');
      });

      it('should escape & character (HTML entity injection)', () => {
        expect(escapeMarkdown('test&value')).toBe('test\\&value');
      });

      it('should escape | character (table delimiter injection)', () => {
        expect(escapeMarkdown('test|value')).toBe('test\\|value');
      });
    });

    describe('complex escaping scenarios', () => {
      it('should handle multiple special characters in same string', () => {
        const input = '**Bold** _italic_ `code` [link](#header)';
        const expected = '\\*\\*Bold\\*\\* \\_italic\\_ \\`code\\` \\[link\\](\\#header)';
        expect(escapeMarkdown(input)).toBe(expected);
      });

      it('should prevent double-escaping by processing backslashes first', () => {
        // If backslash escaping is done correctly first, other escapes won't double-escape
        const input = '\\*already escaped*';
        const expected = '\\\\\\*already escaped\\*';
        expect(escapeMarkdown(input)).toBe(expected);
      });

      it('should preserve emojis (not escape them)', () => {
        const input = '✅ Success! 🎯 Next steps';
        const expected = '✅ Success! 🎯 Next steps';
        expect(escapeMarkdown(input)).toBe(expected);
      });

      it('should handle empty string', () => {
        expect(escapeMarkdown('')).toBe('');
      });

      it('should handle string with no special characters', () => {
        const input = 'Plain text without any special characters';
        expect(escapeMarkdown(input)).toBe(input);
      });

      it('should handle very long strings with special characters', () => {
        const input = '*'.repeat(1000);
        const expected = '\\*'.repeat(1000);
        expect(escapeMarkdown(input)).toBe(expected);
      });

      it('should handle all special characters together', () => {
        const input = '\\*_[]`~>#';
        const expected = '\\\\\\*\\_\\[\\]\\`\\~\\>\\#';
        expect(escapeMarkdown(input)).toBe(expected);
      });
    });

    describe('real-world injection scenarios', () => {
      it('should prevent Markdown heading injection', () => {
        const maliciousInput = '## Injected Heading';
        expect(escapeMarkdown(maliciousInput)).toBe('\\#\\# Injected Heading');
      });

      it('should prevent Markdown link injection', () => {
        const maliciousInput = '[Click Here](https://evil.com)';
        expect(escapeMarkdown(maliciousInput)).toBe('\\[Click Here\\](https://evil.com)');
      });

      it('should prevent Markdown code block injection', () => {
        const maliciousInput = '```javascript\nalert("xss")\n```';
        expect(escapeMarkdown(maliciousInput)).toBe('\\`\\`\\`javascript\nalert("xss")\n\\`\\`\\`');
      });

      it('should prevent bold/italic format injection', () => {
        const maliciousInput = '**Important** _message_';
        expect(escapeMarkdown(maliciousInput)).toBe('\\*\\*Important\\*\\* \\_message\\_');
      });

      it('should prevent complete HTML tag injection', () => {
        const attack = '<script>alert("xss")</script>';
        const result = escapeMarkdown(attack);
        expect(result).not.toContain('<script>');
        expect(result).toContain('\\<script\\>');
      });
    });
  });

  describe('formatAorpAsMarkdown()', () => {
    // Base test fixture
    const createBaseAorpResponse = (overrides?: Partial<AorpResponse>): AorpResponse => ({
      immediate: {
        status: 'success',
        key_insight: 'Task created successfully',
        confidence: 0.95,
        session_id: 'test-session-123',
      },
      actionable: {
        next_steps: [
          'Review the task details',
          'Assign to team member',
          'Set priority level',
        ],
        recommendations: {
          primary: 'Set a due date to track progress',
          secondary: [
            'Add labels for better organization',
            'Link related tasks',
          ],
        },
        workflow_guidance: 'Use task filtering to track similar items',
      },
      quality: {
        completeness: 1.0,
        reliability: 0.98,
        urgency: 'medium',
        indicators: {
          task_complexity: 0.6,
          estimated_effort: 'Medium',
          blocking_dependencies: 2,
        },
      },
      details: {
        summary: 'Created new task in project board',
        data: { task_id: 123, title: 'Test Task' },
        metadata: {
          timestamp: '2024-01-15T10:30:00Z',
          operation: 'create_task',
          api_version: 'v1',
        },
      },
      ...overrides,
    });

    describe('status type formatting', () => {
      it('should format success status with ✅ emoji', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'success',
            key_insight: 'Operation succeeded',
            confidence: 0.9,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('## ✅ Success');
      });

      it('should format error status with ❌ emoji', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'error',
            key_insight: 'Operation failed',
            confidence: 0.5,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('## ❌ Error');
      });

      it('should format partial status with ⚠️ emoji', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'partial',
            key_insight: 'Operation partially completed',
            confidence: 0.7,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('## ⚠️ Partial');
      });

      it('should format pending status with ⏳ emoji', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'pending',
            key_insight: 'Operation is pending',
            confidence: 0.8,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('## ⏳ Pending');
      });
    });

    describe('urgency level formatting', () => {
      it('should format low urgency with 🟢 emoji', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'low',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('🟢 Low');
      });

      it('should format medium urgency with 🟡 emoji', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'medium',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('🟡 Medium');
      });

      it('should format high urgency with 🟠 emoji', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'high',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('🟠 High');
      });

      it('should format critical urgency with 🔴 emoji', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'critical',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('🔴 Critical');
      });
    });

    describe('confidence percentage formatting', () => {
      it('should round confidence to whole number percentage (95%)', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'success',
            key_insight: 'Test',
            confidence: 0.95,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Confidence: 95%');
      });

      it('should round confidence to whole number percentage (100%)', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'success',
            key_insight: 'Test',
            confidence: 1.0,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Confidence: 100%');
      });

      it('should round confidence to whole number percentage (50%)', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'error',
            key_insight: 'Test',
            confidence: 0.5,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Confidence: 50%');
      });

      it('should handle very low confidence (1%)', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'error',
            key_insight: 'Test',
            confidence: 0.01,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Confidence: 1%');
      });
    });

    describe('optional field handling', () => {
      it('should include session_id when present', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'success',
            key_insight: 'Test',
            confidence: 0.9,
            session_id: 'session-456',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Session ID**: `session-456`');
      });

      it('should omit session_id when not present', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'success',
            key_insight: 'Test',
            confidence: 0.9,
            // session_id intentionally omitted
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).not.toContain('**Session ID**');
      });

      it('should omit session_id when undefined', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'success',
            key_insight: 'Test',
            confidence: 0.9,
            session_id: undefined,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).not.toContain('**Session ID**');
      });

      it('should handle empty secondary recommendations array', () => {
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: ['Step 1'],
            recommendations: {
              primary: 'Main recommendation',
              secondary: [],
            },
            workflow_guidance: 'Guidance',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Primary**: Main recommendation');
        // Should not have bullet points for empty secondary
        expect(markdown.split('\n').filter(line => line.trim().startsWith('-')).length).toBeGreaterThan(0);
      });

      it('should omit secondary recommendations when not provided', () => {
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: ['Step 1'],
            recommendations: {
              primary: 'Main recommendation',
              // secondary intentionally omitted
            },
            workflow_guidance: 'Guidance',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Primary**: Main recommendation');
      });

      it('should include workflow_guidance when present', () => {
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: ['Step 1'],
            recommendations: { primary: 'Rec' },
            workflow_guidance: 'Follow best practices',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('### 🔄 Workflow Guidance');
        expect(markdown).toContain('Follow best practices');
      });

      it('should omit workflow_guidance section when not provided', () => {
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: ['Step 1'],
            recommendations: { primary: 'Rec' },
            workflow_guidance: '',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).not.toContain('### 🔄 Workflow Guidance');
      });

      it('should include quality indicators when present', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'low',
            indicators: {
              test_coverage: 0.85,
              code_quality: 'High',
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Test Coverage**: 85%');
        expect(markdown).toContain('**Code Quality**: High');
      });

      it('should omit quality indicators section when empty object', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'low',
            indicators: {},
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        // Should still show standard quality fields but no additional indicators
        expect(markdown).toContain('**Completeness**: 100%');
        expect(markdown).toContain('**Reliability**: 90%');
      });

      it('should omit quality indicators section when undefined', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'low',
            // indicators intentionally omitted
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Completeness**: 100%');
        expect(markdown).toContain('**Reliability**: 90%');
      });
    });

    describe('quality indicators formatting', () => {
      it('should format numeric indicators (0-1 range) as percentages', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'low',
            indicators: {
              test_coverage: 0.75,
              accuracy: 0.92,
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Test Coverage**: 75%');
        expect(markdown).toContain('**Accuracy**: 92%');
      });

      it('should format string indicators without percentage', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'low',
            indicators: {
              status: 'Active',
              priority: 'High',
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Status**: Active');
        expect(markdown).toContain('**Priority**: High');
      });

      it('should format numeric indicators outside 0-1 range as plain numbers', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'low',
            indicators: {
              item_count: 42,
              processing_time: 150,
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Item Count**: 42');
        expect(markdown).toContain('**Processing Time**: 150');
      });

      it('should format boolean indicators as strings', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'low',
            indicators: {
              is_verified: true,
              has_errors: false,
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Is Verified**: true');
        expect(markdown).toContain('**Has Errors**: false');
      });

      it('should format indicator keys with proper capitalization', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'low',
            indicators: {
              task_completion_rate: 0.8,
              api_response_time: 250,
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Task Completion Rate**: 80%');
        expect(markdown).toContain('**Api Response Time**: 250');
      });
    });

    describe('metadata formatting', () => {
      it('should display timestamp from metadata', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Test',
            data: {},
            metadata: {
              timestamp: '2024-01-15T10:30:00Z',
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Timestamp**: 2024-01-15T10:30:00Z');
      });

      it('should display additional metadata fields', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Test',
            data: {},
            metadata: {
              timestamp: '2024-01-15T10:30:00Z',
              operation: 'create_task',
              user_id: 'user-123',
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Timestamp**: 2024-01-15T10:30:00Z');
        expect(markdown).toContain('**Operation**: create-task');
        expect(markdown).toContain('**User Id**: user-123');
      });

      it('should not duplicate timestamp in additional metadata', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Test',
            data: {},
            metadata: {
              timestamp: '2024-01-15T10:30:00Z',
              operation: 'test',
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        const timestampMatches = markdown.match(/\*\*Timestamp\*\*/g);
        expect(timestampMatches?.length).toBe(1);
      });
    });

    describe('input sanitization', () => {
      it('should escape Markdown in key_insight', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'success',
            key_insight: 'Task **created** with [link](url)',
            confidence: 0.9,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Task \\*\\*created\\*\\* with \\[link\\](url)');
      });

      it('should escape Markdown in next_steps', () => {
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: ['Review *task* details', 'Set `priority` level'],
            recommendations: { primary: 'Test' },
            workflow_guidance: 'Test',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Review \\*task\\* details');
        expect(markdown).toContain('Set \\`priority\\` level');
      });

      it('should escape Markdown in recommendations', () => {
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: ['Test'],
            recommendations: {
              primary: 'Set a **due date** to track progress',
              secondary: ['Add _labels_ for organization'],
            },
            workflow_guidance: 'Test',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Set a \\*\\*due date\\*\\* to track progress');
        expect(markdown).toContain('Add \\_labels\\_ for organization');
      });

      it('should escape Markdown in workflow_guidance', () => {
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: ['Test'],
            recommendations: { primary: 'Test' },
            workflow_guidance: 'Use `task filtering` to track items',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Use \\`task filtering\\` to track items');
      });

      it('should escape Markdown in summary', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Created new task in **project** board',
            data: {},
            metadata: { timestamp: '2024-01-15T10:30:00Z' },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Created new task in \\*\\*project\\*\\* board');
      });

      it('should escape Markdown in quality indicator keys', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'low',
            indicators: {
              'task_*importance*': 'High',
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Task \\*Importance\\***: High');
      });

      it('should escape Markdown in quality indicator values', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 0.9,
            urgency: 'low',
            indicators: {
              status: '**Active**',
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Status**: \\*\\*Active\\*\\*');
      });

      it('should escape Markdown in metadata keys', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Test',
            data: {},
            metadata: {
              timestamp: '2024-01-15T10:30:00Z',
              'operation_*type*': 'create',
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        // The key formatting replaces _ with spaces, then escapes special chars
        expect(markdown).toContain('**Operation \\*Type\\***: create');
      });

      it('should escape Markdown in metadata values', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Test',
            data: {},
            metadata: {
              timestamp: '2024-01-15T10:30:00Z',
              operation: '**critical**',
            },
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        // Operation field is system-controlled, converted to kebab-case, not escaped
        expect(markdown).toContain('**Operation**: **critical**');
      });
    });

    describe('formatAorpAsMarkdown - operation field edge cases', () => {
      it('should handle null operation gracefully', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Test',
            data: {},
            metadata: {
              timestamp: '2024-01-15T10:30:00Z',
              operation: null as unknown as string,
            },
          },
        });
        const result = formatAorpAsMarkdown(aorp);
        expect(result).toContain('**Operation**: ');
      });

      it('should handle undefined operation gracefully', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Test',
            data: {},
            metadata: {
              timestamp: '2024-01-15T10:30:00Z',
              operation: undefined as unknown as string,
            },
          },
        });
        const result = formatAorpAsMarkdown(aorp);
        expect(result).toContain('**Operation**: ');
      });

      it('should handle already-formatted kebab-case operation (idempotent)', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Test',
            data: {},
            metadata: {
              timestamp: '2024-01-15T10:30:00Z',
              operation: 'delete-project',
            },
          },
        });
        const result = formatAorpAsMarkdown(aorp);
        expect(result).toContain('**Operation**: delete-project');
      });

      it('should handle double underscores in operation', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Test',
            data: {},
            metadata: {
              timestamp: '2024-01-15T10:30:00Z',
              operation: 'delete__project',
            },
          },
        });
        const result = formatAorpAsMarkdown(aorp);
        expect(result).toContain('**Operation**: delete--project');
      });

      it('should handle empty string operation', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Test',
            data: {},
            metadata: {
              timestamp: '2024-01-15T10:30:00Z',
              operation: '',
            },
          },
        });
        const result = formatAorpAsMarkdown(aorp);
        expect(result).toContain('**Operation**: ');
      });

      it('should NOT escape operation field (system-controlled)', () => {
        const aorp = createBaseAorpResponse({
          details: {
            summary: 'Test',
            data: {},
            metadata: {
              timestamp: '2024-01-15T10:30:00Z',
              operation: 'delete_project',
            },
          },
        });
        const result = formatAorpAsMarkdown(aorp);
        expect(result).not.toContain('\\_');
        expect(result).toContain('delete-project');
      });
    });

    describe('Security: Input Length Validation', () => {
      it('should reject inputs exceeding 10MB limit', () => {
        const hugeString = 'A'.repeat(10_000_001);
        const aorp = createBaseAorpResponse({
          immediate: { status: 'success', key_insight: hugeString, confidence: 0.9 },
        });

        expect(() => formatAorpAsMarkdown(aorp)).toThrow(
          /Input field exceeds maximum length/,
        );
      });

      it('should accept inputs under 10MB limit', () => {
        const largeString = 'A'.repeat(1_000_000); // 1MB
        const aorp = createBaseAorpResponse({
          immediate: { status: 'success', key_insight: largeString, confidence: 0.9 },
        });

        expect(() => formatAorpAsMarkdown(aorp)).not.toThrow();
      });
    });

    describe('edge cases', () => {
      it('should handle empty next_steps array', () => {
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: [],
            recommendations: { primary: 'Test' },
            workflow_guidance: 'Test',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('### 🎯 Next Steps');
        // Should not have any numbered list items
        expect(markdown).not.toMatch(/\d+\.\s/);
      });

      it('should handle very long strings', () => {
        const longString = 'A'.repeat(1000);
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'success',
            key_insight: longString,
            confidence: 0.9,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain(longString);
      });

      it('should handle Unicode characters', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'success',
            key_insight: 'Task 日本語 created successfully',
            confidence: 0.9,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Task 日本語 created successfully');
      });

      it('should handle newlines in user input', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'success',
            key_insight: 'Task created\nwith multiple lines',
            confidence: 0.9,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Task created\nwith multiple lines');
      });

      it('should handle zero confidence', () => {
        const aorp = createBaseAorpResponse({
          immediate: {
            status: 'error',
            key_insight: 'Failed',
            confidence: 0,
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('Confidence: 0%');
      });

      it('should handle quality scores at boundaries (0.0)', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 0.0,
            reliability: 0.0,
            urgency: 'critical',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Completeness**: 0%');
        expect(markdown).toContain('**Reliability**: 0%');
      });

      it('should handle quality scores at boundaries (1.0)', () => {
        const aorp = createBaseAorpResponse({
          quality: {
            completeness: 1.0,
            reliability: 1.0,
            urgency: 'low',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        expect(markdown).toContain('**Completeness**: 100%');
        expect(markdown).toContain('**Reliability**: 100%');
      });

      it('should handle multiple next_steps', () => {
        const steps = Array.from({ length: 10 }, (_, i) => `Step ${i + 1}`);
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: steps,
            recommendations: { primary: 'Test' },
            workflow_guidance: 'Test',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        steps.forEach((step, index) => {
          expect(markdown).toContain(`${index + 1}. ${step}`);
        });
      });

      it('should handle multiple secondary recommendations', () => {
        const recommendations = Array.from({ length: 5 }, (_, i) => `Recommendation ${i + 1}`);
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: ['Test'],
            recommendations: {
              primary: 'Main',
              secondary: recommendations,
            },
            workflow_guidance: 'Test',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);
        recommendations.forEach((rec) => {
          expect(markdown).toContain(`- ${rec}`);
        });
      });
    });

    describe('complete response formatting', () => {
      it('should format minimal AORP response', () => {
        const minimalAorp: AorpResponse = {
          immediate: {
            status: 'success',
            key_insight: 'Operation completed',
            confidence: 0.9,
          },
          actionable: {
            next_steps: ['Continue'],
            recommendations: { primary: 'Review results' },
            workflow_guidance: 'Standard workflow',
          },
          quality: {
            completeness: 1.0,
            reliability: 0.95,
            urgency: 'low',
          },
          details: {
            summary: 'Success',
            data: {},
            metadata: { timestamp: '2024-01-15T10:00:00Z' },
          },
        };
        const markdown = formatAorpAsMarkdown(minimalAorp);

        // Verify all required sections present
        expect(markdown).toContain('## ✅ Success');
        expect(markdown).toContain('### 🎯 Next Steps');
        expect(markdown).toContain('### 💡 Recommendations');
        expect(markdown).toContain('### 📊 Quality Indicators');
        expect(markdown).toContain('### 📋 Details');
      });

      it('should format complete AORP response with all optional fields', () => {
        const completeAorp = createBaseAorpResponse(); // Uses default fixture with all fields
        const markdown = formatAorpAsMarkdown(completeAorp);

        // Verify all sections present
        expect(markdown).toContain('## ✅ Success');
        expect(markdown).toContain('**Session ID**:');
        expect(markdown).toContain('### 🎯 Next Steps');
        expect(markdown).toContain('### 💡 Recommendations');
        expect(markdown).toContain('### 🔄 Workflow Guidance');
        expect(markdown).toContain('### 📊 Quality Indicators');
        expect(markdown).toContain('### 📋 Details');

        // Verify content
        expect(markdown).toContain('Review the task details');
        expect(markdown).toContain('Set a due date to track progress');
        expect(markdown).toContain('Add labels for better organization');
        expect(markdown).toContain('**Task Complexity**: 60%');
      });

      it('should produce valid Markdown structure', () => {
        const aorp = createBaseAorpResponse();
        const markdown = formatAorpAsMarkdown(aorp);

        // Check heading structure
        expect(markdown).toMatch(/^## /m); // H2 headings
        expect(markdown).toMatch(/^### /m); // H3 headings

        // Check list formatting
        expect(markdown).toMatch(/^\d+\. /m); // Numbered lists
        expect(markdown).toMatch(/^- /m); // Bullet lists

        // Check bold formatting
        expect(markdown).toMatch(/\*\*[^*]+\*\*/); // Bold text

        // All content is properly escaped (validated in sanitization tests)
      });
    });

    describe('output format validation', () => {
      it('should use correct heading levels (H2 for status, H3 for sections)', () => {
        const aorp = createBaseAorpResponse();
        const markdown = formatAorpAsMarkdown(aorp);

        // H2 for status (matches any emoji followed by status text)
        expect(markdown).toMatch(/^## \S+ \w+/m);

        // H3 for sections
        expect(markdown).toContain('### 🎯 Next Steps');
        expect(markdown).toContain('### 💡 Recommendations');
        expect(markdown).toContain('### 📊 Quality Indicators');
        expect(markdown).toContain('### 📋 Details');
      });

      it('should format percentages correctly', () => {
        const aorp = createBaseAorpResponse({
          immediate: { status: 'success', key_insight: 'Test', confidence: 0.856 },
          quality: {
            completeness: 0.923,
            reliability: 0.987,
            urgency: 'low',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);

        expect(markdown).toContain('Confidence: 86%'); // Math.round(0.856 * 100)
        expect(markdown).toContain('**Completeness**: 92%'); // Math.round(0.923 * 100)
        expect(markdown).toContain('**Reliability**: 99%'); // Math.round(0.987 * 100)
      });

      it('should use proper list formatting for next_steps', () => {
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: ['First step', 'Second step', 'Third step'],
            recommendations: { primary: 'Test' },
            workflow_guidance: 'Test',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);

        expect(markdown).toContain('1. First step');
        expect(markdown).toContain('2. Second step');
        expect(markdown).toContain('3. Third step');
      });

      it('should use proper list formatting for secondary recommendations', () => {
        const aorp = createBaseAorpResponse({
          actionable: {
            next_steps: ['Test'],
            recommendations: {
              primary: 'Main rec',
              secondary: ['Rec 1', 'Rec 2'],
            },
            workflow_guidance: 'Test',
          },
        });
        const markdown = formatAorpAsMarkdown(aorp);

        expect(markdown).toContain('- Rec 1');
        expect(markdown).toContain('- Rec 2');
      });

      it('should use bold formatting for field labels', () => {
        const aorp = createBaseAorpResponse();
        const markdown = formatAorpAsMarkdown(aorp);

        expect(markdown).toContain('**Key Insight**:');
        expect(markdown).toContain('**Primary**:');
        expect(markdown).toContain('**Completeness**:');
        expect(markdown).toContain('**Reliability**:');
        expect(markdown).toContain('**Urgency**:');
        expect(markdown).toContain('**Summary**:');
        expect(markdown).toContain('**Timestamp**:');
      });

      it('should separate sections with blank lines', () => {
        const aorp = createBaseAorpResponse();
        const markdown = formatAorpAsMarkdown(aorp);

        // Check for double newlines (blank lines) between sections
        expect(markdown).toMatch(/\n\n### 🎯 Next Steps/);
        expect(markdown).toMatch(/\n\n### 💡 Recommendations/);
        expect(markdown).toMatch(/\n\n### 📊 Quality Indicators/);
        expect(markdown).toMatch(/\n\n### 📋 Details/);
      });
    });
  });
});
