/**
 * Input sanitization tests for sanitizeString and the helpers built on it.
 *
 * sanitizeString only ever feeds task titles/descriptions and filter values
 * into the Vikunja REST API as JSON field values — there is no SQL, shell,
 * filesystem or LDAP/NoSQL sink behind it. It therefore:
 *   - rejects values past MAX_STRING_LENGTH (a generous DoS backstop)
 *   - rejects unambiguous <script>/<iframe> HTML injection
 *   - normalizes Unicode and strips invisible spoofing characters, but does
 *     NOT HTML-escape: Vikunja owns rendering (plain-text title, and it
 *     sanitizes the description HTML itself)
 *
 * These tests double as regression coverage for the previously over-broad
 * blocklist, which wrongly rejected file paths, external URLs and ordinary
 * prose. See git history / fix: relax sanitizeString.
 */

import {
  sanitizeString,
  validateValue,
  safeJsonParse,
} from '../../src/utils/validation';
import { sanitizeLogData } from '../../src/utils/security';

describe('sanitizeString', () => {
  describe('rejects unambiguous script/iframe injection', () => {
    it('rejects <script> tags', () => {
      expect(() => sanitizeString('<script>alert(1)</script>')).toThrow(
        'contains potentially dangerous content',
      );
    });

    it('rejects <script> regardless of case and attributes', () => {
      ['<SCRIPT>', '<script src="x.js">', '<script type="x">', '</script>'].forEach(
        (value) => {
          expect(() => sanitizeString(value)).toThrow('dangerous content');
        },
      );
    });

    it('rejects <iframe> tags', () => {
      ['<iframe>', '<iframe src="evil">', '</iframe>'].forEach((value) => {
        expect(() => sanitizeString(value)).toThrow('dangerous content');
      });
    });
  });

  describe('accepts legitimate task content (regression: over-restrictive filter)', () => {
    it('accepts absolute, relative and Windows file paths', () => {
      const paths = [
        '/home/nico/docker/stacks/marea-mcp-vikunja/.env',
        'src/utils/validation.ts',
        'C:\\Users\\nicof\\Desktop',
        'see ../sibling and ../../grandparent dirs',
      ];
      paths.forEach((path) => {
        expect(() => sanitizeString(path)).not.toThrow();
      });
    });

    it('accepts external (non-Google) URLs', () => {
      const urls = [
        'https://www.sortitionfoundation.org/our-work',
        'https://example.com/path?a=1&b=2#frag',
        'See https://docs.google.com/document/d/abc and https://github.com/x/y',
      ];
      urls.forEach((url) => {
        expect(() => sanitizeString(url)).not.toThrow();
      });
    });

    it('accepts prose containing SQL-like words', () => {
      const prose = [
        'Update the roadmap and drop the stale items',
        'Select panelists, then create the press note',
        'Delete old drafts -- they collide on subject',
      ];
      prose.forEach((text) => {
        expect(() => sanitizeString(text)).not.toThrow();
      });
    });

    it('accepts Markdown, punctuation and shell-tool names the old filter rejected', () => {
      const inputs = [
        '## Overview\n- item 1\n- item 2',
        'Range: May 13--15 /* note */',
        'Issue #12 and #19',
        'The constructor and prototype of the class',
        'Run wget, curl or ssh to fetch it',
        '<!-- a plain note -->',
      ];
      inputs.forEach((text) => {
        expect(() => sanitizeString(text)).not.toThrow();
      });
    });

    it('accepts a long description well beyond the old 1000-char cap', () => {
      const long = 'Detailed description sentence. '.repeat(500);
      expect(long.length).toBeGreaterThan(1000);
      expect(() => sanitizeString(long)).not.toThrow();
    });
  });

  describe('length backstop', () => {
    it('accepts strings up to MAX_STRING_LENGTH', () => {
      expect(() => sanitizeString('a'.repeat(1_000_000))).not.toThrow();
    });

    it('rejects strings past the 1,000,000-char backstop', () => {
      expect(() => sanitizeString('a'.repeat(1_000_001))).toThrow(
        'exceeds maximum length of 1000000',
      );
    });
  });

  describe('passes content through without escaping', () => {
    it('does not escape HTML-significant characters', () => {
      expect(sanitizeString('a < b && c > d')).toBe('a < b && c > d');
    });

    it('does not escape slashes (the task title is a plain-text field)', () => {
      expect(sanitizeString('fix src/utils/validation.ts')).toBe(
        'fix src/utils/validation.ts',
      );
    });

    it('does not rewrite path-traversal substrings', () => {
      const paths = [
        '../config',
        'see ../../etc/hosts and /etc/passwd',
        'C:\\Windows\\System32',
        '%2e%2e/secret',
      ];
      paths.forEach((path) => {
        expect(sanitizeString(path)).toBe(path);
      });
    });

    it('strips zero-width / invisible characters', () => {
      expect(sanitizeString('he​llo')).toBe('hello');
    });
  });
});

describe('validateValue propagates sanitizeString to array elements', () => {
  it('sanitizes ordinary string array elements without rejecting them', () => {
    const result = validateValue(['Task 1', 'path/to/x', 'Task 3']);
    expect(Array.isArray(result)).toBe(true);
    expect((result as string[]).length).toBe(3);
  });

  it('still rejects <script> inside an array element', () => {
    expect(() => validateValue(['ok', '<script>alert(1)</script>'])).toThrow(
      'dangerous content',
    );
  });
});

describe('safeJsonParse prototype-pollution protection', () => {
  it('rejects __proto__ payloads', () => {
    expect(() => safeJsonParse('{"__proto__": {"isAdmin": true}}')).toThrow(
      'prototype pollution',
    );
  });
});

describe('sanitizeLogData integration', () => {
  it('passes ordinary strings through rather than failing on paths/prose', () => {
    const out = sanitizeLogData({ note: 'see /home/nico/docker' }) as Record<
      string,
      string
    >;
    expect(out.note).not.toBe('[SANITIZATION_FAILED]');
    expect(typeof out.note).toBe('string');
  });

  it('falls back to [SANITIZATION_FAILED] on script injection', () => {
    const out = sanitizeLogData({ title: '<script>alert(1)</script>' }) as Record<
      string,
      string
    >;
    expect(out.title).toBe('[SANITIZATION_FAILED]');
  });
});
