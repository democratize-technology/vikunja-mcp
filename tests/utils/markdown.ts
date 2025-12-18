/**
 * AST-based Markdown validation utilities for testing
 * Uses markdown-it for professional structural validation
 */

import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';

const md = new MarkdownIt();

export interface AorpStatusInfo {
  type: 'success' | 'error' | 'unknown';
  heading: string;
}

export interface MarkdownParseResult {
  tokens: Token[];
  getHeadings(level?: number): string[];
  getListItems(): string[];
  hasHeading(level: number, pattern: RegExp): boolean;
  hasSection(sectionName: string): boolean;
  getContent(): string;
  // Lightweight AORP helpers (architect-approved 8.5/10)
  getAorpStatus(): AorpStatusInfo;
  getSectionContent(sectionName: string): string | null;
  getSectionListItems(sectionName: string): string[];
  getOperationMetadata(): Record<string, string>;
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
    },

    /**
     * Extract AORP status heading (✅ Success | ❌ Error)
     * Returns 'unknown' if no AORP status heading found
     */
    getAorpStatus(): AorpStatusInfo {
      const headings = this.getHeadings(2);
      const statusHeading = headings.find(h => /^(✅|❌)\s+(Success|Error)/.test(h));

      if (!statusHeading) {
        return { type: 'unknown', heading: '' };
      }

      const type = statusHeading.startsWith('✅') ? 'success' : 'error';
      return { type, heading: statusHeading };
    },

    /**
     * Extract text content from specific AORP section
     * Case-insensitive section name matching
     * Returns empty string if section not found
     */
    getSectionContent(sectionName: string): string {
      const allHeadings = this.getHeadings();
      const normalizedName = sectionName.toLowerCase();

      let sectionIndex = -1;
      for (let i = 0; i < allHeadings.length; i++) {
        if (allHeadings[i].toLowerCase().includes(normalizedName)) {
          sectionIndex = i;
          break;
        }
      }

      if (sectionIndex === -1) return '';

      // Find section start and end in tokens
      let sectionStart = -1;
      let headingsFound = 0;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === 'heading_open') {
          if (headingsFound === sectionIndex) {
            sectionStart = i;
            break;
          }
          headingsFound++;
        }
      }

      if (sectionStart === -1) return '';

      // Extract content until next heading or end
      const contentLines: string[] = [];
      for (let i = sectionStart + 2; i < tokens.length; i++) {
        if (tokens[i].type === 'heading_open') break;
        if (tokens[i].type === 'inline' && tokens[i].content) {
          contentLines.push(tokens[i].content);
        }
      }

      return contentLines.join('\n').trim() || '';
    },

    /**
     * Extract list items from specific section
     * Returns empty array if section not found or has no list items
     */
    getSectionListItems(sectionName: string): string[] {
      const allHeadings = this.getHeadings();
      const normalizedName = sectionName.toLowerCase();

      let sectionIndex = -1;
      for (let i = 0; i < allHeadings.length; i++) {
        if (allHeadings[i].toLowerCase().includes(normalizedName)) {
          sectionIndex = i;
          break;
        }
      }

      if (sectionIndex === -1) return [];

      // Find section start in tokens
      let sectionStart = -1;
      let headingsFound = 0;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === 'heading_open') {
          if (headingsFound === sectionIndex) {
            sectionStart = i;
            break;
          }
          headingsFound++;
        }
      }

      if (sectionStart === -1) return [];

      // Extract list items from this section
      const items: string[] = [];
      let inList = false;
      let inListItem = false;

      for (let i = sectionStart; i < tokens.length; i++) {
        const token = tokens[i];

        // Stop if we hit another heading at the same or higher level
        if (token.type === 'heading_open' && i > sectionStart) {
          break;
        }

        // Track list state
        if (token.type === 'ordered_list_open' || token.type === 'bullet_list_open') {
          inList = true;
          continue;
        }
        if (token.type === 'ordered_list_close' || token.type === 'bullet_list_close') {
          inList = false;
          continue;
        }
        if (token.type === 'list_item_open') {
          inListItem = true;
          continue;
        }
        if (token.type === 'list_item_close') {
          inListItem = false;
          continue;
        }

        // Extract content when inside a list item
        if (inList && inListItem && token.type === 'inline' && token.content) {
          items.push(token.content.trim());
        }
      }

      return items;
    },

    /**
     * Extract key-value pairs from main content
     * First tries: content between H2 and H3 (AORP format)
     * Fallback: content before H2 (legacy format)
     * Matches patterns like "**Key**: Value" or "Key: Value"
     */
    getOperationMetadata(): Record<string, string> {
      // Find first H2 heading
      let firstH2Index = -1;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === 'heading_open' && tokens[i].tag === 'h2') {
          firstH2Index = i;
          break;
        }
      }

      const metadata: Record<string, string> = {};
      const keyValuePattern = /\*?\*?([A-Za-z\s_]+)\*?\*?:\s*(.+)/g;

      if (firstH2Index !== -1) {
        // Try AORP format: content between H2 and H3
        let firstH3Index = -1;
        for (let i = firstH2Index + 1; i < tokens.length; i++) {
          if (tokens[i].type === 'heading_open' && tokens[i].tag === 'h3') {
            firstH3Index = i;
            break;
          }
        }

        // Extract content between H2 and H3
        const contentLines: string[] = [];
        const startIndex = firstH2Index + 1;
        const endIndex = firstH3Index === -1 ? tokens.length : firstH3Index;

        for (let i = startIndex; i < endIndex; i++) {
          if (tokens[i].type === 'inline' && tokens[i].content) {
            contentLines.push(tokens[i].content);
          }
        }

        const mainContent = contentLines.join('\n');

        let match;
        while ((match = keyValuePattern.exec(mainContent)) !== null) {
          const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
          let value = match[2].trim().replace(/^\*?\*?|\*?\*?$/g, '');
          value = value.replace(/^\*?\*?|\*?\*?$/g, '');
          value = value.trim();
          metadata[key] = value;
        }
      }

      // If no metadata found in AORP format, try legacy format (before H2)
      if (Object.keys(metadata).length === 0) {
        const contentLines: string[] = [];
        const endIndex = firstH2Index === -1 ? tokens.length : firstH2Index;

        for (let i = 0; i < endIndex; i++) {
          if (tokens[i].type === 'inline' && tokens[i].content) {
            contentLines.push(tokens[i].content);
          }
        }

        const mainContent = contentLines.join('\n');

        let match;
        while ((match = keyValuePattern.exec(mainContent)) !== null) {
          const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
          let value = match[2].trim().replace(/^\*?\*?|\*?\*?$/g, '');
          value = value.replace(/^\*?\*?|\*?\*?$/g, '');
          value = value.trim();
          metadata[key] = value;
        }
      }

      return metadata;
    }
  };
}
