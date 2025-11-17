/**
 * Storage Adapter Orchestrators Module
 *
 * This module provides orchestrator components for coordinating storage adapter
 * operations, lifecycle management, and health monitoring.
 *
 * Key Features:
 * - Thread-safe adapter operations with mutex protection
 * - Comprehensive error handling and automatic recovery
 * - Adapter factory coordination and configuration management
 * - Health monitoring with configurable failure thresholds
 * - Graceful fallback mechanisms and lifecycle management
 *
 * Usage Example:
 * ```typescript
 * const orchestrator = new StorageAdapterOrchestrator({
 *   healthCheckInterval: 30000,
 *   maxConsecutiveFailures: 3,
 *   enableAutoRecovery: true,
 * });
 *
 * await orchestrator.initialize(session);
 * const adapter = await orchestrator.getAdapter();
 * // Use adapter for storage operations...
 * await orchestrator.close();
 * ```
 */

export { StorageAdapterOrchestrator } from './StorageAdapterOrchestrator';
export type {
  StorageAdapterOrchestrator as IStorageAdapterOrchestrator,
  AdapterState,
  AdapterStatus,
  AdapterInitializationOptions,
  OrchestrationConfig,
} from './interfaces';