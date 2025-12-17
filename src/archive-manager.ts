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

import { moveToArchive, normalizeTimestamp } from './archive-utils';

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

    // Normalize timestamp to directory-safe format
    const normalizedTimestamp = normalizeTimestamp(timestamp);
    archivePath = join(projectDir, archiveDir, normalizedTimestamp);

    if (dryRun) {
      // Dry-run: show what would be archived without actually moving files
      await this.performDryRun(projectDir, archiveDir, normalizedTimestamp, silent, verbose);
    } else {
      // Actually perform archiving
      if (!silent) {
        console.log(`📁 Archiving to: ${archiveDir}/${normalizedTimestamp}/`);
      }

      // Move feature_list.json to archive
      const featureListArchived = await this.archiveFile(
        featureListPath,
        archivePath,
        'feature_list.json',
        silent,
      );
      if (featureListArchived) {
        archived = true;
        archivedFiles.push('feature_list.json');
      }

      // Move progress.txt to archive (if it exists)
      const progressPath = join(projectDir, 'progress.txt');
      const progressArchived = await this.archiveFile(
        progressPath,
        archivePath,
        'progress.txt',
        silent,
        true, // optional file
      );
      if (progressArchived) {
        archivedFiles.push('progress.txt');
      } else if (verbose && !silent) {
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
   * @param projectDir - The project directory path
   * @returns Promise resolving to true if feature_list.json exists, false otherwise
   */
  private async checkFeatureListExists(projectDir: string): Promise<boolean> {
    const featureListPath = join(projectDir, 'feature_list.json');
    try {
      await stat(featureListPath);
      return true;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets the timestamp for the archive directory
   *
   * Reads metadata.last_updated from feature_list.json, or uses current time as fallback
   *
   * @param featureListPath - Path to feature_list.json
   * @param silent - Whether to suppress console output
   * @returns Promise resolving to ISO timestamp string
   */
  private async getTimestamp(featureListPath: string, silent: boolean): Promise<string> {
    try {
      const content = await readFile(featureListPath, 'utf-8');
      const data = JSON.parse(content);

      if (data.metadata?.last_updated) {
        return data.metadata.last_updated;
      } else {
        // metadata.last_updated is missing - use current timestamp as fallback
        if (!silent) {
          console.log(
            '⚠️  Warning: metadata.last_updated is missing, using current timestamp as fallback',
          );
        }
        return new Date().toISOString();
      }
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
   * @param archiveDir - The archive directory name
   * @param normalizedTimestamp - The normalized timestamp for the archive directory
   * @param silent - Whether to suppress console output
   * @param verbose - Whether to show verbose output
   */
  private async performDryRun(
    projectDir: string,
    archiveDir: string,
    normalizedTimestamp: string,
    silent: boolean,
    verbose: boolean,
  ): Promise<void> {
    if (silent) {
      return;
    }

    console.log(`📁 [DRY RUN] Would archive to: ${archiveDir}/${normalizedTimestamp}/`);
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
   * @param silent - Whether to suppress console output
   * @param optional - Whether the file is optional (don't fail if it doesn't exist)
   * @returns Promise resolving to true if file was archived, false otherwise
   */
  private async archiveFile(
    filePath: string,
    archivePath: string,
    filename: string,
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

      // Move file to archive
      await moveToArchive(filePath, archivePath, filename);
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
