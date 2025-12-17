/* eslint-disable no-console */
/**
 * performance-test.ts - Test script to measure archiving performance impact
 *
 * This script measures the time it takes to run the init command with and without
 * archiving to ensure the overhead is less than 100ms as required by F031.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

// Test configuration
const TEST_ITERATIONS = 10;
const MAX_ACCEPTABLE_OVERHEAD = 100; // 100ms as per F031 requirements

interface TestResult {
  noArchiveTime: number;
  withArchiveTime: number;
  overhead: number;
  overheadPercentage: number;
}

function cleanupFiles(projectDir: string): void {
  const featureListPath = join(projectDir, 'feature_list.json');
  const progressPath = join(projectDir, 'progress.txt');
  const runsDir = join(projectDir, '.runs');
  const paceDir = join(projectDir, '.opencode');

  // Remove test files
  if (existsSync(featureListPath)) unlinkSync(featureListPath);
  if (existsSync(progressPath)) unlinkSync(progressPath);

  // Remove .runs directory recursively
  try {
    execSync(`rm -rf "${runsDir}"`, { cwd: projectDir });
  } catch {
    // Directory doesn't exist
  }

  // Remove .opencode directory recursively
  try {
    execSync(`rm -rf "${paceDir}"`, { cwd: projectDir });
  } catch {
    // Directory doesn't exist
  }
}

function createInitialProject(projectDir: string): void {
  const featureListPath = join(projectDir, 'feature_list.json');
  const progressPath = join(projectDir, 'progress.txt');

  // Create a realistic feature_list.json
  writeFileSync(
    featureListPath,
    JSON.stringify(
      {
        features: [
          {
            id: 'F001',
            category: 'core',
            description: 'Test feature',
            priority: 'high',
            steps: ['Step 1', 'Step 2'],
            passes: true,
          },
        ],
        metadata: {
          project_name: 'test-project',
          created_at: '2025-12-17',
          total_features: 1,
          passing: 0,
          failing: 1,
          last_updated: new Date().toISOString(),
        },
      },
      null,
      2,
    ),
  );

  // Create a progress.txt
  writeFileSync(
    progressPath,
    '# Test Progress\n\n---\n### Session 1\n\n**Date:** 2025-12-17\n**Agent Type:** Test\n\n',
  );
}

function measureInitTime(projectDir: string, hasInitialFiles: boolean): number {
  // Clean up before test
  cleanupFiles(projectDir);

  // Create initial files if we want to test archiving
  if (hasInitialFiles) {
    createInitialProject(projectDir);
  }

  const startTime = process.hrtime.bigint();

  try {
    // Run init command with dry-run to avoid LLM calls
    const flags = hasInitialFiles
      ? '--json --dry-run "Test project for performance measurement"'
      : '--json --dry-run "Test project for performance measurement"';
    execSync(`./pace init ${flags}`, {
      cwd: projectDir,
      stdio: 'pipe', // Suppress output for clean measurement
      timeout: 30000, // 30 second timeout
    });
  } catch (error) {
    console.error('Init command failed:', error);
    throw error;
  }

  const endTime = process.hrtime.bigint();
  const durationMs = Number(endTime - startTime) / 1000000; // Convert nanoseconds to milliseconds

  return durationMs;
}

function runPerformanceTest(): TestResult {
  const projectDir = process.cwd();

  console.log(`🏃 Running performance test with ${TEST_ITERATIONS} iterations each...\n`);

  // Measure init time without archiving (no existing files)
  const noArchiveTimes: number[] = [];
  for (let i = 0; i < TEST_ITERATIONS; i++) {
    console.log(`  Measuring without archiving (iteration ${i + 1}/${TEST_ITERATIONS})...`);
    const time = measureInitTime(projectDir, false);
    noArchiveTimes.push(time);
  }

  const noArchiveAvg = noArchiveTimes.reduce((a, b) => a + b, 0) / noArchiveTimes.length;

  // Measure init time with archiving (existing files to archive)
  const withArchiveTimes: number[] = [];
  for (let i = 0; i < TEST_ITERATIONS; i++) {
    console.log(`  Measuring with archiving (iteration ${i + 1}/${TEST_ITERATIONS})...`);
    const time = measureInitTime(projectDir, true);
    withArchiveTimes.push(time);
  }

  const withArchiveAvg = withArchiveTimes.reduce((a, b) => a + b, 0) / withArchiveTimes.length;

  const overhead = withArchiveAvg - noArchiveAvg;
  const overheadPercentage = (overhead / noArchiveAvg) * 100;

  return {
    noArchiveTime: noArchiveAvg,
    withArchiveTime: withArchiveAvg,
    overhead,
    overheadPercentage,
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  } else {
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

function main(): void {
  console.log('🚀 Archive Performance Impact Test\n');
  console.log('This test measures the overhead introduced by the archiving feature.\n');

  // Check if pace binary exists
  if (!existsSync('./pace')) {
    console.error('❌ Error: ./pace binary not found. Run "./init.sh" first.');
    process.exit(1);
  }

  const result = runPerformanceTest();

  console.log('\n📊 Results:');
  console.log(`  Init without archiving:    ${formatDuration(result.noArchiveTime)}`);
  console.log(`  Init with archiving:       ${formatDuration(result.withArchiveTime)}`);
  console.log(`  Archiving overhead:        ${formatDuration(result.overhead)}`);
  console.log(`  Overhead percentage:       ${result.overheadPercentage.toFixed(1)}%`);

  console.log('\n📋 Detailed breakdown:');
  console.log(`  Max acceptable overhead:   ${MAX_ACCEPTABLE_OVERHEAD}ms`);
  console.log(
    `  Requirement status:        ${result.overhead <= MAX_ACCEPTABLE_OVERHEAD ? '✅ PASS' : '❌ FAIL'}`,
  );

  if (result.overhead <= MAX_ACCEPTABLE_OVERHEAD) {
    console.log('\n✅ Performance test PASSED - Archiving overhead is within acceptable limits!');
    process.exit(0);
  } else {
    console.log('\n❌ Performance test FAILED - Archiving overhead exceeds 100ms requirement!');
    console.log('\n💡 Suggestions:');
    console.log('  - Use more asynchronous file operations');
    console.log('  - Consider parallel file operations');
    console.log('  - Optimize file system calls');
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  main();
}
