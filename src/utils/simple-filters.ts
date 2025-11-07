/**
 * Simple filtering utilities
 * Replaces the over-engineered 6-class filtering system with 2 simple functions
 */

import type { Task } from 'node-vikunja';

// Allowed fields for filtering to prevent injection
const ALLOWED_FIELDS = new Set([
  'id', 'title', 'description', 'done', 'priority', 'due_date', 'dueDate',
  'created', 'updated', 'project_id', 'projectId', 'labels', 'assignees',
  'percent_done', 'reminder_dates', 'start_date', 'end_date', 'done_at'
]);

export interface SimpleFilter {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'like' | 'in' | 'not in';
  value: unknown;
}

/**
 * Parses a simple filter string into a filter object
 * Supports basic field-operator-value syntax with security validation
 */
export function parseSimpleFilter(filterStr: string): SimpleFilter | null {
  if (!filterStr || typeof filterStr !== 'string') {
    return null;
  }

  const trimmed = filterStr.trim();
  if (!trimmed || trimmed.length > 1000) { // Prevent DoS with very long filters
    return null;
  }

  // Match pattern: field operator value with strict validation
  // Only allows alphanumeric fields and basic operators
  const filterRegex = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*(=|!=|>=|<=|>|<|like|in|not in)\s*(.+)$/;
  const match = trimmed.match(filterRegex);

  if (!match) {
    return null;
  }

  const [, field, operator, rawValue] = match;

  // Validate field name against allowlist
  if (!ALLOWED_FIELDS.has(field)) {
    return null;
  }

  // Parse the value based on its format with strict validation
  let value: unknown = rawValue;

  // Handle quoted strings (max length to prevent DoS)
  if (rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length <= 502) {
    value = rawValue.slice(1, -1);
  }
  // Handle arrays [1, 2, 3] (max array size to prevent DoS)
  else if (rawValue.startsWith('[') && rawValue.endsWith(']') && rawValue.length <= 200) {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed) && parsed.length <= 100) {
        value = parsed;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }
  // Handle boolean values
  else if (rawValue === 'true') {
    value = true;
  } else if (rawValue === 'false') {
    value = false;
  }
  // Handle null
  else if (rawValue === 'null') {
    value = null;
  }
  // Handle numbers (prevent giant numbers)
  else if (/^-?\d{1,10}$/.test(rawValue)) {
    const num = parseInt(rawValue, 10);
    if (Math.abs(num) <= 2147483647) { // 32-bit int limit
      value = num;
    } else {
      return null;
    }
  }
  // Handle dates (YYYY-MM-DD format with validation)
  else if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    const date = new Date(rawValue + 'T00:00:00.000Z');
    // Validate reasonable date range (1900-2100)
    if (date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
      value = date;
    } else {
      return null;
    }
  } else {
    // Reject any other value format
    return null;
  }

  return {
    field,
    operator: operator as SimpleFilter['operator'],
    value
  };
}

/**
 * Applies a filter to an array of tasks
 * Returns tasks that match the filter criteria
 */
export function applyClientSideFilter(tasks: Task[], filter: SimpleFilter | null): Task[] {
  if (!filter) {
    return tasks;
  }

  return tasks.filter(task => {
    const taskValue = getTaskFieldValue(task, filter.field);
    return evaluateCondition(taskValue, filter.operator, filter.value);
  });
}

/**
 * Gets a field value from a task, supporting nested properties
 */
function getTaskFieldValue(task: Task, field: string): unknown {
  // Handle direct properties
  if (field in task) {
    const value = (task as any)[field];

    // Convert date strings to Date objects
    if (field === 'due_date' && value) {
      return new Date(value);
    }
    if (field === 'created' && value) {
      return new Date(value);
    }
    if (field === 'updated' && value) {
      return new Date(value);
    }

    return value;
  }

  // Handle common nested properties (snake_case to camelCase mapping)
  if (field === 'projectId' && task.project_id) {
    return task.project_id;
  }

  if (field === 'dueDate' && task.due_date) {
    return new Date(task.due_date);
  }

  if (field === 'created' && task.created) {
    return new Date(task.created);
  }

  if (field === 'updated' && task.updated) {
    return new Date(task.updated);
  }

  return null;
}

/**
 * Evaluates a single filter condition
 */
function evaluateCondition(
  taskValue: unknown,
  operator: SimpleFilter['operator'],
  filterValue: unknown
): boolean {
  // Handle null comparisons
  if (filterValue === null) {
    if (operator === '=') {
      return taskValue === null || taskValue === undefined;
    }
    if (operator === '!=') {
      return taskValue !== null && taskValue !== undefined;
    }
  }

  // Handle array operators
  if (operator === 'in' || operator === 'not in') {
    if (!Array.isArray(filterValue)) {
      return false;
    }
    const isInArray = Array.isArray(taskValue)
      ? taskValue.some(item => filterValue.includes(item))
      : filterValue.includes(taskValue);

    return operator === 'in' ? isInArray : !isInArray;
  }

  // Handle string operations
  if (operator === 'like') {
    if (typeof taskValue !== 'string' || typeof filterValue !== 'string') {
      return false;
    }
    return taskValue.toLowerCase().includes(filterValue.toLowerCase());
  }

  // Handle comparison operations
  return evaluateComparison(taskValue, operator, filterValue);
}

/**
 * Evaluates comparison operators (=, !=, >, <, >=, <=)
 */
function evaluateComparison(
  taskValue: unknown,
  operator: SimpleFilter['operator'],
  filterValue: unknown
): boolean {
  // Handle null values for comparisons
  if (taskValue === null || taskValue === undefined) {
    if (filterValue === null) {
      return operator === '=' || operator === '>=';
    }
    // For comparison operators, null values don't match (except for specific cases)
    if (operator === '!=') {
      return true;
    }
    return false;
  }

  if (filterValue === null) {
    if (operator === '!=' || operator === '>') {
      return true;
    }
    return false;
  }

  // Convert to appropriate types for comparison
  let left = taskValue;
  let right = filterValue;

  // Handle dates
  if (left instanceof Date && right instanceof Date) {
    switch (operator) {
      case '=': return left.getTime() === right.getTime();
      case '!=': return left.getTime() !== right.getTime();
      case '>': return left.getTime() > right.getTime();
      case '<': return left.getTime() < right.getTime();
      case '>=': return left.getTime() >= right.getTime();
      case '<=': return left.getTime() <= right.getTime();
    }
  }

  // Handle numeric comparisons
  const leftNum = Number(left);
  const rightNum = Number(right);

  if (!isNaN(leftNum) && !isNaN(rightNum)) {
    switch (operator) {
      case '=': return leftNum === rightNum;
      case '!=': return leftNum !== rightNum;
      case '>': return leftNum > rightNum;
      case '<': return leftNum < rightNum;
      case '>=': return leftNum >= rightNum;
      case '<=': return leftNum <= rightNum;
    }
  }

  // Handle string comparison
  const leftStr = String(left || '');
  const rightStr = String(right || '');

  switch (operator) {
    case '=': return leftStr === rightStr;
    case '!=': return leftStr !== rightStr;
    case '>': return leftStr > rightStr;
    case '<': return leftStr < rightStr;
    case '>=': return leftStr >= rightStr;
    case '<=': return leftStr <= rightStr;
  }

  return false;
}