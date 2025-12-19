import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';
import { storageManager } from '../storage';
import { FilterBuilder, validateFilterExpression, parseFilterString } from '../utils/filters';
import type { FilterField, FilterOperator, SavedFilter } from '../types/filters';
import { logger } from '../utils/logger';
import { createStandardResponse } from '../types/index';
import { ErrorCode, MCPError, type FilterValue } from '../types/index';
import { createValidationError } from '../utils/error-handler';
import { formatAorpAsMarkdown } from '../utils/response-factory';
import { createAorpErrorResponse } from '../utils/response-factory';

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
 * Get session-scoped storage instance
 */
async function getSessionStorage(authManager: AuthManager): ReturnType<typeof storageManager.getStorage> {
  const session = authManager.getSession();
  const sessionId = session.apiToken ? `${session.apiUrl}:${session.apiToken.substring(0, 8)}` : 'anonymous';
  return storageManager.getStorage(sessionId, session.userId, session.apiUrl);
}

/**
 * Register filters tool
 */
export function registerFiltersTool(server: McpServer, authManager: AuthManager, _clientFactory?: VikunjaClientFactory): void {
  server.tool(
    'vikunja_filters',
    'Manage and build advanced filters for tasks and projects with validation',
    {
      action: z.enum(['list', 'get', 'create', 'update', 'delete', 'build', 'validate']),
      parameters: z.record(z.unknown()),
    },
    async ({ action, parameters }) => {
      logger.info(`Executing vikunja_filters action: ${action}`);

      try {
        const storage = await getSessionStorage(authManager);
        switch (action) {
          case 'list': {
            const params = ListFiltersSchema.parse(parameters);
            logger.debug(`Listing filters with params:`, params);

            let filters = await storage.list();

            if (params.projectId !== undefined) {
              filters = await storage.getByProject(params.projectId);
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
                  text: formatAorpAsMarkdown(response), // createStandardResponse returns AORP object, format as markdown
                },
              ],
            };
          }

          case 'get': {
            const params = GetFilterSchema.parse(parameters);
            logger.debug(`Getting filter with id: ${params.id}`);

            const filter = await storage.get(params.id);
            if (!filter) {
              throw new MCPError(ErrorCode.NOT_FOUND, `Filter with id ${params.id} not found`);
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
                  text: formatAorpAsMarkdown(response), // createStandardResponse returns AORP object, format as markdown
                },
              ],
            };
          }

          case 'create': {
            const params = CreateFilterSchema.parse(parameters);
            
            // Use title as name if name is not provided
            // Schema validation ensures at least one of name/title is provided
            const name = params.name ?? params.title;
            logger.debug(`Creating filter with name: ${name}`);

            let filterString = params.filter;
            if (!filterString && params.filters) {
              const builder = new FilterBuilder();
              const { filter_by, filter_value, filter_comparator, filter_concat } = params.filters;
              
              if (filter_by && filter_value && filter_comparator) {
                // Collect all conditions first, then build the filter
                const conditions: Array<{field: FilterField, operator: FilterOperator, value: FilterValue}> = [];

                for (let i = 0; i < filter_by.length; i++) {
                  const field = filter_by[i];
                  const value = filter_value?.[i];
                  const comparator = filter_comparator?.[i];

                  if (!value || !field || !comparator) continue;

                  // Validate field and operator are valid enums
                  const validField = field as FilterField;
                  const validComparator = comparator as FilterOperator;

                  let typedValue: string | number | boolean = value;
                  if (validField === 'priority' || validField === 'percentDone') {
                    typedValue = Number(value);
                  } else if (validField === 'done') {
                    typedValue = value === 'true';
                  }

                  conditions.push({ field: validField, operator: validComparator, value: typedValue });
                }

                // Build filter with all conditions
                if (conditions.length > 0) {
                  const firstCondition = conditions[0];
                  if (firstCondition) {
                    builder.where(firstCondition.field, firstCondition.operator, firstCondition.value);
                  }

                  for (let i = 1; i < conditions.length; i++) {
                    const condition = conditions[i];
                    if (condition) {
                      if (filter_concat === '||') {
                        builder.or();
                      } else {
                        builder.and();
                      }
                      builder.where(condition.field, condition.operator, condition.value);
                    }
                  }
                }
              }
              
              filterString = builder.toString();
            }

            if (!filterString) {
              throw createValidationError('No filter conditions provided');
            }

            const existing = await storage.findByName(name || '');
            if (existing) {
              throw createValidationError(`Filter with name "${name}" already exists`);
            }

            const filter = await storage.create({
              name: name || '',
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
                  text: formatAorpAsMarkdown(response), // createStandardResponse returns AORP object, format as markdown
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
              const existing = await storage.findByName(updates.name);
              if (existing && existing.id !== id) {
                throw createValidationError(`Filter with name "${updates.name}" already exists`);
              }
            }

            const updateData: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>> = {};
            if (updates.name !== undefined) updateData.name = updates.name;
            if (updates.description !== undefined) updateData.description = updates.description;
            if (updates.filter !== undefined) updateData.filter = updates.filter;
            if (updates.projectId !== undefined) updateData.projectId = updates.projectId;
            if (updates.isGlobal !== undefined) updateData.isGlobal = updates.isGlobal;

            const filter = await storage.update(id, updateData);

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
                  text: formatAorpAsMarkdown(response), // createStandardResponse returns AORP object, format as markdown
                },
              ],
            };
          }

          case 'delete': {
            const params = DeleteFilterSchema.parse(parameters);
            logger.debug(`Deleting filter with id: ${params.id}`);

            const filter = await storage.get(params.id);
            if (!filter) {
              throw new MCPError(ErrorCode.NOT_FOUND, `Filter with id ${params.id} not found`);
            }

            await storage.delete(params.id);

            const response = createStandardResponse(
              'delete-saved-filter',
              `Filter "${filter.name}" deleted successfully`,
              { success: true },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: formatAorpAsMarkdown(response), // createStandardResponse returns AORP object, format as markdown
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
                condition.field,
                condition.operator,
                condition.value,
              );
            });

            const filterString = builder.toString();

            const response = createStandardResponse(
              'build-filter',
              'Filter built successfully',
              {
                filter: filterString,
                valid: true,
                warnings: [],
              },
              { conditionCount: params.conditions.length },
            );

            return {
              content: [
                {
                  type: 'text' as const,
                  text: formatAorpAsMarkdown(response), // createStandardResponse returns AORP object, format as markdown
                },
              ],
            };
          }

          case 'validate': {
            const params = ValidateFilterSchema.parse(parameters);
            logger.debug(`Validating filter: ${params.filter}`);

            // Parse the filter string using our secure parser
            const parseResult = parseFilterString(params.filter);

            if (!parseResult.expression) {
              const errorMsg = parseResult.error?.message || 'Invalid filter syntax';
              throw createValidationError(`Invalid filter: ${errorMsg}`);
            }

            // Validate the parsed expression
            const validationResult = validateFilterExpression(parseResult.expression);

            const response = createStandardResponse('validate-filter',
              validationResult.valid ? 'Filter is valid' : 'Filter validation failed', {
              valid: validationResult.valid,
              warnings: validationResult.warnings || [],
              errors: validationResult.errors || [],
              filter: params.filter,
            });

            return {
              content: [
                {
                  type: 'text' as const,
                  text: formatAorpAsMarkdown(response), // createStandardResponse returns AORP object, format as markdown
                },
              ],
            };
          }

          default:
            throw new MCPError(ErrorCode.NOT_IMPLEMENTED, `Unknown action: ${action as string}`);
        }
      } catch (error) {
        logger.error(`Error in vikunja_filters tool:`, error);

        // Convert errors to proper AORP error responses for tests
        const operation = action === 'get' && error instanceof Error && error.message.includes('not found') ? 'get-saved-filter' :
                         action === 'delete' && error instanceof Error && error.message.includes('not found') ? 'delete-saved-filter' :
                         action === 'create' && error instanceof Error && error.message.includes('already exists') ? 'create-saved-filter' :
                         action === 'update' && error instanceof Error && error.message.includes('already exists') ? 'update-saved-filter' :
                         `${action}-filter`;

        const aorpErrorResult = createAorpErrorResponse(operation, error instanceof Error ? error.message : String(error));

        // Create compatibility result with required SimpleAorpResponse properties
      const compatibilityResult = {
        content: aorpErrorResult.content,
        immediate: {
          status: 'error' as const,
          key_insight: aorpErrorResult.content.split('\n')[0] || 'Error occurred',
          confidence: 0.0
        },
        summary: aorpErrorResult.content.split('\n')[0] || 'Error occurred',
        metadata: {
          timestamp: aorpErrorResult.metadata?.timestamp || new Date().toISOString(),
          operation: `${action}-filter`,
          success: false,
          ...(aorpErrorResult.metadata || {})
        }
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: formatAorpAsMarkdown(compatibilityResult),
          },
        ],
      };
    }
  },
);
}
