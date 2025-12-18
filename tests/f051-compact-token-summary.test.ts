/**
 * F051: Test for condensed token summary in compact status
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { StatusReporter } from '../src/status-reporter';
import type { FeatureList } from '../src/types';

/* eslint-disable no-console */

describe('F051: Condensed token summary for compact status', () => {
  let tempDir: string;
  let originalLog: typeof console.log;
  let logs: string[];

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pace-f051-'));

    // Capture console output
    logs = [];
    originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };
  });

  afterEach(async () => {
    console.log = originalLog;
    await rm(tempDir, { recursive: true, force: true });
  });

  const createFeatureList = async (features: FeatureList) => {
    const filePath = join(tempDir, 'feature_list.json');
    await writeFile(filePath, JSON.stringify(features, null, 2), 'utf-8');
  };

  it('Step 1: Should add one-line token summary to compact status', async () => {
    await createFeatureList({
      metadata: {
        token_usage: {
          input: 50000,
          output: 150000,
          total: 200000,
        },
      },
      features: [
        {
          id: 'F001',
          description: 'Feature 1',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: true,
        },
        {
          id: 'F002',
          description: 'Feature 2',
          priority: 'medium',
          category: 'core',
          steps: [],
          passes: false,
        },
      ],
    });

    const reporter = new StatusReporter(tempDir);
    await reporter.printCompactStatus();

    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('1/2');
    expect(logs[0]).toContain('50.0%');
    expect(logs[0]).toContain('tokens'); // Should include token summary
  });

  it('Step 2: Should show total tokens with K suffix for thousands', async () => {
    await createFeatureList({
      metadata: {
        token_usage: {
          input: 2500,
          output: 7500,
          total: 10000,
        },
      },
      features: [
        {
          id: 'F001',
          description: 'Feature',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: true,
        },
      ],
    });

    const reporter = new StatusReporter(tempDir);
    await reporter.printCompactStatus();

    expect(logs[0]).toContain('10.0K tokens');
  });

  it('Step 2: Should show total tokens with M suffix for millions', async () => {
    await createFeatureList({
      metadata: {
        token_usage: {
          input: 500000,
          output: 1500000,
          total: 2000000,
        },
      },
      features: [
        {
          id: 'F001',
          description: 'Feature',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: true,
        },
      ],
    });

    const reporter = new StatusReporter(tempDir);
    await reporter.printCompactStatus();

    expect(logs[0]).toContain('2.0M tokens');
  });

  it('Step 2: Should show total tokens without suffix for values under 1000', async () => {
    await createFeatureList({
      metadata: {
        token_usage: {
          input: 300,
          output: 599,
          total: 899,
        },
      },
      features: [
        {
          id: 'F001',
          description: 'Feature',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: true,
        },
      ],
    });

    const reporter = new StatusReporter(tempDir);
    await reporter.printCompactStatus();

    expect(logs[0]).toContain('899 tokens');
    expect(logs[0]).not.toContain('K');
    expect(logs[0]).not.toContain('M');
  });

  it('Step 3: Should include token summary in printCompactStatus output', async () => {
    await createFeatureList({
      metadata: {
        token_usage: {
          input: 12000,
          output: 38000,
          total: 50000,
        },
      },
      features: [
        {
          id: 'F001',
          description: 'Feature',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: true,
        },
      ],
    });

    const reporter = new StatusReporter(tempDir);
    await reporter.printCompactStatus();

    // Should have exactly one line output
    expect(logs.length).toBe(1);

    // Should contain progress info
    expect(logs[0]).toContain('1/1');
    expect(logs[0]).toContain('100.0%');

    // Should contain token summary
    expect(logs[0]).toContain('50.0K tokens');
  });

  it('Step 4: Should make token summary visually distinct with emoji', async () => {
    await createFeatureList({
      metadata: {
        token_usage: {
          input: 5000,
          output: 15000,
          total: 20000,
        },
      },
      features: [
        {
          id: 'F001',
          description: 'Feature',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: true,
        },
      ],
    });

    const reporter = new StatusReporter(tempDir);
    await reporter.printCompactStatus();

    // Should use diamond emoji for visual distinction
    expect(logs[0]).toContain('💎');
    expect(logs[0]).toContain('20.0K tokens');
  });

  it('Should handle missing token usage gracefully', async () => {
    await createFeatureList({
      metadata: {},
      features: [
        {
          id: 'F001',
          description: 'Feature',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: true,
        },
      ],
    });

    const reporter = new StatusReporter(tempDir);
    await reporter.printCompactStatus();

    // Should still show progress but no token summary
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('1/1');
    expect(logs[0]).toContain('100.0%');
    expect(logs[0]).not.toContain('tokens');
    expect(logs[0]).not.toContain('💎');
  });

  it('Should format edge case numbers correctly', async () => {
    // Test exactly 1000 tokens
    await createFeatureList({
      metadata: {
        token_usage: {
          input: 400,
          output: 600,
          total: 1000,
        },
      },
      features: [
        {
          id: 'F001',
          description: 'Feature',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: true,
        },
      ],
    });

    const reporter = new StatusReporter(tempDir);
    await reporter.printCompactStatus();

    expect(logs[0]).toContain('1.0K tokens');
  });

  it('Should format exactly 1 million tokens correctly', async () => {
    await createFeatureList({
      metadata: {
        token_usage: {
          input: 400000,
          output: 600000,
          total: 1000000,
        },
      },
      features: [
        {
          id: 'F001',
          description: 'Feature',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: true,
        },
      ],
    });

    const reporter = new StatusReporter(tempDir);
    await reporter.printCompactStatus();

    expect(logs[0]).toContain('1.0M tokens');
  });

  it('Should maintain compact single-line format', async () => {
    await createFeatureList({
      metadata: {
        token_usage: {
          input: 100000,
          output: 300000,
          total: 400000,
        },
      },
      features: Array.from({ length: 50 }, (_, i) => ({
        id: `F${String(i + 1).padStart(3, '0')}`,
        description: `Feature ${i + 1}`,
        priority: 'medium' as const,
        category: 'test',
        steps: [],
        passes: i % 2 === 0,
      })),
    });

    const reporter = new StatusReporter(tempDir);
    await reporter.printCompactStatus();

    // Should be exactly one line
    expect(logs.length).toBe(1);

    // Should be reasonably compact
    expect(logs[0].length).toBeLessThan(150);

    // Should contain all essential info
    expect(logs[0]).toContain('25/50');
    expect(logs[0]).toContain('50.0%');
    expect(logs[0]).toContain('400.0K tokens');
  });
});
