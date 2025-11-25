/**
 * Unicode Fix Utility Tests
 */

import {
  fixLiteralUnicodeEscapes,
  fixLiteralUnicodeEscapesInData,
  hasLiteralUnicodeEscapes
} from '../../src/utils/unicode-fix';

describe('Unicode Fix Utilities', () => {
  describe('hasLiteralUnicodeEscapes', () => {
    test('should detect literal unicode escape sequences', () => {
      expect(hasLiteralUnicodeEscapes('Team \\ud83d\\udc65')).toBe(true);
      expect(hasLiteralUnicodeEscapes('Text with \\u26a1 emoji')).toBe(true);
      expect(hasLiteralUnicodeEscapes('Normal text')).toBe(false);
      expect(hasLiteralUnicodeEscapes('Team with 👥 emoji')).toBe(false);
    });

    test('should handle non-string inputs', () => {
      expect(hasLiteralUnicodeEscapes(null as any)).toBe(false);
      expect(hasLiteralUnicodeEscapes(undefined as any)).toBe(false);
      expect(hasLiteralUnicodeEscapes(123 as any)).toBe(false);
      expect(hasLiteralUnicodeEscapes({} as any)).toBe(false);
    });
  });

  describe('fixLiteralUnicodeEscapes', () => {
    test('should fix literal unicode escape sequences', () => {
      expect(fixLiteralUnicodeEscapes('Team \\ud83d\\udc65')).toBe('Team 👥');
      expect(fixLiteralUnicodeEscapes('Lightning \\u26a1')).toBe('Lightning ⚡');
      expect(fixLiteralUnicodeEscapes('Heart ❤️')).toBe('Heart ❤️'); // Already correct
      expect(fixLiteralUnicodeEscapes('Normal text')).toBe('Normal text');
    });

    test('should handle empty strings', () => {
      expect(fixLiteralUnicodeEscapes('')).toBe('');
    });

    test('should handle malformed unicode gracefully', () => {
      // Invalid unicode sequence should not crash
      expect(fixLiteralUnicodeEscapes('Invalid \\uXXXX')).toBe('Invalid \\uXXXX');
      expect(fixLiteralUnicodeEscapes('Partial \\ud83')).toBe('Partial \\ud83');
    });

    test('should handle non-string inputs', () => {
      expect(fixLiteralUnicodeEscapes(null as any)).toBe(null);
      expect(fixLiteralUnicodeEscapes(undefined as any)).toBe(undefined);
      expect(fixLiteralUnicodeEscapes(123 as any)).toBe(123);
      expect(fixLiteralUnicodeEscapes({} as any)).toStrictEqual({});
    });
  });

  describe('fixLiteralUnicodeEscapesInData', () => {
    test('should fix unicode in nested objects', () => {
      const data = {
        teams: [
          {
            id: 1,
            name: 'Team \\ud83d\\udc65',
            description: 'A team with emoji'
          },
          {
            id: 2,
            name: 'Normal Team',
            description: 'No unicode'
          }
        ],
        metadata: {
          creator: 'Admin \\u26a1',
          notes: 'Some notes'
        }
      };

      const fixed = fixLiteralUnicodeEscapesInData(data);

      expect(fixed.teams[0].name).toBe('Team 👥');
      expect(fixed.teams[1].name).toBe('Normal Team');
      expect(fixed.metadata.creator).toBe('Admin ⚡');
      expect(fixed.metadata.notes).toBe('Some notes');
    });

    test('should handle arrays', () => {
      const data = [
        'Item \\ud83d\\udc65',
        'Item \\u26a1',
        'Normal item'
      ];

      const fixed = fixLiteralUnicodeEscapesInData(data);

      expect(fixed).toEqual(['Item 👥', 'Item ⚡', 'Normal item']);
    });

    test('should handle mixed data types', () => {
      const data = {
        string: 'Team \\ud83d\\udc65',
        number: 42,
        boolean: true,
        nullValue: null,
        array: ['Item \\u26a1', 123],
        nested: {
          deep: 'Value \\ud83d\\udc65'
        }
      };

      const fixed = fixLiteralUnicodeEscapesInData(data);

      expect(fixed.string).toBe('Team 👥');
      expect(fixed.number).toBe(42);
      expect(fixed.boolean).toBe(true);
      expect(fixed.nullValue).toBe(null);
      expect(fixed.array[0]).toBe('Item ⚡');
      expect(fixed.array[1]).toBe(123);
      expect(fixed.nested.deep).toBe('Value 👥');
    });

    test('should handle primitive values', () => {
      expect(fixLiteralUnicodeEscapesInData('Team \\ud83d\\udc65')).toBe('Team 👥');
      expect(fixLiteralUnicodeEscapesInData(42)).toBe(42);
      expect(fixLiteralUnicodeEscapesInData(null)).toBe(null);
      expect(fixLiteralUnicodeEscapesInData(undefined)).toBe(undefined);
    });
  });

  describe('Performance tests', () => {
    test('should handle large data structures efficiently', () => {
      const largeData = {
        teams: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Team \\ud83d\\udc65 ${i}`,
          description: `Description with \\u26a1 emoji ${i}`
        }))
      };

      const startTime = performance.now();
      const fixed = fixLiteralUnicodeEscapesInData(largeData);
      const endTime = performance.now();

      expect(fixed.teams[0].name).toBe('Team 👥 0');
      expect(fixed.teams[999].description).toBe('Description with ⚡ emoji 999');

      // Should complete in reasonable time (less than 100ms for 1000 items)
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});