/**
 * Helper for replacing the full label set of a task.
 */

import type { VikunjaClient } from 'node-vikunja';

/**
 * Replace all labels on a task via `POST /tasks/{id}/labels/bulk`.
 *
 * node-vikunja types this endpoint's body as `{ label_ids: number[] }`, but
 * current Vikunja silently ignores that field: it responds `201` and persists
 * nothing. Vikunja actually requires `{ labels: [{ id }, ...] }`. We send the
 * shape Vikunja accepts; the cast is required because node-vikunja's
 * `LabelTaskBulk` type does not describe it.
 *
 * The endpoint has replace semantics — the task's labels become exactly
 * `labelIds` (passing `[]` clears every label).
 */
export async function setTaskLabels(
  client: VikunjaClient,
  taskId: number,
  labelIds: number[],
): Promise<void> {
  const body = { labels: labelIds.map((id) => ({ id })) };
  await client.tasks.updateTaskLabels(
    taskId,
    body as unknown as Parameters<VikunjaClient['tasks']['updateTaskLabels']>[1],
  );
}
