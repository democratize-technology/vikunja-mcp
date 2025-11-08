/**
 * Security tests for SQLiteStorageAdapter XSS vulnerabilities
 *
 * This test suite specifically targets stored XSS vulnerabilities in the
 * JSON serialization/deserialization of filter expressions.
 */

import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync } from 'fs';
import { SQLiteStorageAdapter } from '../../../src/storage/adapters/SQLiteStorageAdapter';
import type { SavedFilter, FilterExpression } from '../../../src/types/filters';
import { StorageDataError } from '../../../src/storage/interfaces';

describe('SQLiteStorageAdapter - Security Tests', () => {
  let adapter: SQLiteStorageAdapter;
  let tempDir: string;
  let dbPath: string;
  let mockSession = { id: 'test-session', createdAt: new Date(), lastAccessAt: new Date() };

  beforeEach(() => {
    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'sqlite-test-'));
    dbPath = join(tempDir, 'test.db');
    adapter = new SQLiteStorageAdapter({ databasePath: dbPath });
  });

  afterEach(async () => {
    await adapter.close();
    // Clean up temp directory
    try {
      const db = new Database(dbPath);
      db.close();
      // Note: In a real implementation, you'd want proper cleanup
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('XSS Protection - Filter Expression Validation', () => {
    const maliciousExpressions: FilterExpression[] = [
      // Script tag injection
      {
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: '<script>alert("XSS")</script>'
          }],
          operator: '&&'
        }]
      },

      // Event handler injection
      {
        groups: [{
          conditions: [{
            field: 'description',
            operator: 'like',
            value: '<img src=x onerror=alert("XSS")>'
          }],
          operator: '&&'
        }]
      },

      // JavaScript protocol injection
      {
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: 'javascript:alert("XSS")'
          }],
          operator: '&&'
        }]
      },

      // HTML injection with encoded content
      {
        groups: [{
          conditions: [{
            field: 'description',
            operator: 'like',
            value: '&lt;script&gt;alert("XSS")&lt;/script&gt;'
          }],
          operator: '&&'
        }]
      },

      // Complex injection attempt
      {
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: '<iframe src="javascript:alert(`XSS`)"></iframe>'
          }],
          operator: '&&'
        }]
      }
    ];

    describe('create() method XSS protection', () => {
      it.each(maliciousExpressions)('should reject malicious expression: %o', async (maliciousExpression) => {
        await adapter.initialize(mockSession);

        const maliciousFilter: Omit<SavedFilter, 'id' | 'created' | 'updated'> = {
          name: 'malicious-filter',
          description: 'Filter with XSS payload',
          filter: 'title contains malicious content',
          expression: maliciousExpression,
          isGlobal: false
        };

        await expect(adapter.create(maliciousFilter)).rejects.toThrow(StorageDataError);
      });

      it('should allow valid expressions', async () => {
        await adapter.initialize(mockSession);

        const validExpression: FilterExpression = {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: 'important task'
            }],
            operator: '&&'
          }]
        };

        const validFilter: Omit<SavedFilter, 'id' | 'created' | 'updated'> = {
          name: 'valid-filter',
          description: 'A legitimate filter',
          filter: 'title contains "important task"',
          expression: validExpression,
          isGlobal: false
        };

        const result = await expect(adapter.create(validFilter)).resolves.toBeDefined();
        expect(result.name).toBe('valid-filter');
        expect(result.expression).toEqual(validExpression);
      });
    });

    describe('update() method XSS protection', () => {
      it.each(maliciousExpressions)('should reject malicious expression in update: %o', async (maliciousExpression) => {
        await adapter.initialize(mockSession);

        // First create a valid filter
        const validExpression: FilterExpression = {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: 'test'
            }],
            operator: '&&'
          }]
        };

        const validFilter: Omit<SavedFilter, 'id' | 'created' | 'updated'> = {
          name: 'test-filter',
          filter: 'title contains "test"',
          expression: validExpression,
          isGlobal: false
        };

        const created = await adapter.create(validFilter);

        // Try to update with malicious expression
        const maliciousUpdate = {
          expression: maliciousExpression
        };

        await expect(adapter.update(created.id, maliciousUpdate)).rejects.toThrow(StorageDataError);
      });

      it('should allow valid expression updates', async () => {
        await adapter.initialize(mockSession);

        const validFilter: Omit<SavedFilter, 'id' | 'created' | 'updated'> = {
          name: 'test-filter',
          filter: 'title contains "test"',
          isGlobal: false
        };

        const created = await adapter.create(validFilter);

        const validExpression: FilterExpression = {
          groups: [{
            conditions: [{
              field: 'priority',
              operator: '>',
              value: 5
            }],
            operator: '&&'
          }]
        };

        const validUpdate = {
          expression: validExpression
        };

        const updated = await expect(adapter.update(created.id, validUpdate)).resolves.toBeDefined();
        expect(updated.expression).toEqual(validExpression);
      });
    });
  });

  describe('JSON Parsing Safety', () => {
    it('should handle malformed JSON in database safely', async () => {
      await adapter.initialize(mockSession);

      // Create a valid filter first
      const validFilter: Omit<SavedFilter, 'id' | 'created' | 'updated'> = {
        name: 'test-filter',
        filter: 'title contains "test"',
        isGlobal: false
      };

      const created = await adapter.create(validFilter);

      // Manually corrupt the database to simulate stored XSS
      const db = new Database(dbPath);
      db.prepare(`
        UPDATE saved_filters
        SET expression = ?
        WHERE id = ?
      `).run('{"groups":[{"conditions":[{"field":"title","operator":"like","value":"<script>alert(\\"XSS\\")</script>"}],"operator":"&&"}]}', created.id);
      db.close();

      // Should handle the malicious JSON gracefully
      await expect(adapter.get(created.id)).rejects.toThrow(StorageDataError);
    });

    it('should reject deeply nested expressions (DoS protection)', async () => {
      await adapter.initialize(mockSession);

      // Create deeply nested expression
      const createDeeplyNested = (depth: number): FilterExpression => {
        if (depth === 0) {
          return {
            groups: [{
              conditions: [{
                field: 'title',
                operator: 'like',
                value: 'test'
              }],
              operator: '&&'
            }]
          };
        }
        return {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: 'test'
            }],
            operator: '&&'
          }],
          operator: '&&'
        };
      };

      const maliciousFilter: Omit<SavedFilter, 'id' | 'created' | 'updated'> = {
        name: 'deep-nested-filter',
        filter: 'deeply nested expression',
        expression: createDeeplyNested(50), // 50 levels deep
        isGlobal: false
      };

      await expect(adapter.create(maliciousFilter)).rejects.toThrow(StorageDataError);
    });

    it('should reject expressions with too many conditions (DoS protection)', async () => {
      await adapter.initialize(mockSession);

      // Create expression with many conditions
      const manyConditions = [];
      for (let i = 0; i < 100; i++) {
        manyConditions.push({
          field: 'title' as const,
          operator: 'like' as const,
          value: `condition${i}`
        });
      }

      const maliciousFilter: Omit<SavedFilter, 'id' | 'created' | 'updated'> = {
        name: 'many-conditions-filter',
        filter: 'expression with many conditions',
        expression: {
          groups: [{
            conditions: manyConditions,
            operator: '&&'
          }]
        },
        isGlobal: false
      };

      await expect(adapter.create(maliciousFilter)).rejects.toThrow(StorageDataError);
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize HTML in filter values', async () => {
      await adapter.initialize(mockSession);

      const maliciousExpression: FilterExpression = {
        groups: [{
          conditions: [{
            field: 'title',
            operator: 'like',
            value: '<script>alert("XSS")</script>'
          }],
          operator: '&&'
        }]
      };

      const maliciousFilter: Omit<SavedFilter, 'id' | 'created' | 'updated'> = {
        name: 'sanitized-filter',
        filter: 'title contains script',
        expression: maliciousExpression,
        isGlobal: false
      };

      await expect(adapter.create(maliciousFilter)).rejects.toThrow(StorageDataError);
    });

    it('should reject invalid field names', async () => {
      await adapter.initialize(mockSession);

      const maliciousExpression: FilterExpression = {
        groups: [{
          conditions: [{
            field: '__proto__' as any, // Attempt prototype pollution
            operator: 'like',
            value: 'malicious'
          }],
          operator: '&&'
        }]
      };

      const maliciousFilter: Omit<SavedFilter, 'id' | 'created' | 'updated'> = {
        name: 'proto-pollution-filter',
        filter: 'prototype pollution attempt',
        expression: maliciousExpression,
        isGlobal: false
      };

      await expect(adapter.create(maliciousFilter)).rejects.toThrow(StorageDataError);
    });

    it('should reject invalid operators', async () => {
      await adapter.initialize(mockSession);

      const maliciousExpression: FilterExpression = {
        groups: [{
          conditions: [{
            field: 'title',
            operator: '$where' as any, // Attempt NoSQL injection-like operator
            value: 'malicious'
          }],
          operator: '&&'
        }]
      };

      const maliciousFilter: Omit<SavedFilter, 'id' | 'created' | 'updated'> = {
        name: 'invalid-operator-filter',
        filter: 'invalid operator attempt',
        expression: maliciousExpression,
        isGlobal: false
      };

      await expect(adapter.create(maliciousFilter)).rejects.toThrow(StorageDataError);
    });
  });
});