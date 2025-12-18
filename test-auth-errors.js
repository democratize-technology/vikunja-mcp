#!/usr/bin/env node

/**
 * Final DX Evaluation - Test Enhanced Authentication Errors
 * Tests if authentication errors provide step-by-step guidance
 */

const { spawn } = require('child_process');
const path = require('path');

async function testAuthenticationErrors() {
  console.log('\n🔐 TESTING ENHANCED AUTHENTICATION ERRORS');
  console.log('=' .repeat(60));

  const serverProcess = spawn('node', ['dist/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VIKUNJA_URL: 'https://vikunja.erinjeremy.com/api/v1',
      VIKUNJA_API_TOKEN: 'invalid-token-format'  // Force auth error
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let serverOutput = '';
  let serverReady = false;

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    serverOutput += output;
    console.log('Server:', output.trim());

    if (output.includes('MCP server running') || output.includes('successfully')) {
      serverReady = true;
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.log('Server Error:', data.toString().trim());
  });

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));

  if (serverReady) {
    console.log('\n✅ Server ready with invalid token - Testing enhanced error messages...\n');

    // Simulate MCP tool call to trigger authentication error
    const testRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "vikunja_tasks",
        arguments: {
          subcommand: "list",
          project_id: 1
        }
      }
    };

    serverProcess.stdin.write(JSON.stringify(testRequest) + '\n');

    // Wait for error response
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Analyze error output for enhanced guidance
  const hasStepByStepGuidance = serverOutput.includes('step') ||
                               serverOutput.includes('follow') ||
                               serverOutput.includes('1.') ||
                               serverOutput.includes('2.') ||
                               serverOutput.includes('check');

  const hasClearInstructions = serverOutput.includes('token') &&
                               serverOutput.includes('format') &&
                               serverOutput.includes('URL');

  console.log('\n📊 AUTHENTICATION ERROR ANALYSIS:');
  console.log(`- Step-by-step guidance: ${hasStepByStepGuidance ? '✅ YES' : '❌ NO'}`);
  console.log(`- Clear instructions: ${hasClearInstructions ? '✅ YES' : '❌ NO'}`);
  console.log(`- Error detail quality: ${serverOutput.length > 100 ? '✅ DETAILED' : '❌ MINIMAL'}`);

  serverProcess.kill();

  return {
    stepByStepGuidance: hasStepByStepGuidance,
    clearInstructions: hasClearInstructions,
    errorQuality: serverOutput.length > 100,
    outputLength: serverOutput.length
  };
}

// Execute test
testAuthenticationErrors()
  .then(results => {
    console.log('\n🎯 AUTHENTICATION ERROR SCORE:',
      Object.values(results).filter(Boolean).length / Object.keys(results).length * 100, '%');
    process.exit(results.stepByStepGuidance && results.clearInstructions ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });