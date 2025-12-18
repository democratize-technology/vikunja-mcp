/**
 * Entity Resolver Service
 *
 * Handles label and user resolution for batch import operations.
 * This service encapsulates the complex logic for fetching entities from the Vikunja API,
 * handling authentication errors, and creating name-to-ID mappings.
 */

import { logger } from '../utils/logger';
import { isAuthenticationError } from '../utils/auth-error-handler';
import type { VikunjaClient, Label, User } from 'node-vikunja';

/**
 * Result of entity resolution operations
 */
export interface EntityResolutionResult {
  /** Map of lowercase label names to label IDs */
  labelMap: Map<string, number>;
  /** Map of lowercase usernames to user IDs */
  userMap: Map<string, number>;
  /** Whether user fetch failed due to known authentication issues */
  userFetchFailedDueToAuth: boolean;
  /** Raw labels array for reference */
  projectLabels: Label[];
  /** Raw users array for reference */
  projectUsers: User[];
}

/**
 * Entity Resolver service for mapping label and user names to IDs
 */
export class EntityResolver {
  /**
   * Fetches labels and users from the Vikunja API and creates resolution maps
   *
   * This method handles the complex logic of:
   * - Fetching labels with robust error handling for malformed responses
   * - Fetching users with special handling for known Vikunja API authentication issues
   * - Creating case-insensitive name-to-ID mappings
   * - Providing comprehensive logging for debugging
   *
   * @param client - The Vikunja API client to use for fetching entities
   * @returns Promise resolving to entity resolution results
   */
  async resolveEntities(client: VikunjaClient): Promise<EntityResolutionResult> {
    // Initialize default result
    const result: EntityResolutionResult = {
      labelMap: new Map(),
      userMap: new Map(),
      userFetchFailedDueToAuth: false,
      projectLabels: [],
      projectUsers: [],
    };

    // Fetch labels with comprehensive error handling
    await this.fetchLabels(client, result);

    // Fetch users with authentication error handling
    await this.fetchUsers(client, result);

    // Create the resolution maps
    this.createResolutionMaps(result);

    // Log the final result for debugging
    logger.debug('Label and user maps created', {
      labelMapSize: result.labelMap.size,
      labelMapEntries: Array.from(result.labelMap.entries()),
      userMapSize: result.userMap.size,
    });

    return result;
  }

  /**
   * Fetch labels from the API with robust error handling
   *
   * Handles multiple edge cases:
   * - null/undefined responses
   * - Non-array responses
   * - Network errors
   * - Auth errors (less common for labels than users)
   *
   * @param client - The Vikunja API client
   * @param result - The result object to update with fetched labels
   */
  private async fetchLabels(
    client: VikunjaClient,
    result: EntityResolutionResult
  ): Promise<void> {
    try {
      const labelsResponse = await client.labels.getLabels({});

      // Handle potential null/undefined response
      if (!labelsResponse) {
        logger.warn('Labels response is null/undefined');
        result.projectLabels = [];
        return;
      }

      // Handle non-array responses
      if (!Array.isArray(labelsResponse)) {
        logger.warn('Labels response is not an array', {
          responseType: typeof labelsResponse,
          response: labelsResponse,
        });
        result.projectLabels = [];
        return;
      }

      // Valid response
      result.projectLabels = labelsResponse;
      logger.debug('Labels fetched', {
        count: result.projectLabels.length,
        labels: result.projectLabels.map((l): { id: number; title: string } => ({ id: l.id ?? 0, title: l.title })),
      });
    } catch (error) {
      logger.error('Failed to fetch labels', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      result.projectLabels = [];
      // Continue without labels mapping
    }
  }

  /**
   * Fetch users from the API with authentication error handling
   *
   * KNOWN VIKUNJA API ISSUE: Users endpoint often fails with API tokens.
   * This is not a bug in our code - it's a documented Vikunja API limitation.
   *
   * @param client - The Vikunja API client
   * @param result - The result object to update with fetched users
   */
  private async fetchUsers(
    client: VikunjaClient,
    result: EntityResolutionResult
  ): Promise<void> {
    try {
      const usersResponse = await client.users.getUsers({});
      result.projectUsers = usersResponse || [];
      logger.debug('Users fetched', { count: result.projectUsers.length });
    } catch (error) {
      // This is a known limitation with Vikunja API authentication
      if (isAuthenticationError(error)) {
        logger.warn(
          'Cannot fetch users due to known Vikunja API authentication issue. Assignees will be skipped.',
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        result.userFetchFailedDueToAuth = true;
        // Continue without user mapping - assignees will be ignored
      } else {
        // Some other error - log but continue
        logger.warn('Failed to fetch users', { error });
      }
      result.projectUsers = [];
    }
  }

  /**
   * Create case-insensitive resolution maps from fetched entities
   *
   * This method is more defensive than the original batch-import.ts implementation.
   * The original code would crash on undefined/null titles, but this implementation
   * handles edge cases gracefully by converting them to unique string representations.
   *
   * @param result - The result object to update with resolution maps
   */
  private createResolutionMaps(result: EntityResolutionResult): void {
    // Create case-insensitive label name to ID map
    result.labelMap = new Map(
      (result.projectLabels || [])
        .filter((label): label is Label & { id: number } => label !== null && label.id !== null)
        .map((label) => {
          let key: string;
          if (!('title' in label)) {
            key = '[missing]';
          } else if (label.title === null) {
            key = '[null]';
          } else if (label.title === undefined) {
            key = '[undefined]';
          } else {
            key = String(label.title).toLowerCase();
          }
          return [key, label.id];
        })
    );

    // Create case-insensitive username to ID map
    result.userMap = new Map(
      (result.projectUsers || [])
        .filter((user): user is User & { id: number } => user !== null && user.id !== null)
        .map((user) => {
          let key: string;
          if (!('username' in user)) {
            key = '[missing]';
          } else if (user.username === null) {
            key = '[null]';
          } else if (user.username === undefined) {
            key = '[undefined]';
          } else {
            key = String(user.username).toLowerCase();
          }
          return [key, user.id];
        })
    );
  }
}