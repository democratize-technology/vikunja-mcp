/**
 * Security utilities for credential masking and sensitive data protection
 * Prevents credential exposure in logs, monitoring systems, and error reports
 */

/**
 * Masks API tokens and other sensitive credentials for logging
 * Shows only the first 4 characters followed by ellipsis
 * 
 * @param credential - The credential to mask (API token, password, etc.)
 * @returns Masked credential string or empty string if input is invalid
 */
export function maskCredential(credential: string | undefined | null): string {
  if (!credential || typeof credential !== 'string') {
    return '';
  }

  if (credential.length <= 4) {
    return '***';
  }

  return `${credential.substring(0, 4)}...`;
}

/**
 * Masks sensitive information in URLs for logging
 * Redacts query parameters and sensitive path components
 * 
 * @param url - The URL to mask
 * @returns Masked URL string or original if not a valid URL
 */
export function maskUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    const urlObj = new URL(url);
    
    // Mask sensitive path components first (tokens, keys, etc.)
    const sensitivePaths = ['/api/v1/token', '/auth', '/login', '/key'];
    const pathname = urlObj.pathname.toLowerCase();
    
    if (sensitivePaths.some(path => pathname.includes(path))) {
      urlObj.pathname = urlObj.pathname.replace(/\/[^/]*$/, '/[REDACTED]');
    }
    
    // Mask query parameters if they exist
    if (urlObj.search) {
      urlObj.search = '?[REDACTED]';
    }
    
    return urlObj.toString();
  } catch {
    // If URL parsing fails, just mask after the first slash
    const firstSlashIndex = url.indexOf('/', url.indexOf('://') + 3);
    if (firstSlashIndex !== -1) {
      return `${url.substring(0, firstSlashIndex)}/[REDACTED]`;
    }
    return url;
  }
}

/**
 * Sanitizes log data by masking sensitive fields in objects
 * Recursively processes nested objects and arrays
 * 
 * @param data - The data object to sanitize
 * @returns Sanitized data with masked sensitive fields
 */
export function sanitizeLogData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Check if string looks like a credential (long alphanumeric with special chars)
    if (data.length > 20 && /^[a-zA-Z0-9+/=._-]+$/.test(data)) {
      return maskCredential(data);
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item));
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = [
      'token', 'api_token', 'apitoken', 'password', 'passwd', 'secret',
      'key', 'private_key', 'privatekey', 'auth', 'authorization',
      'credential', 'credentials', 'jwt', 'bearer'
    ];

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const keyLower = key.toLowerCase();
      
      if (sensitiveKeys.some(sensitiveKey => keyLower.includes(sensitiveKey))) {
        if (typeof value === 'string') {
          // For string sensitive values, use maskCredential if it looks like a credential
          if (value.length > 10 && /^[a-zA-Z0-9+/=._-]+$/.test(value)) {
            sanitized[key] = maskCredential(value);
          } else {
            sanitized[key] = '[REDACTED]';
          }
        } else {
          sanitized[key] = '[REDACTED]';
        }
      } else {
        sanitized[key] = sanitizeLogData(value);
      }
    }
    
    return sanitized;
  }

  return data;
}

/**
 * Creates a secure configuration object for logging
 * Masks sensitive environment variables and configuration values
 * 
 * @param config - Configuration object to sanitize
 * @returns Sanitized configuration for safe logging
 */
export function createSecureLogConfig(config: Record<string, unknown>): Record<string, unknown> {
  return sanitizeLogData(config) as Record<string, unknown>;
}

/**
 * Generates a safe connection status message with masked credentials
 * 
 * @param url - Connection URL
 * @param token - API token or credential
 * @param authType - Type of authentication being used
 * @returns Safe status message for logging
 */
export function createSecureConnectionMessage(
  url: string | undefined,
  token: string | undefined,
  authType?: string
): string {
  const maskedUrl = maskUrl(url);
  const maskedToken = maskCredential(token);
  
  if (authType) {
    return `Connecting to ${maskedUrl} with ${authType} token ${maskedToken}`;
  }
  
  return `Connecting to ${maskedUrl} with token ${maskedToken}`;
}