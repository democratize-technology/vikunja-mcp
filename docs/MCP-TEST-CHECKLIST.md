# MCP Test Checklist

Use this checklist with Claude Code to manually verify all MCP tools work correctly.

## Setup

Before starting, verify MCP connection:

```
Use vikunja_auth status to check connection
```

Expected: Shows authenticated with API URL

---

## Tier 1: Core Operations

### Task CRUD

- [ ] **Create task**
  ```
  Use vikunja_task_crud to create a task with title "Test Task 1", description "Testing", priority high in the MCP-Test project
  ```
  Verify: Response shows task created with correct fields

- [ ] **Read task**
  ```
  Use vikunja_task_crud to get the task you just created by ID
  ```
  Verify: Returns same title, description, priority

- [ ] **Update task**
  ```
  Use vikunja_task_crud to update that task's title to "Test Task Updated" and priority to urgent
  ```
  Verify: Read it back, changes persisted

- [ ] **Delete task**
  ```
  Use vikunja_task_crud to delete that task
  ```
  Verify: Getting the task by ID returns error

- [ ] **List tasks**
  ```
  Create 3 tasks, then use vikunja_task_crud to list tasks in the project
  ```
  Verify: All 3 appear in list

### Task Labels

- [ ] **Apply label**
  ```
  Create a task and a label, then use vikunja_task_labels to apply the label to the task
  ```
  Verify: Get task, label appears in labels array

- [ ] **Apply multiple labels**
  ```
  Apply a second label to the same task
  ```
  Verify: Task now has both labels

- [ ] **Remove label**
  ```
  Use vikunja_task_labels to remove one label
  ```
  Verify: Only one label remains

- [ ] **List task labels**
  ```
  Use vikunja_task_labels list-labels on the task
  ```
  Verify: Shows remaining label

### Labels CRUD

- [ ] **Create label**
  ```
  Use vikunja_labels create with title "test-label", color #22c55e
  ```
  Verify: Label created with correct fields

- [ ] **List labels**
  ```
  Use vikunja_labels list
  ```
  Verify: Returns array (not null), includes created label

- [ ] **Update label**
  ```
  Use vikunja_labels update to change title and color
  ```
  Verify: Changes persisted on read-back

- [ ] **Delete label**
  ```
  Use vikunja_labels delete
  ```
  Verify: Label no longer in list

### Projects

- [ ] **Create project**
  ```
  Use vikunja_projects create with title "Test Project"
  ```
  Verify: Project appears in list

- [ ] **Create child project**
  ```
  Use vikunja_projects create with parentProjectId set to the project above
  ```
  Verify: Child project has correct parent

- [ ] **Update project**
  ```
  Use vikunja_projects update to change title
  ```
  Verify: Title changed on read-back

- [ ] **Archive project**
  ```
  Use vikunja_projects archive
  ```
  Verify: Project shows as archived

- [ ] **Delete project**
  ```
  Use vikunja_projects delete (delete child first)
  ```
  Verify: Project no longer exists

---

## Tier 2: Smoke Tests

### Filters

- [ ] **Build filter**
  ```
  Use vikunja_filters build for priority = high
  ```
  Verify: Returns valid filter string

- [ ] **List with filter**
  ```
  Create tasks with different priorities, list with filter
  ```
  Verify: Only matching tasks returned

### Bulk Operations

- [ ] **Bulk create**
  ```
  Use vikunja_task_bulk bulk-create to create 3 tasks
  ```
  Verify: All 3 created

### Task Extras

- [ ] **Add comment**
  ```
  Use vikunja_task_comments to add a comment
  ```
  Verify: Comment appears on task

- [ ] **Add relation**
  ```
  Use vikunja_task_relations to relate two tasks
  ```
  Verify: Relation exists

---

## Cleanup

After testing:
```
Delete all test projects, labels, and tasks created during testing
```
