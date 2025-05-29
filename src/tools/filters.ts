import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { filterStorage } from '../storage/FilterStorage';
import { FilterBuilder } from '../utils/filters';
import type { FilterField, FilterOperator, SavedFilter } from '../types/filters';
import { logger } from '../utils/logger';
import { createStandardResponse, createErrorResponse } from '../types/index';

/**
 * Schema for listing filters
 */
const ListFiltersSchema = z.object({
  projectId: z.number().optional().describe('Filter by project ID'),
  global: z.boolean().optional().describe('Show only global filters'),
});

/**
 * Schema for getting a filter
 */
const GetFilterSchema = z.object({
  id: z.string().describe('Filter ID'),
});

/**
 * Schema for creating a filter
 */
const CreateFilterSchema = z.object({
  name: z.string().optional().describe('Filter name'),
  title: z.string().optional().describe('Filter title (alias for name)'),
  description: z.string().optional().describe('Filter description'),
  filter: z.string().optional().describe('Filter query string'),
  filters: z.object({
    filter_by: z.array(z.string()).optional(),
    filter_value: z.array(z.string()).optional(),
    filter_comparator: z.array(z.string()).optional(),
    filter_concat: z.string().optional(),
  }).optional().describe('Filter conditions object'),
  projectId: z.number().optional().describe('Project ID (for project-specific filters)'),
  isGlobal: z.boolean().default(false).describe('Whether the filter is globally accessible'),
  is_favorite: z.boolean().optional().describe('Whether the filter is marked as favorite'),
}).refine(data => (data.name || data.title) && (data.filter || data.filters), {
  message: 'Either name or title must be provided, and either filter or filters must be provided'
});

/**
 * Schema for updating a filter
 */
const UpdateFilterSchema = z.object({
  id: z.string().describe('Filter ID'),
  name: z.string().optional().describe('New filter name'),
  description: z.string().optional().describe('New filter description'),
  filter: z.string().optional().describe('New filter query string'),
  projectId: z.number().optional().describe('New project ID'),
  isGlobal: z.boolean().optional().describe('Whether the filter is globally accessible'),
});

/**
 * Schema for deleting a filter
 */
const DeleteFilterSchema = z.object({
  id: z.string().describe('Filter ID'),
});

/**
 * Schema for building a filter
 */
const BuildFilterSchema = z.object({
  conditions: z
    .array(
      z.object({
        field: z.enum([
          'done',
          'priority',
          'percentDone',
          'dueDate',
          'assignees',
          'labels',
          'created',
          'updated',
          'title',
          'description',
        ] as const),
        operator: z.enum(['=', '!=', '>', '>=', '<', '<=', 'like', 'in', 'not in'] as const),
        value: z.union([
          z.string(),
          z.number(),
          z.boolean(),
          z.array(z.union([z.string(), z.number()])),
        ]),
      }),
    )
    .describe('Filter conditions'),
  groupOperator: z.enum(['&&', '||']).optional().describe('Operator to combine conditions'),
});

/**
 * Schema for validating a filter
 */
const ValidateFilterSchema = z.object({
  filter: z.string().describe('Filter query string to validate'),
});

/**
 * Register filters tool
 */
export function registerFiltersTool(server: McpServer): void {
  server.tool(
    'vikunja_filters',
    {
      action: z.enum(['list', 'get', 'create', 'update', 'delete', 'build', 'validate']),
      parameters: z.record(z.unknown()),
    },
    async ({ action, parameters }) => {
      logger.info(`Executing vikunja_filters action: ${action}`);

      try {
        switch (action) {
          case 'list': {
            const params = ListFiltersSchema.parse(parameters);
            logger.debug(`Listing filters with params:`, params);

            let filters = await filterStorage.list();

            if (params.projectId !== undefined) {
              filters = await filterStorage.getByProject(params.projectId);
            } else if (params.global !== undefined) {
              filters = filters.filter((f) => f.isGlobal === params.global);
            }

            const response = createStandardResponse(
              'list-saved-filters',
              `Found ${filters.length} saved filter${filters.length !== 1 ? 's' : ''}`,
              {
                filters: filters.map((f) => ({
                  id: f.id,
                  name: f.name,
                  description: f.description,
                  filter: f.filter,
                  projectId: f.projectId,
                  isGlobal: f.isGlobal,
                  created: f.created.toISOString(),
                  updated: f.updated.toISOString(),
                })),
              },
              { count: filters.length },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'get': {
            const params = GetFilterSchema.parse(parameters);
            logger.debug(`Getting filter with id: ${params.id}`);

            const filter = await filterStorage.get(params.id);
            if (!filter) {
              throw new Error(`Filter with id ${params.id} not found`);
            }

            const response = createStandardResponse(
              'get-saved-filter',
              `Retrieved filter "${filter.name}"`,
              {
                filter: {
                  id: filter.id,
                  name: filter.name,
                  description: filter.description,
                  filter: filter.filter,
                  projectId: filter.projectId,
                  isGlobal: filter.isGlobal,
                  created: filter.created.toISOString(),
                  updated: filter.updated.toISOString(),
                },
              },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'create': {
            const params = CreateFilterSchema.parse(parameters);
            
            // Use title as name if name is not provided
            // Schema validation ensures at least one of name/title is provided
            const name = params.name || (params.title as string);
            logger.debug(`Creating filter with name: ${name}`);

            // Build filter string from filters object if provided
            let filterString = params.filter;
            if (!filterString && params.filters) {
              const builder = new FilterBuilder();
              const { filter_by, filter_value, filter_comparator, filter_concat } = params.filters;
              
              if (filter_by && filter_value && filter_comparator) {
                for (let i = 0; i < filter_by.length; i++) {
                  const field = filter_by[i] as FilterField;
                  const value = filter_value[i];
                  const comparator = filter_comparator[i] as FilterOperator;
                  
                  if (!value) continue;
                  
                  // Convert value to appropriate type based on field
                  let typedValue: string | number | boolean = value;
                  if (field === 'priority' || field === 'percentDone') {
                    typedValue = Number(value);
                  } else if (field === 'done') {
                    typedValue = value === 'true';
                  }
                  
                  if (i > 0 && filter_concat === '||') {
                    builder.or();
                  }
                  
                  builder.where(field, comparator, typedValue);
                }
              }
              
              filterString = builder.toString();
            }

            if (!filterString) {
              throw new Error('No filter conditions provided');
            }

            // Check if filter with same name exists
            const existing = await filterStorage.findByName(name);
            if (existing) {
              throw new Error(`Filter with name "${name}" already exists`);
            }

            const filter = await filterStorage.create({
              name,
              filter: filterString,
              isGlobal: params.isGlobal || params.is_favorite || false,
              ...(params.description && { description: params.description }),
              ...(params.projectId !== undefined && { projectId: params.projectId }),
            });

            const response = createStandardResponse(
              'create-saved-filter',
              `Filter "${filter.name}" saved successfully`,
              {
                filter: {
                  id: filter.id,
                  name: filter.name,
                  description: filter.description,
                  filter: filter.filter,
                  projectId: filter.projectId,
                  isGlobal: filter.isGlobal,
                  created: filter.created.toISOString(),
                  updated: filter.updated.toISOString(),
                },
              },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'update': {
            const params = UpdateFilterSchema.parse(parameters);
            logger.debug(`Updating filter with id: ${params.id}`);

            const { id, ...updates } = params;

            // If renaming, check for duplicate names
            if (updates.name) {
              const existing = await filterStorage.findByName(updates.name);
              if (existing && existing.id !== id) {
                throw new Error(`Filter with name "${updates.name}" already exists`);
              }
            }

            const updateData: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>> = {};
            if (updates.name !== undefined) updateData.name = updates.name;
            if (updates.description !== undefined) updateData.description = updates.description;
            if (updates.filter !== undefined) updateData.filter = updates.filter;
            if (updates.projectId !== undefined) updateData.projectId = updates.projectId;
            if (updates.isGlobal !== undefined) updateData.isGlobal = updates.isGlobal;

            const filter = await filterStorage.update(id, updateData);

            const affectedFields = Object.keys(updateData).filter(
              (key) => updateData[key as keyof typeof updateData] !== undefined,
            );

            const response = createStandardResponse(
              'update-saved-filter',
              `Filter "${filter.name}" updated successfully`,
              {
                filter: {
                  id: filter.id,
                  name: filter.name,
                  description: filter.description,
                  filter: filter.filter,
                  projectId: filter.projectId,
                  isGlobal: filter.isGlobal,
                  created: filter.created.toISOString(),
                  updated: filter.updated.toISOString(),
                },
              },
              { affectedFields },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'delete': {
            const params = DeleteFilterSchema.parse(parameters);
            logger.debug(`Deleting filter with id: ${params.id}`);

            const filter = await filterStorage.get(params.id);
            if (!filter) {
              throw new Error(`Filter with id ${params.id} not found`);
            }

            await filterStorage.delete(params.id);

            const response = createStandardResponse(
              'delete-saved-filter',
              `Filter "${filter.name}" deleted successfully`,
              { success: true },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'build': {
            const params = BuildFilterSchema.parse(parameters);
            logger.debug(`Building filter from conditions`);

            const builder = new FilterBuilder();

            params.conditions.forEach((condition, index) => {
              if (index > 0 && params.groupOperator === '||') {
                builder.or();
              }
              builder.where(
                condition.field as FilterField,
                condition.operator as FilterOperator,
                condition.value,
              );
            });

            const filterString = builder.toString();
            const validation = builder.validate();

            if (!validation.valid && validation.errors.length > 0) {
              throw new Error(`Invalid filter configuration: ${validation.errors.join(', ')}`);
            }

            const response = createStandardResponse(
              'build-filter',
              'Filter built successfully',
              {
                filter: filterString,
                valid: validation.valid,
                warnings: validation.warnings,
              },
              { conditionCount: params.conditions.length },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'validate': {
            const params = ValidateFilterSchema.parse(parameters);
            logger.debug(`Validating filter: ${params.filter}`);

            // For now, we'll do basic validation
            // In a full implementation, we'd parse and validate the filter string
            const isValid = Boolean(params.filter && params.filter.trim().length > 0);

            if (!isValid) {
              throw new Error('Invalid filter: Filter string cannot be empty');
            }

            const response = createStandardResponse('validate-filter', 'Filter is valid', {
              valid: true,
              warnings: [],
              filter: params.filter,
            });

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown action: ${action as string}`);
        }
      } catch (error) {
        logger.error(`Error in vikunja_filters tool:`, error);

        if (error instanceof z.ZodError) {
          const response = createErrorResponse(
            action === 'create' ? 'create-saved-filter' : `${action}-filter`,
            'Invalid parameters',
            'VALIDATION_ERROR',
            {
              errors: error.errors.map((e) => ({
                path: e.path.join('.'),
                message: e.message,
              })),
            },
          );

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        }

        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        const operation =
          action === 'get' && errorMessage.includes('not found')
            ? 'get-saved-filter'
            : action === 'delete' && errorMessage.includes('not found')
              ? 'delete-saved-filter'
              : action === 'create' && errorMessage.includes('already exists')
                ? 'create-saved-filter'
                : action === 'update' && errorMessage.includes('already exists')
                  ? 'update-saved-filter'
                  : action === 'build' && errorMessage.includes('Invalid')
                    ? 'build-filter'
                    : action === 'validate' && errorMessage.includes('Invalid filter')
                      ? 'validate-filter'
                      : errorMessage.includes('Unknown action')
                        ? 'filters-error'
                        : `${action}-filter`;

        const response = createErrorResponse(operation, errorMessage, 'ERROR');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }
    },
  );
}
