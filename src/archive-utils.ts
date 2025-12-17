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

/**
 * Safely moves a file to an archive directory
 *
 * @param sourcePath - The path to the source file to move
 * @param destDirectory - The destination directory path
 * @param filename - The filename to use in the destination (defaults to original filename)
 * @returns A promise that resolves to the destination file path
 * @throws Error if the source file doesn't exist or move operation fails
 *
 * @example
 * ```typescript
 * await moveToArchive('./feature_list.json', './.runs/2025-12-15_17-00-00', 'feature_list.json');
 * // Moves file to ./.runs/2025-12-15_17-00-00/feature_list.json
 * ```
 */
export async function moveToArchive(
  sourcePath: string,
  destDirectory: string,
  filename?: string,
): Promise<string> {
  // Import here to avoid circular dependencies at top level
  const { mkdir, rename, copyFile, unlink, stat } = await import('fs/promises');
  const { join, basename } = await import('path');

  try {
    // Verify source file exists
    try {
      await stat(sourcePath);
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        throw new Error(`Source file not found: ${sourcePath}`);
      }
      throw error;
    }

    // Use provided filename or extract from source path
    const destFilename = filename || basename(sourcePath);
    const destPath = join(destDirectory, destFilename);

    // Create destination directory if it doesn't exist (mkdir -p equivalent)
    await mkdir(destDirectory, { recursive: true });

    // Try to rename first (faster, atomic operation)
    // If that fails (e.g., cross-device), fall back to copy + delete
    try {
      await rename(sourcePath, destPath);
    } catch (error) {
      const err = error as { code?: string };
      // EXDEV error means cross-device link, need to copy instead
      if (err.code === 'EXDEV') {
        await copyFile(sourcePath, destPath);
        await unlink(sourcePath);
      } else {
        throw error;
      }
    }

    return destPath;
  } catch (error) {
    const err = error as { message?: string };
    throw new Error(`Failed to move file to archive: ${err.message || 'Unknown error'}`);
  }
}
