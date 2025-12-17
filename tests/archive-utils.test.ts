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

  describe('file integrity verification', () => {
    test('archived file has same size as original', async () => {
      // Setup: Create source file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'test.txt');
      const testContent = 'test content for size verification';
      await writeFile(sourceFile, testContent);

      // Get original file size
      const originalStats = await stat(sourceFile);
      const originalSize = originalStats.size;

      // Execute: Move file to archive
      const destPath = await moveToArchive(sourceFile, destDir, 'test.txt', testDir);

      // Verify: Archived file has same size
      const archivedStats = await stat(destPath);
      expect(archivedStats.size).toBe(originalSize);
      expect(archivedStats.size).toBe(testContent.length);
    });

    test('archived file content matches original (checksum verification)', async () => {
      // Setup: Create source file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'test.txt');
      const testContent = 'test content for checksum verification';
      await writeFile(sourceFile, testContent);

      // Calculate original checksum using crypto
      const crypto = await import('crypto');
      const originalHash = crypto.createHash('sha256').update(testContent).digest('hex');

      // Execute: Move file to archive
      const destPath = await moveToArchive(sourceFile, destDir, 'test.txt', testDir);

      // Verify: Archived file has same checksum
      const archivedContent = await readFile(destPath, 'utf-8');
      const archivedHash = crypto.createHash('sha256').update(archivedContent).digest('hex');
      expect(archivedHash).toBe(originalHash);
    });

    test('archived JSON file is parseable and content matches', async () => {
      // Setup: Create JSON file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'feature_list.json');
      const jsonData = {
        features: [
          { id: 'F001', passes: true, description: 'Test feature' },
          { id: 'F002', passes: false, description: 'Another test' },
        ],
        metadata: { total: 2, passing: 1, failing: 1 },
      };
      const originalContent = JSON.stringify(jsonData, null, 2);
      await writeFile(sourceFile, originalContent);

      // Execute: Move JSON file
      const destPath = await moveToArchive(sourceFile, destDir, 'feature_list.json', testDir);

      // Verify: Archived JSON is parseable
      const archivedContent = await readFile(destPath, 'utf-8');
      let parsedData;
      expect(() => {
        parsedData = JSON.parse(archivedContent);
      }).not.toThrow();

      // Verify: Content matches original
      expect(parsedData).toEqual(jsonData);

      // Verify: Checksums match
      const crypto = await import('crypto');
      const originalHash = crypto.createHash('sha256').update(originalContent).digest('hex');
      const archivedHash = crypto.createHash('sha256').update(archivedContent).digest('hex');
      expect(archivedHash).toBe(originalHash);
    });

    test('archived file with small size (< 1KB) is complete', async () => {
      // Setup: Create small file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'small.txt');
      const smallContent = 'Small file content';
      await writeFile(sourceFile, smallContent);

      const originalStats = await stat(sourceFile);
      expect(originalStats.size).toBeLessThan(1024); // Verify it's < 1KB

      // Execute: Move file
      const destPath = await moveToArchive(sourceFile, destDir, 'small.txt', testDir);

      // Verify: Size and content match
      const archivedStats = await stat(destPath);
      expect(archivedStats.size).toBe(originalStats.size);

      const archivedContent = await readFile(destPath, 'utf-8');
      expect(archivedContent).toBe(smallContent);
    });

    test('archived file with medium size (1KB - 1MB) is complete', async () => {
      // Setup: Create medium file (~100KB)
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'medium.txt');
      const mediumContent = 'x'.repeat(100 * 1024); // 100KB
      await writeFile(sourceFile, mediumContent);

      const originalStats = await stat(sourceFile);
      expect(originalStats.size).toBeGreaterThanOrEqual(1024); // >= 1KB
      expect(originalStats.size).toBeLessThan(1024 * 1024); // < 1MB

      // Calculate original checksum
      const crypto = await import('crypto');
      const originalHash = crypto.createHash('sha256').update(mediumContent).digest('hex');

      // Execute: Move file
      const destPath = await moveToArchive(sourceFile, destDir, 'medium.txt', testDir);

      // Verify: Size matches
      const archivedStats = await stat(destPath);
      expect(archivedStats.size).toBe(originalStats.size);

      // Verify: Checksum matches
      const archivedContent = await readFile(destPath, 'utf-8');
      const archivedHash = crypto.createHash('sha256').update(archivedContent).digest('hex');
      expect(archivedHash).toBe(originalHash);
    });

    test('archived file with large size (> 1MB) is complete', async () => {
      // Setup: Create large file (~2MB)
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'large.txt');
      const largeContent = 'y'.repeat(2 * 1024 * 1024); // 2MB
      await writeFile(sourceFile, largeContent);

      const originalStats = await stat(sourceFile);
      expect(originalStats.size).toBeGreaterThan(1024 * 1024); // > 1MB

      // Calculate original checksum
      const crypto = await import('crypto');
      const originalHash = crypto.createHash('sha256').update(largeContent).digest('hex');

      // Execute: Move file
      const destPath = await moveToArchive(sourceFile, destDir, 'large.txt', testDir);

      // Verify: Size matches
      const archivedStats = await stat(destPath);
      expect(archivedStats.size).toBe(originalStats.size);

      // Verify: Checksum matches
      const archivedContent = await readFile(destPath, 'utf-8');
      const archivedHash = crypto.createHash('sha256').update(archivedContent).digest('hex');
      expect(archivedHash).toBe(originalHash);
    });

    test('archived JSON with complex structure is parseable', async () => {
      // Setup: Create complex JSON file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'complex.json');
      const complexData = {
        features: Array.from({ length: 50 }, (_, i) => ({
          id: `F${String(i + 1).padStart(3, '0')}`,
          category: ['core', 'functional', 'testing'][i % 3],
          description: `Feature description ${i + 1}`,
          priority: ['critical', 'high', 'medium', 'low'][i % 4],
          steps: Array.from({ length: 5 }, (_, j) => `Step ${j + 1} for feature ${i + 1}`),
          passes: i % 3 === 0,
        })),
        metadata: {
          project_name: 'test-project',
          created_at: '2025-12-17',
          total_features: 50,
          passing: 17,
          failing: 33,
          last_updated: '2025-12-17T00:00:00.000Z',
        },
      };
      const originalContent = JSON.stringify(complexData, null, 2);
      await writeFile(sourceFile, originalContent);

      // Execute: Move JSON file
      const destPath = await moveToArchive(sourceFile, destDir, 'complex.json', testDir);

      // Verify: JSON is parseable
      const archivedContent = await readFile(destPath, 'utf-8');
      let parsedData;
      expect(() => {
        parsedData = JSON.parse(archivedContent);
      }).not.toThrow();

      // Verify: Structure and content match
      expect(parsedData).toEqual(complexData);
      expect(parsedData.features).toHaveLength(50);
      expect(parsedData.metadata.total_features).toBe(50);

      // Verify: File size matches
      const originalStats = await stat(join(destDir, 'complex.json'));
      expect(originalStats.size).toBe(originalContent.length);
    });

    test('archived binary file content is preserved (using MD5)', async () => {
      // Setup: Create binary-like content
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'binary.dat');
      // Create buffer with binary data (mix of printable and non-printable chars)
      const binaryData = Buffer.from([
        0x00,
        0x01,
        0x02,
        0xff,
        0xfe,
        0x7f,
        0x80,
        ...Buffer.from('some text'),
      ]);
      await writeFile(sourceFile, binaryData);

      // Calculate MD5 hash of original
      const crypto = await import('crypto');
      const originalMd5 = crypto.createHash('md5').update(binaryData).digest('hex');

      // Execute: Move file
      const destPath = await moveToArchive(sourceFile, destDir, 'binary.dat', testDir);

      // Verify: MD5 matches
      const archivedContent = await readFile(destPath);
      const archivedMd5 = crypto.createHash('md5').update(archivedContent).digest('hex');
      expect(archivedMd5).toBe(originalMd5);

      // Verify: Size matches
      const originalStats = { size: binaryData.length };
      const archivedStats = await stat(destPath);
      expect(archivedStats.size).toBe(originalStats.size);
    });

    test('archived progress.txt with unicode characters is complete', async () => {
      // Setup: Create progress.txt with unicode
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'progress.txt');
      const progressContent = `# Session 1: Test Session

## Status
- Features passing: 5/10 ✓
- Features failing: 5/10 ✗
- Progress: 50% █████░░░░░

## Recent Work
- Implemented feature F001 🚀
- Fixed bug in F002 ✅
- Added tests ✓

---

Next steps: Continue with remaining features
`;
      await writeFile(sourceFile, progressContent);

      // Calculate original checksum
      const crypto = await import('crypto');
      const originalHash = crypto.createHash('sha256').update(progressContent).digest('hex');

      // Execute: Move file
      const destPath = await moveToArchive(sourceFile, destDir, 'progress.txt', testDir);

      // Verify: Content matches exactly
      const archivedContent = await readFile(destPath, 'utf-8');
      expect(archivedContent).toBe(progressContent);

      // Verify: Checksum matches
      const archivedHash = crypto.createHash('sha256').update(archivedContent).digest('hex');
      expect(archivedHash).toBe(originalHash);

      // Verify: Unicode characters preserved
      expect(archivedContent).toContain('✓');
      expect(archivedContent).toContain('✗');
      expect(archivedContent).toContain('█');
      expect(archivedContent).toContain('░');
      expect(archivedContent).toContain('🚀');
      expect(archivedContent).toContain('✅');
    });

    test('detects corruption by comparing checksums', async () => {
      // Setup: Create source file
      await mkdir(sourceDir, { recursive: true });
      const sourceFile = join(sourceDir, 'test.txt');
      const originalContent = 'Original content for corruption test';
      await writeFile(sourceFile, originalContent);

      // Calculate original checksum
      const crypto = await import('crypto');
      const originalHash = crypto.createHash('sha256').update(originalContent).digest('hex');

      // Execute: Move file
      const destPath = await moveToArchive(sourceFile, destDir, 'test.txt', testDir);

      // Verify: File is not corrupted (checksums match)
      const archivedContent = await readFile(destPath, 'utf-8');
      const archivedHash = crypto.createHash('sha256').update(archivedContent).digest('hex');
      expect(archivedHash).toBe(originalHash);

      // Simulate corruption by modifying archived file
      const corruptedContent = archivedContent + ' CORRUPTED';
      await writeFile(destPath, corruptedContent);

      // Verify: Corruption is detectable
      const corruptedHash = crypto.createHash('sha256').update(corruptedContent).digest('hex');
      expect(corruptedHash).not.toBe(originalHash);
    });
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

  describe('git integration', () => {
    test('.runs directory is properly ignored by git when in .gitignore', async () => {
      // Setup: Create a git repository
      await mkdir(testDir, { recursive: true });
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Initialize git repo
      await execAsync('git init', { cwd: testDir });

      // Create .gitignore with .runs/
      const gitignorePath = join(testDir, '.gitignore');
      await writeFile(gitignorePath, '.runs/\n');
      await execAsync('git add .gitignore', { cwd: testDir });
      await execAsync('git commit -m "add gitignore"', { cwd: testDir });

      // Create .runs directory with archived files
      const archiveDir = join(testDir, '.runs', '2025-12-17_10-00-00');
      await mkdir(archiveDir, { recursive: true });
      await writeFile(join(archiveDir, 'feature_list.json'), '{"test": true}');
      await writeFile(join(archiveDir, 'progress.txt'), 'Session 1\n');

      // Check git status
      const { stdout } = await execAsync('git status --short', { cwd: testDir });

      // Verify: .runs directory is not shown in git status (ignored)
      expect(stdout).not.toContain('.runs');
      expect(stdout).not.toContain('feature_list.json');
      expect(stdout).not.toContain('progress.txt');
    });

    test('archived files can be committed if .runs is not in .gitignore', async () => {
      // Setup: Create a git repository
      await mkdir(testDir, { recursive: true });
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Initialize git repo (no .gitignore for .runs)
      await execAsync('git init', { cwd: testDir });

      // Create initial commit
      await writeFile(join(testDir, 'README.md'), '# Test\n');
      await execAsync('git add README.md', { cwd: testDir });
      await execAsync('git commit -m "initial"', { cwd: testDir });

      // Create .runs directory with archived files
      const archiveDir = join(testDir, '.runs', '2025-12-17_10-00-00');
      await mkdir(archiveDir, { recursive: true });
      const featureContent = '{"features": [], "metadata": {"total": 0}}';
      await writeFile(join(archiveDir, 'feature_list.json'), featureContent);

      // Add and commit archived files
      await execAsync('git add .runs/', { cwd: testDir });
      const { stdout } = await execAsync('git status --short', { cwd: testDir });

      // Verify: Archived files appear in git status (can be committed)
      expect(stdout).toContain('A  .runs/2025-12-17_10-00-00/feature_list.json');

      // Commit the files
      await execAsync('git commit -m "archive committed"', { cwd: testDir });

      // Verify: Files are in git history
      const { stdout: logOutput } = await execAsync('git log --oneline', { cwd: testDir });
      expect(logOutput).toContain('archive committed');

      // Verify: Archived file is in the git tree
      const { stdout: lsOutput } = await execAsync('git ls-files', { cwd: testDir });
      expect(lsOutput).toContain('.runs/2025-12-17_10-00-00/feature_list.json');
    });

    test('git log functionality works with .runs directory present', async () => {
      // Setup: Create a git repository
      await mkdir(testDir, { recursive: true });
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Initialize git repo
      await execAsync('git init', { cwd: testDir });

      // Create .gitignore with .runs/
      const gitignorePath = join(testDir, '.gitignore');
      await writeFile(gitignorePath, '.runs/\n');
      await execAsync('git add .gitignore', { cwd: testDir });
      await execAsync('git commit -m "add gitignore"', { cwd: testDir });

      // Create some commits
      await writeFile(join(testDir, 'file1.txt'), 'content 1');
      await execAsync('git add file1.txt', { cwd: testDir });
      await execAsync('git commit -m "commit 1"', { cwd: testDir });

      await writeFile(join(testDir, 'file2.txt'), 'content 2');
      await execAsync('git add file2.txt', { cwd: testDir });
      await execAsync('git commit -m "commit 2"', { cwd: testDir });

      // Create .runs directory with archived files
      const archiveDir = join(testDir, '.runs', '2025-12-17_10-00-00');
      await mkdir(archiveDir, { recursive: true });
      await writeFile(join(archiveDir, 'feature_list.json'), '{"test": true}');

      // Run git log (similar to StatusReporter.getGitLog)
      const { stdout, stderr } = await execAsync('git log --oneline -10', { cwd: testDir });

      // Verify: git log works without errors
      expect(stderr).toBe('');
      expect(stdout).toContain('commit 2');
      expect(stdout).toContain('commit 1');
      expect(stdout).toContain('add gitignore');

      // Verify: git log doesn't include .runs files (they're ignored)
      expect(stdout).not.toContain('.runs');
    });

    test('no unexpected git behavior after archiving operations', async () => {
      // Setup: Create a git repository with existing files
      await mkdir(testDir, { recursive: true });
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Initialize git repo
      await execAsync('git init', { cwd: testDir });

      // Create .gitignore with .runs/
      const gitignorePath = join(testDir, '.gitignore');
      await writeFile(gitignorePath, '.runs/\nnode_modules/\n');
      await execAsync('git add .gitignore', { cwd: testDir });
      await execAsync('git commit -m "initial"', { cwd: testDir });

      // Create feature_list.json and progress.txt (tracked files)
      await writeFile(join(testDir, 'feature_list.json'), '{"test": true}');
      await writeFile(join(testDir, 'progress.txt'), 'Session 1\n');
      await execAsync('git add feature_list.json progress.txt', { cwd: testDir });
      await execAsync('git commit -m "add files"', { cwd: testDir });

      // Simulate archiving: move files to .runs directory
      const archiveDir = join(testDir, '.runs', '2025-12-17_10-00-00');
      await mkdir(archiveDir, { recursive: true });
      const sourceDir = testDir;
      const sourceFile1 = join(sourceDir, 'feature_list.json');
      const sourceFile2 = join(sourceDir, 'progress.txt');
      await moveToArchive(sourceFile1, archiveDir, 'feature_list.json', testDir);
      await moveToArchive(sourceFile2, archiveDir, 'progress.txt', testDir);

      // Check git status
      const { stdout: statusOutput } = await execAsync('git status --short', { cwd: testDir });

      // Verify: Git shows the tracked files as deleted (expected behavior)
      expect(statusOutput).toContain(' D feature_list.json');
      expect(statusOutput).toContain(' D progress.txt');

      // Verify: .runs directory is not shown (ignored)
      expect(statusOutput).not.toContain('.runs');

      // Create new feature_list.json and progress.txt
      await writeFile(join(testDir, 'feature_list.json'), '{"new": true}');
      await writeFile(join(testDir, 'progress.txt'), 'Session 2\n');

      // Check git status again
      const { stdout: statusOutput2 } = await execAsync('git status --short', { cwd: testDir });

      // Verify: Git shows modified files (can be added and committed)
      expect(statusOutput2).toContain(' M feature_list.json');
      expect(statusOutput2).toContain(' M progress.txt');

      // Add and commit new files
      await execAsync('git add feature_list.json progress.txt', { cwd: testDir });
      await execAsync('git commit -m "new files after archive"', { cwd: testDir });

      // Verify: Git log works correctly
      const { stdout: logOutput } = await execAsync('git log --oneline -5', { cwd: testDir });
      expect(logOutput).toContain('new files after archive');
      expect(logOutput).toContain('add files');
      expect(logOutput).toContain('initial');

      // Verify: No unexpected untracked files
      const { stdout: statusOutput3 } = await execAsync('git status --short', { cwd: testDir });
      expect(statusOutput3).toBe(''); // Clean working tree
    });
  });
});
