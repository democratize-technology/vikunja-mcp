/**
 * Task-specific type definitions
 */

import type { GetTasksParams } from 'node-vikunja';

/**
 * TODO: Remove this interface once node-vikunja adds the 'filter' property to GetTasksParams
 * 
 * TRACKING:
 * - Current node-vikunja version: 0.4.0 (checked 2025-08-17)
 * - Issue status: Needs to be created in upstream repository
 * - Upstream repo: https://github.com/JulianBerger/node-vikunja
 * - Review quarterly for new releases
 * 
 * REMOVAL CRITERIA:
 * - node-vikunja GetTasksParams includes 'filter?: string'
 * - Update imports to use upstream type directly
 * - Remove this file if no other task-specific types needed
 */
export interface FilterParams extends GetTasksParams {
  filter?: string;
}