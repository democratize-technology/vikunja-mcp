/**
 * Tests for field selector functionality
 * Ensures comprehensive coverage of verbosity-based field selection logic
 */

import { FieldSelector } from '../../src/transforms/field-selector';
import { FieldCategory, Verbosity } from '../../src/transforms/base';

describe('Field Selector', () => {
  let fieldSelector: FieldSelector;

  beforeEach(() => {
    fieldSelector = new FieldSelector();
  });

  describe('Minimal Verbosity', () => {
    it('should select only core fields for minimal verbosity', () => {
      const availableFields = ['id', 'title', 'done', 'description', 'priority', 'due_date'];
      const config = { verbosity: Verbosity.MINIMAL };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toEqual(['id', 'title', 'done']);
      expect(result.excludedFields).toEqual(['description', 'priority', 'due_date']);
      expect(result.activeCategories).toEqual([FieldCategory.CORE]);
    });

    it('should handle missing core fields gracefully', () => {
      const availableFields = ['description', 'priority', 'due_date'];
      const config = { verbosity: Verbosity.MINIMAL };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toEqual([]);
      expect(result.excludedFields).toEqual(['description', 'priority', 'due_date']);
      expect(result.activeCategories).toEqual([]);
    });
  });

  describe('Standard Verbosity', () => {
    it('should select core and context fields for standard verbosity', () => {
      // due_date is now in CONTEXT (STANDARD) since it's essential for task management
      const availableFields = ['id', 'title', 'done', 'description', 'priority', 'due_date', 'created_at'];
      const config = { verbosity: Verbosity.STANDARD };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toEqual(['id', 'title', 'done', 'description', 'priority', 'due_date']);
      expect(result.excludedFields).toEqual(['created_at']); // created_at remains in SCHEDULING
      expect(result.activeCategories).toEqual([FieldCategory.CORE, FieldCategory.CONTEXT]);
    });

    it('should include project_id in standard verbosity', () => {
      const availableFields = ['id', 'title', 'done', 'description', 'priority', 'project_id'];
      const config = { verbosity: Verbosity.STANDARD };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toContain('project_id');
      expect(result.activeCategories).toContain(FieldCategory.CONTEXT);
    });
  });

  describe('Detailed Verbosity', () => {
    it('should select core, context, and scheduling fields for detailed verbosity', () => {
      const availableFields = ['id', 'title', 'done', 'description', 'priority', 'due_date', 'created_at', 'updated_at'];
      const config = { verbosity: Verbosity.DETAILED };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toContain('id');
      expect(result.includedFields).toContain('title');
      expect(result.includedFields).toContain('done');
      expect(result.includedFields).toContain('description');
      expect(result.includedFields).toContain('priority');
      expect(result.includedFields).toContain('due_date');
      expect(result.includedFields).toContain('created_at');
      expect(result.includedFields).toContain('updated_at');
      expect(result.includedFields).toHaveLength(8);
      expect(result.excludedFields).toEqual([]);
      expect(result.activeCategories).toEqual([
        FieldCategory.CORE, FieldCategory.CONTEXT, FieldCategory.SCHEDULING
      ]);
    });

    it('should include start_date and end_date when available', () => {
      const availableFields = ['id', 'title', 'done', 'start_date', 'end_date'];
      const config = { verbosity: Verbosity.DETAILED };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toContain('start_date');
      expect(result.includedFields).toContain('end_date');
    });
  });

  describe('Complete Verbosity', () => {
    it('should select all available fields for complete verbosity', () => {
      // Note: due_date is now in CONTEXT, so we need created_at for SCHEDULING category
      const availableFields = ['id', 'title', 'done', 'description', 'priority', 'due_date', 'created_at', 'hex_color', 'position', 'index'];
      const config = { verbosity: Verbosity.COMPLETE };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toHaveLength(availableFields.length);
      availableFields.forEach(field => {
        expect(result.includedFields).toContain(field);
      });
      expect(result.excludedFields).toEqual([]);
      expect(result.activeCategories).toEqual([
        FieldCategory.CORE, FieldCategory.CONTEXT, FieldCategory.SCHEDULING, FieldCategory.METADATA
      ]);
    });

    it('should include metadata fields in complete verbosity', () => {
      const availableFields = ['id', 'title', 'hex_color', 'position', 'index'];
      const config = { verbosity: Verbosity.COMPLETE };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toContain('hex_color');
      expect(result.includedFields).toContain('position');
      expect(result.includedFields).toContain('index');
      expect(result.activeCategories).toContain(FieldCategory.METADATA);
    });
  });

  describe('Field Overrides', () => {
    it('should include additional fields specified in include override', () => {
      const availableFields = ['id', 'title', 'done', 'description', 'custom_field'];
      const config = {
        verbosity: Verbosity.MINIMAL,
        fieldOverrides: { include: ['custom_field'] }
      };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toEqual(['id', 'title', 'done', 'custom_field']);
      expect(result.excludedFields).toEqual(['description']);
    });

    it('should exclude fields specified in exclude override', () => {
      const availableFields = ['id', 'title', 'done', 'description'];
      const config = {
        verbosity: Verbosity.STANDARD,
        fieldOverrides: { exclude: ['description'] }
      };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toEqual(['id', 'title', 'done']);
      expect(result.excludedFields).toEqual(['description']);
    });

    it('should handle both include and exclude overrides', () => {
      const availableFields = ['id', 'title', 'done', 'description', 'priority', 'custom_field'];
      const config = {
        verbosity: Verbosity.STANDARD,
        fieldOverrides: {
          include: ['custom_field'],
          exclude: ['description']
        }
      };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toEqual(['id', 'title', 'done', 'priority', 'custom_field']);
      expect(result.excludedFields).toEqual(['description']);
    });

    it('should handle empty override arrays', () => {
      const availableFields = ['id', 'title', 'done'];
      const config = {
        verbosity: Verbosity.MINIMAL,
        fieldOverrides: { include: [], exclude: [] }
      };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toEqual(['id', 'title', 'done']);
      expect(result.excludedFields).toEqual([]);
    });
  });

  describe('Field Definitions', () => {
    it('should create field definitions for known fields', () => {
      const availableFields = ['id', 'title', 'done', 'description', 'due_date'];
      const config = { verbosity: Verbosity.DETAILED };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.fieldDefinitions).toHaveLength(5);

      // Check core field definitions
      const idField = result.fieldDefinitions.find(f => f.fieldName === 'id');
      expect(idField?.category).toBe(FieldCategory.CORE);
      expect(idField?.minVerbosity).toBe(Verbosity.MINIMAL);

      // Check context field definitions (due_date moved to CONTEXT for STANDARD availability)
      const dueDateField = result.fieldDefinitions.find(f => f.fieldName === 'due_date');
      expect(dueDateField?.category).toBe(FieldCategory.CONTEXT);
      expect(dueDateField?.minVerbosity).toBe(Verbosity.STANDARD);
    });

    it('should infer categories for unknown fields when included via override', () => {
      const availableFields = ['id', 'unknown_date_field', 'description', 'unknown_field'];
      const config = {
        verbosity: Verbosity.COMPLETE,
        fieldOverrides: { include: ['unknown_date_field', 'description', 'unknown_field'] }
      };

      const result = fieldSelector.selectFields(config, availableFields);

      const dateField = result.fieldDefinitions.find(f => f.fieldName === 'unknown_date_field');
      expect(dateField?.category).toBe(FieldCategory.SCHEDULING);

      const descField = result.fieldDefinitions.find(f => f.fieldName === 'description');
      expect(descField?.category).toBe(FieldCategory.CONTEXT);

      const unknownField = result.fieldDefinitions.find(f => f.fieldName === 'unknown_field');
      expect(unknownField?.category).toBe(FieldCategory.METADATA);
    });

    it('should use standard verbosity for unknown fields', () => {
      const availableFields = ['unknown_field'];
      const config = {
        verbosity: Verbosity.MINIMAL,
        fieldOverrides: { include: ['unknown_field'] }
      };

      const result = fieldSelector.selectFields(config, availableFields);

      const unknownField = result.fieldDefinitions.find(f => f.fieldName === 'unknown_field');
      expect(unknownField?.minVerbosity).toBe(Verbosity.STANDARD);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty available fields', () => {
      const availableFields: string[] = [];
      const config = { verbosity: Verbosity.STANDARD };

      const result = fieldSelector.selectFields(config, availableFields);

      expect(result.includedFields).toEqual([]);
      expect(result.excludedFields).toEqual([]);
      expect(result.activeCategories).toEqual([]);
      expect(result.fieldDefinitions).toEqual([]);
    });

    it('should handle duplicate field names in available fields', () => {
      const availableFields = ['id', 'title', 'id', 'description'];
      const config = { verbosity: Verbosity.STANDARD };

      const result = fieldSelector.selectFields(config, availableFields);

      // Should not include duplicates
      expect(result.includedFields.filter(f => f === 'id')).toHaveLength(1);
      expect(result.excludedFields.filter(f => f === 'id')).toHaveLength(0);
    });

    it('should handle null/undefined values in field overrides', () => {
      const availableFields = ['id', 'title', 'done'];
      const config = {
        verbosity: Verbosity.MINIMAL,
        fieldOverrides: {
          include: null as any,
          exclude: undefined as any
        }
      };

      expect(() => {
        fieldSelector.selectFields(config, availableFields);
      }).not.toThrow();
    });

    it('should handle field names with different cases', () => {
      const availableFields = ['ID', 'Title', 'DONE'];
      const config = { verbosity: Verbosity.MINIMAL };

      const result = fieldSelector.selectFields(config, availableFields);

      // Case-sensitive matching - these don't match the default field names
      expect(result.includedFields).toEqual([]);
      expect(result.excludedFields).toEqual(['ID', 'Title', 'DONE']);
    });
  });

  describe('Performance', () => {
    it('should handle large numbers of available fields efficiently', () => {
      const availableFields = Array.from({ length: 1000 }, (_, i) => `field_${i}`);
      availableFields.push('id', 'title', 'done'); // Add core fields

      const startTime = Date.now();
      const result = fieldSelector.selectFields({ verbosity: Verbosity.MINIMAL }, availableFields);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should complete in < 100ms
      expect(result.includedFields).toEqual(['id', 'title', 'done']);
      expect(result.excludedFields).toHaveLength(1000);
    });
  });
});