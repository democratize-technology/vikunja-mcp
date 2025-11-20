/**
 * AST-based Markdown validation utilities for testing
 * Uses markdown-it for professional structural validation
 */

import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';

const md = new MarkdownIt();

export interface MarkdownParseResult {
  tokens: Token[];
  getHeadings(level?: number): string[];
  getListItems(): string[];
  hasHeading(level: number, pattern: RegExp): boolean;
  hasSection(sectionName: string): boolean;
  getContent(): string;
}

/**
 * Parses Markdown text into AST and provides validation helpers
 *
 * @param text - Markdown text to parse
 * @returns Parsing result with helper methods
 *
 * @example
 * const parsed = parseMarkdown('## Success\n- Item 1\n- Item 2');
 * expect(parsed.hasHeading(2, /Success/)).toBe(true);
 * expect(parsed.getListItems()).toEqual(['Item 1', 'Item 2']);
 */
export function parseMarkdown(text: string): MarkdownParseResult {
  const tokens = md.parse(text, {});

  return {
    tokens,

    /**
     * Get all headings at specified level
     * @param level - Heading level (1-6), or undefined for all headings
     */
    getHeadings(level?: number): string[] {
      const headings: string[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'heading_open') {
          const headingLevel = Number.parseInt(token.tag.slice(1));
          if (!level || headingLevel === level) {
            // Next token should be inline with heading content
            if (i + 1 < tokens.length && tokens[i + 1].type === 'inline') {
              headings.push(tokens[i + 1].content);
            }
          }
        }
      }
      return headings;
    },

    /**
     * Get all list items (ordered and unordered)
     */
    getListItems(): string[] {
      const items: string[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'list_item_open') {
          // Find inline content within this list item
          let j = i + 1;
          while (j < tokens.length && tokens[j].type !== 'list_item_close') {
            if (tokens[j].type === 'inline') {
              items.push(tokens[j].content);
            }
            j++;
          }
        }
      }
      return items;
    },

    /**
     * Check if heading exists at specified level matching pattern
     * @param level - Heading level (1-6)
     * @param pattern - Regex pattern to match heading content
     */
    hasHeading(level: number, pattern: RegExp): boolean {
      const headings = this.getHeadings(level);
      return headings.some(h => pattern.test(h));
    },

    /**
     * Check if section exists (AORP sections: Next Steps, Recommendations, etc.)
     * @param sectionName - Section name to find (case-insensitive)
     */
    hasSection(sectionName: string): boolean {
      const allHeadings = this.getHeadings();
      const pattern = new RegExp(sectionName, 'i');
      return allHeadings.some(h => pattern.test(h));
    },

    /**
     * Get all text content (for legacy string matching if needed)
     */
    getContent(): string {
      return text;
    }
  };
}
