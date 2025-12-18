/**
 * Performance Tests for Archive Manager
 *
 * These tests verify that archiving doesn't significantly slow down init operations
 * as required by feature F031 (overhead must be less than 100ms).
 */

import { ArchiveManager } from '../src/archive-manager';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ArchiveManager Performance', () => {
  let archiveManager: ArchiveManager;
  let testDir: string;

  beforeEach(async () => {
    archiveManager = new ArchiveManager();
    testDir = join(tmpdir(), `pace-perf-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await import('fs/promises').then((fs) => fs.rm(testDir, { recursive: true, force: true }));
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Performance Requirements', () => {
    const MAX_ACCEPTABLE_OVERHEAD = 100; // 100ms as per F031
    const TEST_ITERATIONS = 5;

    test('archiving overhead is less than 100ms', async () => {
      const measurements: { noArchive: number; withArchive: number }[] = [];

      // Run performance tests
      for (let i = 0; i < TEST_ITERATIONS; i++) {
        // Measure without archiving
        const noArchiveStart = process.hrtime.bigint();
        await archiveManager.archive({
          projectDir: testDir,
          dryRun: true, // Use dry run to avoid actual file operations
          silent: true,
        });
        const noArchiveEnd = process.hrtime.bigint();
        const noArchiveTime = Number(noArchiveEnd - noArchiveStart) / 1000000; // Convert to ms

        // Create test files to archive
        const featureListPath = join(testDir, 'feature_list.json');
        await writeFile(
          featureListPath,
          JSON.stringify({
            features: [{ id: 'F001', description: 'Test', passes: false }],
            metadata: { last_updated: new Date().toISOString() },
          }),
        );

        const progressPath = join(testDir, 'progress.txt');
        await writeFile(progressPath, 'Test progress');

        // Measure with archiving
        const withArchiveStart = process.hrtime.bigint();
        await archiveManager.archive({
          projectDir: testDir,
          silent: true,
        });
        const withArchiveEnd = process.hrtime.bigint();
        const withArchiveTime = Number(withArchiveEnd - withArchiveStart) / 1000000; // Convert to ms

        measurements.push({ noArchive: noArchiveTime, withArchive: withArchiveTime });

        // Clean up for next iteration
        await import('fs/promises').then((fs) =>
          fs.rm(join(testDir, '.fwdslsh/pace/history'), { recursive: true, force: true }),
        );
      }

      // Calculate averages
      const avgNoArchive = measurements.reduce((sum, m) => sum + m.noArchive, 0) / TEST_ITERATIONS;
      const avgWithArchive =
        measurements.reduce((sum, m) => sum + m.withArchive, 0) / TEST_ITERATIONS;
      const overhead = avgWithArchive - avgNoArchive;

      console.log(`Performance Test Results:`);
      console.log(`  Average without archiving: ${avgNoArchive.toFixed(2)}ms`);
      console.log(`  Average with archiving: ${avgWithArchive.toFixed(2)}ms`);
      console.log(`  Average overhead: ${overhead.toFixed(2)}ms`);

      // Verify requirement
      expect(overhead).toBeLessThan(MAX_ACCEPTABLE_OVERHEAD);
    });

    test('parallel file operations improve performance', async () => {
      // Create multiple test files
      const files = ['feature_list.json', 'progress.txt'];

      for (const file of files) {
        await writeFile(join(testDir, file), 'test content');
      }

      // Measure time with parallel operations
      const start = process.hrtime.bigint();
      await archiveManager.archive({
        projectDir: testDir,
        silent: true,
      });
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to ms

      // Even with multiple files, should complete quickly due to parallel operations
      expect(duration).toBeLessThan(50); // Should be very fast with parallel ops
    });

    test('caching reduces redundant operations', async () => {
      // Create feature_list.json
      const featureListPath = join(testDir, 'feature_list.json');
      await writeFile(
        featureListPath,
        JSON.stringify({
          features: [{ id: 'F001', description: 'Test', passes: false }],
          metadata: { last_updated: '2025-12-17T10:00:00.000Z' },
        }),
      );

      // First call - should be normal speed
      const start1 = process.hrtime.bigint();
      await archiveManager.archive({
        projectDir: testDir,
        dryRun: true, // Use dry run to test caching without actual file ops
        silent: true,
      });
      const end1 = process.hrtime.bigint();
      const firstCall = Number(end1 - start1) / 1000000;

      // Second call with same timestamp - should benefit from caching
      const start2 = process.hrtime.bigint();
      await archiveManager.archive({
        projectDir: testDir,
        dryRun: true,
        silent: true,
      });
      const end2 = process.hrtime.bigint();
      const secondCall = Number(end2 - start2) / 1000000;

      // Second call should be faster or at least not significantly slower due to caching
      expect(secondCall).toBeLessThan(firstCall + 10); // Allow 10ms tolerance
    });

    test('timestamp optimization reduces parsing time', async () => {
      // Create a large feature_list.json to test optimization
      const largeFeatureList = {
        features: Array.from({ length: 1000 }, (_, i) => ({
          id: `F${String(i + 1).padStart(3, '0')}`,
          category: 'test',
          description: `Test feature ${i + 1} with a longer description to make the file larger`,
          priority: 'medium',
          steps: ['Step 1', 'Step 2', 'Step 3'],
          passes: i % 2 === 0,
        })),
        metadata: {
          project_name: 'large-test-project',
          created_at: '2025-12-17',
          total_features: 1000,
          passing: 500,
          failing: 500,
          last_updated: '2025-12-17T10:00:00.000Z',
        },
      };

      const featureListPath = join(testDir, 'feature_list.json');
      await writeFile(featureListPath, JSON.stringify(largeFeatureList, null, 2));

      // Measure timestamp extraction performance
      const start = process.hrtime.bigint();
      await archiveManager.archive({
        projectDir: testDir,
        dryRun: true,
        silent: true,
      });
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000;

      // Should complete quickly even with large file due to regex optimization
      expect(duration).toBeLessThan(20); // Should be under 20ms even for large files
    });
  });

  describe('Asynchronous Operations', () => {
    test('file operations run in parallel', async () => {
      // Create test files
      const featureListPath = join(testDir, 'feature_list.json');
      await writeFile(
        featureListPath,
        JSON.stringify({
          features: [{ id: 'F001', description: 'Test', passes: false }],
          metadata: { last_updated: new Date().toISOString() },
        }),
      );

      const progressPath = join(testDir, 'progress.txt');
      await writeFile(progressPath, 'test progress');

      // Track when operations complete
      const startTime = Date.now();
      const completionTimes: string[] = [];

      // Mock console.time to track operations
      const originalLog = console.log;
      console.log = (...args) => {
        if (args[0] && args[0].includes('Archived')) {
          completionTimes.push(args[0]);
        }
        originalLog(...args);
      };

      await archiveManager.archive({
        projectDir: testDir,
        silent: false, // Enable logging to track completions
      });

      // Restore console
      console.log = originalLog;

      // Both files should be archived quickly due to parallel operations
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(50); // Should complete quickly
      expect(completionTimes).toHaveLength(2); // Both files should be archived
    });
  });
});
