#!/usr/bin/env node

/**
 * Final DX Evaluation - Test Intelligent AORP Activation
 * Tests if AORP automatically activates for complex operations
 */

const { spawn } = require('child_process');

async function testAORPIntelligence() {
  console.log('\n🧠 TESTING INTELLIGENT AORP ACTIVATION');
  console.log('=' .repeat(60));

  // Kill existing server and restart with monitoring
  const existingServer = spawn('pkill', ['node']);
  await new Promise(resolve => setTimeout(resolve, 1000));

  const serverProcess = spawn('node', ['dist/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VIKUNJA_URL: 'https://vikunja.erinjeremy.com/api/v1',
      VIKUNJA_API_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImplcmVteUBlcmluamVyZW15LmNvbSIsImVtYWlsUmVtaW5kZXJzRW5hYmxlZCI6dHJ1ZSwiZXhwIjoxNzY0NjkxMDkxLCJpZCI6MSwiaXNMb2NhbFVzZXIiOnRydWUsImxvbmciOnRydWUsIm5hbWUiOiIiLCJ0eXBlIjoxLCJ1c2VybmFtZSI6ImplcmVteSJ9.5_gtNYr1hoEEHaKS0A-qLPG7rA2hleERrZNN-qr31Mc'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let serverOutput = '';
  let aorpActivations = [];

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    serverOutput += output;

    // Detect AORP activation patterns
    if (output.includes('AORP') || output.includes('optimized') ||
        output.includes('intelligent') || output.includes('auto-activat')) {
      aorpActivations.push(output.trim());
      console.log('🤖 AORP:', output.trim());
    } else if (output.trim()) {
      console.log('Server:', output.trim());
    }
  });

  // Wait for server initialization
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n🔄 TESTING COMPLEX OPERATIONS FOR AUTO-AORP...');

  // Test 1: Bulk task creation (should trigger AORP)
  console.log('\n📝 Test 1: Bulk task creation');
  const bulkRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "vikunja_tasks_bulk",
      arguments: {
        subcommand: "create",
        tasks: [
          { title: "Task 1", description: "Complex task with details" },
          { title: "Task 2", description: "Another complex task" },
          { title: "Task 3", description: "Third task for bulk test" }
        ]
      }
    }
  };

  serverProcess.stdin.write(JSON.stringify(bulkRequest) + '\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 2: Complex filtering (should trigger AORP)
  console.log('\n🔍 Test 2: Complex filtering operation');
  const filterRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "vikunja_tasks",
      arguments: {
        subcommand: "list",
        filter_by: ["due_date", "priority", "labels"],
        filter_value: ["2024-12-31", "high", "urgent"],
        sort_by: ["due_date", "priority"]
      }
    }
  };

  serverProcess.stdin.write(JSON.stringify(filterRequest) + '\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 3: Large data request (should trigger AORP)
  console.log('\n📊 Test 3: Large data operation');
  const dataRequest = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "vikunja_projects",
      arguments: {
        subcommand: "list",
        include_archived: true,
        limit: 100
      }
    }
  };

  serverProcess.stdin.write(JSON.stringify(dataRequest) + '\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('\n📈 AORP INTELLIGENCE ANALYSIS:');
  console.log(`- AORP activations detected: ${aorpActivations.length}`);
  console.log(`- Auto-activation rate: ${aorpActivations.length > 0 ? '✅ ACTIVE' : '❌ INACTIVE'}`);
  console.log(`- Intelligence patterns: ${serverOutput.includes('intelligent') || serverOutput.includes('complex') ? '✅ DETECTED' : '❌ NOT DETECTED'}`);

  aorpActivations.forEach((activation, index) => {
    console.log(`  Activation ${index + 1}: ${activation.substring(0, 100)}...`);
  });

  serverProcess.kill();

  return {
    activations: aorpActivations.length,
    autoActivationWorking: aorpActivations.length > 0,
    intelligenceDetected: serverOutput.includes('intelligent') || serverOutput.includes('complex'),
    serverOutputLength: serverOutput.length
  };
}

// Execute test
testAORPIntelligence()
  .then(results => {
    console.log('\n🎯 AORP INTELLIGENCE SCORE:',
      Object.values(results).filter(Boolean).length / Object.keys(results).length * 100, '%');
    process.exit(results.autoActivationWorking ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });