import { parseMarkdown } from './markdown';

describe('Markdown Test Utility', () => {
  describe('parseMarkdown()', () => {
    it('should parse simple Markdown into tokens', () => {
      const result = parseMarkdown('# Hello\n- Item 1');
      expect(result.tokens).toBeDefined();
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe('getHeadings()', () => {
    it('should extract all headings', () => {
      const markdown = '# H1\n## H2\n### H3';
      const result = parseMarkdown(markdown);
      expect(result.getHeadings()).toEqual(['H1', 'H2', 'H3']);
    });

    it('should filter headings by level', () => {
      const markdown = '# H1\n## H2a\n## H2b\n### H3';
      const result = parseMarkdown(markdown);
      expect(result.getHeadings(2)).toEqual(['H2a', 'H2b']);
      expect(result.getHeadings(1)).toEqual(['H1']);
      expect(result.getHeadings(3)).toEqual(['H3']);
    });

    it('should handle headings with emojis', () => {
      const markdown = '## ✅ Success | Confidence: 95%';
      const result = parseMarkdown(markdown);
      expect(result.getHeadings(2)).toEqual(['✅ Success | Confidence: 95%']);
    });

    it('should handle empty markdown', () => {
      const result = parseMarkdown('');
      expect(result.getHeadings()).toEqual([]);
    });

    it('should handle markdown without headings', () => {
      const markdown = 'Just some text\nAnd more text';
      const result = parseMarkdown(markdown);
      expect(result.getHeadings()).toEqual([]);
    });

    it('should handle headings with special characters', () => {
      const markdown = '## Task #123: Fix "bug" (high priority)';
      const result = parseMarkdown(markdown);
      expect(result.getHeadings(2)).toEqual(['Task #123: Fix "bug" (high priority)']);
    });
  });

  describe('getListItems()', () => {
    it('should extract unordered list items', () => {
      const markdown = '- Item 1\n- Item 2\n- Item 3';
      const result = parseMarkdown(markdown);
      expect(result.getListItems()).toEqual(['Item 1', 'Item 2', 'Item 3']);
    });

    it('should extract ordered list items', () => {
      const markdown = '1. First\n2. Second\n3. Third';
      const result = parseMarkdown(markdown);
      expect(result.getListItems()).toEqual(['First', 'Second', 'Third']);
    });

    it('should extract nested list items', () => {
      const markdown = '- Item 1\n  - Nested 1\n  - Nested 2\n- Item 2';
      const result = parseMarkdown(markdown);
      // Gets all items including nested
      expect(result.getListItems()).toContain('Item 1');
      expect(result.getListItems()).toContain('Nested 1');
    });

    it('should handle empty markdown', () => {
      const result = parseMarkdown('');
      expect(result.getListItems()).toEqual([]);
    });

    it('should handle markdown without lists', () => {
      const markdown = '# Title\nSome text';
      const result = parseMarkdown(markdown);
      expect(result.getListItems()).toEqual([]);
    });

    it('should handle list items with formatting', () => {
      const markdown = '- **Bold item**\n- *Italic item*\n- `Code item`';
      const result = parseMarkdown(markdown);
      // markdown-it preserves formatting markers in content
      expect(result.getListItems()).toEqual(['**Bold item**', '*Italic item*', '`Code item`']);
    });

    it('should handle mixed list types', () => {
      const markdown = '- Unordered 1\n- Unordered 2\n\n1. Ordered 1\n2. Ordered 2';
      const result = parseMarkdown(markdown);
      expect(result.getListItems()).toEqual([
        'Unordered 1',
        'Unordered 2',
        'Ordered 1',
        'Ordered 2'
      ]);
    });
  });

  describe('hasHeading()', () => {
    it('should find heading by level and pattern', () => {
      const markdown = '## ✅ Success | Confidence: 95%';
      const result = parseMarkdown(markdown);
      expect(result.hasHeading(2, /✅ Success/)).toBe(true);
      expect(result.hasHeading(2, /Confidence/)).toBe(true);
      expect(result.hasHeading(1, /Success/)).toBe(false); // Wrong level
      expect(result.hasHeading(2, /Failure/)).toBe(false); // Wrong pattern
    });

    it('should handle case-sensitive patterns', () => {
      const markdown = '## Success';
      const result = parseMarkdown(markdown);
      expect(result.hasHeading(2, /Success/)).toBe(true);
      expect(result.hasHeading(2, /success/)).toBe(false);
      expect(result.hasHeading(2, /success/i)).toBe(true); // Case-insensitive
    });

    it('should handle complex regex patterns', () => {
      const markdown = '## Task #123: Complete';
      const result = parseMarkdown(markdown);
      expect(result.hasHeading(2, /Task #\d+/)).toBe(true);
      expect(result.hasHeading(2, /Task #[a-z]+/)).toBe(false);
    });

    it('should return false for non-existent heading level', () => {
      const markdown = '## Level 2 Only';
      const result = parseMarkdown(markdown);
      expect(result.hasHeading(1, /Level 2/)).toBe(false);
      expect(result.hasHeading(3, /Level 2/)).toBe(false);
    });
  });

  describe('hasSection()', () => {
    it('should find AORP sections', () => {
      const markdown = '## ✅ Success\n### 🎯 Next Steps\n### 📊 Quality Indicators';
      const result = parseMarkdown(markdown);
      expect(result.hasSection('Next Steps')).toBe(true);
      expect(result.hasSection('Quality Indicators')).toBe(true);
      expect(result.hasSection('Recommendations')).toBe(false);
    });

    it('should be case-insensitive', () => {
      const markdown = '### Next Steps';
      const result = parseMarkdown(markdown);
      expect(result.hasSection('next steps')).toBe(true);
      expect(result.hasSection('NEXT STEPS')).toBe(true);
      expect(result.hasSection('NeXt StEpS')).toBe(true);
    });

    it('should find sections with emojis', () => {
      const markdown = '### 🎯 Next Steps';
      const result = parseMarkdown(markdown);
      expect(result.hasSection('Next Steps')).toBe(true);
      expect(result.hasSection('🎯 Next Steps')).toBe(true);
    });

    it('should find sections across different heading levels', () => {
      const markdown = '# Top\n## Mid\n### Bottom';
      const result = parseMarkdown(markdown);
      expect(result.hasSection('Top')).toBe(true);
      expect(result.hasSection('Mid')).toBe(true);
      expect(result.hasSection('Bottom')).toBe(true);
    });

    it('should return false for non-existent sections', () => {
      const markdown = '## Section One\n### Section Two';
      const result = parseMarkdown(markdown);
      expect(result.hasSection('Section Three')).toBe(false);
      expect(result.hasSection('Nonexistent')).toBe(false);
    });

    it('should handle partial matches', () => {
      const markdown = '## Next Steps and Recommendations';
      const result = parseMarkdown(markdown);
      expect(result.hasSection('Next Steps')).toBe(true);
      expect(result.hasSection('Recommendations')).toBe(true);
      expect(result.hasSection('Steps and')).toBe(true);
    });
  });

  describe('getContent()', () => {
    it('should return original Markdown text', () => {
      const markdown = '# Test\nContent here';
      const result = parseMarkdown(markdown);
      expect(result.getContent()).toBe(markdown);
    });

    it('should preserve exact formatting', () => {
      const markdown = '# Title\n\n- Item 1\n  - Nested\n\nParagraph';
      const result = parseMarkdown(markdown);
      expect(result.getContent()).toBe(markdown);
    });

    it('should handle empty content', () => {
      const result = parseMarkdown('');
      expect(result.getContent()).toBe('');
    });
  });

  describe('tokens property', () => {
    it('should expose raw tokens array', () => {
      const markdown = '# Test\n- Item';
      const result = parseMarkdown(markdown);
      expect(result.tokens).toBeInstanceOf(Array);
      expect(result.tokens.length).toBeGreaterThan(0);
    });

    it('should contain valid markdown-it tokens', () => {
      const markdown = '## Heading';
      const result = parseMarkdown(markdown);
      const headingToken = result.tokens.find(t => t.type === 'heading_open');
      expect(headingToken).toBeDefined();
      expect(headingToken?.tag).toBe('h2');
    });
  });

  describe('edge cases', () => {
    it('should handle markdown with only whitespace', () => {
      const result = parseMarkdown('   \n\n   \n');
      expect(result.getHeadings()).toEqual([]);
      expect(result.getListItems()).toEqual([]);
    });

    it('should handle very long headings', () => {
      const longHeading = 'A'.repeat(1000);
      const markdown = `## ${longHeading}`;
      const result = parseMarkdown(markdown);
      expect(result.getHeadings(2)).toEqual([longHeading]);
    });

    it('should handle multiple consecutive headings', () => {
      const markdown = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
      const result = parseMarkdown(markdown);
      expect(result.getHeadings()).toEqual(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
    });

    it('should handle list items with line breaks', () => {
      const markdown = '- Item with\n  continuation\n- Another item';
      const result = parseMarkdown(markdown);
      expect(result.getListItems().length).toBeGreaterThan(0);
    });

    it('should handle markdown with code blocks', () => {
      const markdown = '# Title\n```\ncode\n```\n- List item';
      const result = parseMarkdown(markdown);
      expect(result.getHeadings()).toEqual(['Title']);
      expect(result.getListItems()).toEqual(['List item']);
    });

    it('should handle headings without following content', () => {
      const markdown = '## Heading\n\n## Another Heading';
      const result = parseMarkdown(markdown);
      expect(result.getHeadings(2)).toEqual(['Heading', 'Another Heading']);
    });
  });
});
