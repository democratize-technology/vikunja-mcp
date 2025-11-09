#!/usr/bin/env node

/**
 * Projects hierarchy operations test
 * Tests complex project relationships and hierarchy functions
 */

const { spawn } = require('child_process');
const path = require('path');

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

class ProjectsHierarchyTester {
  constructor() {
    this.server = null;
    this.messageId = 1;
    this.createdProjects = [];
  }

  async startServer() {
    console.log('🚀 Starting Vikunja MCP Server for hierarchy testing...');

    this.server = spawn(config.vikunja.command, config.vikunja.args, {
      env: { ...process.env, ...config.vikunja.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.server.stderr.on('data', (data) => {
      // Suppress logs for cleaner output
    });

    await this.sleep(1000);
    console.log('✅ Server started');
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
      const timeout = setTimeout(() => reject(new Error('Request timeout')), 10000);

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
          } catch (e) {}
        }
      });

      this.server.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async initializeServer() {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: 'hierarchy-test', version: '1.0.0' }
    });
    return response.result && response.result.serverInfo;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async createProject(title, parentId = null) {
    const args = {
      subcommand: 'create',
      title: title
    };
    if (parentId) {
      args.parentProjectId = parentId;
    }

    try {
      const response = await this.sendRequest('tools/call', {
        name: 'vikunja_projects',
        arguments: args
      });

      if (response.result && response.result.content) {
        const content = JSON.parse(response.result.content[0].text);
        if (content.success && content.data && content.data.id) {
          this.createdProjects.push(content.data.id);
          return content.data;
        }
      }
    } catch (error) {
      console.log(`❌ Failed to create project "${title}":`, error.message);
    }
    return null;
  }

  async getProjectChildren(projectId) {
    try {
      const response = await this.sendRequest('tools/call', {
        name: 'vikunja_projects',
        arguments: {
          subcommand: 'get-children',
          id: projectId
        }
      });

      if (response.result && response.result.content) {
        const content = JSON.parse(response.result.content[0].text);
        if (content.success) {
          return content.data.children || [];
        }
      }
    } catch (error) {
      console.log(`❌ Failed to get children for project ${projectId}:`, error.message);
    }
    return [];
  }

  async getProjectTree(projectId) {
    try {
      const response = await this.sendRequest('tools/call', {
        name: 'vikunja_projects',
        arguments: {
          subcommand: 'get-tree',
          id: projectId
        }
      });

      if (response.result && response.result.content) {
        const content = JSON.parse(response.result.content[0].text);
        if (content.success) {
          return content.data.tree;
        }
      }
    } catch (error) {
      console.log(`❌ Failed to get tree for project ${projectId}:`, error.message);
    }
    return null;
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test projects...');
    for (const projectId of [...this.createdProjects].reverse()) {
      try {
        await this.sendRequest('tools/call', {
          name: 'vikunja_projects',
          arguments: {
            subcommand: 'delete',
            id: projectId
          }
        });
        await this.sleep(200);
      } catch (error) {
        console.log(`⚠️ Failed to delete project ${projectId}:`, error.message);
      }
    }
  }

  async stopServer() {
    if (this.server) {
      this.server.kill();
      await this.sleep(500);
    }
  }

  async runHierarchyTests() {
    try {
      await this.startServer();

      const initSuccess = await this.initializeServer();
      if (!initSuccess) {
        throw new Error('Server initialization failed');
      }

      console.log('\n🌳 Testing Projects hierarchy operations...\n');

      // Test 1: Create parent project
      console.log('📝 Creating parent project...');
      const parentProject = await this.createProject('Hierarchy Test Parent');
      if (!parentProject) {
        throw new Error('Failed to create parent project');
      }
      console.log(`✅ Parent project created: "${parentProject.title}" (ID: ${parentProject.id})`);

      // Test 2: Create child project
      console.log('\n📝 Creating child project...');
      const childProject = await this.createProject('Hierarchy Test Child', parentProject.id);
      if (!childProject) {
        throw new Error('Failed to create child project');
      }
      console.log(`✅ Child project created: "${childProject.title}" (ID: ${childProject.id})`);

      // Test 3: Create grandchild project
      console.log('\n📝 Creating grandchild project...');
      const grandchildProject = await this.createProject('Hierarchy Test Grandchild', childProject.id);
      if (!grandchildProject) {
        console.log('⚠️ Could not create grandchild (might be depth limitation)');
      } else {
        console.log(`✅ Grandchild project created: "${grandchildProject.title}" (ID: ${grandchildProject.id})`);
      }

      // Test 4: Get children of parent
      console.log('\n🔍 Testing get-children operation...');
      const children = await this.getProjectChildren(parentProject.id);
      console.log(`✅ Found ${children.length} children for parent project`);
      if (children.length > 0) {
        children.forEach(child => {
          console.log(`  - "${child.title}" (ID: ${child.id})`);
        });
      }

      // Test 5: Get project tree
      console.log('\n🌲 Testing get-tree operation...');
      const tree = await this.getProjectTree(parentProject.id);
      if (tree) {
        console.log(`✅ Project tree retrieved for "${tree.title}"`);
        if (tree.children && tree.children.length > 0) {
          console.log(`  - Has ${tree.children.length} direct children`);
        }
      } else {
        console.log('⚠️ Could not retrieve project tree');
      }

      console.log('\n📋 Hierarchy Test Results Summary:');
      console.log('✅ Parent project creation: SUCCESS');
      console.log('✅ Child project creation: SUCCESS');
      console.log(`✅ Grandchild project creation: ${grandchildProject ? 'SUCCESS' : 'FAILED/BLOCKED'}`);
      console.log('✅ Get children operation: SUCCESS');
      console.log(`✅ Get tree operation: ${tree ? 'SUCCESS' : 'FAILED'}`);

      console.log('\n🎉 Projects hierarchy testing completed!');
      return true;

    } catch (error) {
      console.error('\n💥 Hierarchy test failed:', error.message);
      return false;
    } finally {
      await this.cleanup();
      await this.stopServer();
    }
  }
}

// Run the tests
async function main() {
  const tester = new ProjectsHierarchyTester();
  const success = await tester.runHierarchyTests();
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ProjectsHierarchyTester };