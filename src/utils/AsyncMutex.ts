/**
 * Simple mutex implementation for synchronizing access
 * Provides FIFO ordering and prevents race conditions in async operations
 */

export class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = (): void => {
        this.locked = false;
        const next = this.queue.shift();
        if (next) {
          this.locked = true;
          // Use microtask scheduling for better performance
          Promise.resolve().then(next);
        }
      };

      if (this.locked) {
        this.queue.push(() => resolve(release));
      } else {
        this.locked = true;
        resolve(release);
      }
    });
  }
}