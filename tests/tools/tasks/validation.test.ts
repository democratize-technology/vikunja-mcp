import { describe, it, expect, jest } from '@jest/globals';
import {
  validateDateString,
  validateId,
  convertRepeatConfiguration,
  processBatches,
} from '../../../src/tools/tasks/validation';
import { MCPError, ErrorCode } from '../../../src/types';

describe('Validation utilities', () => {
  describe('validateDateString', () => {
    it('should accept valid ISO 8601 date strings', () => {
      expect(() => validateDateString('2024-05-24T10:00:00Z', 'testDate')).not.toThrow();
      expect(() => validateDateString('2024-05-24', 'testDate')).not.toThrow();
      expect(() => validateDateString('2024-05-24T10:00:00+02:00', 'testDate')).not.toThrow();
    });

    it('should throw error for invalid date strings', () => {
      expect(() => validateDateString('invalid-date', 'testDate')).toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'testDate must be a valid ISO 8601 date string (e.g., 2024-05-24T10:00:00Z)'
        )
      );
    });

    it('should throw error for malformed dates', () => {
      expect(() => validateDateString('2024-13-45', 'testDate')).toThrow(
        new MCPError(
          ErrorCode.VALIDATION_ERROR,
          'testDate must be a valid ISO 8601 date string (e.g., 2024-05-24T10:00:00Z)'
        )
      );
    });
  });

  describe('validateId', () => {
    it('should accept positive integers', () => {
      expect(() => validateId(1, 'testId')).not.toThrow();
      expect(() => validateId(100, 'testId')).not.toThrow();
      expect(() => validateId(999999, 'testId')).not.toThrow();
    });

    it('should throw error for zero', () => {
      expect(() => validateId(0, 'testId')).toThrow(
        new MCPError(ErrorCode.VALIDATION_ERROR, 'testId must be a positive integer')
      );
    });

    it('should throw error for negative numbers', () => {
      expect(() => validateId(-1, 'testId')).toThrow(
        new MCPError(ErrorCode.VALIDATION_ERROR, 'testId must be a positive integer')
      );
    });

    it('should throw error for non-integers', () => {
      expect(() => validateId(1.5, 'testId')).toThrow(
        new MCPError(ErrorCode.VALIDATION_ERROR, 'testId must be a positive integer')
      );
    });
  });

  describe('convertRepeatConfiguration', () => {
    it('should convert daily repeat', () => {
      const result = convertRepeatConfiguration(7, 'day');
      expect(result).toEqual({
        repeat_mode: 0,
        repeat_after: 7 * 24 * 60 * 60, // 7 days in seconds
      });
    });

    it('should convert weekly repeat', () => {
      const result = convertRepeatConfiguration(2, 'week');
      expect(result).toEqual({
        repeat_mode: 0,
        repeat_after: 2 * 7 * 24 * 60 * 60, // 2 weeks in seconds
      });
    });

    it('should convert monthly repeat', () => {
      const result = convertRepeatConfiguration(1, 'month');
      expect(result).toEqual({
        repeat_mode: 1, // Special mode for monthly
        repeat_after: 1 * 30 * 24 * 60 * 60, // Approximate month in seconds
      });
    });

    it('should convert yearly repeat', () => {
      const result = convertRepeatConfiguration(1, 'year');
      expect(result).toEqual({
        repeat_mode: 0,
        repeat_after: 1 * 365 * 24 * 60 * 60, // 1 year in seconds (approximate)
      });
    });

    it('should handle repeatAfter without mode', () => {
      const result = convertRepeatConfiguration(3600, undefined);
      expect(result).toEqual({
        repeat_mode: 0,
        repeat_after: 3600, // Assumes value is already in seconds
      });
    });

    it('should handle month mode without repeatAfter', () => {
      const result = convertRepeatConfiguration(undefined, 'month');
      expect(result).toEqual({
        repeat_mode: 1,
      });
    });

    it('should return empty object when no parameters provided', () => {
      const result = convertRepeatConfiguration(undefined, undefined);
      expect(result).toEqual({});
    });
  });

  describe('processBatches', () => {
    it('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const processor = jest.fn().mockImplementation((batch) => 
        Promise.resolve(batch.map((n: number) => n * 2))
      );

      const result = await processBatches(items, 3, processor);

      expect(processor).toHaveBeenCalledTimes(4); // 10 items / 3 batch size = 4 batches
      expect(processor).toHaveBeenCalledWith([1, 2, 3]);
      expect(processor).toHaveBeenCalledWith([4, 5, 6]);
      expect(processor).toHaveBeenCalledWith([7, 8, 9]);
      expect(processor).toHaveBeenCalledWith([10]);
      expect(result).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    });

    it('should handle empty array', async () => {
      const processor = jest.fn().mockResolvedValue([]);

      const result = await processBatches([], 5, processor);

      expect(processor).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should handle single batch', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn().mockImplementation((batch) => 
        Promise.resolve(batch.map((n: number) => n * 2))
      );

      const result = await processBatches(items, 10, processor);

      expect(processor).toHaveBeenCalledTimes(1);
      expect(processor).toHaveBeenCalledWith([1, 2, 3]);
      expect(result).toEqual([2, 4, 6]);
    });

    it('should handle processor errors', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn().mockRejectedValue(new Error('Processing failed'));

      await expect(processBatches(items, 2, processor)).rejects.toThrow('Processing failed');
    });

    it('should maintain order of results', async () => {
      const items = Array.from({ length: 20 }, (_, i) => i + 1);
      const processor = jest.fn().mockImplementation((batch) => 
        Promise.resolve(batch.map((n: number) => `item-${n}`))
      );

      const result = await processBatches(items, 7, processor);

      expect(result).toHaveLength(20);
      expect(result[0]).toBe('item-1');
      expect(result[19]).toBe('item-20');
    });
  });
});