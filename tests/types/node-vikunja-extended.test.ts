/**
 * Tests for node-vikunja-extended type guards and utilities
 */

import { describe, it, expect } from '@jest/globals';
import {
  isVikunjaClient,
  isVikunjaClientConstructor,
} from '../../src/types/node-vikunja-extended';

describe('Type Guards', () => {
  describe('isVikunjaClient', () => {
    it('should return true for valid VikunjaClient object', () => {
      const validClient = {
        teams: {},
        labels: {},
        tasks: {},
        projects: {},
        users: {},
      };

      expect(isVikunjaClient(validClient)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isVikunjaClient(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isVikunjaClient(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(isVikunjaClient('string')).toBe(false);
      expect(isVikunjaClient(123)).toBe(false);
      expect(isVikunjaClient(true)).toBe(false);
    });

    it('should return false for object missing required properties', () => {
      const invalidClient = {
        teams: {},
        labels: {},
        // missing tasks, projects, users
      };

      expect(isVikunjaClient(invalidClient)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isVikunjaClient({})).toBe(false);
    });
  });

  describe('isVikunjaClientConstructor', () => {
    it('should return true for function constructors', () => {
      function MockConstructor() {}
      class MockClass {}

      expect(isVikunjaClientConstructor(MockConstructor)).toBe(true);
      expect(isVikunjaClientConstructor(MockClass)).toBe(true);
      expect(isVikunjaClientConstructor(() => {})).toBe(true);
    });

    it('should return false for non-function types', () => {
      expect(isVikunjaClientConstructor(null)).toBe(false);
      expect(isVikunjaClientConstructor(undefined)).toBe(false);
      expect(isVikunjaClientConstructor('string')).toBe(false);
      expect(isVikunjaClientConstructor(123)).toBe(false);
      expect(isVikunjaClientConstructor({})).toBe(false);
      expect(isVikunjaClientConstructor([])).toBe(false);
      expect(isVikunjaClientConstructor(true)).toBe(false);
    });
  });
});