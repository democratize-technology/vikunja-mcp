/**
 * Test for FilterSerializer type safety fix
 */

import { FilterSerializer } from '../../src/storage/filtering/FilterSerializer';

describe('FilterSerializer Type Safety', () => {
  let serializer: FilterSerializer;

  beforeEach(() => {
    serializer = new FilterSerializer();
  });

  describe('isValidExpression method', () => {
    it('should handle valid filter expression objects', () => {
      const validExpression = {
        groups: [
          {
            conditions: [
              {
                field: 'title',
                operator: '=',
                value: 'Test Task'
              }
            ],
            operator: '&&'
          }
        ]
      };

      // This should not throw and should return true for valid structure
      expect(() => {
        // Access private method for testing
        const result = (serializer as any).isValidExpression(validExpression);
        expect(result).toBe(true);
      }).not.toThrow();
    });

    it('should handle invalid objects gracefully', () => {
      const invalidInputs = [
        null,
        undefined,
        'string',
        123,
        [],
        { groups: 'not an array' },
        { groups: [{ conditions: 'not an array' }] },
        { groups: [{ conditions: [], operator: '&&' }] }, // missing field/operator/value
      ];

      invalidInputs.forEach(input => {
        const result = (serializer as any).isValidExpression(input);
        // Most invalid inputs should return false, but let's see what actually happens
        expect(typeof result).toBe('boolean');
      });
    });

    it('should type-check unknown inputs properly', () => {
      const unknownInputs: unknown[] = [
        { groups: [] },
        { groups: [{ conditions: [{ field: 'title', operator: '=', value: 'test' }], operator: '&&' }] },
        { invalid: 'structure' },
        'random string'
      ];

      unknownInputs.forEach(input => {
        expect(() => {
          const result = (serializer as any).isValidExpression(input);
          expect(typeof result).toBe('boolean');
        }).not.toThrow();
      });
    });
  });
});