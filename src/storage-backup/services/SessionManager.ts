/**
 * SessionManager - Manages storage session lifecycle
 *
 * This service handles session creation, retrieval, and cleanup.
 * It tracks active sessions and provides session isolation for
 * different users and API contexts.
 */

import { randomUUID } from 'crypto';
import { AsyncMutex } from '../../utils/AsyncMutex';
import type { StorageSession } from '../interfaces';

/**
 * SessionManager handles the lifecycle of storage sessions
 * with proper isolation, concurrent access protection, and access time tracking.
 */
export class SessionManager {
  private sessions = new Map<string, StorageSession>();
  private mutex = new AsyncMutex();

  /**
   * Create a new session
   */
  async createSession(sessionId?: string, userId?: string, apiUrl?: string): Promise<StorageSession> {
    const release = await this.mutex.acquire();
    try {
      const id = sessionId || randomUUID();
      const now = new Date();

      const session: StorageSession = {
        id,
        createdAt: now,
        lastAccessAt: now,
      };

      if (userId !== undefined) {
        session.userId = userId;
      }

      if (apiUrl !== undefined) {
        session.apiUrl = apiUrl;
      }

      this.sessions.set(id, session);
      return { ...session }; // Return copy to prevent external mutation
    } finally {
      release();
    }
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<StorageSession | null> {
    const release = await this.mutex.acquire();
    try {
      const session = this.sessions.get(sessionId);
      return session ? { ...session } : null;
    } finally {
      release();
    }
  }

  /**
   * Update access time for a session
   */
  async updateAccessTime(sessionId: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.lastAccessAt = new Date();
      }
    } finally {
      release();
    }
  }

  /**
   * Remove a session
   */
  async removeSession(sessionId: string): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      return this.sessions.delete(sessionId);
    } finally {
      release();
    }
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<StorageSession[]> {
    const release = await this.mutex.acquire();
    try {
      return Array.from(this.sessions.values()).map(session => ({ ...session }));
    } finally {
      release();
    }
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.sessions.clear();
    } finally {
      release();
    }
  }

  /**
   * Get session count
   */
  async getSessionCount(): Promise<number> {
    const release = await this.mutex.acquire();
    try {
      return this.sessions.size;
    } finally {
      release();
    }
  }
}