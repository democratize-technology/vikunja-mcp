/**
 * Error classes for storage operations
 * Separated to avoid circular imports with storage system
 */

export class StorageDataError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'STORAGE_DATA_ERROR', cause?: Error) {
    super(message);
    this.name = 'StorageDataError';
    this.code = code;
    if (cause) {
      this.cause = cause;
    }
  }
}