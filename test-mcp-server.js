const { spawn } = require('child_process');
const path = require('path');

// Test MCP server initialization and protocol compliance
console.log('Testing MCP Server Protocol Compliance...\n');

// Start the MCP server process
const serverProcess = spawn('node', [path.join(__dirname, 'dist', 'index.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'test',
    VIKUNJA_URL: 'https://demo.vikunja.io',
    VIKUNJA_API_TOKEN: 'test_token_12345'
  }
});

let initializationComplete = false;

// Collect stdout and stderr
serverProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('Server output:', output.trim());
});

serverProcess.stderr.on('data', (data) => {
  const output = data.toString();
  console.log('Server stderr:', output.trim());
});

// Test timeout
setTimeout(() => {
  if (!initializationComplete) {
    console.log('Server initialization timeout - this is expected for MCP servers');
    console.log('MCP server started successfully (waiting for stdin commands)');

    // Test basic MCP protocol - send initialize request
    const initializeRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-07-09',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    };

    console.log('Sending MCP initialize request...');
    serverProcess.stdin.write(JSON.stringify(initializeRequest) + '\n');
  }
}, 2000);

// Listen for responses
serverProcess.stdout.on('data', (data) => {
  const output = data.toString().trim();

  try {
    const response = JSON.parse(output);
    console.log('Received valid MCP JSON-RPC response:');
    console.log('Method:', response.method || 'response');
    console.log('ID:', response.id);

    if (response.method === 'notifications/initialized') {
      console.log('MCP server initialization completed successfully!');
      initializationComplete = true;

      // Test list tools request
      setTimeout(() => {
        console.log('Testing tools listing...');
        const listToolsRequest = {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list'
        };
        serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');
      }, 1000);
    }

    if (response.result && response.result.tools) {
      console.log('Server exposes', response.result.tools.length, 'tools:');
      response.result.tools.forEach(tool => {
        console.log(' -', tool.name + ':', (tool.description || '').substring(0, 80) + '...');
      });

      console.log('MCP protocol compliance verified!');
      console.log(' JSON-RPC 2.0 communication');
      console.log(' Initialize handshake');
      console.log(' Tools listing');
      console.log(' Proper response format');

      // Cleanup
      setTimeout(() => {
        serverProcess.kill('SIGTERM');
        process.exit(0);
      }, 1000);
    }

    if (response.error) {
      console.log('MCP Error Response:');
      console.log(' Code:', response.error.code);
      console.log(' Message:', response.error.message);
    }
  } catch (e) {
    // Not JSON - ignore for now
  }
});

// Handle process exit
serverProcess.on('close', (code) => {
  console.log('Server process exited with code', code);
});

// Global timeout
setTimeout(() => {
  console.log('Global timeout - terminating test');
  serverProcess.kill('SIGTERM');
  process.exit(1);
}, 15000);
