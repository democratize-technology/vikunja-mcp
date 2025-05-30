/**
 * Tests for handler index exports
 */

describe('Task handlers index', () => {
  it('should export all handler functions', () => {
    const handlers = require('../../../../src/tools/tasks/handlers/index');
    
    // Verify all exports are present
    expect(handlers.handleCreateTask).toBeDefined();
    expect(handlers.handleListTasks).toBeDefined();
    expect(handlers.handleUpdateTask).toBeDefined();
    expect(handlers.handleDeleteTask).toBeDefined();
    expect(handlers.handleBulkCreateTasks).toBeDefined();
    expect(handlers.handleBulkUpdateTasks).toBeDefined();
    expect(handlers.handleBulkDeleteTasks).toBeDefined();
    
    // Verify they are functions
    expect(typeof handlers.handleCreateTask).toBe('function');
    expect(typeof handlers.handleListTasks).toBe('function');
    expect(typeof handlers.handleUpdateTask).toBe('function');
    expect(typeof handlers.handleDeleteTask).toBe('function');
    expect(typeof handlers.handleBulkCreateTasks).toBe('function');
    expect(typeof handlers.handleBulkUpdateTasks).toBe('function');
    expect(typeof handlers.handleBulkDeleteTasks).toBe('function');
  });
});