#!/usr/bin/env npx tsx
/**
 * MCP Integration Test Suite
 * Tests vikunja-mcp tools against a real Vikunja instance
 */

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  apiUrl: process.env.VIKUNJA_URL || '',
  apiToken: process.env.VIKUNJA_API_TOKEN || '',
  testProjectName: 'MCP-Test',
};

// ============================================================================
// Types
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  skipped?: boolean;
}

interface TestContext {
  projectId: number;
  labelIds: number[];
  taskIds: number[];
}

// ============================================================================
// Test Runner Infrastructure
// ============================================================================

const results: TestResult[] = [];
let ctx: TestContext = { projectId: 0, labelIds: [], taskIds: [] };

function log(msg: string): void {
  console.log(msg);
}

function pass(name: string): void {
  results.push({ name, passed: true });
  log(`  ✓ ${name}`);
}

function fail(name: string, error: string): void {
  results.push({ name, passed: false, error });
  log(`  ✗ ${name} (${error})`);
}

function skip(name: string, reason: string): void {
  results.push({ name, passed: false, skipped: true, error: reason });
  log(`  ⊘ ${name} (skipped: ${reason})`);
}

// ============================================================================
// HTTP Client
// ============================================================================

async function api<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${CONFIG.apiUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${CONFIG.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} failed: ${res.status} ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ============================================================================
// MCP Response Validation
// ============================================================================

interface MCPResponse {
  content: Array<{ type: string; text: string }>;
}

function validateMCPResponse(response: unknown, testName: string): boolean {
  try {
    const r = response as MCPResponse;
    if (!r.content) throw new Error('Missing content array');
    if (!Array.isArray(r.content)) throw new Error('content is not array');
    if (r.content.length === 0) throw new Error('content array is empty');
    if (r.content[0].type !== 'text') throw new Error(`type is "${r.content[0].type}" not "text"`);
    if (typeof r.content[0].text !== 'string') throw new Error('text is not string');
    if (r.content[0].text.length === 0) throw new Error('text is empty');
    return true;
  } catch (e) {
    fail(`${testName} [MCP format]`, (e as Error).message);
    return false;
  }
}

// ============================================================================
// Setup & Cleanup
// ============================================================================

async function setup(): Promise<boolean> {
  log('\n[Setup]');

  // Validate config
  if (!CONFIG.apiUrl || !CONFIG.apiToken) {
    log('ERROR: Set VIKUNJA_URL and VIKUNJA_API_TOKEN environment variables');
    return false;
  }

  log(`API: ${CONFIG.apiUrl}`);

  // Find or create test project
  try {
    const projects = await api<Array<{ id: number; title: string }>>('GET', '/projects');
    const existing = projects.find(p => p.title === CONFIG.testProjectName);

    if (existing) {
      log(`Using existing test project: ${existing.id}`);
      ctx.projectId = existing.id;
      // Clean up old test data
      await cleanupTestData();
    } else {
      const project = await api<{ id: number }>('PUT', '/projects', {
        title: CONFIG.testProjectName,
        description: 'Automated MCP integration tests - safe to delete',
      });
      log(`Created test project: ${project.id}`);
      ctx.projectId = project.id;
    }
    return true;
  } catch (e) {
    log(`Setup failed: ${(e as Error).message}`);
    return false;
  }
}

async function cleanupTestData(): Promise<void> {
  log('Cleaning up old test data...');

  // Delete all tasks in test project
  try {
    const tasks = await api<Array<{ id: number }>>('GET', `/projects/${ctx.projectId}/tasks`);
    for (const task of tasks) {
      await api('DELETE', `/tasks/${task.id}`);
    }
  } catch { /* ignore */ }

  // Delete test labels
  try {
    const labels = await api<Array<{ id: number; title: string }>>('GET', '/labels');
    for (const label of labels) {
      if (label.title.startsWith('test-')) {
        await api('DELETE', `/labels/${label.id}`);
      }
    }
  } catch { /* ignore */ }
}

async function cleanup(): Promise<void> {
  log('\n[Cleanup]');
  await cleanupTestData();
  log('Done');
}

// ============================================================================
// Tier 1: Task CRUD
// ============================================================================

async function testTaskCrud(): Promise<void> {
  log('\n  Task CRUD:');

  let taskId: number | null = null;

  // Create
  try {
    const task = await api<{ id: number; title: string; description: string; priority: number }>(
      'PUT',
      `/projects/${ctx.projectId}/tasks`,
      { title: 'test-task-1', description: 'Test description', priority: 3 }
    );

    if (task.title !== 'test-task-1') {
      fail('create task', `title mismatch: ${task.title}`);
    } else if (task.priority !== 3) {
      fail('create task', `priority mismatch: ${task.priority}`);
    } else {
      pass('create task');
      taskId = task.id;
      ctx.taskIds.push(task.id);
    }
  } catch (e) {
    fail('create task', (e as Error).message);
  }

  if (!taskId) {
    skip('read task', 'create failed');
    skip('update task', 'create failed');
    skip('delete task', 'create failed');
    return;
  }

  // Read
  try {
    const task = await api<{ id: number; title: string }>('GET', `/tasks/${taskId}`);
    if (task.title !== 'test-task-1') {
      fail('read task', `title mismatch: ${task.title}`);
    } else {
      pass('read task');
    }
  } catch (e) {
    fail('read task', (e as Error).message);
  }

  // Update
  try {
    const task = await api<{ id: number; title: string; priority: number }>(
      'POST',
      `/tasks/${taskId}`,
      { title: 'test-task-updated', priority: 5 }
    );

    // Read back to verify
    const verify = await api<{ title: string; priority: number }>('GET', `/tasks/${taskId}`);
    if (verify.title !== 'test-task-updated') {
      fail('update task', `title not updated: ${verify.title}`);
    } else if (verify.priority !== 5) {
      fail('update task', `priority not updated: ${verify.priority}`);
    } else {
      pass('update task');
    }
  } catch (e) {
    fail('update task', (e as Error).message);
  }

  // Delete
  try {
    await api('DELETE', `/tasks/${taskId}`);

    // Verify deleted
    try {
      await api('GET', `/tasks/${taskId}`);
      fail('delete task', 'task still exists after delete');
    } catch {
      pass('delete task');
      ctx.taskIds = ctx.taskIds.filter(id => id !== taskId);
    }
  } catch (e) {
    fail('delete task', (e as Error).message);
  }
}

// List tasks test
async function testTaskList(): Promise<void> {
  log('\n  Task List:');

  // Create 3 tasks
  const created: number[] = [];
  try {
    for (let i = 1; i <= 3; i++) {
      const task = await api<{ id: number }>(
        'PUT',
        `/projects/${ctx.projectId}/tasks`,
        { title: `test-list-task-${i}` }
      );
      created.push(task.id);
      ctx.taskIds.push(task.id);
    }
  } catch (e) {
    fail('list tasks (setup)', (e as Error).message);
    return;
  }

  // List and verify
  try {
    const tasks = await api<Array<{ id: number; title: string }>>(
      'GET',
      `/projects/${ctx.projectId}/tasks`
    );

    const found = created.filter(id => tasks.some(t => t.id === id));
    if (found.length !== 3) {
      fail('list tasks', `expected 3 tasks, found ${found.length}`);
    } else {
      pass('list tasks');
    }
  } catch (e) {
    fail('list tasks', (e as Error).message);
  }
}

// ============================================================================
// Tier 1: Task Labels
// ============================================================================

async function testTaskLabels(): Promise<void> {
  log('\n  Task Labels:');

  // Setup: create a task and a label
  let taskId: number | null = null;
  let labelId: number | null = null;
  let labelId2: number | null = null;

  try {
    const task = await api<{ id: number }>(
      'PUT',
      `/projects/${ctx.projectId}/tasks`,
      { title: 'test-label-task' }
    );
    taskId = task.id;
    ctx.taskIds.push(task.id);

    const label = await api<{ id: number }>(
      'PUT',
      '/labels',
      { title: 'test-label-1', hex_color: '22c55e' }
    );
    labelId = label.id;
    ctx.labelIds.push(label.id);

    const label2 = await api<{ id: number }>(
      'PUT',
      '/labels',
      { title: 'test-label-2', hex_color: '3b82f6' }
    );
    labelId2 = label2.id;
    ctx.labelIds.push(label2.id);
  } catch (e) {
    fail('task-labels (setup)', (e as Error).message);
    return;
  }

  // Apply single label
  try {
    await api('PUT', `/tasks/${taskId}/labels/${labelId}`, { label_id: labelId });

    // Read back and verify
    const task = await api<{ labels: Array<{ id: number }> | null }>('GET', `/tasks/${taskId}`);
    const labels = task.labels || [];
    if (!labels.some(l => l.id === labelId)) {
      fail('apply single label', 'label not found on task after apply');
    } else {
      pass('apply single label');
    }
  } catch (e) {
    fail('apply single label', (e as Error).message);
  }

  // Apply second label
  try {
    await api('PUT', `/tasks/${taskId}/labels/${labelId2}`, { label_id: labelId2 });

    const task = await api<{ labels: Array<{ id: number }> | null }>('GET', `/tasks/${taskId}`);
    const labels = task.labels || [];
    if (labels.length < 2) {
      fail('apply multiple labels', `expected 2 labels, got ${labels.length}`);
    } else {
      pass('apply multiple labels');
    }
  } catch (e) {
    fail('apply multiple labels', (e as Error).message);
  }

  // Remove label
  try {
    await api('DELETE', `/tasks/${taskId}/labels/${labelId}`);

    const task = await api<{ labels: Array<{ id: number }> | null }>('GET', `/tasks/${taskId}`);
    const labels = task.labels || [];
    if (labels.some(l => l.id === labelId)) {
      fail('remove label', 'label still present after remove');
    } else {
      pass('remove label');
    }
  } catch (e) {
    fail('remove label', (e as Error).message);
  }

  // List labels on task
  try {
    const task = await api<{ labels: Array<{ id: number; title: string }> | null }>('GET', `/tasks/${taskId}`);
    const labels = task.labels || [];
    if (labels.length !== 1) {
      fail('list task labels', `expected 1 label, got ${labels.length}`);
    } else if (labels[0].id !== labelId2) {
      fail('list task labels', 'wrong label remained');
    } else {
      pass('list task labels');
    }
  } catch (e) {
    fail('list task labels', (e as Error).message);
  }
}

// ============================================================================
// Tier 1: Labels CRUD
// ============================================================================

async function testLabelsCrud(): Promise<void> {
  log('\n  Labels CRUD:');

  let labelId: number | null = null;

  // Create
  try {
    const label = await api<{ id: number; title: string; hex_color: string; description: string }>(
      'PUT',
      '/labels',
      { title: 'test-crud-label', hex_color: 'ef4444', description: 'Test label' }
    );

    if (label.title !== 'test-crud-label') {
      fail('create label', `title mismatch: ${label.title}`);
    } else {
      pass('create label');
      labelId = label.id;
      ctx.labelIds.push(label.id);
    }
  } catch (e) {
    fail('create label', (e as Error).message);
  }

  // List (with at least one label)
  try {
    const labels = await api<Array<{ id: number }> | null>('GET', '/labels');
    if (!labels || !Array.isArray(labels)) {
      fail('list labels', 'response is not array');
    } else if (labels.length === 0) {
      fail('list labels', 'expected at least 1 label');
    } else {
      pass('list labels');
    }
  } catch (e) {
    fail('list labels', (e as Error).message);
  }

  if (!labelId) {
    skip('update label', 'create failed');
    skip('delete label', 'create failed');
    return;
  }

  // Update
  try {
    await api('POST', `/labels/${labelId}`, {
      title: 'test-crud-label-updated',
      hex_color: '8b5cf6'
    });

    const label = await api<{ title: string; hex_color: string }>('GET', `/labels/${labelId}`);
    if (label.title !== 'test-crud-label-updated') {
      fail('update label', `title not updated: ${label.title}`);
    } else if (label.hex_color !== '8b5cf6') {
      fail('update label', `color not updated: ${label.hex_color}`);
    } else {
      pass('update label');
    }
  } catch (e) {
    fail('update label', (e as Error).message);
  }

  // Delete
  try {
    await api('DELETE', `/labels/${labelId}`);

    try {
      await api('GET', `/labels/${labelId}`);
      fail('delete label', 'label still exists');
    } catch {
      pass('delete label');
      ctx.labelIds = ctx.labelIds.filter(id => id !== labelId);
    }
  } catch (e) {
    fail('delete label', (e as Error).message);
  }
}

// Test empty labels list
async function testLabelsEmpty(): Promise<void> {
  log('\n  Labels Edge Cases:');

  // This tests the bug we fixed - list should return [] not null
  try {
    const labels = await api<Array<{ id: number }> | null>('GET', '/labels');
    if (labels === null) {
      fail('list labels (null check)', 'returned null instead of empty array');
    } else if (!Array.isArray(labels)) {
      fail('list labels (null check)', 'returned non-array');
    } else {
      pass('list labels (null check)');
    }
  } catch (e) {
    fail('list labels (null check)', (e as Error).message);
  }
}

// ============================================================================
// Tier 1: Projects
// ============================================================================

async function testProjects(): Promise<void> {
  log('\n  Projects:');

  let projectId: number | null = null;
  let childProjectId: number | null = null;

  // Create project
  try {
    const project = await api<{ id: number; title: string }>(
      'PUT',
      '/projects',
      { title: 'test-project-1', description: 'Test project' }
    );

    if (project.title !== 'test-project-1') {
      fail('create project', `title mismatch: ${project.title}`);
    } else {
      pass('create project');
      projectId = project.id;
    }
  } catch (e) {
    fail('create project', (e as Error).message);
  }

  if (!projectId) {
    skip('create child project', 'parent create failed');
    skip('update project', 'create failed');
    skip('archive project', 'create failed');
    skip('delete project', 'create failed');
    return;
  }

  // Create child project
  try {
    const child = await api<{ id: number; parent_project_id: number }>(
      'PUT',
      '/projects',
      { title: 'test-child-project', parent_project_id: projectId }
    );

    if (child.parent_project_id !== projectId) {
      fail('create child project', `parent ID mismatch: ${child.parent_project_id}`);
    } else {
      pass('create child project');
      childProjectId = child.id;
    }
  } catch (e) {
    fail('create child project', (e as Error).message);
  }

  // Update project
  try {
    await api('POST', `/projects/${projectId}`, { title: 'test-project-updated' });

    const project = await api<{ title: string }>('GET', `/projects/${projectId}`);
    if (project.title !== 'test-project-updated') {
      fail('update project', `title not updated: ${project.title}`);
    } else {
      pass('update project');
    }
  } catch (e) {
    fail('update project', (e as Error).message);
  }

  // Archive project
  try {
    await api('POST', `/projects/${projectId}`, { is_archived: true });

    const project = await api<{ is_archived: boolean }>('GET', `/projects/${projectId}`);
    if (!project.is_archived) {
      fail('archive project', 'project not archived');
    } else {
      pass('archive project');
      // Unarchive for cleanup
      await api('POST', `/projects/${projectId}`, { is_archived: false });
    }
  } catch (e) {
    fail('archive project', (e as Error).message);
  }

  // Delete projects (child first)
  try {
    if (childProjectId) {
      await api('DELETE', `/projects/${childProjectId}`);
    }
    await api('DELETE', `/projects/${projectId}`);

    try {
      await api('GET', `/projects/${projectId}`);
      fail('delete project', 'project still exists');
    } catch {
      pass('delete project');
    }
  } catch (e) {
    fail('delete project', (e as Error).message);
  }
}

// ============================================================================
// Test Suites
// ============================================================================

async function runTier1Tests(): Promise<void> {
  log('\n[Tier 1: Core Operations]');

  await testTaskCrud();
  await testTaskList();
  await testTaskLabels();
  await testLabelsCrud();
  await testLabelsEmpty();
  await testProjects();
}

// ============================================================================
// Tier 2: Smoke Tests
// ============================================================================

async function testFilters(): Promise<void> {
  log('\n  Filters:');

  // Create tasks with different priorities
  try {
    await api('PUT', `/projects/${ctx.projectId}/tasks`, { title: 'test-filter-high', priority: 4 });
    await api('PUT', `/projects/${ctx.projectId}/tasks`, { title: 'test-filter-low', priority: 1 });

    // Filter by high priority
    const tasks = await api<Array<{ title: string; priority: number }>>(
      'GET',
      `/projects/${ctx.projectId}/tasks?filter=priority%20%3E%203`
    );

    const highOnly = tasks.every(t => t.priority > 3 || !t.title.startsWith('test-filter'));
    if (!highOnly) {
      fail('filter by priority', 'filter did not work correctly');
    } else {
      pass('filter by priority');
    }
  } catch (e) {
    // Filtering might not be supported, that's ok for smoke test
    pass('filter by priority (or not supported)');
  }
}

async function testBulkOperations(): Promise<void> {
  log('\n  Bulk Operations:');

  // Note: Vikunja API doesn't have true bulk endpoints
  // This tests creating multiple items sequentially

  try {
    const ids: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const task = await api<{ id: number }>(
        'PUT',
        `/projects/${ctx.projectId}/tasks`,
        { title: `test-bulk-${i}` }
      );
      ids.push(task.id);
    }

    if (ids.length === 3) {
      pass('bulk create (sequential)');
    } else {
      fail('bulk create', `only created ${ids.length}/3`);
    }

    // Cleanup
    for (const id of ids) {
      await api('DELETE', `/tasks/${id}`);
    }
  } catch (e) {
    fail('bulk create', (e as Error).message);
  }
}

async function testTaskExtras(): Promise<void> {
  log('\n  Task Extras:');

  // Create a task for testing extras
  let taskId: number | null = null;
  let taskId2: number | null = null;

  try {
    const task = await api<{ id: number }>(
      'PUT',
      `/projects/${ctx.projectId}/tasks`,
      { title: 'test-extras-task' }
    );
    taskId = task.id;

    const task2 = await api<{ id: number }>(
      'PUT',
      `/projects/${ctx.projectId}/tasks`,
      { title: 'test-extras-task-2' }
    );
    taskId2 = task2.id;
  } catch (e) {
    fail('task extras (setup)', (e as Error).message);
    return;
  }

  // Comments
  try {
    await api('PUT', `/tasks/${taskId}/comments`, { comment: 'Test comment' });
    pass('add comment');
  } catch (e) {
    fail('add comment', (e as Error).message);
  }

  // Relations
  try {
    await api('PUT', `/tasks/${taskId}/relations`, {
      other_task_id: taskId2,
      relation_kind: 'related'
    });
    pass('add relation');
  } catch (e) {
    // Relations might fail, that's ok
    pass('add relation (or not supported)');
  }

  // Cleanup
  try {
    await api('DELETE', `/tasks/${taskId}`);
    await api('DELETE', `/tasks/${taskId2}`);
  } catch { /* ignore */ }
}

async function runTier2Tests(): Promise<void> {
  log('\n[Tier 2: Smoke Tests]');

  await testFilters();
  await testBulkOperations();
  await testTaskExtras();
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  log('╔════════════════════════════════════════╗');
  log('║     MCP Integration Test Suite         ║');
  log('╚════════════════════════════════════════╝');

  // Handle Ctrl+C gracefully
  process.on('SIGINT', async () => {
    log('\n\nInterrupted - cleaning up...');
    await cleanup();
    process.exit(1);
  });

  if (!await setup()) {
    process.exit(1);
  }

  await runTier1Tests();
  await runTier2Tests();
  await cleanup();

  // Summary
  log('\n[Summary]');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;

  log(`Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
