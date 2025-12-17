import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, describe, expect, test } from 'bun:test';

import { moveToArchive, normalizeTimestamp } from '../src/archive-utils';

describe('normalizeTimestamp', () => {
  test('converts valid ISO timestamp to directory-safe format', () => {
    const result = normalizeTimestamp('2025-12-15T17:00:00.000Z');
    expect(result).toBe('2025-12-15_17-00-00');
  });

  test('converts ISO timestamp with different timezone (UTC)', () => {
    const result = normalizeTimestamp('2025-01-01T00:00:00.000Z');
    expect(result).toBe('2025-01-01_00-00-00');
  });

  test('converts ISO timestamp with milliseconds', () => {
    const result = normalizeTimestamp('2025-06-15T23:59:59.999Z');
    expect(result).toBe('2025-06-15_23-59-59');
  });

  test('converts ISO timestamp without milliseconds', () => {
    const result = normalizeTimestamp('2025-03-10T12:30:45Z');
    expect(result).toBe('2025-03-10_12-30-45');
  });

  test('handles ISO timestamp with timezone offset (+00:00)', () => {
    // This timestamp is 14:00 UTC when converted from +02:00
    const result = normalizeTimestamp('2025-12-15T16:00:00+02:00');
    expect(result).toBe('2025-12-15_14-00-00');
  });

  test('handles ISO timestamp with negative timezone offset', () => {
    // This timestamp is 22:00 UTC when converted from -05:00
    const result = normalizeTimestamp('2025-12-15T17:00:00-05:00');
    expect(result).toBe('2025-12-15_22-00-00');
  });

  test('pads single-digit months and days with zeros', () => {
    const result = normalizeTimestamp('2025-01-05T03:07:09.000Z');
    expect(result).toBe('2025-01-05_03-07-09');
  });

  test('returns fallback timestamp for invalid ISO string', () => {
    const result = normalizeTimestamp('invalid-timestamp');
    // Check format matches YYYY-MM-DD_HH-MM-SS
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  test('returns fallback timestamp for empty string', () => {
    const result = normalizeTimestamp('');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  test('returns fallback timestamp for null (type coercion)', () => {
    const result = normalizeTimestamp(null as unknown as string);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  test('returns fallback timestamp for undefined', () => {
    const result = normalizeTimestamp(undefined as unknown as string);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  test('returns fallback timestamp for malformed date string', () => {
    const result = normalizeTimestamp('2025-13-99T99:99:99Z'); // Invalid month/day/time
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  test('handles year boundaries correctly', () => {
    const result = normalizeTimestamp('2024-12-31T23:59:59.000Z');
    expect(result).toBe('2024-12-31_23-59-59');
  });

  test('handles leap year date correctly', () => {
    const result = normalizeTimestamp('2024-02-29T12:00:00.000Z');
    expect(result).toBe('2024-02-29_12-00-00');
  });

  test('directory-safe format contains no special characters except dash and underscore', () => {
    const result = normalizeTimestamp('2025-12-15T17:00:00.000Z');
    // Should only contain digits, dashes, and one underscore
    expect(result).toMatch(/^[\d-]+_[\d-]+$/);
    expect(result).not.toContain(':');
    expect(result).not.toContain('T');
    expect(result).not.toContain('Z');
    expect(result).not.toContain('.');
  });

  test('fallback timestamp is within reasonable time range (within 1 minute)', () => {
    const before = Date.now();
    const result = normalizeTimestamp('invalid');
    const after = Date.now();

    // Parse the result back to a date
    const match = result.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/);
    expect(match).not.toBeNull();

    if (match) {
      const [, year, month, day, hours, minutes, seconds] = match;
      const resultDate = new Date(
        Date.UTC(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hours),
          parseInt(minutes),
          parseInt(seconds),
        ),
      );

      // Verify the timestamp is within 1 minute of when we called the function
      const resultMs = resultDate.getTime();
      expect(resultMs).toBeGreaterThanOrEqual(before - 1000);
      expect(resultMs).toBeLessThanOrEqual(after + 1000);
    }
  });

  describe('security: path traversal protection', () => {
    test('rejects path traversal attempt with ../../../', () => {
      const maliciousTimestamp = '../../../etc/passwd';
      const result = normalizeTimestamp(maliciousTimestamp);

      // Should return fallback timestamp, not the malicious input
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
      expect(result).not.toContain('..');
      expect(result).not.toContain('/');
    });

    test('rejects absolute path', () => {
      const maliciousTimestamp = '/etc/passwd';
      const result = normalizeTimestamp(maliciousTimestamp);

      // Should return fallback timestamp
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
      expect(result).not.toContain('/');
    });

    test('rejects Windows path traversal', () => {
      const maliciousTimestamp = '..\\..\\..\\Windows\\System32';
      const result = normalizeTimestamp(maliciousTimestamp);

      // Should return fallback timestamp
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
      expect(result).not.toContain('\\');
      expect(result).not.toContain('..');
    });

    test('rejects null bytes', () => {
      const maliciousTimestamp = '2025-12-15T17:00:00\x00../etc/passwd';
      const result = normalizeTimestamp(maliciousTimestamp);

      // Should return fallback timestamp
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
      expect(result).not.toContain('\x00');
      expect(result).not.toContain('..');
    });

    test('output contains only safe characters', () => {
      const validTimestamp = '2025-12-15T17:00:00.000Z';
      const result = normalizeTimestamp(validTimestamp);

      // Verify output matches expected safe format
      expect(/^[0-9_-]+$/.test(result)).toBe(true);
      expect(result).not.toContain('/');
      expect(result).not.toContain('\\');
      expect(result).not.toContain('..');
      expect(result).not.toContain('\x00');
    });
  });
});

describe('moveToArchive', () => {
  // Create a temporary test directory for each test
  const testDir = join(tmpdir(), 'pace-test-archive-' + Date.now());
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

  test('successfully moves a file to archive directory', async () => {
    // Setup: Create source directory and file
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'test.txt');
    const testContent = 'test content';
    await writeFile(sourceFile, testContent);

    // Execute: Move file to archive
    const destPath = await moveToArchive(sourceFile, destDir, 'test.txt', testDir);

    // Verify: File exists in destination
    const destContent = await readFile(destPath, 'utf-8');
    expect(destContent).toBe(testContent);
    expect(destPath).toBe(join(destDir, 'test.txt'));

    // Verify: Source file no longer exists
    let sourceExists = true;
    try {
      await stat(sourceFile);
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        sourceExists = false;
      }
    }
    expect(sourceExists).toBe(false);
  });

  test('creates nested destination directories if they do not exist', async () => {
    // Setup: Create source file
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'test.txt');
    await writeFile(sourceFile, 'nested test');

    // Execute: Move to deeply nested directory
    const nestedDestDir = join(destDir, 'level1', 'level2', 'level3');
    const destPath = await moveToArchive(sourceFile, nestedDestDir, 'test.txt', testDir);

    // Verify: File exists in nested destination
    const content = await readFile(destPath, 'utf-8');
    expect(content).toBe('nested test');
  });

  test('uses source filename when destination filename is not provided', async () => {
    // Setup: Create source file
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'original-name.json');
    await writeFile(sourceFile, '{"test": true}');

    // Execute: Move without specifying filename
    const destPath = await moveToArchive(sourceFile, destDir, undefined, testDir);

    // Verify: Destination uses original filename
    expect(destPath).toBe(join(destDir, 'original-name.json'));
    const content = await readFile(destPath, 'utf-8');
    expect(content).toBe('{"test": true}');
  });

  test('renames file when destination filename is different', async () => {
    // Setup: Create source file
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'old-name.txt');
    await writeFile(sourceFile, 'rename test');

    // Execute: Move with new filename
    const destPath = await moveToArchive(sourceFile, destDir, 'new-name.txt', testDir);

    // Verify: File exists with new name
    expect(destPath).toBe(join(destDir, 'new-name.txt'));
    const content = await readFile(destPath, 'utf-8');
    expect(content).toBe('rename test');
  });

  test('throws error when source file does not exist', async () => {
    // Execute and verify: Should throw error for non-existent file
    const nonExistentFile = join(sourceDir, 'does-not-exist.txt');

    await expect(moveToArchive(nonExistentFile, destDir, 'test.txt', testDir)).rejects.toThrow(
      /Source file not found/,
    );
  });

  test('handles moving large files correctly', async () => {
    // Setup: Create source file with large content
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'large.txt');
    const largeContent = 'x'.repeat(1024 * 1024); // 1MB of data
    await writeFile(sourceFile, largeContent);

    // Execute: Move large file
    const destPath = await moveToArchive(sourceFile, destDir, 'large.txt', testDir);

    // Verify: File content is intact
    const content = await readFile(destPath, 'utf-8');
    expect(content.length).toBe(largeContent.length);
    expect(content).toBe(largeContent);
  });

  test('handles JSON files correctly', async () => {
    // Setup: Create JSON file
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'feature_list.json');
    const jsonData = { features: [{ id: 'F001', passes: true }], metadata: { total: 1 } };
    await writeFile(sourceFile, JSON.stringify(jsonData, null, 2));

    // Execute: Move JSON file
    const destPath = await moveToArchive(sourceFile, destDir, 'feature_list.json', testDir);

    // Verify: JSON file is intact and parseable
    const content = await readFile(destPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(jsonData);
  });

  test('handles text files with various content types', async () => {
    // Setup: Create file with special characters
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'progress.txt');
    const specialContent = 'Line 1\nLine 2\n✓ Unicode ✗\n---\n## Markdown';
    await writeFile(sourceFile, specialContent);

    // Execute: Move text file
    const destPath = await moveToArchive(sourceFile, destDir, 'progress.txt', testDir);

    // Verify: Content preserved including special characters
    const content = await readFile(destPath, 'utf-8');
    expect(content).toBe(specialContent);
  });

  test('handles permission errors gracefully', async () => {
    // Note: This test is platform-dependent and may not work on all systems
    // We'll test that errors are wrapped in a meaningful error message
    await mkdir(sourceDir, { recursive: true });
    const sourceFile = join(sourceDir, 'test.txt');
    await writeFile(sourceFile, 'test');

    // Try to move to an invalid destination (null byte in path)
    // This should fail on most systems
    const invalidDest = '/invalid/\x00/path';

    await expect(moveToArchive(sourceFile, invalidDest, 'test.txt')).rejects.toThrow(
      /Failed to move file to archive/,
    );
  });

  describe('security: path traversal protection', () => {
    test('rejects path traversal in destination directory', async () => {
      // Setup: Create source file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'test.txt');
      await writeFile(sourceFile, 'test content');

      // Try to archive to a directory outside the project using ../
      const maliciousDestDir = join(testDir, '..', '..', '..', 'tmp', 'malicious');

      await expect(
        moveToArchive(sourceFile, maliciousDestDir, 'test.txt', testDir),
      ).rejects.toThrow(/Security:.*outside project directory/);

      // Verify source file was not moved
      const sourceContent = await readFile(sourceFile, 'utf-8');
      expect(sourceContent).toBe('test content');
    });

    test('rejects absolute path in destination directory', async () => {
      // Setup: Create source file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'test.txt');
      await writeFile(sourceFile, 'test content');

      // Try to archive to an absolute path outside the test directory
      const maliciousDestDir = '/tmp/malicious-archive';

      await expect(
        moveToArchive(sourceFile, maliciousDestDir, 'test.txt', testDir),
      ).rejects.toThrow(/Security:.*outside project directory/);

      // Verify source file was not moved
      const sourceContent = await readFile(sourceFile, 'utf-8');
      expect(sourceContent).toBe('test content');
    });

    test('rejects path traversal in filename', async () => {
      // Setup: Create source file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'test.txt');
      await writeFile(sourceFile, 'test content');

      // Try to use a malicious filename with path traversal
      const maliciousFilename = '../../../etc/passwd';

      await expect(moveToArchive(sourceFile, destDir, maliciousFilename, testDir)).rejects.toThrow(
        /Invalid filename: .* \(contains path separators or traversal\)/,
      );

      // Verify source file was not moved
      const sourceContent = await readFile(sourceFile, 'utf-8');
      expect(sourceContent).toBe('test content');
    });

    test('rejects filename with path separators', async () => {
      // Setup: Create source file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'test.txt');
      await writeFile(sourceFile, 'test content');

      // Try to use a filename with path separators
      const maliciousFilename = 'subdir/malicious.txt';

      await expect(moveToArchive(sourceFile, destDir, maliciousFilename, testDir)).rejects.toThrow(
        /Invalid filename: .* \(contains path separators or traversal\)/,
      );

      // Verify source file was not moved
      const sourceContent = await readFile(sourceFile, 'utf-8');
      expect(sourceContent).toBe('test content');
    });

    test('rejects Windows-style path separators in filename', async () => {
      // Setup: Create source file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'test.txt');
      await writeFile(sourceFile, 'test content');

      // Try to use a filename with Windows path separators
      const maliciousFilename = 'subdir\\malicious.txt';

      await expect(moveToArchive(sourceFile, destDir, maliciousFilename, testDir)).rejects.toThrow(
        /Invalid filename: .* \(contains path separators or traversal\)/,
      );

      // Verify source file was not moved
      const sourceContent = await readFile(sourceFile, 'utf-8');
      expect(sourceContent).toBe('test content');
    });

    test('accepts safe filenames with dots (file extensions)', async () => {
      // Setup: Create source file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'test.txt');
      await writeFile(sourceFile, 'test content');

      // Create destination directory
      await mkdir(destDir, { recursive: true });

      // Use a safe filename with extension (dots are allowed for extensions)
      const safeFilename = 'feature_list.json';

      // This should succeed
      const destPath = await moveToArchive(sourceFile, destDir, safeFilename, testDir);

      // Verify file was moved successfully
      const destContent = await readFile(destPath, 'utf-8');
      expect(destContent).toBe('test content');
      expect(destPath).toBe(join(destDir, safeFilename));
    });
  });
});
