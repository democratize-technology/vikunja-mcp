/**
 * Test suite for SQLiteDataMapper component
 *
 * Tests the pure data transformation functionality with no external dependencies.
 */

import { SQLiteDataMapper, type FilterRow } from '../../../../src/storage/adapters/components/SQLiteDataMapper';
import type { SavedFilter } from '../../../../src/types/filters';

describe('SQLiteDataMapper', () => {
  const sampleFilter: SavedFilter = {
    id: 'test-id',
    name: 'Test Filter',
    description: 'Test Description',
    filter: 'title contains "test"',
    expression: {
      groups: [
        {
          operator: '&&' as const,
          conditions: [
            { field: 'title', operator: 'like' as const, value: '%test%' },
          ],
        },
      ],
    },
    isGlobal: true,
    projectId: 123,
    created: new Date('2023-01-01T00:00:00.000Z'),
    updated: new Date('2023-01-02T00:00:00.000Z'),
  };

  const sampleRow: FilterRow = {
    id: 'test-id',
    session_id: 'session-123',
    name: 'Test Filter',
    description: 'Test Description',
    filter: 'title contains "test"',
    expression: JSON.stringify({
      groups: [
        {
          operator: '&&',
          conditions: [
            { field: 'title', operator: 'like', value: '%test%' },
          ],
        },
      ],
    }),
    project_id: 123,
    is_global: 1,
    created: '2023-01-01T00:00:00.000Z',
    updated: '2023-01-02T00:00:00.000Z',
  };

  describe('rowToFilter', () => {
    it('should convert a complete row to SavedFilter', () => {
      const result = SQLiteDataMapper.rowToFilter(sampleRow);

      expect(result).toEqual(sampleFilter);
    });

    it('should handle row with null optional fields', () => {
      const minimalRow: FilterRow = {
        id: 'test-id',
        session_id: 'session-123',
        name: 'Minimal Filter',
        description: null,
        filter: 'title contains "test"',
        expression: null,
        project_id: null,
        is_global: 0,
        created: '2023-01-01T00:00:00.000Z',
        updated: '2023-01-02T00:00:00.000Z',
      };

      const result = SQLiteDataMapper.rowToFilter(minimalRow);

      expect(result.id).toBe('test-id');
      expect(result.name).toBe('Minimal Filter');
      expect(result.description).toBeUndefined();
      expect(result.expression).toBeUndefined();
      expect(result.projectId).toBeUndefined();
      expect(result.isGlobal).toBe(false);
    });

    it('should handle invalid JSON in expression field', () => {
      const invalidExpressionRow = {
        ...sampleRow,
        expression: 'invalid json {',
      };

      const result = SQLiteDataMapper.rowToFilter(invalidExpressionRow);

      expect(result.expression).toBeUndefined();
    });

    it('should convert boolean fields correctly', () => {
      const result = SQLiteDataMapper.rowToFilter(sampleRow);
      expect(result.isGlobal).toBe(true);

      const falseRow = { ...sampleRow, is_global: 0 };
      const falseResult = SQLiteDataMapper.rowToFilter(falseRow);
      expect(falseResult.isGlobal).toBe(false);
    });

    it('should parse dates correctly', () => {
      const result = SQLiteDataMapper.rowToFilter(sampleRow);

      expect(result.created).toEqual(new Date('2023-01-01T00:00:00.000Z'));
      expect(result.updated).toEqual(new Date('2023-01-02T00:00:00.000Z'));
    });
  });

  describe('filterToRow', () => {
    it('should convert SavedFilter to row format', () => {
      const sessionId = 'session-123';
      const result = SQLiteDataMapper.filterToRow(sampleFilter, sessionId);

      expect(result).toEqual({
        session_id: sessionId,
        name: sampleFilter.name,
        description: sampleFilter.description,
        filter: sampleFilter.filter,
        expression: JSON.stringify(sampleFilter.expression),
        project_id: sampleFilter.projectId,
        is_global: 1,
      });
    });

    it('should handle filter without optional fields', () => {
      const minimalFilter: SavedFilter = {
        id: 'test-id',
        name: 'Minimal Filter',
        filter: 'title contains "test"',
        isGlobal: false,
        created: new Date(),
        updated: new Date(),
      };

      const sessionId = 'session-123';
      const result = SQLiteDataMapper.filterToRow(minimalFilter, sessionId);

      expect(result.description).toBeNull();
      expect(result.expression).toBeNull();
      expect(result.project_id).toBeNull();
      expect(result.is_global).toBe(0);
    });
  });

  describe('isValidRow', () => {
    it('should validate a correct row', () => {
      expect(SQLiteDataMapper.isValidRow(sampleRow)).toBe(true);
    });

    it('should reject invalid objects', () => {
      expect(SQLiteDataMapper.isValidRow(null)).toBe(false);
      expect(SQLiteDataMapper.isValidRow(undefined)).toBe(false);
      expect(SQLiteDataMapper.isValidRow('string')).toBe(false);
      expect(SQLiteDataMapper.isValidRow(123)).toBe(false);
      expect(SQLiteDataMapper.isValidRow({})).toBe(false);
    });

    it('should reject rows with missing required fields', () => {
      const incompleteRow = { ...sampleRow };
      delete (incompleteRow as Partial<FilterRow>).id;

      expect(SQLiteDataMapper.isValidRow(incompleteRow)).toBe(false);
    });

    it('should reject rows with wrong field types', () => {
      const invalidTypeRows = [
        { ...sampleRow, id: 123 }, // number instead of string
        { ...sampleRow, is_global: 'true' }, // string instead of number
        { ...sampleRow, created: 123 }, // number instead of string
        { ...sampleRow, project_id: '123' }, // string instead of number/null
      ];

      invalidTypeRows.forEach(row => {
        expect(SQLiteDataMapper.isValidRow(row)).toBe(false);
      });
    });

    it('should accept valid optional field types', () => {
      const validOptionalRows = [
        { ...sampleRow, description: null }, // null is valid
        { ...sampleRow, expression: null }, // null is valid
        { ...sampleRow, project_id: null }, // null is valid
      ];

      validOptionalRows.forEach(row => {
        expect(SQLiteDataMapper.isValidRow(row)).toBe(true);
      });
    });
  });

  describe('Field extraction methods', () => {
    it('should extract session ID correctly', () => {
      expect(SQLiteDataMapper.getSessionId(sampleRow)).toBe('session-123');
    });

    it('should extract filter ID correctly', () => {
      expect(SQLiteDataMapper.getFilterId(sampleRow)).toBe('test-id');
    });

    it('should check if global filter correctly', () => {
      expect(SQLiteDataMapper.isGlobalFilter(sampleRow)).toBe(true);

      const nonGlobalRow = { ...sampleRow, is_global: 0 };
      expect(SQLiteDataMapper.isGlobalFilter(nonGlobalRow)).toBe(false);
    });

    it('should extract project ID correctly', () => {
      expect(SQLiteDataMapper.getProjectId(sampleRow)).toBe(123);

      const nullProjectRow = { ...sampleRow, project_id: null };
      expect(SQLiteDataMapper.getProjectId(nullProjectRow)).toBeNull();
    });

    it('should extract filter name correctly', () => {
      expect(SQLiteDataMapper.getFilterName(sampleRow)).toBe('Test Filter');
    });
  });

  describe('Round-trip conversion', () => {
    it('should maintain data integrity through row->filter->row conversion', () => {
      const filter = SQLiteDataMapper.rowToFilter(sampleRow);
      const sessionId = sampleRow.session_id;
      const row = SQLiteDataMapper.filterToRow(filter, sessionId);

      // Remove fields that aren't included in filterToRow result
      const { id, created, updated, expression, ...expectedRow } = sampleRow;

      // Check that all fields match except expression (which may have different JSON ordering)
      expect(row.session_id).toBe(expectedRow.session_id);
      expect(row.name).toBe(expectedRow.name);
      expect(row.description).toBe(expectedRow.description);
      expect(row.filter).toBe(expectedRow.filter);
      expect(row.project_id).toBe(expectedRow.project_id);
      expect(row.is_global).toBe(expectedRow.is_global);

      // Check that expression can be parsed back to the original object
      if (row.expression) {
        const parsedExpression = JSON.parse(row.expression);
        expect(parsedExpression).toEqual(sampleFilter.expression);
      }
    });

    it('should maintain data integrity through filter->row->filter conversion', () => {
      const sessionId = 'session-123';
      const row = SQLiteDataMapper.filterToRow(sampleFilter, sessionId);

      // Create a complete row for testing
      const completeRow: FilterRow = {
        id: sampleFilter.id,
        created: sampleFilter.created.toISOString(),
        updated: sampleFilter.updated.toISOString(),
        ...row,
      };

      const filter = SQLiteDataMapper.rowToFilter(completeRow);

      expect(filter).toEqual(sampleFilter);
    });
  });
});