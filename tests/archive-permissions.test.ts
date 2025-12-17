import { mkdir, readFile, rm, stat, writeFile, chmod } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { platform } from 'os';

import { afterEach, describe, expect, test } from 'bun:test';

import { moveToArchive } from '../src/archive-utils';

describe('F033: Verify archived files retain correct permissions', () => {
  // Create a temporary test directory for each test
  const testDir = join(tmpdir(), 'pace-test-f033-' + Date.now());
  const sourceDir = join(testDir, 'source');
  const destDir = join(testDir, 'dest');

  afterEach(async () => {
    // Clean up test directory after each test
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('checks file permissions before archiving', async () => {
    // Setup: Create source file with specific permissions
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'test.txt');
    await writeFile(sourceFile, 'test content');

    // Set specific permissions
    const targetMode = 0o644; // rw-r--r--
    await chmod(sourceFile, targetMode);

    // Verify permissions before archiving
    const beforeStats = await stat(sourceFile);
    const beforeMode = beforeStats.mode & 0o777;
    expect(beforeMode).toBe(targetMode);

    // Execute: Archive the file
    const destPath = await moveToArchive(sourceFile, destDir, 'test.txt', testDir);

    // Verify: Permissions after archiving match before
    const afterStats = await stat(destPath);
    const afterMode = afterStats.mode & 0o777;
    expect(afterMode).toBe(beforeMode);
    expect(afterMode).toBe(targetMode);
  });

  test('checks file permissions after archiving', async () => {
    // Setup: Create source file with executable permissions
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'script.sh');
    await writeFile(sourceFile, '#!/bin/bash\necho "Hello World"\n');

    // Set executable permissions
    const targetMode = 0o755; // rwxr-xr-x
    await chmod(sourceFile, targetMode);

    // Execute: Archive the file
    const destPath = await moveToArchive(sourceFile, destDir, 'script.sh', testDir);

    // Verify: Archived file has correct permissions
    const archivedStats = await stat(destPath);
    const archivedMode = archivedStats.mode & 0o777;
    expect(archivedMode).toBe(targetMode);

    // Verify: Executable bit is set for user, group, and others
    expect(archivedMode & 0o100).toBe(0o100); // User execute
    expect(archivedMode & 0o010).toBe(0o010); // Group execute
    expect(archivedMode & 0o001).toBe(0o001); // Other execute
  });

  test('verifies permissions are preserved across different permission modes', async () => {
    const permissionModes = [
      0o777, // rwxrwxrwx
      0o755, // rwxr-xr-x
      0o644, // rw-r--r--
      0o600, // rw-------
      0o444, // r--r--r--
      0o400, // r--------
      0o666, // rw-rw-rw-
      0o750, // rwxr-x---
      0o770, // rwxrwx---
    ];

    for (const targetMode of permissionModes) {
      // Setup: Create source file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, `file-mode-${targetMode.toString(8)}.txt`);
      await writeFile(sourceFile, `content for mode ${targetMode.toString(8)}`);

      // Set specific permissions
      await chmod(sourceFile, targetMode);

      // Verify source file permissions
      const sourceStats = await stat(sourceFile);
      const sourceMode = sourceStats.mode & 0o777;
      expect(sourceMode).toBe(targetMode);

      // Execute: Archive the file
      const destPath = await moveToArchive(
        sourceFile,
        destDir,
        `file-mode-${targetMode.toString(8)}.txt`,
        testDir,
      );

      // Verify: Archived file permissions match exactly
      const archivedStats = await stat(destPath);
      const archivedMode = archivedStats.mode & 0o777;
      expect(archivedMode).toBe(targetMode);
      expect(archivedMode).toBe(sourceMode);

      // Clean up for next iteration
      await rm(destPath, { force: true });
    }
  });

  test('test with executable files if applicable', async () => {
    // Setup: Create executable script files
    await mkdir(sourceDir, { recursive: true });

    const scripts = [
      { name: 'bash-script.sh', content: '#!/bin/bash\necho "Bash script"', mode: 0o755 },
      {
        name: 'python-script.py',
        content: '#!/usr/bin/env python3\nprint("Python script")',
        mode: 0o755,
      },
      {
        name: 'node-script.js',
        content: '#!/usr/bin/env node\nconsole.log("Node script")',
        mode: 0o755,
      },
      { name: 'executable-bin', content: 'binary content placeholder', mode: 0o744 },
    ];

    for (const script of scripts) {
      const sourceFile = join(sourceDir, script.name);
      await writeFile(sourceFile, script.content);
      await chmod(sourceFile, script.mode);

      // Verify source has executable permissions
      const sourceStats = await stat(sourceFile);
      const sourceMode = sourceStats.mode & 0o777;
      expect(sourceMode).toBe(script.mode);

      // Check if execute bit is set
      expect(sourceMode & 0o100).toBe(0o100); // User execute should be set

      // Execute: Archive the script
      const destPath = await moveToArchive(sourceFile, destDir, script.name, testDir);

      // Verify: Archived script retains executable permissions
      const archivedStats = await stat(destPath);
      const archivedMode = archivedStats.mode & 0o777;
      expect(archivedMode).toBe(script.mode);

      // Verify execute bits are preserved
      expect(archivedMode & 0o100).toBe(0o100); // User execute
      if (script.mode & 0o010) expect(archivedMode & 0o010).toBe(0o010); // Group execute
      if (script.mode & 0o001) expect(archivedMode & 0o001).toBe(0o001); // Other execute

      // Clean up for next iteration
      await rm(destPath, { force: true });
    }
  });

  test('test on different platforms (Linux, macOS)', async () => {
    const currentPlatform = platform();
    expect(['linux', 'darwin']).toContain(currentPlatform); // Ensure we're on a supported platform

    // Setup: Create files with platform-specific considerations
    await mkdir(sourceDir, { recursive: true });

    // Test different permission scenarios based on platform
    const testCases = [
      {
        name: 'standard-executable.sh',
        content: '#!/bin/bash\necho "Standard executable"',
        mode: 0o755,
        description: 'Standard executable permissions',
      },
      {
        name: 'user-executable-only.sh',
        content: '#!/bin/bash\necho "User executable only"',
        mode: 0o700,
        description: 'User-only executable permissions',
      },
      {
        name: 'no-executable.txt',
        content: 'Non-executable file',
        mode: 0o644,
        description: 'Standard file permissions (no execute)',
      },
      {
        name: 'restricted.dat',
        content: 'Restricted data file',
        mode: 0o600,
        description: 'User-only read/write permissions',
      },
    ];

    for (const testCase of testCases) {
      const sourceFile = join(sourceDir, testCase.name);
      await writeFile(sourceFile, testCase.content);
      await chmod(sourceFile, testCase.mode);

      // Record permissions before archiving
      const beforeStats = await stat(sourceFile);
      const beforeMode = beforeStats.mode & 0o777;
      expect(beforeMode).toBe(testCase.mode);

      // Execute: Archive the file
      const destPath = await moveToArchive(sourceFile, destDir, testCase.name, testDir);

      // Verify: Permissions are preserved exactly
      const afterStats = await stat(destPath);
      const afterMode = afterStats.mode & 0o777;
      expect(afterMode).toBe(testCase.mode);
      expect(afterMode).toBe(beforeMode);

      // Platform-specific verification
      if (currentPlatform === 'linux') {
        // Linux-specific permission handling
        expect(afterMode & 0o777).toBe(testCase.mode);
      } else if (currentPlatform === 'darwin') {
        // macOS-specific permission handling
        expect(afterMode & 0o777).toBe(testCase.mode);
      }

      // Verify file content is intact
      const content = await readFile(destPath, 'utf-8');
      expect(content).toBe(testCase.content);

      // Clean up for next iteration
      await rm(destPath, { force: true });
    }

    // Log platform for test verification
    console.log(`✅ Permission preservation verified on ${currentPlatform}`);
  });

  test('verifies permission preservation with feature_list.json', async () => {
    // Setup: Create feature_list.json with specific permissions
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'feature_list.json');
    const jsonData = {
      features: [
        {
          id: 'F033',
          passes: false,
          description: 'Verify archived files retain correct permissions',
        },
      ],
      metadata: { total: 1, passing: 0, failing: 1 },
    };
    await writeFile(sourceFile, JSON.stringify(jsonData, null, 2));

    // Test with different permission modes for JSON files
    const jsonPermissionModes = [0o644, 0o600, 0o640, 0o666];

    for (const targetMode of jsonPermissionModes) {
      // Reset file and set permissions
      await writeFile(sourceFile, JSON.stringify(jsonData, null, 2));
      await chmod(sourceFile, targetMode);

      // Verify source permissions
      const sourceStats = await stat(sourceFile);
      const sourceMode = sourceStats.mode & 0o777;
      expect(sourceMode).toBe(targetMode);

      // Execute: Archive the JSON file
      const destPath = await moveToArchive(sourceFile, destDir, 'feature_list.json', testDir);

      // Verify: JSON file permissions preserved
      const archivedStats = await stat(destPath);
      const archivedMode = archivedStats.mode & 0o777;
      expect(archivedMode).toBe(targetMode);
      expect(archivedMode).toBe(sourceMode);

      // Verify: JSON content is still parseable
      const content = await readFile(destPath, 'utf-8');
      const parsedData = JSON.parse(content);
      expect(parsedData).toEqual(jsonData);

      // Clean up for next iteration
      await rm(destPath, { force: true });
    }
  });

  test('verifies permission preservation with progress.txt', async () => {
    // Setup: Create progress.txt with specific permissions
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'progress.txt');
    const progressContent = `# Session Log - Permission Testing

## F033: Verify archived files retain correct permissions

### Verification Steps:
- [x] Check file permissions before archiving
- [x] Check file permissions after archiving  
- [x] Verify permissions are preserved
- [x] Test with executable files if applicable
- [x] Test on different platforms (Linux, macOS)

### Results:
- Permissions preserved correctly: ✅
- Executable files work: ✅
- Platform compatibility: ✅

---

Session completed successfully.
`;
    await writeFile(sourceFile, progressContent);

    // Test with different permission modes for progress files
    const progressPermissionModes = [0o644, 0o600, 0o640];

    for (const targetMode of progressPermissionModes) {
      // Reset file and set permissions
      await writeFile(sourceFile, progressContent);
      await chmod(sourceFile, targetMode);

      // Verify source permissions
      const sourceStats = await stat(sourceFile);
      const sourceMode = sourceStats.mode & 0o777;
      expect(sourceMode).toBe(targetMode);

      // Execute: Archive the progress file
      const destPath = await moveToArchive(sourceFile, destDir, 'progress.txt', testDir);

      // Verify: Progress file permissions preserved
      const archivedStats = await stat(destPath);
      const archivedMode = archivedStats.mode & 0o777;
      expect(archivedMode).toBe(targetMode);
      expect(archivedMode).toBe(sourceMode);

      // Verify: Progress content is intact
      const content = await readFile(destPath, 'utf-8');
      expect(content).toBe(progressContent);

      // Clean up for next iteration
      await rm(destPath, { force: true });
    }
  });

  test('comprehensive end-to-end permission verification workflow', async () => {
    // This test implements the complete F033 verification workflow

    // Setup: Create multiple files with different permissions
    await mkdir(sourceDir, { recursive: true });

    const testFiles = [
      {
        name: 'feature_list.json',
        content: '{"features": [{"id": "F033", "passes": false}]}',
        mode: 0o644,
        type: 'json',
      },
      {
        name: 'progress.txt',
        content: '# Session: Testing F033\nStatus: In progress',
        mode: 0o600,
        type: 'text',
      },
      {
        name: 'deploy.sh',
        content: '#!/bin/bash\necho "Deploy script"',
        mode: 0o755,
        type: 'executable',
      },
      {
        name: 'config.json',
        content: '{"debug": true, "timeout": 5000}',
        mode: 0o640,
        type: 'json',
      },
    ];

    const originalPermissions = new Map();

    // Step 1: Check file permissions before archiving
    for (const file of testFiles) {
      const sourceFile = join(sourceDir, file.name);
      await writeFile(sourceFile, file.content);
      await chmod(sourceFile, file.mode);

      // Record original permissions
      const stats = await stat(sourceFile);
      const actualMode = stats.mode & 0o777;
      originalPermissions.set(file.name, actualMode);

      // Verify permissions are set correctly
      expect(actualMode).toBe(file.mode);
    }

    // Step 2 & 3: Archive files and verify permissions are preserved
    for (const file of testFiles) {
      const sourceFile = join(sourceDir, file.name);

      // Execute: Archive the file
      const destPath = await moveToArchive(sourceFile, destDir, file.name, testDir);

      // Step 3: Verify permissions are preserved
      const archivedStats = await stat(destPath);
      const archivedMode = archivedStats.mode & 0o777;
      const originalMode = originalPermissions.get(file.name);

      expect(archivedMode).toBe(originalMode);
      expect(archivedMode).toBe(file.mode);

      // Verify content integrity
      const content = await readFile(destPath, 'utf-8');
      expect(content).toBe(file.content);

      // Step 4: Test with executable files if applicable
      if (file.type === 'executable') {
        // Verify executable bits are set
        expect(archivedMode & 0o100).toBe(0o100); // User execute
        expect(archivedMode & 0o010).toBe(0o010); // Group execute
        expect(archivedMode & 0o001).toBe(0o001); // Other execute
      }
    }

    // Step 5: Test on different platforms (Linux, macOS) - logged in platform test
    const currentPlatform = platform();
    console.log(`✅ F033 verification completed on ${currentPlatform}`);

    // Final verification: All files preserved permissions correctly
    const archivedFiles = await stat(destDir);
    expect(archivedFiles.isDirectory()).toBe(true);

    // Count that all files were archived
    let fileCount = 0;
    for (const file of testFiles) {
      const destPath = join(destDir, file.name);
      try {
        await stat(destPath);
        fileCount++;
      } catch {
        // File doesn't exist - this would be a failure
      }
    }
    expect(fileCount).toBe(testFiles.length);
  });

  test('handles edge cases for permission preservation', async () => {
    await mkdir(sourceDir, { recursive: true });

    // Test edge case: Maximum restrictive permissions
    const restrictiveFile = join(sourceDir, 'restricted.txt');
    await writeFile(restrictiveFile, 'restricted content');
    await chmod(restrictiveFile, 0o000); // No permissions for anyone

    const sourceStats1 = await stat(restrictiveFile);
    const sourceMode1 = sourceStats1.mode & 0o777;
    expect(sourceMode1).toBe(0o000);

    const destPath1 = await moveToArchive(restrictiveFile, destDir, 'restricted.txt', testDir);
    const archivedStats1 = await stat(destPath1);
    const archivedMode1 = archivedStats1.mode & 0o777;
    expect(archivedMode1).toBe(0o000);

    // Test edge case: Maximum permissive permissions
    const permissiveFile = join(sourceDir, 'permissive.txt');
    await writeFile(permissiveFile, 'permissive content');
    await chmod(permissiveFile, 0o777); // All permissions for everyone

    const sourceStats2 = await stat(permissiveFile);
    const sourceMode2 = sourceStats2.mode & 0o777;
    expect(sourceMode2).toBe(0o777);

    const destPath2 = await moveToArchive(permissiveFile, destDir, 'permissive.txt', testDir);
    const archivedStats2 = await stat(destPath2);
    const archivedMode2 = archivedStats2.mode & 0o777;
    expect(archivedMode2).toBe(0o777);
  });
});
