/**
 * Task-specific type definitions
 */

import type { GetTasksParams } from 'node-vikunja';

// TODO: Remove this interface once node-vikunja adds the 'filter' property to GetTasksParams
// See: https://github.com/your-org/node-vikunja/issues/XXX (create issue)
export interface FilterParams extends GetTasksParams {
  filter?: string;
}