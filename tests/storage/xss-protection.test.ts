/**
 * XSS Protection Integration Tests
 *
 * This test suite verifies that XSS protection is properly integrated
 * into the SQLiteStorageAdapter for stored filter expressions.
 */

import { SQLiteStorageAdapter } from '../../src/storage/adapters/SQLiteStorageAdapter';
import { sanitizeString, safeJsonStringify, safeJsonParse } from '../../src/utils/validation';
import { StorageDataError } from '../../src/storage/interfaces';
import type { SavedFilter, FilterExpression } from '../../src/types/filters';
import { v4 as uuidv4 } from 'uuid';
import { tmpdir } from 'os';
import { join } from 'path';

describe('XSS Protection Integration Tests', () => {
  let adapter: SQLiteStorageAdapter;
  let testDbPath: string;
  let sessionId: string;

  beforeEach(() => {
    // Create unique test database
    const testId = uuidv4();
    testDbPath = join(tmpdir(), `test-xss-protection-${testId}.db`);
    sessionId = uuidv4();

    adapter = new SQLiteStorageAdapter({
      databasePath: testDbPath,
      enableWAL: false, // Disable for simpler testing
      debug: false,
    });
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.close();
    }
    // Note: We don't delete the test file here to allow for post-mortem analysis
  });

  describe('Storage Adapter XSS Protection', () => {
    it('should prevent storing malicious XSS content in expressions', async () => {
      await adapter.initialize({ id: sessionId, createdAt: new Date(), lastAccessAt: new Date() });

      const maliciousFilter: SavedFilter = {
        id: uuidv4(),
        name: 'Malicious Filter',
        filter: 'basic filter text',
        expression: {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: '<script>alert("XSS")</script>'
            }],
            operator: '&&'
          }]
        },
        isGlobal: false,
        created: new Date(),
        updated: new Date(),
      };

      await expect(adapter.create(maliciousFilter)).rejects.toThrow(StorageDataError);
    });

    it('should allow storing safe HTML content that gets escaped', async () => {
      await adapter.initialize({ id: sessionId, createdAt: new Date(), lastAccessAt: new Date() });

      const safeFilter: SavedFilter = {
        id: uuidv4(),
        name: 'Safe HTML Filter',
        filter: 'safe filter text',
        expression: {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: '<b>important task</b>'
            }],
            operator: '&&'
          }]
        },
        isGlobal: false,
        created: new Date(),
        updated: new Date(),
      };

      const result = await adapter.create(safeFilter);
      expect(result).toBeDefined();
      expect(result.name).toBe('Safe HTML Filter');

      // Verify the HTML was properly escaped when stored
      const retrieved = await adapter.get(result.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.expression?.groups[0].conditions[0].value).toBe('&lt;b&gt;important task&lt;&#x2F;b&gt;');
    });

    it('should prevent prototype pollution attacks', async () => {
      await adapter.initialize({ id: sessionId, createdAt: new Date(), lastAccessAt: new Date() });

      const maliciousFilter: SavedFilter = {
        id: uuidv4(),
        name: 'Prototype Pollution Filter',
        filter: 'basic filter text',
        expression: {
          groups: [{
            conditions: [{
              field: '__proto__' as any,
              operator: '=' as any,
              value: 'malicious'
            }],
            operator: '&&'
          }]
        },
        isGlobal: false,
        created: new Date(),
        updated: new Date(),
      };

      await expect(adapter.create(maliciousFilter)).rejects.toThrow(StorageDataError);
    });

    it('should prevent DoS attacks with excessive conditions', async () => {
      await adapter.initialize({ id: sessionId, createdAt: new Date(), lastAccessAt: new Date() });

      const manyConditions = [];
      for (let i = 0; i < 60; i++) { // Exceed MAX_CONDITIONS (50)
        manyConditions.push({
          field: 'title',
          operator: 'like',
          value: `condition${i}`
        });
      }

      const dosFilter: SavedFilter = {
        id: uuidv4(),
        name: 'DoS Filter',
        filter: 'dos filter text',
        expression: {
          groups: [{
            conditions: manyConditions,
            operator: '&&'
          }]
        },
        isGlobal: false,
        created: new Date(),
        updated: new Date(),
      };

      await expect(adapter.create(dosFilter)).rejects.toThrow(StorageDataError);
    });

    it('should maintain data integrity with complex valid expressions', async () => {
      await adapter.initialize({ id: sessionId, createdAt: new Date(), lastAccessAt: new Date() });

      const complexFilter: SavedFilter = {
        id: uuidv4(),
        name: 'Complex Valid Filter',
        filter: 'complex filter text',
        expression: {
          groups: [
            {
              conditions: [
                { field: 'title', operator: 'like', value: 'urgent' },
                { field: 'priority', operator: '>', value: 5 }
              ],
              operator: '&&'
            },
            {
              conditions: [
                { field: 'done', operator: '=', value: false }
              ],
              operator: '||'
            }
          ],
          operator: '&&'
        },
        isGlobal: false,
        created: new Date(),
        updated: new Date(),
      };

      const result = await adapter.create(complexFilter);
      expect(result).toBeDefined();

      const retrieved = await adapter.get(result.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.expression).toEqual(complexFilter.expression);
    });

    it('should handle safe string arrays properly', async () => {
      await adapter.initialize({ id: sessionId, createdAt: new Date(), lastAccessAt: new Date() });

      const arrayFilter: SavedFilter = {
        id: uuidv4(),
        name: 'Array Filter',
        filter: 'array filter text',
        expression: {
          groups: [{
            conditions: [{
              field: 'labels',
              operator: 'in',
              value: ['<b>urgent</b>', 'normal', '<i>important</i>']
            }],
            operator: '&&'
          }]
        },
        isGlobal: false,
        created: new Date(),
        updated: new Date(),
      };

      const result = await adapter.create(arrayFilter);
      expect(result).toBeDefined();

      const retrieved = await adapter.get(result.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.expression?.groups[0].conditions[0].value).toEqual([
        '&lt;b&gt;urgent&lt;&#x2F;b&gt;',
        'normal',
        '&lt;i&gt;important&lt;&#x2F;i&gt;'
      ]);
    });

    it('should reject malformed JSON expressions', async () => {
      await adapter.initialize({ id: sessionId, createdAt: new Date(), lastAccessAt: new Date() });

      // This test verifies that even if somehow malicious JSON gets into the database,
      // it will be rejected during parsing
      const maliciousJson = '{"groups":[{"conditions":[{"field":"__proto__","operator":"=","value":"malicious"}],"operator":"&&"}]}';

      expect(() => safeJsonParse(maliciousJson)).toThrow(StorageDataError);
    });

    it('should integrate with existing storage operations seamlessly', async () => {
      await adapter.initialize({ id: sessionId, createdAt: new Date(), lastAccessAt: new Date() });

      // Test normal operations still work
      const normalFilter: SavedFilter = {
        id: uuidv4(),
        name: 'Normal Filter',
        filter: 'normal filter text',
        isGlobal: false,
        created: new Date(),
        updated: new Date(),
      };

      const created = await adapter.create(normalFilter);
      const retrieved = await adapter.get(created.id);
      expect(retrieved).toEqual(created);

      const list = await adapter.list();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Normal Filter');

      // Test update operations
      const updatedFilter = {
        ...created,
        name: 'Updated Normal Filter',
        expression: {
          groups: [{
            conditions: [{
              field: 'title',
              operator: 'like',
              value: 'updated'
            }],
            operator: '&&'
          }]
        },
        updated: new Date(),
      };

      const updated = await adapter.update(created.id, updatedFilter);
      expect(updated.name).toBe('Updated Normal Filter');
      expect(updated.expression).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of safe filters efficiently', async () => {
      await adapter.initialize({ id: sessionId, createdAt: new Date(), lastAccessAt: new Date() });

      const filters: SavedFilter[] = [];
      for (let i = 0; i < 20; i++) {
        filters.push({
          id: uuidv4(),
          name: `Filter ${i}`,
          filter: `filter text ${i}`,
          expression: {
            groups: [{
              conditions: [{
                field: 'title',
                operator: 'like',
                value: `task ${i}`
              }],
              operator: '&&'
            }]
          },
          isGlobal: false,
          created: new Date(),
          updated: new Date(),
        });
      }

      const startTime = Date.now();
      const createdFilters = await Promise.all(filters.map(f => adapter.create(f)));
      const endTime = Date.now();

      expect(createdFilters).toHaveLength(20);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds

      const list = await adapter.list();
      expect(list).toHaveLength(20);
    });
  });
});