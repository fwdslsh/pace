/**
 * archive-utils.ts - Utilities for archiving pace project files
 */

import type { ArchiveError } from './types.js';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validates that a directory name is safe and doesn't contain path traversal characters
 *
 * Security: Prevents directory traversal attacks by rejecting:
 * - Path separators (/, \)
 * - Parent directory references (..)
 * - Absolute paths (starting with / or drive letter)
 * - Null bytes or other control characters
 *
 * @param dirname - The directory name to validate
 * @returns true if the directory name is safe, false otherwise
 *
 * @example
 * ```typescript
 * isValidDirectoryName("2025-12-15_17-00-00")  // Returns: true
 * isValidDirectoryName("../../../etc")          // Returns: false
 * isValidDirectoryName("/etc/passwd")           // Returns: false
 * isValidDirectoryName("foo/../bar")            // Returns: false
 * ```
 */
function isValidDirectoryName(dirname: string): boolean {
  // Check for empty string
  if (!dirname || dirname.length === 0) {
    return false;
  }

  // Check for path traversal patterns
  if (dirname.includes('..')) {
    return false;
  }

  // Check for path separators (Unix and Windows)
  if (dirname.includes('/') || dirname.includes('\\')) {
    return false;
  }

  // Check for null bytes or control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(dirname)) {
    return false;
  }

  // Only allow alphanumeric, hyphens, underscores, and dots (but not ..)
  if (!/^[a-zA-Z0-9_-]+$/.test(dirname)) {
    return false;
  }

  return true;
}

/**
 * Normalizes an ISO timestamp string to a directory-safe format: YYYY-MM-DD_HH-MM-SS
 *
 * Security: This function ensures the output contains only alphanumeric characters,
 * hyphens, and underscores. It is safe from path traversal attacks as it constructs
 * the output from numeric date components only.
 *
 * @param isoTimestamp - An ISO 8601 timestamp string (e.g., "2025-12-15T17:00:00.000Z")
 * @returns A directory-safe timestamp string (e.g., "2025-12-15_17-00-00")
 *
 * @example
 * ```typescript
 * normalizeTimestamp("2025-12-15T17:00:00.000Z")  // Returns: "2025-12-15_17-00-00"
 * normalizeTimestamp("invalid")                    // Returns: current timestamp
 * normalizeTimestamp("")                           // Returns: current timestamp
 * normalizeTimestamp("../../../etc/passwd")        // Returns: current timestamp (invalid date)
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
    const normalized = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

    // Security: Validate the normalized string only contains safe characters
    // This should always pass given numeric inputs, but provides defense in depth
    if (!isValidDirectoryName(normalized)) {
      return getFallbackTimestamp();
    }

    return normalized;
  } catch {
    // If any error occurs, return fallback
    return getFallbackTimestamp();
  }
}

/**
 * Returns the current timestamp in normalized format as a fallback
 *
 * This function is used when the provided timestamp is invalid, missing, or cannot be parsed.
 * It generates a timestamp based on the current UTC time to ensure consistency across timezones.
 *
 * @returns Current timestamp in YYYY-MM-DD_HH-MM-SS format (UTC)
 *
 * @example
 * ```typescript
 * // If called at 2025-12-17 14:30:45 UTC, returns:
 * getFallbackTimestamp()  // Returns: "2025-12-17_14-30-45"
 * ```
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
 * Validates that the destination path is within a safe parent directory
 *
 * Security: Ensures that path operations cannot escape the project directory
 * by resolving both paths and checking that the destination is a child of the parent.
 *
 * @param destPath - The destination path to validate
 * @param parentPath - The parent directory path that should contain destPath
 * @returns true if destPath is within parentPath, false otherwise
 *
 * @example
 * ```typescript
 * isPathWithinDirectory("/project/.runs/archive", "/project")  // Returns: true
 * isPathWithinDirectory("/etc/passwd", "/project")             // Returns: false
 * isPathWithinDirectory("/project/../etc", "/project")         // Returns: false
 * ```
 */
async function isPathWithinDirectory(destPath: string, parentPath: string): Promise<boolean> {
  const { resolve, relative } = await import('path');

  try {
    // Resolve both paths to absolute paths (this resolves .. and symlinks)
    const resolvedDest = resolve(destPath);
    const resolvedParent = resolve(parentPath);

    // Get the relative path from parent to destination
    const relativePath = relative(resolvedParent, resolvedDest);

    // If the relative path starts with '..' or is an absolute path,
    // then destPath is outside parentPath
    if (relativePath.startsWith('..') || resolve(relativePath) === relativePath) {
      return false;
    }

    return true;
  } catch {
    // If path resolution fails, reject the path as unsafe
    return false;
  }
}

/**
 * Resolves a unique archive directory path by appending a numeric suffix if needed
 *
 * If the archive directory already exists, this function appends a suffix (-1, -2, etc.)
 * to create a unique directory name.
 *
 * @param baseArchivePath - The base archive directory path (e.g., ".runs/2025-12-15_17-00-00")
 * @returns A promise that resolves to a unique archive directory path
 *
 * @example
 * ```typescript
 * // If .runs/2025-12-15_17-00-00 exists:
 * await resolveUniqueArchivePath('.runs/2025-12-15_17-00-00')
 * // Returns: '.runs/2025-12-15_17-00-00-1'
 *
 * // If both -1 and -2 exist:
 * // Returns: '.runs/2025-12-15_17-00-00-3'
 * ```
 */
export async function resolveUniqueArchivePath(baseArchivePath: string): Promise<string> {
  const { stat } = await import('fs/promises');

  let uniquePath = baseArchivePath;
  let suffix = 0;

  // Keep incrementing suffix until we find a path that doesn't exist
  while (true) {
    try {
      await stat(uniquePath);
      // Path exists, try next suffix
      suffix++;
      uniquePath = `${baseArchivePath}-${suffix}`;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        // Path doesn't exist, we can use it
        return uniquePath;
      }
      // Some other error occurred, rethrow
      throw error;
    }
  }
}

/**
 * Safely moves a file to an archive directory
 *
 * Security: Validates that destination directory is safe and within the project directory.
 * This prevents path traversal attacks and ensures files are only archived to intended locations.
 *
 * @param sourcePath - The path to the source file to move
 * @param destDirectory - The destination directory path
 * @param filename - The filename to use in the destination (defaults to original filename)
 * @param projectDir - The project root directory (defaults to process.cwd())
 * @returns A promise that resolves to the destination file path
 * @throws {ArchiveError} if the source file doesn't exist or move operation fails
 * @throws {ArchiveError} if the destination path is unsafe or outside the project directory
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
  projectDir?: string,
): Promise<string> {
  // Import here to avoid circular dependencies at top level
  const { mkdir, rename, copyFile, unlink, stat } = await import('fs/promises');
  const { join, basename, resolve } = await import('path');

  try {
    // Verify source file exists
    try {
      await stat(sourcePath);
    } catch (error) {
      const err = error as ArchiveError;
      if (err.code === 'ENOENT') {
        const notFoundError: ArchiveError = new Error(
          `Source file not found: ${sourcePath}`,
        ) as ArchiveError;
        notFoundError.code = 'ENOENT';
        notFoundError.path = sourcePath;
        throw notFoundError;
      }
      throw error;
    }

    // Use provided filename or extract from source path
    const destFilename = filename || basename(sourcePath);

    // Security: Validate destination filename doesn't contain path traversal
    if (destFilename.includes('..') || destFilename.includes('/') || destFilename.includes('\\')) {
      throw new Error(`Invalid filename: ${destFilename} (contains path separators or traversal)`);
    }

    const destPath = join(destDirectory, destFilename);

    // Security: Validate that destination is within the project directory
    // Get the current working directory as the project root (or use provided projectDir)
    const rootDir = projectDir || process.cwd();
    const isWithinProject = await isPathWithinDirectory(destPath, rootDir);
    if (!isWithinProject) {
      throw new Error(
        `Security: Destination path ${destPath} is outside project directory ${rootDir}`,
      );
    }

    // Security: Validate that destination directory doesn't contain path traversal
    const resolvedDestDir = resolve(destDirectory);
    const isDestDirWithinProject = await isPathWithinDirectory(resolvedDestDir, rootDir);
    if (!isDestDirWithinProject) {
      throw new Error(
        `Security: Destination directory ${destDirectory} is outside project directory ${rootDir}`,
      );
    }

    // Create destination directory if it doesn't exist (mkdir -p equivalent)
    await mkdir(destDirectory, { recursive: true });

    // Try to rename first (faster, atomic operation)
    // If that fails (e.g., cross-device), fall back to copy + delete
    try {
      await rename(sourcePath, destPath);
    } catch (error) {
      const err = error as ArchiveError;
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
    const err = error as ArchiveError;
    const archiveError: ArchiveError = new Error(
      `Failed to move file to archive: ${err.message || 'Unknown error'}`,
    ) as ArchiveError;
    archiveError.code = err.code;
    archiveError.path = err.path || sourcePath;
    throw archiveError;
  }
}
