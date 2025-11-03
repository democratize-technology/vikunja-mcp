#!/usr/bin/env node

/**
 * Simple MCP Server Test
 * Tests Vikunja MCP server by sending direct MCP protocol messages
 */

const { spawn } = require('child_process');
const path = require('path');

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

async function testMCPServer() {
  log('🚀 Starting simple MCP server test...');

  const env = {
    ...process.env,
    VIKUNJA_URL: process.env.VIKUNJA_URL || "https://your-vikunja-instance.com/api/v1",
    VIKUNJA_API_TOKEN: process.env.VIKUNJA_API_TOKEN || "your-api-token-here"
  };

  // Start the MCP server
  const serverProcess = spawn('node', [path.join(__dirname, 'dist', 'index.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env
  });

  let stdout = '';
  let stderr = '';
  let responses = [];

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    stdout += output;
    log(`Server output: ${output.trim()}`);

    // Try to parse JSON responses
    const lines = output.trim().split('\n');
    lines.forEach(line => {
      if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
        try {
          const response = JSON.parse(line.trim());
          responses.push(response);
          log(`Received response: ${JSON.stringify(response, null, 2)}`, 'success');
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });
  });

  serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    stderr += output;
    log(`Server error: ${output.trim()}`, 'error');
  });

  serverProcess.on('error', (error) => {
    log(`Server process error: ${error.message}`, 'error');
  });

  // Wait a moment for server to initialize
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 1: List tools
  log('📋 Test 1: Listing available tools...');
  const listToolsRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {}
  };

  serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 2: List projects
  log('📂 Test 2: Listing projects...');
  const listProjectsRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "vikunja_projects",
      arguments: {
        subcommand: "list"
      }
    }
  };

  serverProcess.stdin.write(JSON.stringify(listProjectsRequest) + '\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Test 3: List tasks
  log('📝 Test 3: Listing tasks...');
  const listTasksRequest = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "vikunja_tasks",
      arguments: {
        subcommand: "list",
        limit: 5
      }
    }
  };

  serverProcess.stdin.write(JSON.stringify(listTasksRequest) + '\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Test 4: Create a task
  log('➕ Test 4: Creating a test task...');
  const createTaskRequest = {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "vikunja_tasks",
      arguments: {
        subcommand: "create",
        title: `MCP Test Task ${Date.now()}`,
        description: "This task was created during MCP server testing"
      }
    }
  };

  serverProcess.stdin.write(JSON.stringify(createTaskRequest) + '\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Test 5: Test error handling (missing required parameter)
  log('🧪 Test 5: Testing error handling (missing required parameters)...');
  const errorTestRequest = {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "vikunja_tasks",
      arguments: {
        subcommand: "get"
        // Missing required 'id' parameter
      }
    }
  };

  serverProcess.stdin.write(JSON.stringify(errorTestRequest) + '\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Close the server
  log('🔚 Closing server...');
  serverProcess.stdin.end();

  // Wait for server to close
  await new Promise(resolve => {
    serverProcess.on('close', (code) => {
      log(`Server closed with code: ${code}`);
      resolve();
    });
  });

  // Generate report
  log('\n📊 TEST REPORT', 'success');
  log('================', 'success');
  log(`Total responses received: ${responses.length}`);

  responses.forEach((response, index) => {
    log(`\nResponse ${index + 1}:`, 'success');
    log(`  ID: ${response.id}`);
    log(`  Method: ${response.result ? 'success' : 'error'}`);
    if (response.result) {
      if (response.result.tools) {
        log(`  Tools available: ${response.result.tools.length}`);
        response.result.tools.forEach(tool => {
          log(`    - ${tool.name}: ${tool.description}`);
        });
      }
      if (response.result.content) {
        log(`  Content received: ${response.result.content.length} items`);
        response.result.content.forEach(item => {
          if (item.type === 'text') {
            const text = item.text.substring(0, 200);
            log(`    Text: ${text}${item.text.length > 200 ? '...' : ''}`);
          }
        });
      }
    }
    if (response.error) {
      log(`  Error: ${response.error.message}`, 'error');
    }
  });

  if (stderr) {
    log('\n🚨 Server stderr output:', 'error');
    log(stderr);
  }

  return {
    success: responses.length > 0,
    responses,
    stdout,
    stderr
  };
}

// Main execution
async function main() {
  try {
    const result = await testMCPServer();

    if (result.success) {
      log('\n✅ MCP server test completed successfully!', 'success');
      process.exit(0);
    } else {
      log('\n❌ MCP server test failed!', 'error');
      process.exit(1);
    }
  } catch (error) {
    log(`💥 Test failed with error: ${error.message}`, 'error');
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main();
}

module.exports = { testMCPServer };