#!/usr/bin/env node

// Simple test to debug the PersistentFilterStorage initialization issue

const { PersistentFilterStorage } = require('./dist/storage/PersistentFilterStorage');
const { randomUUID } = require('crypto');

async function testInit() {
  console.log('Starting initialization test...');

  try {
    // Mock environment
    process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
    process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = '/tmp/debug-test.db';

    console.log('Creating PersistentFilterStorage...');
    const storage = new PersistentFilterStorage(randomUUID(), 'test-user', 'https://test.vikunja.io');

    console.log('PersistentFilterStorage created successfully');
    console.log('Testing simple operation...');

    // This should trigger initialization
    const filters = await storage.list();
    console.log('List operation completed, filters:', filters.length);

    console.log('Closing storage...');
    await storage.close();
    console.log('Storage closed successfully');

  } catch (error) {
    console.error('Error during test:', error);
    console.error('Stack:', error.stack);
  }
}

testInit().then(() => {
  console.log('Test completed');
  process.exit(0);
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});