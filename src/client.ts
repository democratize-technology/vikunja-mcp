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
import { AsyncMutex } from './utils/AsyncMutex';

export { VikunjaClientFactory } from './client/VikunjaClientFactory';

/**
 * Client context for dependency injection with thread safety
 *
 * NOTE: The synchronous getInstance() method has potential race conditions
 * in highly concurrent scenarios. For thread safety, use getInstanceAsync().
 */
class ClientContext {
  private static instance: ClientContext | null = null;
  private static instanceMutex = new AsyncMutex();
  private clientFactory: VikunjaClientFactory | null = null;
  private factoryMutex = new AsyncMutex();

  private constructor() {}

  /**
   * Backward compatible synchronous getInstance
   * @deprecated Use getInstanceAsync() for thread safety. This method has race conditions in concurrent scenarios.
   */
  static getInstance(): ClientContext {
    if (!ClientContext.instance) {
      ClientContext.instance = new ClientContext();
    }
    return ClientContext.instance;
  }

  /**
   * Thread-safe async getInstance for new code
   */
  static async getInstanceAsync(): Promise<ClientContext> {
    const release = await ClientContext.instanceMutex.acquire();
    try {
      if (!ClientContext.instance) {
        ClientContext.instance = new ClientContext();
      }
      return ClientContext.instance;
    } finally {
      release();
    }
  }

  // Backward compatible synchronous versions (NOT THREAD-SAFE)
  /**
   * Set the client factory for dependency injection (synchronous, NOT thread-safe)
   * WARNING: This method can cause race conditions in concurrent scenarios.
   * Use the async version for thread safety.
   */
  setClientFactory(factory: VikunjaClientFactory): void {
    this.clientFactory = factory;
  }

  /**
   * Set the client factory for dependency injection (thread-safe)
   */
  async setClientFactoryThreadSafe(factory: VikunjaClientFactory): Promise<void> {
    const release = await this.factoryMutex.acquire();
    try {
      this.clientFactory = factory;
    } finally {
      release();
    }
  }

  /**
   * Clear the client factory (for testing, synchronous, NOT thread-safe)
   * WARNING: This method can cause race conditions in concurrent scenarios.
   * Use the async version for thread safety.
   */
  clearClientFactory(): void {
    this.clientFactory = null;
  }

  /**
   * Clear the client factory (for testing, thread-safe)
   */
  async clearClientFactoryThreadSafe(): Promise<void> {
    const release = await this.factoryMutex.acquire();
    try {
      this.clientFactory = null;
    } finally {
      release();
    }
  }

  /**
   * Get a client instance using the factory (synchronous, NOT thread-safe)
   * WARNING: This method can cause race conditions in concurrent scenarios.
   * Use the async version for thread safety.
   */
  async getClient(): Promise<VikunjaClient> {
    if (this.clientFactory) {
      return Promise.resolve(this.clientFactory.getClient());
    }
    throw new Error('No client factory available. Please authenticate first.');
  }

  /**
   * Get a client instance using the factory (thread-safe)
   */
  async getClientThreadSafe(): Promise<VikunjaClient> {
    const release = await this.factoryMutex.acquire();
    try {
      if (this.clientFactory) {
        return this.clientFactory.getClient();
      }
      throw new Error('No client factory available. Please authenticate first.');
    } finally {
      release();
    }
  }

  /**
   * Check if factory is available (synchronous, NOT thread-safe)
   * WARNING: This method can cause race conditions in concurrent scenarios.
   * Use the async version for thread safety.
   */
  hasFactory(): boolean {
    return this.clientFactory !== null;
  }

  /**
   * Check if factory is available (thread-safe)
   */
  async hasFactoryThreadSafe(): Promise<boolean> {
    const release = await this.factoryMutex.acquire();
    try {
      return this.clientFactory !== null;
    } finally {
      release();
    }
  }
}

/**
 * Convenience function to get client from context (backward compatible)
 */
export async function getClientFromContext(): Promise<VikunjaClient> {
  return ClientContext.getInstance().getClient();
}

/**
 * Set the global client factory for all tools (backward compatible)
 */
export function setGlobalClientFactory(factory: VikunjaClientFactory): void {
  ClientContext.getInstance().setClientFactory(factory);
}

/**
 * Clear the global client factory (for testing, backward compatible)
 */
export function clearGlobalClientFactory(): void {
  ClientContext.getInstance().clearClientFactory();
}

// Thread-safe versions for new code
/**
 * Convenience function to get client from context (thread-safe)
 */
export async function getClientFromContextAsync(): Promise<VikunjaClient> {
  const context = await ClientContext.getInstanceAsync();
  return context.getClient();
}

/**
 * Set the global client factory for all tools (thread-safe)
 */
export async function setGlobalClientFactoryAsync(factory: VikunjaClientFactory): Promise<void> {
  const context = await ClientContext.getInstanceAsync();
  await context.setClientFactory(factory);
}

/**
 * Clear the global client factory (for testing, thread-safe)
 */
export async function clearGlobalClientFactoryAsync(): Promise<void> {
  const context = await ClientContext.getInstanceAsync();
  await context.clearClientFactory();
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

