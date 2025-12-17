/* eslint-disable no-console */
/**
 * archive-manager.ts - Manager for archiving pace project files
 *
 * This module provides the ArchiveManager class which encapsulates the logic
 * for archiving project files (feature_list.json, progress.txt) when reinitializing
 * a pace project.
 */

import { copyFile, readFile, readdir, stat, writeFile } from 'fs/promises';
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
  /** Whether to create archive metadata file (.archive-info.json) */
  createArchiveMetadata?: boolean;
  /** Reason for archiving (e.g., 'pace init', 'pace init --force') */
  reason?: string;
}

/**
 * Result of an archive operation
 */
export interface ArchiveResult {
  /** Whether archiving was performed */
  archived: boolean;
  /** Path to archive directory (if archived) */
  archivePath: string | null;
  /** List of files that were archived */
  archivedFiles: string[];
}

/**
 * Information about an archive directory
 */
export interface ArchiveInfo {
  /** Archive directory name (timestamp) */
  name: string;
  /** Full path to archive directory */
  path: string;
  /** Archive creation timestamp (from directory name or metadata) */
  timestamp: string;
  /** Archive metadata if available */
  metadata?: {
    reason?: string;
    files?: string[];
    originalMetadata?: any;
  };
}

/**
 * Options for restore operation
 */
export interface RestoreOptions {
  /** The project directory path */
  projectDir: string;
  /** The timestamp of the archive to restore */
  timestamp: string;
  /** Custom archive directory path (defaults to '.runs') */
  archiveDir?: string;
  /** Whether to skip confirmation prompts */
  force?: boolean;
  /** Whether to suppress console output (for JSON mode) */
  silent?: boolean;
  /** Whether to show verbose output */
  verbose?: boolean;
}

/**
 * Result of a restore operation
 */
export interface RestoreResult {
  /** Whether restore was successful */
  success: boolean;
  /** Path to archive that was restored */
  archivePath: string | null;
  /** List of files that were restored */
  restoredFiles: string[];
  /** Error message if restore failed */
  error?: string;
}

/**
 * Options for clean archives operation
 */
export interface CleanArchivesOptions {
  /** The project directory path */
  projectDir: string;
  /** Custom archive directory path (defaults to '.runs') */
  archiveDir?: string;
  /** Delete archives older than specified days */
  olderThan?: number;
  /** Keep last N archives (newest) */
  keepLast?: number;
  /** Whether to suppress console output (for JSON mode) */
  silent?: boolean;
  /** Whether to show verbose output */
  verbose?: boolean;
}

/**
 * Result of a clean archives operation
 */
export interface CleanArchivesResult {
  /** Whether cleaning was successful */
  success: boolean;
  /** List of archives that were deleted */
  deletedArchives: Array<{
    name: string;
    path: string;
    timestamp: string;
  }>;
  /** Error message if cleaning failed */
  error?: string;
}

/**
 * Validation status for an archive
 */
export type ArchiveValidationStatus = 'valid' | 'warning' | 'invalid';

/**
 * Detailed validation result for an archive
 */
export interface ArchiveValidationResult {
  /** Archive directory name */
  archiveName: string;
  /** Full path to archive directory */
  archivePath: string;
  /** Overall validation status */
  status: ArchiveValidationStatus;
  /** List of validation issues found */
  issues: string[];
  /** List of expected files that are present */
  presentFiles: string[];
  /** List of expected files that are missing */
  missingFiles: string[];
  /** List of unexpected files found */
  unexpectedFiles: string[];
  /** Whether archive metadata is valid */
  metadataValid: boolean;
  /** Whether feature_list.json is valid JSON */
  featureListValid: boolean;
  /** Whether archive contains expected core files */
  hasCoreFiles: boolean;
}

/**
 * Options for archive validation
 */
export interface ValidateArchiveOptions {
  /** The project directory path */
  projectDir: string;
  /** Custom archive directory path (defaults to '.runs') */
  archiveDir?: string;
  /** Whether to show verbose output */
  verbose?: boolean;
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
      createArchiveMetadata = true,
      reason = 'pace init',
    } = options;

    const featureListPath = join(projectDir, 'feature_list.json');
    let archivePath: string | null = null;
    let archived = false;
    const archivedFiles: string[] = [];
    let originalMetadata: any = null;

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

    // Read metadata from feature_list.json before archiving
    try {
      const content = await readFile(featureListPath, 'utf-8');
      const data = JSON.parse(content);
      originalMetadata = data.metadata || null;
    } catch {
      // If we can't read metadata, continue without it
      originalMetadata = null;
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

      // In dry-run mode, also show that metadata would be created
      if (createArchiveMetadata && !silent) {
        console.log('  • .archive-info.json (metadata)');
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

      // Create archive metadata file if enabled and files were archived
      if (createArchiveMetadata && archived && archivePath) {
        await this.createArchiveMetadata(
          archivePath,
          originalMetadata,
          archivedFiles,
          reason,
          silent,
        );
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
   * Creates a metadata file in the archive directory
   *
   * Creates a .archive-info.json file containing:
   * - Original metadata from feature_list.json
   * - Archive timestamp
   * - Reason for archiving
   * - List of archived files
   *
   * @param archivePath - Path to the archive directory
   * @param featureListMetadata - Original metadata from feature_list.json
   * @param archivedFiles - List of archived files
   * @param reason - Reason for archiving
   * @param silent - Whether to suppress console output
   */
  private async createArchiveMetadata(
    archivePath: string,
    featureListMetadata: any,
    archivedFiles: string[],
    reason: string,
    silent: boolean,
  ): Promise<void> {
    try {
      const archiveMetadata = {
        archive: {
          timestamp: new Date().toISOString(),
          reason,
          files: archivedFiles,
        },
        originalMetadata: featureListMetadata || null,
      };

      const metadataPath = join(archivePath, '.archive-info.json');
      await writeFile(metadataPath, JSON.stringify(archiveMetadata, null, 2), 'utf-8');

      if (!silent) {
        console.log('  ✓ Created archive metadata');
      }
    } catch (error) {
      if (!silent) {
        console.warn(`  ⚠️  Failed to create archive metadata: ${error}`);
      }
      // Don't fail the archive operation if metadata creation fails
    }
  }

  /**
   * Lists all archive directories in the specified archive directory
   *
   * @param projectDir - The project directory path
   * @param archiveDir - Archive directory path (defaults to '.runs')
   * @returns Promise resolving to array of archive information
   */
  async listArchives(projectDir: string, archiveDir = '.runs'): Promise<ArchiveInfo[]> {
    const archiveBasePath = join(projectDir, archiveDir);
    const archives: ArchiveInfo[] = [];

    try {
      // Check if archive directory exists
      await stat(archiveBasePath);

      // Read all entries in archive directory
      const entries = await readdir(archiveBasePath);

      // Filter for directories that look like timestamped archives
      for (const entry of entries) {
        const entryPath = join(archiveBasePath, entry);
        try {
          const entryStat = await stat(entryPath);
          if (entryStat.isDirectory()) {
            // Try to read metadata file
            let metadata: ArchiveInfo['metadata'] = undefined;
            let timestamp = entry; // Default to directory name as timestamp

            try {
              const metadataPath = join(entryPath, '.archive-info.json');
              const metadataContent = await readFile(metadataPath, 'utf-8');
              const metadataData = JSON.parse(metadataContent);

              metadata = {
                reason: metadataData.archive?.reason,
                files: metadataData.archive?.files,
                originalMetadata: metadataData.originalMetadata,
              };

              // Use archive timestamp if available
              if (metadataData.archive?.timestamp) {
                timestamp = metadataData.archive.timestamp;
              }
            } catch {
              // No metadata file available, that's okay
            }

            archives.push({
              name: entry,
              path: entryPath,
              timestamp,
              metadata,
            });
          }
        } catch {
          // Skip entries that can't be accessed
          continue;
        }
      }

      // Sort archives by timestamp (newest first)
      archives.sort((a, b) => {
        const aTime = new Date(a.timestamp).getTime();
        const bTime = new Date(b.timestamp).getTime();
        return bTime - aTime;
      });
    } catch {
      // Archive directory doesn't exist or can't be accessed
      // Return empty array
    }

    return archives;
  }

  /**
   * Archives a single file to archive directory
   *
   * @param filePath - Path to file to archive
   * @param archivePath - Path to archive directory
   * @param filename - Filename to use in archive
   * @param projectDir - The project root directory for path validation
   * @param silent - Whether to suppress console output
   * @param optional - Whether file is optional (don't fail if it doesn't exist)
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

  /**
   * Restores files from an archive directory back to project root
   *
   * This method:
   * 1. Finds the archive directory with the given timestamp
   * 2. Lists all files in the archive (excluding metadata)
   * 3. Prompts for confirmation before overwriting (unless force=true)
   * 4. Copies files from archive back to project root
   *
   * @param options - Restore options including project directory, timestamp, and flags
   * @returns Promise resolving to restore result with success status, path, and file list
   */
  async restoreArchive(options: RestoreOptions): Promise<RestoreResult> {
    const {
      projectDir,
      timestamp,
      archiveDir = '.runs',
      force = false,
      silent = false,
      verbose = false,
    } = options;

    const archiveBasePath = join(projectDir, archiveDir);
    let archivePath: string | null = null;
    const restoredFiles: string[] = [];

    try {
      // Check if archive directory exists
      await stat(archiveBasePath);

      // Find the archive directory with the given timestamp
      const entries = await readdir(archiveBasePath);

      // Look for exact match or partial match with timestamp
      const matchingEntry = entries.find(
        (entry) => entry === timestamp || entry.startsWith(timestamp),
      );

      if (!matchingEntry) {
        return {
          success: false,
          archivePath: null,
          restoredFiles: [],
          error: `Archive with timestamp '${timestamp}' not found. Use 'pace archives' to list available archives.`,
        };
      }

      archivePath = join(archiveBasePath, matchingEntry);

      // Verify it's a directory
      const archiveStat = await stat(archivePath);
      if (!archiveStat.isDirectory()) {
        return {
          success: false,
          archivePath: null,
          restoredFiles: [],
          error: `'${matchingEntry}' is not a valid archive directory.`,
        };
      }

      // Read archive contents
      const archiveEntries = await readdir(archivePath);

      // Filter out metadata file and system files
      const filesToRestore = archiveEntries.filter(
        (entry) => entry !== '.archive-info.json' && !entry.startsWith('.'),
      );

      if (filesToRestore.length === 0) {
        return {
          success: false,
          archivePath,
          restoredFiles: [],
          error: 'No restorable files found in archive.',
        };
      }

      // Try to read archive metadata
      let archiveMetadata: any = null;
      try {
        const metadataPath = join(archivePath, '.archive-info.json');
        const metadataContent = await readFile(metadataPath, 'utf-8');
        archiveMetadata = JSON.parse(metadataContent);
      } catch {
        // No metadata available, that's okay
      }

      if (!silent) {
        console.log('\n' + '='.repeat(60));
        console.log(' RESTORE ARCHIVE');
        console.log('='.repeat(60));
        console.log(`\nArchive: ${matchingEntry}`);
        console.log(`Path: ${archivePath}`);

        if (archiveMetadata?.archive?.reason) {
          console.log(`Reason: ${archiveMetadata.archive.reason}`);
        }

        console.log(`\nFiles to restore (${filesToRestore.length}):`);
        for (const file of filesToRestore) {
          console.log(`  • ${file}`);
        }

        console.log('\nFiles will be copied to project root:');
        console.log(`  • ${projectDir}/`);
      }

      // Check for existing files that would be overwritten
      const existingFiles: string[] = [];
      for (const file of filesToRestore) {
        const targetPath = join(projectDir, file);
        try {
          await stat(targetPath);
          existingFiles.push(file);
        } catch {
          // File doesn't exist, no conflict
        }
      }

      if (existingFiles.length > 0 && !force) {
        console.log('\n⚠️  Warning: The following files will be overwritten:');
        for (const file of existingFiles) {
          console.log(`  • ${file}`);
        }
        console.log('\nUse --force to overwrite without confirmation.');
        return {
          success: false,
          archivePath,
          restoredFiles: [],
          error: 'Restore cancelled due to existing files. Use --force to overwrite.',
        };
      }

      // Confirmation prompt (unless force or silent)
      if (!force && !silent) {
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question('\nDo you want to proceed with restoring these files? [y/N] ', resolve);
        });

        rl.close();

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          return {
            success: false,
            archivePath,
            restoredFiles: [],
            error: 'Restore cancelled by user.',
          };
        }
      }

      // Perform the restore
      if (!silent && !force) {
        console.log('\n🔄 Restoring files...');
      }

      for (const file of filesToRestore) {
        const sourcePath = join(archivePath, file);
        const targetPath = join(projectDir, file);

        try {
          await copyFile(sourcePath, targetPath);
          restoredFiles.push(file);

          if (!silent) {
            if (verbose) {
              console.log(`  ✓ Restored ${file} -> ${targetPath}`);
            } else {
              console.log(`  ✓ Restored ${file}`);
            }
          }
        } catch (error) {
          if (!silent) {
            console.error(`  ✗ Failed to restore ${file}: ${error}`);
          }

          // Continue with other files even if one fails
        }
      }

      if (!silent) {
        console.log('\n' + '-'.repeat(60));
        console.log(
          `Successfully restored ${restoredFiles.length}/${filesToRestore.length} files.`,
        );

        if (restoredFiles.length < filesToRestore.length) {
          console.log(`⚠️  Some files failed to restore. Check output above.`);
        }

        console.log('='.repeat(60) + '\n');
      }

      return {
        success: restoredFiles.length > 0,
        archivePath,
        restoredFiles,
      };
    } catch (error) {
      const errorMessage = String(error);

      if (errorMessage.includes('ENOENT')) {
        return {
          success: false,
          archivePath: null,
          restoredFiles: [],
          error: `Archive directory not found. Use 'pace archives' to list available archives.`,
        };
      }

      return {
        success: false,
        archivePath,
        restoredFiles,
        error: `Restore failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Deletes old archive directories based on age or count criteria
   *
   * This method:
   * 1. Lists all archive directories
   * 2. Filters archives based on --older-than or --keep-last criteria
   * 3. Prompts for confirmation before deleting
   * 4. Deletes the selected archive directories
   *
   * @param options - Clean archives options including project directory and criteria
   * @returns Promise resolving to clean result with success status and deleted archives list
   */
  async cleanArchives(options: CleanArchivesOptions): Promise<CleanArchivesResult> {
    const {
      projectDir,
      archiveDir = '.runs',
      olderThan,
      keepLast,
      silent = false,
      verbose = false,
    } = options;

    // Validate arguments
    if (!olderThan && !keepLast) {
      return {
        success: false,
        deletedArchives: [],
        error: 'Either --older-than or --keep-last option must be specified',
      };
    }

    if (olderThan && keepLast) {
      return {
        success: false,
        deletedArchives: [],
        error: 'Cannot specify both --older-than and --keep-last options together',
      };
    }

    const archiveBasePath = join(projectDir, archiveDir);

    try {
      // Get all archives
      const archives = await this.listArchives(projectDir, archiveDir);

      if (archives.length === 0) {
        if (!silent) {
          console.log('\nNo archives found.');
          console.log('Archives are created when you reinitialize a pace project.');
          console.log('Use "pace init" with an existing project to create archives.');
        }
        return { success: true, deletedArchives: [] };
      }

      let archivesToDelete: typeof archives = [];

      if (olderThan) {
        // Filter archives older than specified days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThan);

        archivesToDelete = archives.filter((archive) => {
          try {
            const archiveDate = new Date(archive.timestamp);
            return archiveDate.getTime() < cutoffDate.getTime();
          } catch {
            // If we can't parse the timestamp, include it for deletion
            return true;
          }
        });
      } else if (keepLast) {
        // Keep the last N archives (newest ones), delete the rest
        archivesToDelete = archives.slice(keepLast);
      }

      if (archivesToDelete.length === 0) {
        if (!silent) {
          if (olderThan) {
            console.log(`\nNo archives found older than ${olderThan} days.`);
          } else if (keepLast) {
            console.log(`\nNo archives to delete. Keeping last ${keepLast} archives.`);
          }
          console.log(`Total archives: ${archives.length}`);
        }
        return { success: true, deletedArchives: [] };
      }

      if (!silent) {
        console.log('\n' + '='.repeat(60));
        console.log(' CLEAN ARCHIVES');
        console.log('='.repeat(60));
        console.log(`\nFound ${archives.length} archive${archives.length === 1 ? '' : 's'} total`);

        if (olderThan) {
          console.log(
            `Archives to delete (older than ${olderThan} days): ${archivesToDelete.length}`,
          );
        } else if (keepLast) {
          console.log(`Archives to delete (keeping last ${keepLast}): ${archivesToDelete.length}`);
        }

        console.log('\nArchives that will be deleted:');
        for (const archive of archivesToDelete) {
          let date: Date;
          try {
            date = new Date(archive.timestamp);
            if (isNaN(date.getTime())) {
              date = new Date();
            }
          } catch {
            date = new Date();
          }

          const formattedDate = date.toLocaleDateString();
          const formattedTime = date.toLocaleTimeString();
          const ageDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));

          console.log(`  🗑️  ${archive.name}`);
          console.log(`     Created: ${formattedDate} ${formattedTime} (${ageDays} days ago)`);

          if (archive.metadata?.reason) {
            console.log(`     Reason: ${archive.metadata.reason}`);
          }

          if (verbose && archive.metadata?.files) {
            console.log(`     Files: ${archive.metadata.files.join(', ')}`);
          }

          console.log('');
        }
      }

      // Confirmation prompt
      if (!silent) {
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(
            `\nAre you sure you want to delete ${archivesToDelete.length} archive${archivesToDelete.length === 1 ? '' : 's'}? This cannot be undone. [y/N] `,
            resolve,
          );
        });

        rl.close();

        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          return {
            success: false,
            deletedArchives: [],
            error: 'Archive deletion cancelled by user.',
          };
        }
      }

      // Delete the archives
      const deletedArchives: CleanArchivesResult['deletedArchives'] = [];
      let success = true;

      if (!silent) {
        console.log('\n🗑️  Deleting archives...');
      }

      for (const archive of archivesToDelete) {
        try {
          // Use rimraf or similar to recursively delete directory
          const { rm } = await import('fs/promises');
          await rm(archive.path, { recursive: true, force: true });

          deletedArchives.push({
            name: archive.name,
            path: archive.path,
            timestamp: archive.timestamp,
          });

          if (!silent) {
            if (verbose) {
              console.log(`  ✓ Deleted ${archive.name} (${archive.path})`);
            } else {
              console.log(`  ✓ Deleted ${archive.name}`);
            }
          }
        } catch (error) {
          success = false;
          if (!silent) {
            console.error(`  ✗ Failed to delete ${archive.name}: ${error}`);
          }
        }
      }

      if (!silent) {
        console.log('\n' + '-'.repeat(60));
        console.log(
          `Successfully deleted ${deletedArchives.length}/${archivesToDelete.length} archives.`,
        );

        if (deletedArchives.length < archivesToDelete.length) {
          console.log('⚠️  Some archives failed to delete. Check output above.');
        }

        const remainingCount = archives.length - deletedArchives.length;
        console.log(`Archives remaining: ${remainingCount}`);
        console.log('='.repeat(60) + '\n');
      }

      return {
        success: deletedArchives.length > 0,
        deletedArchives,
      };
    } catch (error) {
      const errorMessage = String(error);

      if (errorMessage.includes('ENOENT')) {
        return {
          success: false,
          deletedArchives: [],
          error: `Archive directory not found. Use 'pace archives' to list available archives.`,
        };
      }

      return {
        success: false,
        deletedArchives: [],
        error: `Archive cleaning failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Validates a specific archive directory structure and contents
   *
   * This method:
   * 1. Checks if the archive directory exists and is accessible
   * 2. Verifies expected files are present (feature_list.json, progress.txt optional)
   * 3. Validates JSON files are properly formatted
   * 4. Checks for corruption or incomplete archives
   * 5. Reports detailed validation results
   *
   * @param options - Validation options including project directory and archive name
   * @returns Promise resolving to detailed validation result
   */
  async validateArchive(options: {
    projectDir: string;
    archiveName: string;
    archiveDir?: string;
    verbose?: boolean;
  }): Promise<ArchiveValidationResult> {
    const { projectDir, archiveName, archiveDir = '.runs', verbose = false } = options;

    // Initialize validation result
    const result: ArchiveValidationResult = {
      archiveName,
      archivePath: join(projectDir, archiveDir, archiveName),
      status: 'valid',
      issues: [],
      presentFiles: [],
      missingFiles: [],
      unexpectedFiles: [],
      metadataValid: false,
      featureListValid: false,
      hasCoreFiles: false,
    };

    try {
      // Check if archive directory exists and is accessible
      await stat(result.archivePath);
    } catch (error) {
      result.status = 'invalid';
      result.issues.push(`Archive directory not found or not accessible: ${result.archivePath}`);
      return result;
    }

    // Expected files in a valid archive
    const expectedFiles = ['feature_list.json'];
    const optionalFiles = ['progress.txt', '.archive-info.json'];

    try {
      // Read archive directory contents
      const archiveEntries = await readdir(result.archivePath);

      // Categorize files
      for (const entry of archiveEntries) {
        if (expectedFiles.includes(entry)) {
          result.presentFiles.push(entry);
        } else if (optionalFiles.includes(entry)) {
          result.presentFiles.push(entry);
        } else if (entry.startsWith('.')) {
          // Ignore hidden system files (these are expected)
        } else {
          result.unexpectedFiles.push(entry);
        }
      }

      // Check for missing expected files
      for (const expectedFile of expectedFiles) {
        if (!result.presentFiles.includes(expectedFile)) {
          result.missingFiles.push(expectedFile);
        }
      }

      // Determine if archive has core files
      result.hasCoreFiles = result.presentFiles.includes('feature_list.json');

      // Validate feature_list.json
      if (result.presentFiles.includes('feature_list.json')) {
        try {
          const featureListPath = join(result.archivePath, 'feature_list.json');
          const content = await readFile(featureListPath, 'utf-8');
          const parsed = JSON.parse(content);

          // Basic structure validation
          if (!parsed.features || !Array.isArray(parsed.features)) {
            result.featureListValid = false;
            result.issues.push('feature_list.json: Missing or invalid features array');
          } else {
            result.featureListValid = true;

            // Check for feature metadata
            if (!parsed.metadata) {
              result.issues.push('feature_list.json: Missing metadata section');
              result.status = result.status === 'valid' ? 'warning' : result.status;
            }
          }
        } catch (parseError) {
          result.featureListValid = false;
          result.issues.push(`feature_list.json: Invalid JSON - ${parseError}`);
          result.status = 'invalid';
        }
      }

      // Validate archive metadata if present
      if (result.presentFiles.includes('.archive-info.json')) {
        try {
          const metadataPath = join(result.archivePath, '.archive-info.json');
          const content = await readFile(metadataPath, 'utf-8');
          const parsed = JSON.parse(content);

          // Basic structure validation
          if (!parsed.archive) {
            result.metadataValid = false;
            result.issues.push('.archive-info.json: Missing archive section');
          } else {
            result.metadataValid = true;
          }
        } catch (parseError) {
          result.metadataValid = false;
          result.issues.push(`.archive-info.json: Invalid JSON - ${parseError}`);
          result.status = result.status === 'valid' ? 'warning' : result.status;
        }
      } else {
        result.metadataValid = true; // No metadata is acceptable for older archives
      }

      // Assess overall archive health
      if (result.missingFiles.length > 0) {
        result.status = 'invalid';
        result.issues.push(`Missing required files: ${result.missingFiles.join(', ')}`);
      }

      if (result.unexpectedFiles.length > 0) {
        result.issues.push(`Unexpected files found: ${result.unexpectedFiles.join(', ')}`);
        if (result.status === 'valid') {
          result.status = 'warning';
        }
      }

      // Check for empty archive
      if (result.presentFiles.length === 0) {
        result.status = 'invalid';
        result.issues.push('Archive is empty');
      }

      // Validate archive name format
      const archiveNamePattern = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-(\d+))?$/;
      if (!archiveNamePattern.test(archiveName)) {
        result.issues.push(`Archive name format is invalid: ${archiveName}`);
        if (result.status === 'valid') {
          result.status = 'warning';
        }
      }

      // Additional verbose checks
      if (verbose) {
        // Check file sizes for potential corruption
        for (const file of result.presentFiles) {
          try {
            const filePath = join(result.archivePath, file);
            const fileStat = await stat(filePath);

            if (fileStat.size === 0) {
              result.issues.push(`File is empty: ${file}`);
              if (result.status === 'valid') {
                result.status = 'warning';
              }
            }
          } catch (fileError) {
            result.issues.push(`Cannot read file: ${file} - ${fileError}`);
            result.status = 'invalid';
          }
        }
      }
    } catch (error) {
      result.status = 'invalid';
      result.issues.push(`Failed to validate archive: ${error}`);
    }

    return result;
  }

  /**
   * Validates all archives in the archive directory
   *
   * @param options - Validation options including project directory
   * @returns Promise resolving to array of validation results for all archives
   */
  async validateAllArchives(options: ValidateArchiveOptions): Promise<ArchiveValidationResult[]> {
    const { projectDir, archiveDir = '.runs', verbose = false } = options;

    try {
      // Get list of all archives
      const archives = await this.listArchives(projectDir, archiveDir);

      // Validate each archive
      const validationPromises = archives.map(async (archive) => {
        return this.validateArchive({
          projectDir,
          archiveName: archive.name,
          archiveDir,
          verbose,
        });
      });

      return await Promise.all(validationPromises);
    } catch (error) {
      throw new Error(`Failed to validate archives: ${error}`);
    }
  }
}
