/**
 * Field selector with verbosity-based logic
 * Handles intelligent field selection based on verbosity levels and overrides
 */

import type { FieldDefinition, TransformerConfig } from './base';
import { FieldCategory, Verbosity } from './base';
import { DEFAULT_VERBOSITY_FIELDS } from './base';

/**
 * Field selection result
 */
export interface FieldSelectionResult {
  includedFields: string[];
  excludedFields: string[];
  activeCategories: FieldCategory[];
  fieldDefinitions: FieldDefinition[];
}

/**
 * Field selector class for verbosity-based field selection
 */
export class FieldSelector {
  private fieldDefinitions: Map<string, FieldDefinition> = new Map();

  constructor() {
    this.initializeDefaultFieldDefinitions();
  }

  private initializeDefaultFieldDefinitions(): void {
    const coreFields: FieldDefinition[] = [
      { fieldName: 'id', category: FieldCategory.CORE, minVerbosity: Verbosity.MINIMAL },
      { fieldName: 'title', category: FieldCategory.CORE, minVerbosity: Verbosity.MINIMAL },
      { fieldName: 'done', category: FieldCategory.CORE, minVerbosity: Verbosity.MINIMAL },
      { fieldName: 'status', category: FieldCategory.CORE, minVerbosity: Verbosity.MINIMAL },
    ];

    const contextFields: FieldDefinition[] = [
      { fieldName: 'description', category: FieldCategory.CONTEXT, minVerbosity: Verbosity.STANDARD },
      { fieldName: 'project_id', category: FieldCategory.CONTEXT, minVerbosity: Verbosity.STANDARD },
      { fieldName: 'priority', category: FieldCategory.CONTEXT, minVerbosity: Verbosity.STANDARD },
    ];

    const schedulingFields: FieldDefinition[] = [
      { fieldName: 'due_date', category: FieldCategory.SCHEDULING, minVerbosity: Verbosity.DETAILED },
      { fieldName: 'created_at', category: FieldCategory.SCHEDULING, minVerbosity: Verbosity.DETAILED },
      { fieldName: 'updated_at', category: FieldCategory.SCHEDULING, minVerbosity: Verbosity.DETAILED },
    ];

    const metadataFields: FieldDefinition[] = [
      { fieldName: 'hex_color', category: FieldCategory.METADATA, minVerbosity: Verbosity.COMPLETE },
      { fieldName: 'position', category: FieldCategory.METADATA, minVerbosity: Verbosity.COMPLETE },
      { fieldName: 'index', category: FieldCategory.METADATA, minVerbosity: Verbosity.COMPLETE },
    ];

    [...coreFields, ...contextFields, ...schedulingFields, ...metadataFields].forEach(field => {
      this.fieldDefinitions.set(field.fieldName, field);
    });
  }

  selectFields(config: TransformerConfig, availableFields: string[]): FieldSelectionResult {
    const verbosityFields = DEFAULT_VERBOSITY_FIELDS[config.verbosity] || [];
    const selectedFields = new Set<string>([...verbosityFields]);

    if (config.fieldOverrides?.include) {
      config.fieldOverrides.include.forEach(field => selectedFields.add(field));
    }

    if (config.fieldOverrides?.exclude) {
      config.fieldOverrides.exclude.forEach(field => selectedFields.delete(field));
    }

    const finalSelectedFields = Array.from(selectedFields).filter(field =>
      availableFields.includes(field)
    );

    const excludedFields = availableFields.filter(field => !finalSelectedFields.includes(field));

    const fieldDefinitions: FieldDefinition[] = finalSelectedFields.map(fieldName => {
      const existingDef = this.fieldDefinitions.get(fieldName);
      if (existingDef) {
        return existingDef;
      }
      return {
        fieldName,
        category: this.inferFieldCategory(fieldName),
        minVerbosity: Verbosity.STANDARD
      };
    });

    const activeCategories = new Set<FieldCategory>();
    fieldDefinitions.forEach(def => activeCategories.add(def.category));

    return {
      includedFields: finalSelectedFields,
      excludedFields,
      activeCategories: Array.from(activeCategories),
      fieldDefinitions
    };
  }

  private inferFieldCategory(fieldName: string): FieldCategory {
    const lowerFieldName = fieldName.toLowerCase();

    if (['id', 'title', 'done', 'status'].includes(lowerFieldName)) {
      return FieldCategory.CORE;
    }

    if (lowerFieldName.includes('date') || lowerFieldName.includes('time')) {
      return FieldCategory.SCHEDULING;
    }

    if (['description', 'project', 'priority'].includes(lowerFieldName)) {
      return FieldCategory.CONTEXT;
    }

    return FieldCategory.METADATA;
  }
}

export const defaultFieldSelector = new FieldSelector();