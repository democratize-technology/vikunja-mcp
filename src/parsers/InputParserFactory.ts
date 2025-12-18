import { MCPError, ErrorCode } from '../types';
import { parseCSVLine } from './CSVParser';
import { parseJSONInput, importedTaskSchema, type ImportedTask } from './JSONParser';
import { logger } from '../utils/logger';

export interface ParseInputOptions {
  format: 'csv' | 'json';
  data: string;
  skipErrors?: boolean;
}

// Re-export ImportedTask for convenience
export type { ImportedTask } from './JSONParser';

/**
 * Factory function to parse input data based on format.
 * This centralizes format detection and parser orchestration logic.
 *
 * @param options - Parsing options including format, data, and error handling
 * @returns Array of parsed and validated ImportedTask objects
 * @throws MCPError if parsing fails or validation errors occur
 */
export function parseInputData(options: ParseInputOptions): ImportedTask[] {
  const { format, data, skipErrors = false } = options;

  // Validate input parameters
  if (!data || data.trim() === '') {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      'Input data cannot be empty'
    );
  }

  try {
    switch (format) {
      case 'json':
        return parseJSONInput(data);

      case 'csv':
        return parseCSVInput(data, skipErrors);

      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const exhaustiveCheck: never = format;
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          `Unsupported format: ${String(format)}. Supported formats are: csv, json`
        );
      }
    }
  } catch (error) {
    // Re-throw MCP errors as-is
    if (error instanceof MCPError) {
      throw error;
    }

    // Wrap other errors in MCPError
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      `Failed to parse ${format} input: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse CSV input data and return array of ImportedTask objects.
 * Extracted from batch-import.ts to improve modularity and testability.
 *
 * @param data - Raw CSV string data
 * @param skipErrors - Whether to skip invalid rows or throw an error
 * @returns Array of parsed and validated ImportedTask objects
 * @throws MCPError if CSV structure is invalid or validation fails (when skipErrors=false)
 */
function parseCSVInput(data: string, skipErrors: boolean = false): ImportedTask[] {
  const tasks: ImportedTask[] = [];

  // Split into lines and filter out empty lines
  const lines = data.split('\n').filter((line) => line.trim());
  if (lines.length < 2) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      'CSV must have at least a header row and one data row'
    );
  }

  // Parse header
  const headers = parseCSVLine(lines[0] || '');
  const requiredHeaders = ['title'];
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

  if (missingHeaders.length > 0) {
    throw new MCPError(
      ErrorCode.VALIDATION_ERROR,
      `Missing required CSV headers: ${missingHeaders.join(', ')}`
    );
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i] || '');

    // Skip empty rows
    if (values.every((value) => !value || value.trim() === '')) {
      continue;
    }

    interface TaskDataInput {
      title?: string;
      description?: string;
      done?: boolean;
      dueDate?: string;
      priority?: number;
      labels?: string[];
      assignees?: string[];
      startDate?: string;
      endDate?: string;
      hexColor?: string;
      percentDone?: number;
      repeatAfter?: number;
      repeatMode?: number;
    }

    const taskData: TaskDataInput = {};

    headers.forEach((header, index) => {
      const value = values[index];
      if (value) {
        switch (header) {
          case 'title':
            taskData.title = value;
            break;
          case 'description':
            taskData.description = value;
            break;
          case 'done':
            taskData.done = value.toLowerCase() === 'true';
            break;
          case 'dueDate':
            taskData.dueDate = value;
            break;
          case 'priority':
            taskData.priority = parseInt(value, 10);
            break;
          case 'labels':
            taskData.labels = value ? value.split(';').map((l) => l.trim()).filter((l) => l.length > 0) : [];
            logger.debug('Parsed labels from CSV', {
              rawValue: value,
              parsedLabels: taskData.labels,
            });
            break;
          case 'assignees':
            taskData.assignees = value ? value.split(';').map((a) => a.trim()).filter((a) => a.length > 0) : [];
            break;
          case 'startDate':
            taskData.startDate = value;
            break;
          case 'endDate':
            taskData.endDate = value;
            break;
          case 'hexColor':
            taskData.hexColor = value;
            break;
          case 'percentDone':
            taskData.percentDone = parseInt(value, 10);
            break;
          case 'repeatAfter':
            taskData.repeatAfter = parseInt(value, 10);
            break;
          case 'repeatMode':
            taskData.repeatMode = parseInt(value, 10);
            break;
        }
      }
    });

    try {
      const validatedTask = importedTaskSchema.parse(taskData);
      tasks.push(validatedTask);
    } catch (error) {
      if (!skipErrors) {
        throw new MCPError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid task data at row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
      // If skipErrors is true, we skip this row and continue
    }
  }

  return tasks;
}