/**
 * Tests for SQLiteConnectionManager
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, mkdirSync } from 'fs';
import * as sqliteModule from 'better-sqlite3';
import { SQLiteConnectionManager } from '../../../../src/storage/adapters/components/SQLiteConnectionManager';
import type { StorageSession } from '../../../../src/storage/interfaces';
import {
  StorageInitializationError,
  StorageConnectionError,
} from '../../../../src/storage/interfaces';

describe('SQLiteConnectionManager', () => {
  let connectionManager: SQLiteConnectionManager;
  let testDatabasePath: string;
  let testSession: StorageSession;
  let testDir: string;

  beforeEach(() => {
    // Create unique test directory and database path
    testDir = join(tmpdir(), `vikunja-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    mkdirSync(testDir, { recursive: true });
    testDatabasePath = join(testDir, 'test.db');

    testSession = {
      id: 'test-session-id',
      createdAt: new Date(),
      lastAccessAt: new Date(),
    };

    connectionManager = new SQLiteConnectionManager({
      databasePath: testDatabasePath,
      enableWAL: true,
      enableForeignKeys: true,
      timeout: 5000,
      debug: false,
    });
  });

  afterEach(async () => {
    // Clean up connection and test files
    try {
      await connectionManager.close();
    } catch (error) {
      // Ignore cleanup errors
    }

    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Constructor', () => {
    it('should accept configuration with default values', () => {
      const manager = new SQLiteConnectionManager({
        databasePath: testDatabasePath,
      });

      const config = manager.getConfig();
      expect(config.databasePath).toBe(testDatabasePath);
      expect(config.enableWAL).toBe(true);
      expect(config.enableForeignKeys).toBe(true);
      expect(config.timeout).toBe(5000);
      expect(config.debug).toBe(false);
    });

    it('should override defaults with provided values', () => {
      const manager = new SQLiteConnectionManager({
        databasePath: testDatabasePath,
        enableWAL: false,
        enableForeignKeys: false,
        timeout: 10000,
        debug: true,
      });

      const config = manager.getConfig();
      expect(config.enableWAL).toBe(false);
      expect(config.enableForeignKeys).toBe(false);
      expect(config.timeout).toBe(10000);
      expect(config.debug).toBe(true);
    });
  });

  describe('Initialization', () => {
    it('should initialize database connection successfully', async () => {
      await expect(connectionManager.initialize(testSession)).resolves.not.toThrow();

      expect(connectionManager.isConnected()).toBe(true);
      expect(connectionManager.getConnection()).toBeInstanceOf(sqliteModule.default);
      expect(connectionManager.getSession()).toEqual(testSession);
    });

    it('should create database directory if it does not exist', async () => {
      const nestedPath = join(testDir, 'nested', 'subdir', 'test.db');
      const nestedManager = new SQLiteConnectionManager({
        databasePath: nestedPath,
      });

      await expect(nestedManager.initialize(testSession)).resolves.not.toThrow();
      expect(nestedManager.isConnected()).toBe(true);

      await nestedManager.close();
    });

    it('should apply database configuration during initialization', async () => {
      await connectionManager.initialize(testSession);
      const db = connectionManager.getConnection()!;

      // Check WAL mode
      const walMode = db.pragma('journal_mode', { simple: true });
      expect(walMode).toBe('wal');

      // Check foreign keys
      const foreignKeys = db.pragma('foreign_keys', { simple: true });
      expect(foreignKeys).toBe(1);

      // Check synchronous mode
      const synchronous = db.pragma('synchronous', { simple: true });
      expect(synchronous).toBe(1); // NORMAL mode
    });

    it('should throw StorageInitializationError on database creation failure', async () => {
      // Use invalid path to trigger failure
      const invalidManager = new SQLiteConnectionManager({
        databasePath: '/invalid/path/that/cannot/be/created/test.db',
      });

      await expect(invalidManager.initialize(testSession))
        .rejects.toThrow(StorageInitializationError);
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      await connectionManager.initialize(testSession);
    });

    it('should return null connection when not initialized', () => {
      const newManager = new SQLiteConnectionManager({ databasePath: testDatabasePath });
      expect(newManager.getConnection()).toBeNull();
      expect(newManager.getSession()).toBeNull();
    });

    it('should return active connection when initialized', () => {
      const connection = connectionManager.getConnection();
      const session = connectionManager.getSession();

      expect(connection).toBeInstanceOf(sqliteModule.default);
      expect(session).toEqual(testSession);
    });

    it('should report correct connection status', () => {
      expect(connectionManager.isConnected()).toBe(true);
    });

    it('should disconnect properly on close', async () => {
      await connectionManager.close();

      expect(connectionManager.isConnected()).toBe(false);
      expect(connectionManager.getConnection()).toBeNull();
      expect(connectionManager.getSession()).toBeNull();
    });
  });

  describe('Health Check', () => {
    beforeEach(async () => {
      await connectionManager.initialize(testSession);
    });

    it('should return healthy status for good connection', async () => {
      const result = await connectionManager.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.details).toBeDefined();
      expect(result.details!.databasePath).toBe(testDatabasePath);
      expect(result.details!.sessionId).toBe(testSession.id);
      expect(result.details!.integrityStatus).toBe('ok');
    });

    it('should attempt reconnection when database is not initialized', async () => {
      await connectionManager.close();

      const result = await connectionManager.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.recoveryAttempted).toBe(true);
      expect(result.error).toBe('Database not initialized and reconnection failed');
    });

    it('should handle connection test failure with reconnection', async () => {
      // Close the database to simulate connection failure
      const db = connectionManager.getConnection()!;
      db.close();

      const result = await connectionManager.healthCheck();

      expect(result.healthy).toBe(true); // Should recover
      expect(result.recoveryAttempted).toBe(true);
    });

    it('should detect database integrity issues', async () => {
      const db = connectionManager.getConnection()!;

      // Simulate integrity check failure by mocking
      const originalPrepare = db.prepare.bind(db);
      db.prepare = jest.fn().mockImplementation((query: string) => {
        if (query.includes('integrity_check')) {
          return {
            get: () => ({ integrity_check: 'database disk image is malformed' })
          };
        }
        return originalPrepare(query);
      });

      const result = await connectionManager.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Database integrity check failed');
      expect(result.details!.integrityCheckResult).toBe('database disk image is malformed');
    });

    it('should handle integrity check errors gracefully', async () => {
      const db = connectionManager.getConnection()!;

      // Mock integrity check to throw an error
      const originalPrepare = db.prepare.bind(db);
      db.prepare = jest.fn().mockImplementation((query: string) => {
        if (query.includes('integrity_check')) {
          throw new Error('Integrity check failed');
        }
        return originalPrepare(query);
      });

      const result = await connectionManager.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Unable to check database integrity');
    });
  });

  describe('Reconnection', () => {
    beforeEach(async () => {
      await connectionManager.initialize(testSession);
    });

    it('should reconnect successfully after connection loss', async () => {
      // Close connection to simulate loss
      const db = connectionManager.getConnection()!;
      db.close();

      const result = await connectionManager.reconnect();

      expect(result).toBe(true);
      expect(connectionManager.isConnected()).toBe(true);
      expect(connectionManager.getConnection()).toBeInstanceOf(sqliteModule.default);
    });

    it('should return false when reconnection fails', async () => {
      // Close the database connection
      const db = connectionManager.getConnection()!;
      db.close();

      // Change session to null to force reconnection failure
      const privateManager = connectionManager as any;
      privateManager.session = null;

      const result = await connectionManager.reconnect();

      expect(result).toBe(false);
      expect(connectionManager.isConnected()).toBe(false);
      expect(connectionManager.getConnection()).toBeNull();
    });

    it('should reapply database configuration after reconnection', async () => {
      await connectionManager.reconnect();
      const db = connectionManager.getConnection()!;

      // Verify configuration is reapplied
      const walMode = db.pragma('journal_mode', { simple: true });
      const foreignKeys = db.pragma('foreign_keys', { simple: true });

      expect(walMode).toBe('wal');
      expect(foreignKeys).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple close calls gracefully', async () => {
      await connectionManager.initialize(testSession);

      await expect(connectionManager.close()).resolves.not.toThrow();
      await expect(connectionManager.close()).resolves.not.toThrow(); // Should not throw
    });

    it('should handle health check on uninitialized manager', async () => {
      const newManager = new SQLiteConnectionManager({ databasePath: testDatabasePath });

      const result = await newManager.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.recoveryAttempted).toBe(true);
    });

    it('should handle reconnection on uninitialized manager', async () => {
      const newManager = new SQLiteConnectionManager({ databasePath: testDatabasePath });

      const result = await newManager.reconnect();

      expect(result).toBe(false); // Should fail since no session exists
    });
  });

  describe('Configuration Validation', () => {
    it('should handle debug mode without errors', async () => {
      const debugManager = new SQLiteConnectionManager({
        databasePath: testDatabasePath,
        debug: true,
      });

      await expect(debugManager.initialize(testSession)).resolves.not.toThrow();
      expect(debugManager.isConnected()).toBe(true);

      await debugManager.close();
    });

    it('should handle WAL mode disabled', async () => {
      const noWalManager = new SQLiteConnectionManager({
        databasePath: testDatabasePath,
        enableWAL: false,
      });

      await expect(noWalManager.initialize(testSession)).resolves.not.toThrow();
      expect(noWalManager.isConnected()).toBe(true);

      // Verify WAL is disabled
      const db = noWalManager.getConnection()!;
      const walMode = db.pragma('journal_mode', { simple: true });
      expect(walMode).toBe('delete'); // Default mode

      await noWalManager.close();
    });

    it('should handle foreign keys disabled', async () => {
      const noFkManager = new SQLiteConnectionManager({
        databasePath: testDatabasePath,
        enableForeignKeys: false,
      });

      await expect(noFkManager.initialize(testSession)).resolves.not.toThrow();
      expect(noFkManager.isConnected()).toBe(true);

      // Verify foreign keys are disabled
      const db = noFkManager.getConnection()!;
      const foreignKeys = db.pragma('foreign_keys', { simple: true });
      expect(foreignKeys).toBe(0);

      await noFkManager.close();
    });
  });
});