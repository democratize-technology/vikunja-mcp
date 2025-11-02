/**
 * AI-Optimized Response Protocol (AORP) Module
 * Provides structured, AI-friendly response format with confidence scoring,
 * next steps generation, and quality indicators.
 */

// Export all types and interfaces
export * from './types';

// Export main classes and utilities
export { AorpBuilder } from './builder';
export { AorpResponseFactory, defaultAorpFactory } from './factory';

// Re-export utility functions for convenience
export {
  createAorpResponse as createAorpFromOptimized,
  createAorpFromData,
  createAorpFromError
} from './factory';