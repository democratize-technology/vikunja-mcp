import { Verbosity, FieldCategory, SizeEstimator } from '../../src/transforms/base';

describe('Base Transformation System', () => {
  describe('Verbosity Enum', () => {
    it('should have all expected verbosity levels', () => {
      expect(Verbosity.MINIMAL).toBe('minimal');
      expect(Verbosity.STANDARD).toBe('standard');
      expect(Verbosity.DETAILED).toBe('detailed');
      expect(Verbosity.COMPLETE).toBe('complete');
    });
  });

  describe('FieldCategory Enum', () => {
    it('should have all expected field categories', () => {
      expect(FieldCategory.CORE).toBe('core');
      expect(FieldCategory.CONTEXT).toBe('context');
      expect(FieldCategory.SCHEDULING).toBe('scheduling');
      expect(FieldCategory.METADATA).toBe('metadata');
    });
  });

  describe('SizeEstimator', () => {
    it('should return 0 for null and undefined values', () => {
      expect(SizeEstimator.estimateSize(null)).toBe(0);
      expect(SizeEstimator.estimateSize(undefined)).toBe(0);
    });

    it('should estimate string size correctly', () => {
      expect(SizeEstimator.estimateSize('hello')).toBe(10);
      expect(SizeEstimator.estimateSize('')).toBe(0);
    });

    it('should estimate number size correctly', () => {
      expect(SizeEstimator.estimateSize(42)).toBe(8);
      expect(SizeEstimator.estimateSize(0)).toBe(8);
    });

    it('should estimate boolean size correctly', () => {
      expect(SizeEstimator.estimateSize(true)).toBe(4);
      expect(SizeEstimator.estimateSize(false)).toBe(4);
    });

    it('should calculate reduction percentage correctly', () => {
      expect(SizeEstimator.calculateReduction(100, 50)).toBe(50);
      expect(SizeEstimator.calculateReduction(200, 100)).toBe(50);
      expect(SizeEstimator.calculateReduction(100, 0)).toBe(100);
      expect(SizeEstimator.calculateReduction(100, 100)).toBe(0);
    });

    it('should handle zero original size', () => {
      expect(SizeEstimator.calculateReduction(0, 0)).toBe(0);
      expect(SizeEstimator.calculateReduction(0, 50)).toBe(0);
    });
  });
});