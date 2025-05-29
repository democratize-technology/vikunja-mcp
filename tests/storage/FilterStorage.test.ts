/**
 * Tests for FilterStorage
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemoryFilterStorage } from '../../src/storage/FilterStorage';
import type { SavedFilter } from '../../src/types/filters';

describe('InMemoryFilterStorage', () => {
  let storage: InMemoryFilterStorage;

  beforeEach(async () => {
    storage = new InMemoryFilterStorage();
    await storage.clear();
  });

  describe('create', () => {
    it('should create a new filter', async () => {
      const filter = await storage.create({
        name: 'Test Filter',
        description: 'A test filter',
        filter: 'done = false',
        isGlobal: true,
      });

      expect(filter.id).toBeDefined();
      expect(filter.name).toBe('Test Filter');
      expect(filter.created).toBeInstanceOf(Date);
      expect(filter.updated).toBeInstanceOf(Date);
    });

    it('should generate unique IDs', async () => {
      const filter1 = await storage.create({
        name: 'Filter 1',
        filter: 'priority = 1',
        isGlobal: false,
      });

      const filter2 = await storage.create({
        name: 'Filter 2',
        filter: 'priority = 2',
        isGlobal: false,
      });

      expect(filter1.id).not.toBe(filter2.id);
    });
  });

  describe('get', () => {
    it('should retrieve an existing filter', async () => {
      const created = await storage.create({
        name: 'Test Filter',
        filter: 'done = false',
        isGlobal: true,
      });

      const retrieved = await storage.get(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.name).toBe('Test Filter');
    });

    it('should return null for non-existent filter', async () => {
      const retrieved = await storage.get('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('list', () => {
    it('should return all filters sorted by updated date', async () => {
      // Create filters with slight delays to ensure different timestamps
      const filter1 = await storage.create({
        name: 'Filter 1',
        filter: 'priority = 1',
        isGlobal: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const filter2 = await storage.create({
        name: 'Filter 2',
        filter: 'priority = 2',
        isGlobal: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const filter3 = await storage.create({
        name: 'Filter 3',
        filter: 'priority = 3',
        isGlobal: false,
      });

      const filters = await storage.list();
      expect(filters).toHaveLength(3);
      expect(filters[0].name).toBe('Filter 3'); // Most recent first
      expect(filters[2].name).toBe('Filter 1'); // Oldest last
    });

    it('should return empty array when no filters exist', async () => {
      const filters = await storage.list();
      expect(filters).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update an existing filter', async () => {
      const created = await storage.create({
        name: 'Original Name',
        filter: 'done = false',
        isGlobal: false,
      });

      const originalCreated = created.created;
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await storage.update(created.id, {
        name: 'Updated Name',
        description: 'Now with description',
      });

      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Now with description');
      expect(updated.filter).toBe('done = false'); // Unchanged
      expect(updated.created).toEqual(originalCreated);
      expect(updated.updated.getTime()).toBeGreaterThan(originalCreated.getTime());
    });

    it('should throw error for non-existent filter', async () => {
      await expect(storage.update('non-existent-id', { name: 'New Name' })).rejects.toThrow(
        'Filter with id non-existent-id not found',
      );
    });
  });

  describe('delete', () => {
    it('should delete an existing filter', async () => {
      const created = await storage.create({
        name: 'To Delete',
        filter: 'done = true',
        isGlobal: false,
      });

      await storage.delete(created.id);

      const retrieved = await storage.get(created.id);
      expect(retrieved).toBeNull();
    });

    it('should throw error for non-existent filter', async () => {
      await expect(storage.delete('non-existent-id')).rejects.toThrow(
        'Filter with id non-existent-id not found',
      );
    });
  });

  describe('findByName', () => {
    it('should find filter by exact name', async () => {
      await storage.create({
        name: 'Unique Name',
        filter: 'priority = 5',
        isGlobal: true,
      });

      const found = await storage.findByName('Unique Name');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Unique Name');
    });

    it('should return null for non-existent name', async () => {
      const found = await storage.findByName('Non Existent');
      expect(found).toBeNull();
    });

    it('should return first match if multiple filters have same name', async () => {
      const filter1 = await storage.create({
        name: 'Duplicate',
        filter: 'priority = 1',
        isGlobal: false,
      });

      const filter2 = await storage.create({
        name: 'Duplicate',
        filter: 'priority = 2',
        isGlobal: false,
      });

      const found = await storage.findByName('Duplicate');
      expect(found).not.toBeNull();
      // Should return the first one found (implementation dependent)
      expect([filter1.id, filter2.id]).toContain(found!.id);
    });
  });

  describe('getByProject', () => {
    it('should return project-specific and global filters', async () => {
      const projectId = 42;

      // Create various filters
      await storage.create({
        name: 'Global Filter',
        filter: 'done = false',
        isGlobal: true,
      });

      await storage.create({
        name: 'Project Filter',
        filter: 'priority >= 3',
        projectId,
        isGlobal: false,
      });

      await storage.create({
        name: 'Other Project Filter',
        filter: 'priority = 1',
        projectId: 99,
        isGlobal: false,
      });

      const filters = await storage.getByProject(projectId);
      expect(filters).toHaveLength(2);
      expect(filters.map((f) => f.name)).toContain('Global Filter');
      expect(filters.map((f) => f.name)).toContain('Project Filter');
      expect(filters.map((f) => f.name)).not.toContain('Other Project Filter');
    });

    it('should return only global filters for projects with no specific filters', async () => {
      await storage.create({
        name: 'Global Filter',
        filter: 'done = false',
        isGlobal: true,
      });

      const filters = await storage.getByProject(999);
      expect(filters).toHaveLength(1);
      expect(filters[0].name).toBe('Global Filter');
    });
  });

  describe('clear', () => {
    it('should remove all filters', async () => {
      await storage.create({
        name: 'Filter 1',
        filter: 'priority = 1',
        isGlobal: false,
      });

      await storage.create({
        name: 'Filter 2',
        filter: 'priority = 2',
        isGlobal: false,
      });

      await storage.clear();

      const filters = await storage.list();
      expect(filters).toEqual([]);
    });
  });
});
