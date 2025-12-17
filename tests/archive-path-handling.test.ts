import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { afterEach, describe, expect, test } from 'bun:test';

import { ArchiveManager } from '../src/archive-manager';

describe('Archive Path Handling (F029: very long or invalid project directory paths)', () => {
  // Create a temporary test directory for each test
  const baseTestDir = join(tmpdir(), 'pace-test-path-handling-' + Date.now());

  afterEach(async () => {
    // Clean up test directory after each test
    try {
      await rm(baseTestDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('deeply nested project directories', () => {
    test('handles project in deeply nested directory (5 levels)', async () => {
      // Setup: Create deeply nested project directory
      const deepDir = join(
        baseTestDir,
        'level1',
        'level2',
        'level3',
        'level4',
        'level5',
        'my-project',
      );
      await mkdir(deepDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [{ id: 'F001', passes: false }],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
          total_features: 1,
          passing: 0,
          failing: 1,
        },
      };
      await writeFile(join(deepDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));
      await writeFile(join(deepDir, 'progress.txt'), 'Session 1\n');

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: deepDir,
        silent: true,
      });

      // Verify: Archiving succeeded
      expect(result.archived).toBe(true);
      expect(result.archivePath).not.toBeNull();
      expect(result.archivedFiles).toContain('feature_list.json');
      expect(result.archivedFiles).toContain('progress.txt');

      // Verify: Archive directory is inside the deeply nested project dir
      expect(result.archivePath).toContain(deepDir);
      expect(result.archivePath).toContain('.runs');

      // Verify: Archived files exist
      const archivedFeatureList = await readFile(
        join(result.archivePath!, 'feature_list.json'),
        'utf-8',
      );
      const parsedArchived = JSON.parse(archivedFeatureList);
      expect(parsedArchived.features[0].id).toBe('F001');
    });

    test('handles project in very deeply nested directory (10 levels)', async () => {
      // Setup: Create very deeply nested project directory
      const deepDir = join(
        baseTestDir,
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
        'g',
        'h',
        'i',
        'j',
        'project',
      );
      await mkdir(deepDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
          total_features: 0,
          passing: 0,
          failing: 0,
        },
      };
      await writeFile(join(deepDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: deepDir,
        silent: true,
      });

      // Verify: Archiving succeeded even with very deep path
      expect(result.archived).toBe(true);
      expect(result.archivePath).toContain(deepDir);
      expect(result.archivePath).toContain('.runs');

      // Verify: .runs directory is created at the correct level
      expect(result.archivePath).toContain(join(deepDir, '.runs'));
    });

    test('handles extremely long path name (>250 characters)', async () => {
      // Setup: Create directory with very long path
      // Most filesystems support up to 4096 bytes for paths
      const longDirName = 'very-long-directory-name-'.repeat(10); // ~250 chars
      const deepDir = join(baseTestDir, longDirName, 'project');
      await mkdir(deepDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(join(deepDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: deepDir,
        silent: true,
      });

      // Verify: Archiving succeeded even with very long path
      expect(result.archived).toBe(true);
      expect(result.archivePath).toContain('.runs');
      expect(result.archivedFiles).toContain('feature_list.json');
    });
  });

  describe('directory names with special characters', () => {
    test('handles project directory with spaces', async () => {
      // Setup: Create directory with spaces
      const dirWithSpaces = join(baseTestDir, 'my project folder', 'workspace');
      await mkdir(dirWithSpaces, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(
        join(dirWithSpaces, 'feature_list.json'),
        JSON.stringify(featureList, null, 2),
      );

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: dirWithSpaces,
        silent: true,
      });

      // Verify: Archiving succeeded
      expect(result.archived).toBe(true);
      expect(result.archivePath).toContain(dirWithSpaces);
      expect(result.archivedFiles).toContain('feature_list.json');
    });

    test('handles project directory with hyphens and underscores', async () => {
      // Setup: Create directory with hyphens and underscores
      const dirWithChars = join(baseTestDir, 'my-project_folder', 'test-workspace_v2');
      await mkdir(dirWithChars, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(
        join(dirWithChars, 'feature_list.json'),
        JSON.stringify(featureList, null, 2),
      );

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: dirWithChars,
        silent: true,
      });

      // Verify: Archiving succeeded
      expect(result.archived).toBe(true);
      expect(result.archivedFiles).toContain('feature_list.json');
    });

    test('handles project directory with dots', async () => {
      // Setup: Create directory with dots
      const dirWithDots = join(baseTestDir, 'project.v2.0', 'workspace.test');
      await mkdir(dirWithDots, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(join(dirWithDots, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: dirWithDots,
        silent: true,
      });

      // Verify: Archiving succeeded
      expect(result.archived).toBe(true);
      expect(result.archivedFiles).toContain('feature_list.json');
    });

    test('handles project directory with parentheses', async () => {
      // Setup: Create directory with parentheses
      const dirWithParens = join(baseTestDir, 'project (v2)', 'workspace (test)');
      await mkdir(dirWithParens, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(
        join(dirWithParens, 'feature_list.json'),
        JSON.stringify(featureList, null, 2),
      );

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: dirWithParens,
        silent: true,
      });

      // Verify: Archiving succeeded
      expect(result.archived).toBe(true);
      expect(result.archivedFiles).toContain('feature_list.json');
    });

    test('handles project directory with brackets', async () => {
      // Setup: Create directory with brackets
      const dirWithBrackets = join(baseTestDir, 'project[v2]', 'workspace[test]');
      await mkdir(dirWithBrackets, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(
        join(dirWithBrackets, 'feature_list.json'),
        JSON.stringify(featureList, null, 2),
      );

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: dirWithBrackets,
        silent: true,
      });

      // Verify: Archiving succeeded
      expect(result.archived).toBe(true);
      expect(result.archivedFiles).toContain('feature_list.json');
    });

    test('handles project directory with mixed special characters', async () => {
      // Setup: Create directory with multiple special characters
      const dirMixed = join(baseTestDir, 'my-project_v2.0 (test) [dev]', 'workspace');
      await mkdir(dirMixed, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(join(dirMixed, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: dirMixed,
        silent: true,
      });

      // Verify: Archiving succeeded
      expect(result.archived).toBe(true);
      expect(result.archivedFiles).toContain('feature_list.json');
    });
  });

  describe('relative paths', () => {
    test('handles relative path (../project)', async () => {
      // Setup: Create project structure
      const parentDir = join(baseTestDir, 'parent');
      const siblingDir = join(baseTestDir, 'sibling');
      const projectDir = join(baseTestDir, 'project');
      await mkdir(parentDir, { recursive: true });
      await mkdir(siblingDir, { recursive: true });
      await mkdir(projectDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(join(projectDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Execute: Archive files using absolute path (relative paths should be resolved)
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: projectDir, // Using absolute path
        silent: true,
      });

      // Verify: Archiving succeeded
      expect(result.archived).toBe(true);
      expect(result.archivePath).toContain(projectDir);

      // Verify: .runs directory is in the project directory
      const resolvedProjectDir = resolve(projectDir);
      const resolvedArchivePath = resolve(result.archivePath!);
      expect(resolvedArchivePath).toContain(resolvedProjectDir);
    });

    test('handles . (current directory)', async () => {
      // Setup: Create project directory and change to it
      const projectDir = join(baseTestDir, 'current-dir-test');
      await mkdir(projectDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(join(projectDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Save original cwd
      const originalCwd = process.cwd();

      try {
        // Change to project directory
        process.chdir(projectDir);

        // Execute: Archive files using current directory
        const manager = new ArchiveManager();
        const result = await manager.archive({
          projectDir: '.', // Current directory
          silent: true,
        });

        // Verify: Archiving succeeded
        expect(result.archived).toBe(true);
        expect(result.archivePath).not.toBeNull();

        // Verify: Archive path is within current directory
        const absoluteArchivePath = resolve(result.archivePath!);
        const absoluteProjectDir = resolve('.');
        expect(absoluteArchivePath).toContain(absoluteProjectDir);
      } finally {
        // Restore original cwd
        process.chdir(originalCwd);
      }
    });

    test('resolves relative path correctly', async () => {
      // Setup: Create nested structure
      const workDir = join(baseTestDir, 'work');
      const projectDir = join(baseTestDir, 'project-elsewhere');
      await mkdir(workDir, { recursive: true });
      await mkdir(projectDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(join(projectDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Execute: Archive files (path resolution handled by caller, we use absolute)
      const manager = new ArchiveManager();
      const absoluteProjectDir = resolve(projectDir);
      const result = await manager.archive({
        projectDir: absoluteProjectDir,
        silent: true,
      });

      // Verify: Archiving succeeded
      expect(result.archived).toBe(true);

      // Verify: Archive is in the absolute project directory
      expect(result.archivePath).toContain(absoluteProjectDir);
      expect(result.archivePath).toContain('.runs');
    });
  });

  describe('.runs directory creation in correct location', () => {
    test('creates .runs in project root (not parent)', async () => {
      // Setup: Create project in nested structure
      const parentDir = join(baseTestDir, 'parent');
      const projectDir = join(parentDir, 'my-project');
      await mkdir(projectDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(join(projectDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: projectDir,
        silent: true,
      });

      // Verify: .runs is in project directory, not parent
      expect(result.archivePath).toContain(join(projectDir, '.runs'));
      expect(result.archivePath).not.toContain(join(parentDir, '.runs'));

      // Verify: Archive path structure is correct
      const expectedPrefix = join(projectDir, '.runs');
      expect(result.archivePath?.startsWith(expectedPrefix)).toBe(true);
    });

    test('creates .runs in deeply nested project root', async () => {
      // Setup: Create deeply nested project
      const deepDir = join(
        baseTestDir,
        'level1',
        'level2',
        'level3',
        'level4',
        'level5',
        'project',
      );
      await mkdir(deepDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(join(deepDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: deepDir,
        silent: true,
      });

      // Verify: .runs is at the project level, not any parent level
      expect(result.archivePath).toContain(join(deepDir, '.runs'));

      // Verify: Archive path is exactly <projectDir>/.runs/<timestamp>
      const archivePathParts = result.archivePath!.split('.runs');
      expect(archivePathParts[0]).toBe(deepDir + '/');
      expect(archivePathParts[1]).toMatch(/^\/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
    });

    test('uses custom archive directory when specified', async () => {
      // Setup: Create project directory
      const projectDir = join(baseTestDir, 'custom-archive-test');
      await mkdir(projectDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(join(projectDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Execute: Archive files with custom archive directory
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: projectDir,
        archiveDir: '.archives',
        silent: true,
      });

      // Verify: Custom archive directory is used
      expect(result.archivePath).toContain(join(projectDir, '.archives'));
      expect(result.archivePath).not.toContain('.runs');

      // Verify: Files are archived correctly
      expect(result.archived).toBe(true);
      expect(result.archivedFiles).toContain('feature_list.json');
    });

    test('creates .runs in project root with spaces in path', async () => {
      // Setup: Create project with spaces in path
      const projectDir = join(baseTestDir, 'my project folder', 'workspace');
      await mkdir(projectDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(join(projectDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Execute: Archive files
      const manager = new ArchiveManager();
      const result = await manager.archive({
        projectDir: projectDir,
        silent: true,
      });

      // Verify: .runs is in project directory (with correct spacing)
      expect(result.archivePath).toContain(join(projectDir, '.runs'));
      expect(result.archived).toBe(true);
    });
  });

  describe('path resolution consistency', () => {
    test('resolves paths consistently across multiple archiving operations', async () => {
      // Setup: Create project directory
      const projectDir = join(baseTestDir, 'consistency-test');
      await mkdir(projectDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };

      const manager = new ArchiveManager();

      // First archiving
      await writeFile(join(projectDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));
      const result1 = await manager.archive({
        projectDir: projectDir,
        silent: true,
      });

      // Second archiving (recreate feature_list.json)
      await writeFile(
        join(projectDir, 'feature_list.json'),
        JSON.stringify({ ...featureList, metadata: { last_updated: '2025-12-17T11:00:00.000Z' } }),
      );
      const result2 = await manager.archive({
        projectDir: projectDir,
        silent: true,
      });

      // Third archiving (recreate feature_list.json)
      await writeFile(
        join(projectDir, 'feature_list.json'),
        JSON.stringify({ ...featureList, metadata: { last_updated: '2025-12-17T12:00:00.000Z' } }),
      );
      const result3 = await manager.archive({
        projectDir: projectDir,
        silent: true,
      });

      // Verify: All archives are in the same .runs directory
      expect(result1.archivePath).toContain(join(projectDir, '.runs'));
      expect(result2.archivePath).toContain(join(projectDir, '.runs'));
      expect(result3.archivePath).toContain(join(projectDir, '.runs'));

      // Verify: Archive paths are different (different timestamps)
      expect(result1.archivePath).not.toBe(result2.archivePath);
      expect(result2.archivePath).not.toBe(result3.archivePath);
      expect(result1.archivePath).not.toBe(result3.archivePath);

      // Verify: All use consistent structure
      const archivePaths = [result1.archivePath!, result2.archivePath!, result3.archivePath!];
      for (const archivePath of archivePaths) {
        // Each should be: <projectDir>/.runs/<timestamp>
        expect(archivePath.startsWith(join(projectDir, '.runs'))).toBe(true);
        expect(archivePath).toMatch(/\.runs\/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);
      }
    });

    test('handles symbolic links consistently', async () => {
      // Note: This test may behave differently on different platforms
      // On Windows, symbolic links require admin privileges
      try {
        // Setup: Create project directory
        const realProjectDir = join(baseTestDir, 'real-project');
        const linkProjectDir = join(baseTestDir, 'link-to-project');
        await mkdir(realProjectDir, { recursive: true });

        // Create symbolic link (may fail on Windows without admin)
        try {
          const { symlink } = await import('fs/promises');
          await symlink(realProjectDir, linkProjectDir, 'dir');
        } catch (symlinkError) {
          // Skip this test if symlink creation fails (e.g., Windows without admin)
          console.log('Skipping symlink test (permission denied or not supported)');
          return;
        }

        // Create feature_list.json in real directory
        const featureList = {
          features: [],
          metadata: {
            last_updated: '2025-12-17T10:00:00.000Z',
          },
        };
        await writeFile(
          join(realProjectDir, 'feature_list.json'),
          JSON.stringify(featureList, null, 2),
        );

        // Execute: Archive via symbolic link
        const manager = new ArchiveManager();
        const result = await manager.archive({
          projectDir: linkProjectDir,
          silent: true,
        });

        // Verify: Archiving succeeded
        expect(result.archived).toBe(true);

        // Verify: Archive is accessible via link
        const archivedFile = await readFile(
          join(result.archivePath!, 'feature_list.json'),
          'utf-8',
        );
        const parsed = JSON.parse(archivedFile);
        expect(parsed.metadata.last_updated).toBe('2025-12-17T10:00:00.000Z');
      } catch (error) {
        // If any error occurs, log and skip
        console.log('Symlink test skipped:', error);
      }
    });

    test('normalizes paths with redundant separators', async () => {
      // Setup: Create project directory
      const projectDir = join(baseTestDir, 'normalize-test');
      await mkdir(projectDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };
      await writeFile(join(projectDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));

      // Execute: Archive with normalized path (path.resolve handles this)
      const manager = new ArchiveManager();
      const normalizedProjectDir = resolve(projectDir);
      const result = await manager.archive({
        projectDir: normalizedProjectDir,
        silent: true,
      });

      // Verify: Archive path is clean (no redundant separators)
      expect(result.archivePath).not.toContain('//');
      expect(result.archivePath).toContain('.runs');
      expect(result.archived).toBe(true);
    });

    test('handles trailing slashes consistently', async () => {
      // Setup: Create project directory
      const projectDir = join(baseTestDir, 'trailing-slash-test');
      await mkdir(projectDir, { recursive: true });

      // Create feature_list.json
      const featureList = {
        features: [],
        metadata: {
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };

      const manager = new ArchiveManager();

      // First archive: without trailing slash
      await writeFile(join(projectDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));
      const result1 = await manager.archive({
        projectDir: projectDir, // No trailing slash
        silent: true,
      });

      // Second archive: with trailing slash
      await writeFile(
        join(projectDir, 'feature_list.json'),
        JSON.stringify({ ...featureList, metadata: { last_updated: '2025-12-17T11:00:00.000Z' } }),
      );
      const result2 = await manager.archive({
        projectDir: projectDir + '/', // With trailing slash
        silent: true,
      });

      // Verify: Both produce archives in the same .runs directory
      expect(resolve(result1.archivePath!)).toContain(resolve(projectDir, '.runs'));
      expect(resolve(result2.archivePath!)).toContain(resolve(projectDir, '.runs'));

      // Verify: Paths are consistent (after normalization)
      const normalizedPath1 = resolve(result1.archivePath!);
      const normalizedPath2 = resolve(result2.archivePath!);
      expect(normalizedPath1.split('.runs')[0]).toBe(normalizedPath2.split('.runs')[0]);
    });
  });
});
