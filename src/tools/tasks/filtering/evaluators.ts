/**
 * Filter evaluation functions for tasks
 */

import type { Task } from 'node-vikunja';
import type { FilterCondition, FilterGroup, FilterExpression } from '../../../types/filters';

/**
 * Evaluates a filter condition against a task
 */
export function evaluateCondition(task: Task, condition: FilterCondition): boolean {
  const { field, operator, value } = condition;

  switch (field) {
    case 'done':
      return evaluateComparison(task.done, operator, value === true || value === 'true');

    case 'priority':
      return evaluateComparison(task.priority || 0, operator, Number(value));

    case 'percentDone':
      return evaluateComparison(task.percent_done || 0, operator, Number(value));

    case 'dueDate':
      if (!task.due_date) {
        // Null due dates are only matched by != operator
        return operator === '!=';
      }
      return evaluateDateComparison(task.due_date, operator, String(value));

    case 'created':
      if (!task.created) return false;
      return evaluateDateComparison(task.created, operator, String(value));

    case 'updated':
      if (!task.updated) return false;
      return evaluateDateComparison(task.updated, operator, String(value));

    case 'title':
      return evaluateStringComparison(task.title, operator, String(value));

    case 'description':
      return evaluateStringComparison(task.description || '', operator, String(value));

    case 'assignees':
      return evaluateArrayComparison(
        task.assignees?.map((a) => a.id) || [],
        operator,
        Array.isArray(value) ? value.map((v) => Number(v)) : [Number(value)],
      );

    case 'labels':
      return evaluateArrayComparison(
        task.labels?.map((l) => l.id).filter((id): id is number => id !== undefined) || [],
        operator,
        Array.isArray(value) ? value.map((v) => Number(v)) : [Number(value)],
      );

    default:
      return false;
  }
}

/**
 * Evaluates comparison operators
 */
export function evaluateComparison(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case '=':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
      return Number(actual) > Number(expected);
    case '>=':
      return Number(actual) >= Number(expected);
    case '<':
      return Number(actual) < Number(expected);
    case '<=':
      return Number(actual) <= Number(expected);
    default:
      return false;
  }
}

/**
 * Evaluates date comparisons (supports relative dates like "now+7d")
 */
export function evaluateDateComparison(actual: string, operator: string, expected: string): boolean {
  const actualDate = new Date(actual);
  const expectedDate = parseRelativeDate(expected);

  if (!expectedDate) return false;

  switch (operator) {
    case '=':
      // For date equality, compare only the date part
      return actualDate.toDateString() === expectedDate.toDateString();
    case '!=':
      return actualDate.toDateString() !== expectedDate.toDateString();
    case '>':
      return actualDate > expectedDate;
    case '>=':
      return actualDate >= expectedDate;
    case '<':
      return actualDate < expectedDate;
    case '<=':
      return actualDate <= expectedDate;
    default:
      return false;
  }
}

/**
 * Parses relative date strings (e.g., "now+7d", "now-1w")
 */
export function parseRelativeDate(dateStr: string): Date | null {
  // ISO date format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return new Date(dateStr);
  }

  // Relative date format
  const relativeMatch = dateStr.match(/^now([+-]\d+)([smhdwMy])?$/);
  if (relativeMatch && relativeMatch[1]) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2] || 'd';
    const now = new Date();

    switch (unit) {
      case 's':
        now.setSeconds(now.getSeconds() + amount);
        break;
      case 'm':
        now.setMinutes(now.getMinutes() + amount);
        break;
      case 'h':
        now.setHours(now.getHours() + amount);
        break;
      case 'd':
        now.setDate(now.getDate() + amount);
        break;
      case 'w':
        now.setDate(now.getDate() + amount * 7);
        break;
      case 'M':
        now.setMonth(now.getMonth() + amount);
        break;
      case 'y':
        now.setFullYear(now.getFullYear() + amount);
        break;
    }

    return now;
  }

  // "now" without offset
  if (dateStr === 'now') {
    return new Date();
  }

  return null;
}

/**
 * Evaluates string comparisons
 */
export function evaluateStringComparison(actual: string, operator: string, expected: string): boolean {
  switch (operator) {
    case '=':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case 'like':
      // Simple pattern matching - case insensitive
      return actual.toLowerCase().includes(expected.toLowerCase());
    default:
      return false;
  }
}

/**
 * Evaluates array comparisons (for assignees and labels)
 */
export function evaluateArrayComparison(actual: number[], operator: string, expected: number[]): boolean {
  switch (operator) {
    case 'in':
      // Check if any expected value is in the actual array
      return expected.some((e) => actual.includes(e));
    case 'not in':
      // Check if none of the expected values are in the actual array
      return !expected.some((e) => actual.includes(e));
    default:
      return false;
  }
}

/**
 * Evaluates a filter group against a task
 */
export function evaluateGroup(task: Task, group: FilterGroup): boolean {
  if (group.operator === '&&') {
    return group.conditions.every((condition) => evaluateCondition(task, condition));
  } else {
    return group.conditions.some((condition) => evaluateCondition(task, condition));
  }
}

/**
 * Applies a filter expression to a list of tasks
 */
export function applyFilter(tasks: Task[], expression: FilterExpression): Task[] {
  return tasks.filter((task) => {
    const groupOperator = expression.operator || '&&';

    if (groupOperator === '&&') {
      return expression.groups.every((group) => evaluateGroup(task, group));
    } else {
      return expression.groups.some((group) => evaluateGroup(task, group));
    }
  });
}