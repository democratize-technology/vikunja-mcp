/**
 * SessionManager - Advanced session lifecycle management
 *
 * This module extracts session-related responsibilities from PersistentFilterStorage
 * and provides comprehensive session lifecycle management with:
 * - Session creation and configuration
 * - Access time tracking and expiration
 * - Session metadata management
 * - Thread-safe operations with mutex protection
 * - Configurable timeout settings
 * - Session-based isolation
 * - Comprehensive error handling and logging
 */

import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import { AsyncMutex } from '../../utils/AsyncMutex';
import type { StorageSession } from '../interfaces';

/**
 * Configuration options for session management
 */
export interface SessionManagerConfig {
  /** Session timeout in milliseconds (default: 1 hour) */
  sessionTimeoutMs?: number;
  /** Cleanup interval in milliseconds (default: 1 hour) */
  cleanupIntervalMs?: number;
  /** Maximum number of active sessions (default: 1000) */
  maxSessions?: number;
  /** Enable debug logging for session operations */
  debugLogging?: boolean;
}

/**
 * Session statistics and metadata
 */
export interface SessionStats {
  /** Total number of active sessions */
  totalSessions: number;
  /** Number of sessions expired since last cleanup */
  expiredSessions: number;
  /** Oldest session creation time */
  oldestSession: Date | undefined;
  /** Newest session creation time */
  newestSession: Date | undefined;
  /** Average session age in milliseconds */
  averageSessionAgeMs: number;
}

/**
 * Session creation options
 */
export interface SessionOptions {
  /** Optional session ID (auto-generated if not provided) */
  sessionId?: string;
  /** Optional user ID for session association */
  userId?: string;
  /** Optional API URL for session context */
  apiUrl?: string;
  /** Optional custom session timeout in milliseconds */
  customTimeoutMs?: number;
}

/**
 * Enhanced session information with additional metadata
 */
export interface ManagedSession extends StorageSession {
  /** Custom timeout for this specific session */
  timeoutMs?: number;
  /** Session expiration time */
  expiresAt?: Date;
  /** Additional session metadata */
  metadata?: Record<string, unknown>;
}

/**
 * SessionManager provides comprehensive session lifecycle management
 * with thread-safe operations, configurable timeouts, and automatic cleanup.
 */
export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private mutex = new AsyncMutex();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private config: Required<SessionManagerConfig>;
  private expiredSessionsCount = 0;

  /**
   * Create a new SessionManager instance
   * @param config Optional configuration options
   */
  constructor(config: SessionManagerConfig = {}) {
    this.config = {
      sessionTimeoutMs: config.sessionTimeoutMs ?? 60 * 60 * 1000, // 1 hour
      cleanupIntervalMs: config.cleanupIntervalMs ?? 60 * 60 * 1000, // 1 hour
      maxSessions: config.maxSessions ?? 1000,
      debugLogging: config.debugLogging ?? false,
    };

    this.startCleanupTimer();
    this.logDebug('SessionManager initialized', { config: this.config });
  }

  /**
   * Create a new session with the specified options
   * @param options Session creation options
   * @returns Created session information
   * @throws Error if maximum session limit is reached
   */
  async createSession(options: SessionOptions = {}): Promise<ManagedSession> {
    const release = await this.mutex.acquire();
    try {
      // Check session limit
      if (this.sessions.size >= this.config.maxSessions) {
        throw new Error(
          `Maximum session limit (${this.config.maxSessions}) reached. Cannot create new session.`
        );
      }

      const sessionId = options.sessionId || randomUUID();
      const now = new Date();
      const timeoutMs = options.customTimeoutMs || this.config.sessionTimeoutMs;
      const expiresAt = new Date(now.getTime() + timeoutMs);

      // Check if session already exists
      if (this.sessions.has(sessionId)) {
        throw new Error(`Session with ID '${sessionId}' already exists`);
      }

      const session: ManagedSession = {
        id: sessionId,
        createdAt: now,
        lastAccessAt: now,
        timeoutMs,
        expiresAt,
      };

      // Add optional fields
      if (options.userId !== undefined) {
        session.userId = options.userId;
      }

      if (options.apiUrl !== undefined) {
        session.apiUrl = options.apiUrl;
      }

      this.sessions.set(sessionId, session);

      this.logDebug('Session created', {
        sessionId: session.id,
        userId: session.userId,
        apiUrl: session.apiUrl,
        timeoutMs: session.timeoutMs,
        expiresAt: session.expiresAt,
      });

      return { ...session }; // Return copy to prevent external mutation
    } finally {
      release();
    }
  }

  /**
   * Get a session by ID, updating its access time
   * @param sessionId Session ID to retrieve
   * @returns Session information or null if not found
   */
  async getSession(sessionId: string): Promise<ManagedSession | null> {
    const release = await this.mutex.acquire();
    try {
      const session = this.sessions.get(sessionId);

      if (!session) {
        this.logDebug('Session not found', { sessionId });
        return null;
      }

      // Check if session has expired
      if (this.isSessionExpired(session)) {
        this.logDebug('Session expired during access', { sessionId });
        this.sessions.delete(sessionId);
        this.expiredSessionsCount++;
        return null;
      }

      // Update access time and expiration
      session.lastAccessAt = new Date();
      if (session.timeoutMs) {
        session.expiresAt = new Date(session.lastAccessAt.getTime() + session.timeoutMs);
      }

      this.logDebug('Session accessed', {
        sessionId: session.id,
        lastAccessAt: session.lastAccessAt,
        expiresAt: session.expiresAt,
      });

      return { ...session }; // Return copy to prevent external mutation
    } finally {
      release();
    }
  }

  /**
   * Update access time for a session without retrieving it
   * @param sessionId Session ID to update
   * @returns True if session was found and updated, false otherwise
   */
  async updateAccessTime(sessionId: string): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      const session = this.sessions.get(sessionId);

      if (!session) {
        return false;
      }

      // Check if session has expired
      if (this.isSessionExpired(session)) {
        this.sessions.delete(sessionId);
        this.expiredSessionsCount++;
        return false;
      }

      // Update access time and expiration
      session.lastAccessAt = new Date();
      if (session.timeoutMs) {
        session.expiresAt = new Date(session.lastAccessAt.getTime() + session.timeoutMs);
      }

      this.logDebug('Session access time updated', {
        sessionId,
        lastAccessAt: session.lastAccessAt,
        expiresAt: session.expiresAt,
      });

      return true;
    } finally {
      release();
    }
  }

  /**
   * Check if a session exists and is not expired
   * @param sessionId Session ID to check
   * @returns True if session exists and is valid
   */
  async isSessionValid(sessionId: string): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      const session = this.sessions.get(sessionId);
      return session ? !this.isSessionExpired(session) : false;
    } finally {
      release();
    }
  }

  /**
   * Remove a session manually
   * @param sessionId Session ID to remove
   * @returns True if session was removed, false if not found
   */
  async removeSession(sessionId: string): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      const removed = this.sessions.delete(sessionId);

      if (removed) {
        this.logDebug('Session removed manually', { sessionId });
      }

      return removed;
    } finally {
      release();
    }
  }

  /**
   * Get all active sessions
   * @returns Array of active session information
   */
  async getActiveSessions(): Promise<ManagedSession[]> {
    const release = await this.mutex.acquire();
    try {
      // Filter out expired sessions and return copies
      const activeSessions: ManagedSession[] = [];

      for (const [sessionId, session] of Array.from(this.sessions.entries())) {
        if (!this.isSessionExpired(session)) {
          activeSessions.push({ ...session });
        } else {
          this.sessions.delete(sessionId);
          this.expiredSessionsCount++;
        }
      }

      this.logDebug('Active sessions retrieved', {
        count: activeSessions.length,
        totalSessions: this.sessions.size,
      });

      return activeSessions;
    } finally {
      release();
    }
  }

  /**
   * Get session statistics
   * @returns Session statistics
   */
  async getSessionStats(): Promise<SessionStats> {
    const release = await this.mutex.acquire();
    try {
      const sessions = Array.from(this.sessions.values());
      const validSessions = sessions.filter(session => !this.isSessionExpired(session));

      // Remove expired sessions
      for (const session of Array.from(sessions)) {
        if (this.isSessionExpired(session)) {
          this.sessions.delete(session.id);
          this.expiredSessionsCount++;
        }
      }

      const now = new Date();
      let totalAge = 0;
      let oldestSession: Date | undefined;
      let newestSession: Date | undefined;

      for (const session of validSessions) {
        const age = now.getTime() - session.createdAt.getTime();
        totalAge += age;

        if (!oldestSession || session.createdAt < oldestSession) {
          oldestSession = session.createdAt;
        }

        if (!newestSession || session.createdAt > newestSession) {
          newestSession = session.createdAt;
        }
      }

      return {
        totalSessions: validSessions.length,
        expiredSessions: this.expiredSessionsCount,
        oldestSession,
        newestSession,
        averageSessionAgeMs: validSessions.length > 0 ? totalAge / validSessions.length : 0,
      } as SessionStats;
    } finally {
      release();
    }
  }

  /**
   * Clear all sessions
   * @returns Number of sessions that were cleared
   */
  async clearAllSessions(): Promise<number> {
    const release = await this.mutex.acquire();
    try {
      const count = this.sessions.size;
      this.sessions.clear();
      this.expiredSessionsCount = 0;

      this.logDebug('All sessions cleared', { count });

      return count;
    } finally {
      release();
    }
  }

  /**
   * Perform cleanup of expired sessions
   * @returns Number of sessions that were cleaned up
   */
  async cleanupExpiredSessions(): Promise<number> {
    const release = await this.mutex.acquire();
    try {
      const now = new Date();
      const expiredSessions: string[] = [];

      for (const [sessionId, session] of Array.from(this.sessions.entries())) {
        if (this.isSessionExpired(session)) {
          expiredSessions.push(sessionId);
        }
      }

      // Remove expired sessions
      for (const sessionId of expiredSessions) {
        this.sessions.delete(sessionId);
        this.expiredSessionsCount++;
      }

      if (expiredSessions.length > 0) {
        this.logDebug('Expired sessions cleaned up', {
          count: expiredSessions.length,
          remainingSessions: this.sessions.size,
        });
      }

      return expiredSessions.length;
    } finally {
      release();
    }
  }

  /**
   * Update session metadata
   * @param sessionId Session ID to update
   * @param metadata New metadata to merge with existing
   * @returns True if session was found and updated
   */
  async updateSessionMetadata(
    sessionId: string,
    metadata: Record<string, unknown>
  ): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      const session = this.sessions.get(sessionId);

      if (!session || this.isSessionExpired(session)) {
        return false;
      }

      session.metadata = { ...(session.metadata ?? {}), ...metadata };
      session.lastAccessAt = new Date();

      if (session.timeoutMs) {
        session.expiresAt = new Date(session.lastAccessAt.getTime() + session.timeoutMs);
      }

      this.logDebug('Session metadata updated', { sessionId, metadata });

      return true;
    } finally {
      release();
    }
  }

  /**
   * Get session metadata
   * @param sessionId Session ID to get metadata for
   * @returns Session metadata or null if session not found
   */
  async getSessionMetadata(sessionId: string): Promise<Record<string, unknown> | null> {
    const release = await this.mutex.acquire();
    try {
      const session = this.sessions.get(sessionId);

      if (!session || this.isSessionExpired(session)) {
        return null;
      }

      return { ...(session.metadata ?? {}) };
    } finally {
      release();
    }
  }

  /**
   * Get current configuration
   * @returns Current session manager configuration
   */
  getConfig(): Required<SessionManagerConfig> {
    return { ...this.config };
  }

  /**
   * Stop the cleanup timer and perform final cleanup
   */
  async shutdown(): Promise<void> {
    this.logDebug('SessionManager shutting down');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    await this.cleanupExpiredSessions();
    await this.clearAllSessions();

    this.logDebug('SessionManager shutdown complete');
  }

  /**
   * Check if a session is expired based on its timeout
   * @param session Session to check
   * @returns True if session is expired
   */
  private isSessionExpired(session: ManagedSession): boolean {
    if (!session.expiresAt) {
      // Fallback to default timeout logic
      const now = new Date();
      const timeoutMs = session.timeoutMs || this.config.sessionTimeoutMs;
      const expiresAt = new Date(session.lastAccessAt.getTime() + timeoutMs);
      return now > expiresAt;
    }
    return new Date() > session.expiresAt;
  }

  /**
   * Start the automatic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions().catch((error) => {
        logger.error('Error during session cleanup', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Log debug messages if debug logging is enabled
   * @param message Message to log
   * @param data Additional data to include
   */
  private logDebug(message: string, data?: Record<string, unknown>): void {
    if (this.config.debugLogging === true) {
      logger.debug(`SessionManager: ${message}`, data);
    }
  }
}