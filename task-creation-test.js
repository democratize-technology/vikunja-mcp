#!/usr/bin/env node

/**
 * Task Creation Test for MCP Server
 * Tests creating a task with proper projectId
 */

const { spawn } = require('child_process');
const path = require('path');

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

async function testTaskCreation() {
  log('🚀 Testing task creation with proper projectId...');

  const env = {
    ...process.env,
    VIKUNJA_URL: process.env.VIKUNJA_URL || "https://your-vikunja-instance.com/api/v1",
    VIKUNJA_API_TOKEN: process.env.VIKUNJA_API_TOKEN || "your-api-token-here"
  };

  const serverProcess = spawn('node', [path.join(__dirname, 'dist', 'index.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env
  });

  let responses = [];
  let createdTaskId = null;

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    const lines = output.trim().split('\n');
    lines.forEach(line => {
      if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
        try {
          const response = JSON.parse(line.trim());
          responses.push(response);
          log(`Response ID ${response.id}: ${response.result ? 'Success' : 'Error'}`, 'success');

          if (response.result && response.result.content) {
            response.result.content.forEach(item => {
              if (item.type === 'text') {
                try {
                  const parsed = JSON.parse(item.text);
                  if (parsed.task && parsed.task.id) {
                    createdTaskId = parsed.task.id;
                    log(`Created task with ID: ${createdTaskId}`, 'success');
                  }
                } catch (e) {
                  log(`Response text: ${item.text.substring(0, 200)}...`);
                }
              }
            });
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });
  });

  serverProcess.stderr.on('data', (data) => {
    log(`Server: ${data.toString().trim()}`);
  });

  // Wait for server initialization
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 1: Create a task with proper projectId
  log('➕ Test 1: Creating task with projectId=1...');
  const createTaskRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "vikunja_tasks",
      arguments: {
        subcommand: "create",
        title: `MCP Test Task ${Date.now()}`,
        description: "This task was created during MCP server testing and should be deleted",
        projectId: 1,
        priority: 2
      }
    }
  };

  serverProcess.stdin.write(JSON.stringify(createTaskRequest) + '\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Test 2: Get the created task
  if (createdTaskId) {
    log(`📝 Test 2: Getting created task with ID ${createdTaskId}...`);
    const getTaskRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "vikunja_tasks",
        arguments: {
          subcommand: "get",
          id: createdTaskId
        }
      }
    };

    serverProcess.stdin.write(JSON.stringify(getTaskRequest) + '\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 3: Update the task
    log('✏️ Test 3: Updating task...');
    const updateTaskRequest = {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "vikunja_tasks",
        arguments: {
          subcommand: "update",
          id: createdTaskId,
          title: `MCP Test Task ${Date.now()} - UPDATED`,
          description: "This task was updated during MCP server testing",
          priority: 3
        }
      }
    };

    serverProcess.stdin.write(JSON.stringify(updateTaskRequest) + '\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 4: Delete the task
    log('🗑️ Test 4: Deleting test task...');
    const deleteTaskRequest = {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "vikunja_tasks",
        arguments: {
          subcommand: "delete",
          id: createdTaskId
        }
      }
    };

    serverProcess.stdin.write(JSON.stringify(deleteTaskRequest) + '\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
  } else {
    log('❌ No task was created, skipping get/update/delete tests', 'error');
  }

  // Close server
  serverProcess.stdin.end();
  await new Promise(resolve => {
    serverProcess.on('close', resolve);
  });

  return {
    success: createdTaskId !== null,
    responses,
    createdTaskId
  };
}

// Main execution
async function main() {
  try {
    const result = await testTaskCreation();

    log('\n📊 TASK CRUD TEST REPORT', 'success');
    log('==========================', 'success');
    log(`Task created: ${result.createdTaskId ? '✅ YES' : '❌ NO'}`);
    log(`Total responses: ${result.responses.length}`);

    if (result.success) {
      log('\n✅ Task CRUD operations test PASSED!', 'success');
      process.exit(0);
    } else {
      log('\n❌ Task CRUD operations test FAILED!', 'error');
      process.exit(1);
    }
  } catch (error) {
    log(`💥 Test failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}