/**
 * Tests for src/index.ts - Main Server Entry Point
 * Coverage for server initialization, environment processing, 
 * auto-authentication, factory initialization, and tool registration
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock external dependencies first
const mockMcpServer = {
  connect: jest.fn(),
};
const MockMcpServer = jest.fn().mockImplementation(() => mockMcpServer);

const mockStdioServerTransport = {};
const MockStdioServerTransport = jest.fn().mockImplementation(() => mockStdioServerTransport);

const mockDotenvConfig = jest.fn();

const mockAuthManager = {
  connect: jest.fn(),
  getAuthType: jest.fn(),
};
const MockAuthManager = jest.fn().mockImplementation(() => mockAuthManager);

const mockRegisterTools = jest.fn();

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockCreateSecureConnectionMessage = jest.fn().mockReturnValue('Secure connection message');
const mockCreateSecureLogConfig = jest.fn().mockReturnValue({ config: 'test' });

const mockCreateVikunjaClientFactory = jest.fn();
const mockSetGlobalClientFactory = jest.fn();
const mockClearGlobalClientFactory = jest.fn();
const mockGetClientFromContext = jest.fn();

// Set up all mocks before imports
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: MockMcpServer,
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: MockStdioServerTransport,
}));

jest.mock('dotenv', () => ({
  default: {
    config: mockDotenvConfig,
  },
  config: mockDotenvConfig,
}));

jest.mock('../src/auth/AuthManager', () => ({
  AuthManager: MockAuthManager,
}));

jest.mock('../src/tools', () => ({
  registerTools: mockRegisterTools,
}));

jest.mock('../src/utils/logger', () => ({
  logger: mockLogger,
}));

jest.mock('../src/utils/security', () => ({
  createSecureConnectionMessage: mockCreateSecureConnectionMessage,
  createSecureLogConfig: mockCreateSecureLogConfig,
}));

jest.mock('../src/client', () => ({
  createVikunjaClientFactory: mockCreateVikunjaClientFactory,
  setGlobalClientFactory: mockSetGlobalClientFactory,
  getClientFromContext: mockGetClientFromContext,
  clearGlobalClientFactory: mockClearGlobalClientFactory,
}));

describe('Main Server Entry Point (index.ts)', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalExit: typeof process.exit;
  let mockProcessExit: jest.SpyInstance;

  beforeEach(() => {
    // Save original environment and process.exit
    originalEnv = { ...process.env };
    originalExit = process.exit;
    
    // Mock process.exit
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called'); // Throw to prevent actual exit
    });

    // Clear environment variables that affect startup
    delete process.env.VIKUNJA_URL;
    delete process.env.VIKUNJA_API_TOKEN;
    delete process.env.MCP_MODE;
    delete process.env.DEBUG;
    
    // Always set NODE_ENV=test to prevent main() execution unless specifically testing main()
    process.env.NODE_ENV = 'test';
    process.env.JEST_WORKER_ID = '1';

    // Clear all mocks
    jest.clearAllMocks();

    // Reset modules to get a fresh instance
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment and process.exit
    process.env = originalEnv;
    process.exit = originalExit;
    mockProcessExit.mockRestore();
  });

  describe('Module Initialization', () => {
    it('should load dotenv configuration on import', () => {
      // Import the module to trigger initialization
      require('../src/index');
      
      expect(mockDotenvConfig).toHaveBeenCalledTimes(1);
    });

    it('should create McpServer with correct configuration', () => {
      require('../src/index');
      
      expect(MockMcpServer).toHaveBeenCalledTimes(1);
      expect(MockMcpServer).toHaveBeenCalledWith({
        name: 'vikunja-mcp',
        version: '0.1.0',
      });
    });

    it('should create AuthManager instance', () => {
      require('../src/index');
      
      expect(MockAuthManager).toHaveBeenCalledTimes(1);
    });
  });

  describe('Auto-Authentication Flow', () => {
    it('should perform auto-authentication when both VIKUNJA_URL and VIKUNJA_API_TOKEN are set', () => {
      // Set environment variables for auto-auth
      process.env.VIKUNJA_URL = 'https://vikunja.example.com/api/v1';
      process.env.VIKUNJA_API_TOKEN = 'tk_test123';
      mockAuthManager.getAuthType.mockReturnValue('api-token');
      
      require('../src/index');
      
      expect(mockCreateSecureConnectionMessage).toHaveBeenCalledWith(
        'https://vikunja.example.com/api/v1',
        'tk_test123'
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Auto-authenticating: Secure connection message');
      expect(mockAuthManager.connect).toHaveBeenCalledWith(
        'https://vikunja.example.com/api/v1',
        'tk_test123'
      );
      expect(mockAuthManager.getAuthType).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Using detected auth type: api-token');
    });

    it('should perform auto-authentication with JWT token', () => {
      process.env.VIKUNJA_URL = 'https://vikunja.example.com/api/v1';
      process.env.VIKUNJA_API_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token';
      mockAuthManager.getAuthType.mockReturnValue('jwt');
      
      require('../src/index');
      
      expect(mockAuthManager.connect).toHaveBeenCalledWith(
        'https://vikunja.example.com/api/v1',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token'
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Using detected auth type: jwt');
    });

    it('should not auto-authenticate when VIKUNJA_URL is missing', () => {
      process.env.VIKUNJA_API_TOKEN = 'tk_test123';
      
      require('../src/index');
      
      expect(mockCreateSecureConnectionMessage).not.toHaveBeenCalled();
      expect(mockAuthManager.connect).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Auto-authenticating'));
    });

    it('should not auto-authenticate when VIKUNJA_API_TOKEN is missing', () => {
      process.env.VIKUNJA_URL = 'https://vikunja.example.com/api/v1';
      
      require('../src/index');
      
      expect(mockCreateSecureConnectionMessage).not.toHaveBeenCalled();
      expect(mockAuthManager.connect).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Auto-authenticating'));
    });

    it('should not auto-authenticate when both environment variables are missing', () => {
      require('../src/index');
      
      expect(mockCreateSecureConnectionMessage).not.toHaveBeenCalled();
      expect(mockAuthManager.connect).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('Auto-authenticating'));
    });
  });

  describe('Factory Initialization', () => {
    it('should successfully initialize client factory and set global', async () => {
      const mockClientFactory = { test: 'factory' };
      mockCreateVikunjaClientFactory.mockResolvedValue(mockClientFactory);
      
      require('../src/index');
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockCreateVikunjaClientFactory).toHaveBeenCalledWith(mockAuthManager);
      expect(mockSetGlobalClientFactory).toHaveBeenCalledWith(mockClientFactory);
      expect(mockRegisterTools).toHaveBeenCalledWith(
        mockMcpServer,
        mockAuthManager,
        mockClientFactory
      );
    });

    it('should handle factory initialization failure gracefully', async () => {
      const initError = new Error('Factory initialization failed');
      mockCreateVikunjaClientFactory.mockRejectedValue(initError);
      
      require('../src/index');
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to initialize client factory during startup:',
        initError
      );
      expect(mockSetGlobalClientFactory).not.toHaveBeenCalled();
      expect(mockRegisterTools).toHaveBeenCalledWith(
        mockMcpServer,
        mockAuthManager,
        undefined
      );
    });

    it('should handle null factory result gracefully', async () => {
      mockCreateVikunjaClientFactory.mockResolvedValue(null);
      
      require('../src/index');
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockSetGlobalClientFactory).not.toHaveBeenCalled();
      expect(mockRegisterTools).toHaveBeenCalledWith(
        mockMcpServer,
        mockAuthManager,
        undefined
      );
    });

    it('should handle undefined factory result gracefully', async () => {
      mockCreateVikunjaClientFactory.mockResolvedValue(undefined);
      
      require('../src/index');
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockSetGlobalClientFactory).not.toHaveBeenCalled();
      expect(mockRegisterTools).toHaveBeenCalledWith(
        mockMcpServer,
        mockAuthManager,
        undefined
      );
    });

    it('should handle factory creation errors gracefully', async () => {
      const initError = new Error('Factory creation failed');
      mockCreateVikunjaClientFactory.mockRejectedValue(initError);
      
      require('../src/index');
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to initialize client factory during startup:',
        initError
      );
      // The initializeFactory catches errors internally, so no error is logged and no catch block is executed
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockRegisterTools).toHaveBeenCalledTimes(1); // Only in then() block
      expect(mockRegisterTools).toHaveBeenCalledWith(
        mockMcpServer,
        mockAuthManager,
        undefined
      );
    });

    it('should fallback to legacy registration when promise chain fails', async () => {
      // Create a scenario where the promise chain itself fails
      // Make registerTools throw in the then() block to trigger the catch()
      const mockClientFactory = { test: 'factory' };
      mockCreateVikunjaClientFactory.mockResolvedValue(mockClientFactory);
      
      let callCount = 0;
      mockRegisterTools.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('RegisterTools failed');
        }
        // Second call succeeds (in catch block)
      });
      
      require('../src/index');
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize:', expect.any(Error));
      expect(mockRegisterTools).toHaveBeenCalledTimes(2); // Once in then(), once in catch()
      expect(mockRegisterTools).toHaveBeenLastCalledWith(
        mockMcpServer,
        mockAuthManager,
        undefined
      );
    });
  });

  describe('Tool Registration', () => {
    it('should register tools with client factory when initialization succeeds', async () => {
      const mockClientFactory = { test: 'factory' };
      mockCreateVikunjaClientFactory.mockResolvedValue(mockClientFactory);
      
      require('../src/index');
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockRegisterTools).toHaveBeenCalledTimes(1);
      expect(mockRegisterTools).toHaveBeenCalledWith(
        mockMcpServer,
        mockAuthManager,
        mockClientFactory
      );
    });

    it('should register tools without client factory when initialization fails', async () => {
      mockCreateVikunjaClientFactory.mockRejectedValue(new Error('Factory failed'));
      
      require('../src/index');
      
      // Wait for async initialization and error handling
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockRegisterTools).toHaveBeenCalledTimes(1); // Only once since initializeFactory catches errors
      expect(mockRegisterTools).toHaveBeenCalledWith(
        mockMcpServer,
        mockAuthManager,
        undefined
      );
    });
  });

  describe('Server Startup (main function)', () => {
    it('should not start server in test environment (NODE_ENV=test)', () => {
      process.env.NODE_ENV = 'test';
      
      require('../src/index');
      
      expect(MockStdioServerTransport).not.toHaveBeenCalled();
      expect(mockMcpServer.connect).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalledWith('Vikunja MCP server started');
    });

    it('should not start server when JEST_WORKER_ID is set', () => {
      process.env.JEST_WORKER_ID = '1';
      
      require('../src/index');
      
      expect(MockStdioServerTransport).not.toHaveBeenCalled();
      expect(mockMcpServer.connect).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalledWith('Vikunja MCP server started');
    });

    it('should not start server when both NODE_ENV=test and JEST_WORKER_ID are set', () => {
      process.env.NODE_ENV = 'test';
      process.env.JEST_WORKER_ID = '1';
      
      require('../src/index');
      
      expect(MockStdioServerTransport).not.toHaveBeenCalled();
      expect(mockMcpServer.connect).not.toHaveBeenCalled();
    });

    // Note: Testing the actual main() function execution in production mode
    // would require more complex mocking since it runs immediately on import
    // and we can't easily separate the import from the execution.
  });

  describe('Exported Functions', () => {
    it('should export getClientFromContext function', () => {
      const indexModule = require('../src/index');
      
      expect(indexModule.getClientFromContext).toBeDefined();
      expect(indexModule.getClientFromContext).toBe(mockGetClientFromContext);
    });

    it('should export clearGlobalClientFactory function', () => {
      const indexModule = require('../src/index');
      
      expect(indexModule.clearGlobalClientFactory).toBeDefined();
      expect(indexModule.clearGlobalClientFactory).toBe(mockClearGlobalClientFactory);
    });
  });

  describe('Complete Integration Scenarios', () => {
    it('should handle complete startup flow with auto-auth and successful factory init', async () => {
      process.env.VIKUNJA_URL = 'https://vikunja.example.com/api/v1';
      process.env.VIKUNJA_API_TOKEN = 'tk_test123';
      const mockClientFactory = { test: 'factory' };
      mockCreateVikunjaClientFactory.mockResolvedValue(mockClientFactory);
      mockAuthManager.getAuthType.mockReturnValue('api-token');
      
      require('../src/index');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Verify auto-auth
      expect(mockAuthManager.connect).toHaveBeenCalledWith(
        'https://vikunja.example.com/api/v1',
        'tk_test123'
      );
      
      // Verify factory initialization
      expect(mockCreateVikunjaClientFactory).toHaveBeenCalledWith(mockAuthManager);
      expect(mockSetGlobalClientFactory).toHaveBeenCalledWith(mockClientFactory);
      
      // Verify tool registration
      expect(mockRegisterTools).toHaveBeenCalledWith(
        mockMcpServer,
        mockAuthManager,
        mockClientFactory
      );
    });

    it('should handle startup flow without auto-auth but with successful factory init', async () => {
      const mockClientFactory = { test: 'factory' };
      mockCreateVikunjaClientFactory.mockResolvedValue(mockClientFactory);
      
      require('../src/index');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Verify no auto-auth
      expect(mockAuthManager.connect).not.toHaveBeenCalled();
      
      // Verify factory initialization
      expect(mockCreateVikunjaClientFactory).toHaveBeenCalledWith(mockAuthManager);
      expect(mockSetGlobalClientFactory).toHaveBeenCalledWith(mockClientFactory);
      
      // Verify tool registration
      expect(mockRegisterTools).toHaveBeenCalledWith(
        mockMcpServer,
        mockAuthManager,
        mockClientFactory
      );
    });

    it('should handle startup flow with auto-auth but failed factory init', async () => {
      process.env.VIKUNJA_URL = 'https://vikunja.example.com/api/v1';
      process.env.VIKUNJA_API_TOKEN = 'tk_test123';
      const factoryError = new Error('Factory failed');
      mockCreateVikunjaClientFactory.mockRejectedValue(factoryError);
      mockAuthManager.getAuthType.mockReturnValue('api-token');
      
      require('../src/index');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Verify auto-auth
      expect(mockAuthManager.connect).toHaveBeenCalledWith(
        'https://vikunja.example.com/api/v1',
        'tk_test123'
      );
      
      // Verify factory initialization failure
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to initialize client factory during startup:',
        factoryError
      );
      expect(mockSetGlobalClientFactory).not.toHaveBeenCalled();
      
      // Verify fallback tool registration
      expect(mockRegisterTools).toHaveBeenCalledWith(
        mockMcpServer,
        mockAuthManager,
        undefined
      );
    });
  });

  describe('Environment Variable Edge Cases', () => {
    it('should handle empty string environment variables', () => {
      process.env.VIKUNJA_URL = '';
      process.env.VIKUNJA_API_TOKEN = '';
      process.env.MCP_MODE = '';
      process.env.DEBUG = '';
      
      require('../src/index');
      
      // Empty strings should be falsy for auth check
      expect(mockAuthManager.connect).not.toHaveBeenCalled();
    });

    it('should handle whitespace-only environment variables', () => {
      process.env.VIKUNJA_URL = '   ';
      process.env.VIKUNJA_API_TOKEN = '\t\n';
      
      require('../src/index');
      
      // Whitespace-only should still trigger auth attempt
      expect(mockAuthManager.connect).toHaveBeenCalledWith('   ', '\t\n');
    });

    it('should handle special characters in environment variables', () => {
      process.env.VIKUNJA_URL = 'https://vikunja.example.com/api/v1?special=true&encoded=%20';
      process.env.VIKUNJA_API_TOKEN = 'tk_special!@#$%^&*()token';
      mockAuthManager.getAuthType.mockReturnValue('api-token');
      
      require('../src/index');
      
      expect(mockAuthManager.connect).toHaveBeenCalledWith(
        'https://vikunja.example.com/api/v1?special=true&encoded=%20',
        'tk_special!@#$%^&*()token'
      );
    });
  });

  describe('Async Error Boundary', () => {
    it('should handle Promise rejection in initializeFactory chain', async () => {
      mockCreateVikunjaClientFactory.mockRejectedValue(new Error('Async error'));
      
      require('../src/index');
      
      // Wait for promise rejection handling
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to initialize client factory during startup:',
        expect.any(Error)
      );
      // Since initializeFactory catches errors internally, no error log should occur
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle synchronous errors in factory creation', async () => {
      mockCreateVikunjaClientFactory.mockImplementation(() => {
        throw new Error('Sync factory error');
      });
      
      require('../src/index');
      
      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to initialize client factory during startup:',
        expect.any(Error)
      );
      // Since initializeFactory catches errors internally, no error log should occur
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });
});