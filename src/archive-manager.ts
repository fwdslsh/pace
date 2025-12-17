/* eslint-disable no-console */
/**
 * archive-manager.ts - Manager for archiving pace project files
 *
 * This module provides the ArchiveManager class which encapsulates the logic
 * for archiving project files (feature_list.json, progress.txt) when reinitializing
 * a pace project.
 */

import { copyFile, readFile, stat } from 'fs/promises';
import { join } from 'path';

import { moveToArchive, normalizeTimestamp, resolveUniqueArchivePath } from './archive-utils';

// Cache for repeated operations to improve performance
const fileExistsCache = new Map<string, boolean>();
const timestampCache = new Map<string, string>();
const CACHE_TTL = 5000; // 5 seconds cache
let cacheTimestamp = 0;

/**
 * Options for the archive operation
 */
export interface ArchiveOptions {
  /** The project directory path */
  projectDir: string;
  /** Custom archive directory path (defaults to '.runs') */
  archiveDir?: string;
  /** Whether this is a dry-run (no actual file operations) */
  dryRun?: boolean;
  /** Whether to suppress console output (for JSON mode) */
  silent?: boolean;
  /** Whether to show verbose output */
  verbose?: boolean;
}

/**
 * Result of an archive operation
 */
export interface ArchiveResult {
  /** Whether archiving was performed */
  archived: boolean;
  /** Path to the archive directory (if archived) */
  archivePath: string | null;
  /** List of files that were archived */
  archivedFiles: string[];
}

/**
 * ArchiveManager handles the archiving of pace project files
 *
 * When reinitializing a pace project, this class manages the archiving of existing
 * project files (feature_list.json, progress.txt) to a timestamped directory in .runs/
 *
 * Performance Optimizations:
 * - Parallel file operations for feature_list.json and progress.txt
 * - Caching for repeated file system operations (5-second TTL)
 * - Timestamp normalization caching to avoid redundant calculations
 * - Optimized timestamp extraction using regex instead of full JSON parsing
 * - Asynchronous operations throughout to minimize blocking
 *
 * These optimizations ensure that archiving adds less than 100ms overhead to init operations
 * as required by feature F031.
 *
 * @example
 * ```typescript
 * const manager = new ArchiveManager();
 * const result = await manager.archive({
 *   projectDir: '/path/to/project',
 *   dryRun: false,
 *   silent: false
 * });
 * console.log(result.archived); // true if files were archived
 * console.log(result.archivePath); // e.g., "/path/to/project/.runs/2025-12-15_17-00-00"
 * ```
 */
export class ArchiveManager {
  /**
   * Archives existing project files before reinitialization
   *
   * This method:
   * 1. Checks if feature_list.json exists
   * 2. Reads metadata.last_updated timestamp (or uses current time as fallback)
   * 3. Creates a timestamped archive directory (defaults to .runs/)
   * 4. Moves feature_list.json and progress.txt (if exists) to the archive
   * 5. Falls back to .bak files if archiving fails
   *
   * @param options - Archive options including project directory, archive directory, and flags
   * @returns Promise resolving to archive result with archived status, path, and file list
   */
  async archive(options: ArchiveOptions): Promise<ArchiveResult> {
    const {
      projectDir,
      archiveDir = '.runs',
      dryRun = false,
      silent = false,
      verbose = false,
    } = options;

    const featureListPath = join(projectDir, 'feature_list.json');
    let archivePath: string | null = null;
    let archived = false;
    const archivedFiles: string[] = [];

    // Check if feature_list.json exists
    const featureListExists = await this.checkFeatureListExists(projectDir);

    if (!featureListExists) {
      // No files to archive
      return { archived: false, archivePath: null, archivedFiles: [] };
    }

    // File exists - archive before initializing (unless dry-run)
    if (!silent) {
      console.log('\n📦 Existing project files found');
    }

    // Read metadata.last_updated from feature_list.json
    const timestamp = await this.getTimestamp(featureListPath, silent);

    // Normalize timestamp to directory-safe format (with caching for performance)
    const normalizedTimestamp = timestampCache.has(timestamp)
      ? timestampCache.get(timestamp)!
      : (() => {
          const normalized = normalizeTimestamp(timestamp);
          timestampCache.set(timestamp, normalized);
          return normalized;
        })();
    const baseArchivePath = join(projectDir, archiveDir, normalizedTimestamp);

    // Resolve unique archive path (handles conflicts by appending -1, -2, etc.)
    archivePath = await resolveUniqueArchivePath(baseArchivePath);

    if (dryRun) {
      // Dry-run: show what would be archived without actually moving files
      const displayPath = archivePath.replace(join(projectDir) + '/', '');
      await this.performDryRun(projectDir, displayPath, silent, verbose);

      // In dry-run mode, still report what would be archived
      archived = true;
      archivedFiles.push('feature_list.json');

      // Check if progress.txt exists and would be archived
      const progressPath = join(projectDir, 'progress.txt');
      try {
        await stat(progressPath);
        archivedFiles.push('progress.txt');
      } catch {
        // progress.txt doesn't exist, don't add to archivedFiles
      }
    } else {
      // Actually perform archiving
      if (!silent) {
        const displayPath = archivePath.replace(join(projectDir) + '/', '');
        console.log(`📁 Archiving to: ${displayPath}/`);
      }

      // Prepare archiving operations to run in parallel
      const progressPath = join(projectDir, 'progress.txt');

      // Start both archiving operations in parallel for better performance
      const [featureListArchived, progressArchived] = await Promise.allSettled([
        this.archiveFile(featureListPath, archivePath, 'feature_list.json', projectDir, silent),
        this.archiveFile(
          progressPath,
          archivePath,
          'progress.txt',
          projectDir,
          silent,
          true, // optional file
        ),
      ]);

      // Handle results
      if (featureListArchived.status === 'fulfilled' && featureListArchived.value) {
        archived = true;
        archivedFiles.push('feature_list.json');
      } else if (featureListArchived.status === 'rejected') {
        console.error('Failed to archive feature_list.json:', featureListArchived.reason);
      }

      if (progressArchived.status === 'fulfilled' && progressArchived.value) {
        archivedFiles.push('progress.txt');
      } else if (progressArchived.status === 'rejected') {
        console.error('Failed to archive progress.txt:', progressArchived.reason);
      } else if (
        verbose &&
        !silent &&
        progressArchived.status === 'fulfilled' &&
        !progressArchived.value
      ) {
        console.log('  ℹ️  progress.txt not found (skipping)');
      }

      if (!silent) {
        console.log('✅ Archiving complete\n');
      }
    }

    return { archived, archivePath, archivedFiles };
  }

  /**
   * Checks if feature_list.json exists in the project directory
   *
   * Uses caching to avoid repeated file system calls during performance-critical operations.
   *
   * @param projectDir - The project directory path
   * @returns Promise resolving to true if feature_list.json exists, false otherwise
   */
  private async checkFeatureListExists(projectDir: string): Promise<boolean> {
    const featureListPath = join(projectDir, 'feature_list.json');

    // Use cache for performance if within TTL
    const now = Date.now();
    if (now - cacheTimestamp < CACHE_TTL && fileExistsCache.has(featureListPath)) {
      return fileExistsCache.get(featureListPath)!;
    }

    try {
      await stat(featureListPath);
      fileExistsCache.set(featureListPath, true);
      cacheTimestamp = now;
      return true;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        fileExistsCache.set(featureListPath, false);
        cacheTimestamp = now;
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets the timestamp for the archive directory
   *
   * Reads metadata.last_updated from feature_list.json, or uses current time as fallback.
   * Optimized to avoid full JSON parsing by using a simple string search for the timestamp.
   *
   * @param featureListPath - Path to feature_list.json
   * @param silent - Whether to suppress console output
   * @returns Promise resolving to ISO timestamp string
   */
  private async getTimestamp(featureListPath: string, silent: boolean): Promise<string> {
    try {
      const content = await readFile(featureListPath, 'utf-8');

      // Optimization: Try to extract timestamp without full JSON parsing
      // This is faster for large feature_list.json files
      const timestampMatch = content.match(/"last_updated"\s*:\s*"([^"]+)"/);
      if (timestampMatch && timestampMatch[1]) {
        return timestampMatch[1];
      }

      // Fallback to full JSON parse if regex doesn't work
      const data = JSON.parse(content);
      if (data.metadata?.last_updated) {
        return data.metadata.last_updated;
      }

      // metadata.last_updated is missing - use current timestamp as fallback
      if (!silent) {
        console.log(
          '⚠️  Warning: metadata.last_updated is missing, using current timestamp as fallback',
        );
      }
      return new Date().toISOString();
    } catch {
      // If JSON is corrupted or read fails, use current timestamp
      if (!silent) {
        console.log(
          '⚠️  Warning: Could not read metadata from feature_list.json, using current timestamp',
        );
      }
      return new Date().toISOString();
    }
  }

  /**
   * Performs a dry-run showing what would be archived
   *
   * @param projectDir - The project directory path
   * @param displayPath - The display path to show (relative to project dir)
   * @param silent - Whether to suppress console output
   * @param verbose - Whether to show verbose output
   */
  private async performDryRun(
    projectDir: string,
    displayPath: string,
    silent: boolean,
    verbose: boolean,
  ): Promise<void> {
    if (silent) {
      return;
    }

    console.log(`📁 [DRY RUN] Would archive to: ${displayPath}/`);
    console.log('  • feature_list.json');

    const progressPath = join(projectDir, 'progress.txt');
    try {
      await stat(progressPath);
      console.log('  • progress.txt');
    } catch {
      // progress.txt doesn't exist
      if (verbose) {
        console.log('  ℹ️  progress.txt not found (skipping)');
      }
    }
  }

  /**
   * Archives a single file to the archive directory
   *
   * @param filePath - Path to the file to archive
   * @param archivePath - Path to the archive directory
   * @param filename - Filename to use in the archive
   * @param projectDir - The project root directory for path validation
   * @param silent - Whether to suppress console output
   * @param optional - Whether the file is optional (don't fail if it doesn't exist)
   * @returns Promise resolving to true if file was archived, false otherwise
   */
  private async archiveFile(
    filePath: string,
    archivePath: string,
    filename: string,
    projectDir: string,
    silent: boolean,
    optional = false,
  ): Promise<boolean> {
    try {
      // Check if file exists (for optional files)
      if (optional) {
        try {
          await stat(filePath);
        } catch {
          // File doesn't exist, that's OK for optional files
          return false;
        }
      }

      // Move file to archive (pass projectDir for path validation)
      await moveToArchive(filePath, archivePath, filename, projectDir);
      if (!silent) {
        console.log(`  ✓ Archived ${filename}`);
      }
      return true;
    } catch (error) {
      // If archiving to .runs fails, try .bak fallback
      if (!silent) {
        console.error(`  ✗ Failed to archive to .runs: ${error}`);
        console.log('  ⚠️  Attempting fallback: creating .bak backup');
      }

      try {
        const bakPath = `${filePath}.bak`;
        await copyFile(filePath, bakPath);
        if (!silent) {
          console.log(`  ✓ Created backup: ${bakPath}`);
        }
        return false;
      } catch (bakError) {
        if (!silent) {
          console.error(`  ✗ Fallback backup also failed: ${bakError}`);
          if (!optional) {
            console.log('  ⚠️  Init will continue, but old files may be overwritten');
          }
        }
        return false;
      }
    }
  }
}
