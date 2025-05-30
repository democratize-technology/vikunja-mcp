/**
 * Constants for task operations
 */

// Error message constants
export const AUTH_ERROR_MESSAGES = {
  NOT_AUTHENTICATED: 'Authentication required. Please authenticate with Vikunja first.',
  ASSIGNEE_CREATE:
    'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation. The task was created but assignees could not be added.',
  ASSIGNEE_UPDATE:
    'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation. Other task fields were updated but assignees could not be changed.',
  ASSIGNEE_ASSIGN:
    'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation that prevents assigning users to tasks.',
  ASSIGNEE_REMOVE:
    'Assignee removal operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation that prevents removing users from tasks.',
  ASSIGNEE_REMOVE_PARTIAL:
    'Assignee removal operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation. New assignees were added but old assignees could not be removed.',
  ASSIGNEE_BULK_UPDATE:
    'Assignee operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation that prevents bulk updating assignees.',
  LABEL_CREATE:
    'Label operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation. The task was created but labels could not be added.',
  LABEL_UPDATE:
    'Label operations may have authentication issues with certain Vikunja API versions. ' +
    'This is a known limitation. Other task fields were updated but labels could not be changed.',
};

// Bulk operation constants
export const BULK_OPERATION_BATCH_SIZE = 10;
export const MAX_BULK_OPERATION_TASKS = 100;