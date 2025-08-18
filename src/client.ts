/**
 * Vikunja Client Factory Exports
 * Re-exports for backwards compatibility
 */

import type { VikunjaClient } from 'node-vikunja';
import type { AuthManager } from './auth/AuthManager';
import type { 
  VikunjaModule 
} from './types/node-vikunja-extended';
import { isVikunjaClientConstructor } from './types/node-vikunja-extended';
import { VikunjaClientFactory } from './client/VikunjaClientFactory';

export { VikunjaClientFactory } from './client/VikunjaClientFactory';

// Global factory instance for backwards compatibility
let globalFactory: VikunjaClientFactory | null = null;

/**
 * Client context that can switch between factory and legacy modes
 */
class ClientContext {
  private static instance: ClientContext | null = null;
  private clientFactory: VikunjaClientFactory | null = null;

  private constructor() {}

  static getInstance(): ClientContext {
    if (!ClientContext.instance) {
      ClientContext.instance = new ClientContext();
    }
    return ClientContext.instance;
  }

  /**
   * Set the client factory for dependency injection
   */
  setClientFactory(factory: VikunjaClientFactory): void {
    this.clientFactory = factory;
  }

  /**
   * Clear the client factory (for testing)
   */
  clearClientFactory(): void {
    this.clientFactory = null;
  }

  /**
   * Get a client instance using the factory if available, otherwise fall back to legacy
   */
  async getClient(): Promise<VikunjaClient> {
    if (this.clientFactory) {
      return Promise.resolve(this.clientFactory.getClient());
    }
    // Fall back to legacy global factory
    if (globalFactory) {
      return Promise.resolve(globalFactory.getClient());
    }
    throw new Error('No client factory available. Please authenticate first.');
  }

  /**
   * Check if factory is available
   */
  hasFactory(): boolean {
    return this.clientFactory !== null;
  }
}

/**
 * Convenience function to get client from context
 */
export async function getClientFromContext(): Promise<VikunjaClient> {
  return ClientContext.getInstance().getClient();
}

/**
 * Set the global client factory for all tools
 */
export function setGlobalClientFactory(factory: VikunjaClientFactory): void {
  ClientContext.getInstance().setClientFactory(factory);
}

/**
 * Clear the global client factory (for testing)
 */
export function clearGlobalClientFactory(): void {
  ClientContext.getInstance().clearClientFactory();
}

export { ClientContext };

/**
 * Creates a new VikunjaClientFactory with dependency injection
 */
export async function createVikunjaClientFactory(authManager: AuthManager): Promise<VikunjaClientFactory> {
  // Dynamically import VikunjaClient
  const module: VikunjaModule = await import('node-vikunja');
  if (!isVikunjaClientConstructor(module.VikunjaClient)) {
    throw new Error('Invalid VikunjaClient constructor imported');
  }
  
  return new VikunjaClientFactory(authManager, module.VikunjaClient);
}

/**
 * Sets the global factory instance for backwards compatibility
 * @deprecated Use dependency injection instead
 */
export function setGlobalFactory(factory: VikunjaClientFactory): void {
  globalFactory = factory;
}

/**
 * Get an authenticated Vikunja client instance
 * @deprecated Use VikunjaClientFactory.getClient() directly
 */
export function getVikunjaClient(): VikunjaClient {
  if (!globalFactory) {
    throw new Error('Global factory not initialized. Use createVikunjaClientFactory or inject VikunjaClientFactory directly.');
  }
  
  return globalFactory.getClient();
}

/**
 * Cleanup function to reset client instance
 * @deprecated Use VikunjaClientFactory.cleanup() directly
 */
export function cleanupVikunjaClient(): void {
  if (globalFactory) {
    globalFactory.cleanup();
  }
}

/**
 * Legacy setAuthManager function for backwards compatibility
 * @deprecated Use dependency injection instead
 */
export async function setAuthManager(manager: AuthManager): Promise<void> {
  const factory = await createVikunjaClientFactory(manager);
  setGlobalFactory(factory);
}
