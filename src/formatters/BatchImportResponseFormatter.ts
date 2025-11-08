/**
 * BatchImportResponseFormatter - Handles formatting of batch import results
 *
 * This module is responsible for formatting the response text for batch import operations,
 * including success/failure summaries, warnings, errors, and authentication issues.
 *
 * Refactored from src/tools/batch-import.ts to improve separation of concerns and testability.
 */

export interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{
    index: number;
    title: string;
    error: string;
  }>;
  createdTasks: Array<{
    id: number;
    title: string;
  }>;
  warnings?: Array<{
    taskId: number;
    title: string;
    warning: string;
  }>;
}

export interface FormatterOptions {
  userFetchFailedDueToAuth: boolean;
  hasAssignees: boolean;
}

/**
 * Formats batch import results into a user-friendly text response
 */
export class BatchImportResponseFormatter {
  /**
   * Format the complete batch import result
   *
   * @param result - The import result to format
   * @param userFetchFailedDueToAuth - Whether user fetching failed due to authentication
   * @param hasAssignees - Whether any tasks have assignees
   * @returns Formatted response text
   */
  formatResult(
    result: ImportResult,
    userFetchFailedDueToAuth: boolean = false,
    hasAssignees: boolean = false
  ): string {
    let responseText = '';

    // Add success/failure summary
    responseText += this.formatSummary(result);

    // Add authentication warning if applicable
    responseText += this.formatAuthWarning(userFetchFailedDueToAuth, hasAssignees);

    // Add created tasks list
    responseText += this.formatCreatedTasks(result);

    // Add warnings if any
    responseText += this.formatWarnings(result);

    // Add errors if any
    responseText += this.formatErrors(result);

    return responseText;
  }

  /**
   * Format the success/failure summary section
   *
   * @param result - The import result
   * @returns Summary text
   */
  private formatSummary(result: ImportResult): string {
    let summary = `Import completed:\n`;
    summary += `- Successfully imported: ${result.success} tasks\n`;
    summary += `- Failed: ${result.failed} tasks\n`;
    return summary;
  }

  /**
   * Format authentication warning if users couldn't be fetched
   *
   * @param userFetchFailedDueToAuth - Whether user fetching failed due to authentication
   * @param hasAssignees - Whether any tasks have assignees
   * @returns Authentication warning text or empty string
   */
  private formatAuthWarning(userFetchFailedDueToAuth: boolean, hasAssignees: boolean): string {
    if (userFetchFailedDueToAuth && hasAssignees) {
      let warning = `\n⚠️  Warning: Could not fetch users due to Vikunja API authentication issue.\n`;
      warning += `   Assignees were skipped for all tasks.\n`;
      return warning;
    }
    return '';
  }

  /**
   * Format the created tasks section
   *
   * @param result - The import result
   * @returns Created tasks text or empty string
   */
  private formatCreatedTasks(result: ImportResult): string {
    if (result.createdTasks.length > 0) {
      let createdTasks = `\nCreated tasks:\n`;
      result.createdTasks.forEach((task) => {
        createdTasks += `- #${task.id}: ${task.title}\n`;
      });
      return createdTasks;
    }
    return '';
  }

  /**
   * Format the warnings section
   *
   * @param result - The import result
   * @returns Warnings text or empty string
   */
  private formatWarnings(result: ImportResult): string {
    if (result.warnings && result.warnings.length > 0) {
      let warnings = `\n⚠️  Warnings:\n`;
      result.warnings.forEach((warning) => {
        warnings += `- Task #${warning.taskId} (${warning.title}): ${warning.warning}\n`;
      });
      return warnings;
    }
    return '';
  }

  /**
   * Format the errors section
   *
   * @param result - The import result
   * @returns Errors text or empty string
   */
  private formatErrors(result: ImportResult): string {
    if (result.errors.length > 0) {
      let errors = `\nErrors:\n`;
      result.errors.forEach((error) => {
        errors += `- Row ${error.index + 1} (${error.title}): ${error.error}\n`;
      });
      return errors;
    }
    return '';
  }

  /**
   * Format result using options object for convenience
   *
   * @param result - The import result
   * @param options - Formatting options
   * @returns Formatted response text
   */
  formatResultWithOptions(result: ImportResult, options: FormatterOptions): string {
    return this.formatResult(result, options.userFetchFailedDueToAuth, options.hasAssignees);
  }
}