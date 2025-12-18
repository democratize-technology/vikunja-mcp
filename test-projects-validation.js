#!/usr/bin/env node

/**
 * Projects validation and error handling test
 * Tests validation logic and error cases
 */

const { spawn } = require('child_process');
const path = require('path');

// Configuration from the mandatory protocol
const config = {
  vikunja: {
    command: 'node',
    args: [path.join(__dirname, 'dist', 'index.js')],
    env: {
      'VIKUNJA_URL': 'https://vikunja.erinjeremy.com/api/v1',
      'VIKUNJA_API_TOKEN': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImplcmVteUBlcmluamVyZW15LmNvbSIsImVtYWlsUmVtaW5kZXJzRW5hYmxlZCI6dHJ1ZSwiZXhwIjoxNzY1Mjk4Nzg0LCJpZCI6MSwiaXNMb2NhbFVzZXIiOnRydWUsImxvbmciOnRydWUsIm5hbWUiOiIiLCJ0eXBlIjoxLCJ1c2VybmFtZSI6ImplcmVteSJ9.k9Csiffu2uf3XgkROvub_ZZBFLYVDrA18-c60i1r04E'
    }
  }
};

class ProjectsValidationTester {
  constructor() {
    this.server = null;
    this.messageId = 1;
    this.testResults = [];
  }

  async startServer() {
    console.log('🚀 Starting Vikunja MCP Server for validation testing...');

    this.server = spawn(config.vikunja.command, config.vikunja.args, {
      env: { ...process.env, ...config.vikunja.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.server.on('error', (error) => {
      console.error('❌ Server error:', error);
    });

    this.server.stderr.on('data', (data) => {
      // Suppress logs for cleaner test output
    });

    await this.sleep(1000);
    console.log('✅ Server started successfully');
  }

  async sendRequest(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.messageId++
    };

    return new Promise((resolve, reject) => {
      let responseData = '';

      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for ${method}`));
      }, 10000);

      this.server.stdout.on('data', (data) => {
        responseData += data.toString();

        const lines = responseData.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const response = JSON.parse(line);
            if (response.id === request.id) {
              clearTimeout(timeout);
              resolve(response);
              return;
            }
          } catch (e) {
            // Not valid JSON yet, continue collecting
          }
        }
      });

      this.server.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async initializeServer() {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { roots: { listChanged: true } },
      clientInfo: {
        name: 'projects-validation-test',
        version: '1.0.0'
      }
    });

    return response.result && response.result.serverInfo;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testValidation(testName, requestArgs, expectedError) {
    console.log(`\n🧪 Testing: ${testName}`);
    console.log(`📤 Request args:`, requestArgs);

    try {
      const response = await this.sendRequest('tools/call', {
        name: 'vikunja_projects',
        arguments: requestArgs
      });

      console.log(`📥 Response structure:`, response.error ? 'ERROR' : 'SUCCESS');
      if (response.error) {
        console.log(`📥 Error response:`, response.error);
      } else if (response.result && response.result.content) {
        try {
          const content = JSON.parse(response.result.content[0].text);
          console.log(`📥 Success response:`, content.success ? 'SUCCESS' : 'ERROR');
          if (!content.success) {
            console.log(`📥 Error in content:`, content);
            // This might be the actual error case
            const actualError = content.message || 'Unknown error';
            if (expectedError && actualError.includes(expectedError)) {
              console.log(`✅ PASS: Got expected error: "${actualError}"`);
              this.testResults.push({ test: testName, status: 'PASS', error: actualError });
              return true;
            } else {
              console.log(`❌ FAIL: Expected error containing "${expectedError}", got: "${actualError}"`);
              this.testResults.push({ test: testName, status: 'FAIL', expected: expectedError, actual: actualError });
              return false;
            }
          }
        } catch (parseError) {
          console.log(`📥 Content parse error:`, parseError.message);
        }
      }

      if (response.error) {
        const actualError = response.error.message;
        if (expectedError && actualError.includes(expectedError)) {
          console.log(`✅ PASS: Got expected error: "${actualError}"`);
          this.testResults.push({ test: testName, status: 'PASS', error: actualError });
          return true;
        } else {
          console.log(`❌ FAIL: Expected error containing "${expectedError}", got: "${actualError}"`);
          this.testResults.push({ test: testName, status: 'FAIL', expected: expectedError, actual: actualError });
          return false;
        }
      } else {
        console.log(`❌ FAIL: Expected error but got success response`);
        this.testResults.push({ test: testName, status: 'FAIL', expected: expectedError, actual: 'SUCCESS' });
        return false;
      }
    } catch (error) {
      console.log(`📥 Caught exception:`, error.message);
      if (expectedError && error.message.includes(expectedError)) {
        console.log(`✅ PASS: Got expected error: "${error.message}"`);
        this.testResults.push({ test: testName, status: 'PASS', error: error.message });
        return true;
      } else {
        console.log(`❌ FAIL: Expected error containing "${expectedError}", got: "${error.message}"`);
        this.testResults.push({ test: testName, status: 'FAIL', expected: expectedError, actual: error.message });
        return false;
      }
    }
  }

  async runValidationTests() {
    try {
      await this.startServer();

      const initSuccess = await this.initializeServer();
      if (!initSuccess) {
        throw new Error('Server initialization failed');
      }

      console.log('\n🎯 Starting Projects validation tests...\n');

      let passedTests = 0;
      let totalTests = 0;

      // Test just one validation case to debug
      totalTests++;
      if (await this.testValidation(
        'Create project without title',
        { subcommand: 'create' },
        'title is required'
      )) passedTests++;

      console.log('\n📋 Validation Test Results Summary:');
      console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
      console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests} tests`);

      if (this.testResults.some(r => r.status === 'FAIL')) {
        console.log('\n❌ Failed Tests:');
        this.testResults
          .filter(r => r.status === 'FAIL')
          .forEach(r => {
            console.log(`  - ${r.test}: Expected "${r.expected}", got "${r.actual}"`);
          });
      }

      console.log('\n🎉 Projects validation testing completed!');
      return passedTests === totalTests;

    } catch (error) {
      console.error('\n💥 Validation test failed:', error.message);
      return false;
    } finally {
      if (this.server) {
        this.server.kill();
        await this.sleep(500);
      }
    }
  }
}

// Run the tests
async function main() {
  const tester = new ProjectsValidationTester();
  const success = await tester.runValidationTests();

  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ProjectsValidationTester };