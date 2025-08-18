/**
 * Intelligent response cache with TTL and performance monitoring
 * Reduces redundant API calls in bulk operations
 */

import { logger } from '../logger';

export interface CacheOptions {
  /**
   * Time-to-live for cache entries in milliseconds (default: 30 seconds)
   */
  ttl: number;
  
  /**
   * Maximum number of cached entries (default: 1000)
   */
  maxSize: number;
  
  /**
   * Enable cache performance metrics (default: true)
   */
  enableMetrics: boolean;
  
  /**
   * Cleanup interval in milliseconds (default: 60 seconds)
   */
  cleanupInterval: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRatio: number;
  totalRequests: number;
  cacheSize: number;
  averageResponseTime: number;
  savedApiCalls: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  accessCount: number;
  lastAccessTime: number;
}

const DEFAULT_OPTIONS: CacheOptions = {
  ttl: 30000, // 30 seconds
  maxSize: 1000,
  enableMetrics: true,
  cleanupInterval: 60000, // 1 minute
};

export class ResponseCache<T = unknown> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly options: CacheOptions;
  private readonly metrics: CacheMetrics;
  private cleanupTimer?: NodeJS.Timeout;
  private readonly pendingOperations = new Map<string, Promise<T>>();

  constructor(options: Partial<CacheOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.metrics = {
      hits: 0,
      misses: 0,
      hitRatio: 0,
      totalRequests: 0,
      cacheSize: 0,
      averageResponseTime: 0,
      savedApiCalls: 0,
    };

    if (this.options.cleanupInterval > 0) {
      this.startCleanupTimer();
    }
  }

  /**
   * Get cached response or execute function and cache result
   */
  async getOrSet<TResult extends T>(
    key: string,
    factory: () => Promise<TResult>,
    ttl?: number
  ): Promise<TResult> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    // Check cache first
    const cached = this.get(key);
    if (cached !== undefined) {
      this.metrics.hits++;
      this.updateMetrics(startTime);
      logger.debug('Cache hit', { key, remainingTtl: this.getRemainingTtl(key) });
      return cached as TResult;
    }

    // Check if operation is already pending to prevent duplicate work
    const pendingOperation = this.pendingOperations.get(key);
    if (pendingOperation) {
      this.metrics.hits++; // Treat as hit since we're avoiding duplicate work
      this.updateMetrics(startTime);
      logger.debug('Operation already pending, awaiting result', { key });
      return pendingOperation as Promise<TResult>;
    }

    // Cache miss - execute factory function
    this.metrics.misses++;
    logger.debug('Cache miss, executing factory', { key });

    const operationPromise = factory().then(result => {
      this.set(key, result, ttl);
      this.pendingOperations.delete(key);
      return result;
    }).catch(error => {
      this.pendingOperations.delete(key);
      throw error;
    });

    this.pendingOperations.set(key, operationPromise as Promise<T>);

    try {
      const result = await operationPromise;
      this.updateMetrics(startTime);
      return result;
    } catch (error) {
      this.updateMetrics(startTime);
      throw error;
    }
  }

  /**
   * Get value from cache if not expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      logger.debug('Cache entry expired', { key });
      return undefined;
    }

    entry.accessCount++;
    entry.lastAccessTime = now;
    return entry.data;
  }

  /**
   * Set value in cache with optional TTL override
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const effectiveTtl = ttl ?? this.options.ttl;
    
    // Enforce max size by removing least recently used entries
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry<T> = {
      data: value,
      timestamp: now,
      expiresAt: now + effectiveTtl,
      accessCount: 1,
      lastAccessTime: now,
    };

    this.cache.set(key, entry);
    this.metrics.cacheSize = this.cache.size;
    
    logger.debug('Cache entry set', { 
      key, 
      ttl: effectiveTtl, 
      cacheSize: this.cache.size 
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete specific cache entry
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.metrics.cacheSize = this.cache.size;
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.metrics.cacheSize = 0;
    logger.debug('Cache cleared');
  }

  /**
   * Get remaining TTL for a cache entry in milliseconds
   */
  getRemainingTtl(key: string): number {
    const entry = this.cache.get(key);
    if (!entry) {
      return 0;
    }

    const remaining = entry.expiresAt - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Get current cache metrics
   */
  getMetrics(): CacheMetrics {
    this.metrics.hitRatio = this.metrics.totalRequests > 0 
      ? this.metrics.hits / this.metrics.totalRequests 
      : 0;
    
    this.metrics.savedApiCalls = this.metrics.hits;
    this.metrics.cacheSize = this.cache.size;
    
    return { ...this.metrics };
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let invalidated = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        invalidated++;
      }
    }
    
    this.metrics.cacheSize = this.cache.size;
    logger.debug('Cache pattern invalidation', { pattern: pattern.source, invalidated });
    return invalidated;
  }

  /**
   * Create cache key for task operations
   */
  static createTaskKey(operation: string, taskId: number, suffix?: string): string {
    return `task:${operation}:${taskId}${suffix ? `:${suffix}` : ''}`;
  }

  /**
   * Create cache key for bulk operations
   */
  static createBulkKey(operation: string, taskIds: number[], field?: string): string {
    const sortedIds = [...taskIds].sort((a, b) => a - b);
    const idsHash = this.hashIds(sortedIds);
    return `bulk:${operation}:${idsHash}${field ? `:${field}` : ''}`;
  }

  /**
   * Create cache key for project operations
   */
  static createProjectKey(operation: string, projectId: number, suffix?: string): string {
    return `project:${operation}:${projectId}${suffix ? `:${suffix}` : ''}`;
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    this.metrics.cacheSize = this.cache.size;
    
    if (cleaned > 0) {
      logger.debug('Cache cleanup completed', { entriesRemoved: cleaned, remainingEntries: this.cache.size });
    }

    return cleaned;
  }

  /**
   * Destroy cache and cleanup timers
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
    this.pendingOperations.clear();
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  /**
   * Evict least recently used entry when cache is full
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey = '';
    let oldestAccessTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessTime < oldestAccessTime) {
        oldestAccessTime = entry.lastAccessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug('Evicted LRU cache entry', { key: oldestKey });
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(startTime: number): void {
    if (!this.options.enableMetrics) return;

    const responseTime = Date.now() - startTime;
    const totalResponseTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1);
    this.metrics.averageResponseTime = (totalResponseTime + responseTime) / this.metrics.totalRequests;
  }

  /**
   * Create a hash from array of IDs for cache key uniqueness
   */
  private static hashIds(ids: number[]): string {
    // Simple hash for cache keys - not cryptographic
    let hash = 0;
    const str = ids.join(',');
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

// Export convenience instances for common use cases
export const taskCache = new ResponseCache({
  ttl: 30000, // 30 seconds for task data
  maxSize: 500,
});

export const projectCache = new ResponseCache({
  ttl: 60000, // 1 minute for project data (changes less frequently)
  maxSize: 100,
});

export const operationCache = new ResponseCache({
  ttl: 10000, // 10 seconds for operation results
  maxSize: 200,
});

// Export convenience functions
export const createTaskCache = (options?: Partial<CacheOptions>): ResponseCache => 
  new ResponseCache(options);

export const AGGRESSIVE_CACHE_CONFIG: Partial<CacheOptions> = {
  ttl: 60000, // 1 minute
  maxSize: 2000,
  enableMetrics: true,
  cleanupInterval: 30000,
};

export const CONSERVATIVE_CACHE_CONFIG: Partial<CacheOptions> = {
  ttl: 15000, // 15 seconds
  maxSize: 500,
  enableMetrics: true,
  cleanupInterval: 60000,
};