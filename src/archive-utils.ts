/**
 * archive-utils.ts - Utilities for archiving pace project files
 */

/**
 * Normalizes an ISO timestamp string to a directory-safe format: YYYY-MM-DD_HH-MM-SS
 *
 * @param isoTimestamp - An ISO 8601 timestamp string (e.g., "2025-12-15T17:00:00.000Z")
 * @returns A directory-safe timestamp string (e.g., "2025-12-15_17-00-00")
 *
 * @example
 * ```typescript
 * normalizeTimestamp("2025-12-15T17:00:00.000Z")  // Returns: "2025-12-15_17-00-00"
 * normalizeTimestamp("invalid")                    // Returns: current timestamp
 * normalizeTimestamp("")                           // Returns: current timestamp
 * ```
 */
export function normalizeTimestamp(isoTimestamp: string): string {
  try {
    // Validate input
    if (!isoTimestamp || typeof isoTimestamp !== 'string') {
      return getFallbackTimestamp();
    }

    // Parse the ISO timestamp
    const date = new Date(isoTimestamp);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return getFallbackTimestamp();
    }

    // Extract date components in UTC
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    // Format as YYYY-MM-DD_HH-MM-SS
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  } catch {
    // If any error occurs, return fallback
    return getFallbackTimestamp();
  }
}

/**
 * Returns the current timestamp in normalized format as a fallback
 * @returns Current timestamp in YYYY-MM-DD_HH-MM-SS format
 */
function getFallbackTimestamp(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}
