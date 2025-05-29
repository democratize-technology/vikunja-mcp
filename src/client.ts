/**
 * Vikunja Client Factory
 * Creates and manages Vikunja client instances
 */

import type { VikunjaClient } from 'node-vikunja';
import type { AuthManager } from './auth/AuthManager';

// Global auth manager instance (set by index.ts)
let authManager: AuthManager | null = null;

export function setAuthManager(manager: AuthManager): void {
  authManager = manager;
}

let clientInstance: VikunjaClient | null = null;
let currentApiUrl: string | null = null;
let currentApiToken: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let VikunjaClientClass: any = null;

/**
 * Get an authenticated Vikunja client instance
 */
export async function getVikunjaClient(): Promise<VikunjaClient> {
  if (!authManager) {
    throw new Error('Auth manager not initialized. Call setAuthManager first.');
  }

  const session = authManager.getSession();

  // Dynamically import VikunjaClient if not already loaded
  if (!VikunjaClientClass) {
    const module = await import('node-vikunja');
    VikunjaClientClass = module.VikunjaClient;
  }

  // Check if we need to create a new client
  if (!clientInstance || currentApiUrl !== session.apiUrl || currentApiToken !== session.apiToken) {
    // Clean up old client if it exists
    if (clientInstance) {
      // Perform any necessary cleanup
      clientInstance = null;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    clientInstance = new VikunjaClientClass(session.apiUrl, session.apiToken);
    currentApiUrl = session.apiUrl;
    currentApiToken = session.apiToken;
  }

  return clientInstance as VikunjaClient;
}

/**
 * Cleanup function to reset client instance
 */
export function cleanupVikunjaClient(): void {
  clientInstance = null;
  currentApiUrl = null;
  currentApiToken = null;
}
