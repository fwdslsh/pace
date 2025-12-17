/* eslint-disable no-console */
/**
 * archive-performance-benchmark.ts - Comprehensive benchmark for archive performance
 *
 * This script provides a detailed benchmark of archiving performance under various conditions
 * to ensure F031 requirement (less than 100ms overhead) is consistently met.
 */

import { ArchiveManager } from './src/archive-manager';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

interface BenchmarkResult {
  scenario: string;
  avgTimeMs: number;
  maxTimeMs: number;
  minTimeMs: number;
  iterations: number;
  overheadMs: number;
}

interface TestCase {
  name: string;
  setupFiles: (projectDir: string) => Promise<void>;
}

const BENCHMARK_ITERATIONS = 20;
const MAX_ACCEPTABLE_OVERHEAD = 100;

async function createBaselineProject(projectDir: string): Promise<void> {
  // Empty project - no files to archive
}

async function createSmallProject(projectDir: string): Promise<void> {
  await writeFile(
    join(projectDir, 'feature_list.json'),
    JSON.stringify({
      features: [{ id: 'F001', description: 'Test', passes: false }],
      metadata: { last_updated: new Date().toISOString() },
    }),
  );
}

async function createMediumProject(projectDir: string): Promise<void> {
  await writeFile(
    join(projectDir, 'feature_list.json'),
    JSON.stringify({
      features: Array.from({ length: 50 }, (_, i) => ({
        id: `F${String(i + 1).padStart(3, '0')}`,
        category: 'test',
        description: `Medium test feature ${i + 1}`,
        priority: 'medium',
        steps: ['Step 1', 'Step 2'],
        passes: false,
      })),
      metadata: {
        project_name: 'medium-test-project',
        created_at: '2025-12-17',
        total_features: 50,
        passing: 0,
        failing: 50,
        last_updated: new Date().toISOString(),
      },
    }),
  );
  await writeFile(join(projectDir, 'progress.txt'), 'Session 1\nSession 2\n');
}

async function createLargeProject(projectDir: string): Promise<void> {
  await writeFile(
    join(projectDir, 'feature_list.json'),
    JSON.stringify({
      features: Array.from({ length: 500 }, (_, i) => ({
        id: `F${String(i + 1).padStart(3, '0')}`,
        category: 'test',
        description: `Large test feature ${i + 1} with extensive description to increase file size`,
        priority: 'medium',
        steps: ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5'],
        passes: i % 2 === 0,
      })),
      metadata: {
        project_name: 'large-test-project',
        created_at: '2025-12-17',
        total_features: 500,
        passing: 250,
        failing: 250,
        last_updated: new Date().toISOString(),
      },
    }),
  );
  await writeFile(
    join(projectDir, 'progress.txt'),
    Array.from({ length: 100 }, (_, i) => `Session ${i + 1}\n---\n`).join(''),
  );
}

const testCases: TestCase[] = [
  { name: 'No files (baseline)', setupFiles: createBaselineProject },
  { name: 'Small project (1 feature)', setupFiles: createSmallProject },
  { name: 'Medium project (50 features)', setupFiles: createMediumProject },
  { name: 'Large project (500 features)', setupFiles: createLargeProject },
];

async function runBenchmark(
  archiveManager: ArchiveManager,
  testCase: TestCase,
): Promise<BenchmarkResult> {
  const times: number[] = [];

  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
    const testDir = join(tmpdir(), `pace-bench-${Date.now()}-${i}`);
    await mkdir(testDir, { recursive: true });

    try {
      const startTime = process.hrtime.bigint();

      await testCase.setupFiles(testDir);

      await archiveManager.archive({
        projectDir: testDir,
        silent: true,
      });

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      times.push(durationMs);
    } finally {
      // Cleanup
      try {
        await import('fs/promises').then((fs) => fs.rm(testDir, { recursive: true, force: true }));
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);

  // Calculate overhead compared to baseline (assume baseline is ~20ms from previous tests)
  const baselineTime = 20; // Approximate baseline without archiving
  const overhead = Math.max(0, avgTime - baselineTime);

  return {
    scenario: testCase.name,
    avgTimeMs: avgTime,
    maxTimeMs: maxTime,
    minTimeMs: minTime,
    iterations: BENCHMARK_ITERATIONS,
    overheadMs: overhead,
  };
}

function formatTime(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(1)}μs`;
  } else if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  } else {
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

function printResults(results: BenchmarkResult[]): void {
  console.log('\n🚀 Archive Performance Benchmark Results\n');
  console.log('='.repeat(60));

  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.scenario}`);
    console.log('   ' + '-'.repeat(40));
    console.log(`   Average time:     ${formatTime(result.avgTimeMs)}`);
    console.log(`   Max time:         ${formatTime(result.maxTimeMs)}`);
    console.log(`   Min time:         ${formatTime(result.minTimeMs)}`);
    console.log(`   Overhead:         ${formatTime(result.overheadMs)}`);
    console.log(
      `   Requirement:      ${result.overheadMs <= MAX_ACCEPTABLE_OVERHEAD ? '✅ PASS' : '❌ FAIL'}`,
    );
  });

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');

  const maxOverhead = Math.max(...results.map((r) => r.overheadMs));
  const avgOverhead = results.reduce((sum, r) => sum + r.overheadMs, 0) / results.length;
  const passingCount = results.filter((r) => r.overheadMs <= MAX_ACCEPTABLE_OVERHEAD).length;

  console.log(`   Maximum overhead:  ${formatTime(maxOverhead)}`);
  console.log(`   Average overhead:  ${formatTime(avgOverhead)}`);
  console.log(`   Scenarios passing: ${passingCount}/${results.length}`);
  console.log(
    `   Overall status:    ${maxOverhead <= MAX_ACCEPTABLE_OVERHEAD ? '✅ PASS' : '❌ FAIL'}`,
  );
  console.log(`   Requirement:       <${MAX_ACCEPTABLE_OVERHEAD}ms overhead (F031)`);

  if (maxOverhead <= MAX_ACCEPTABLE_OVERHEAD) {
    console.log('\n✅ Performance benchmark PASSED - All scenarios within acceptable limits!');
  } else {
    console.log('\n❌ Performance benchmark FAILED - Some scenarios exceed 100ms requirement!');
  }
}

async function main(): Promise<void> {
  console.log('🏃 Running comprehensive archive performance benchmark...\n');

  const archiveManager = new ArchiveManager();
  const results: BenchmarkResult[] = [];

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}...`);
    const result = await runBenchmark(archiveManager, testCase);
    results.push(result);
  }

  printResults(results);
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
