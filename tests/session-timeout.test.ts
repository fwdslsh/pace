import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { mkdir, writeFile, rm } from 'fs/promises';

const testDir = join(import.meta.dir, '../test-timeout-temp');

describe('Session Timeout', () => {
  test('should timeout after configured duration', async () => {
    await mkdir(testDir, { recursive: true });

    const featureList = {
      metadata: {
        project_name: 'Test Timeout',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: new Date().toISOString(),
      },
      features: [
        {
          id: 'F001',
          category: 'test',
          description: 'Test timeout feature',
          priority: 'critical',
          steps: ['Test step 1'],
          passes: false,
        },
      ],
    };

    const config = {
      model: 'anthropic/claude-sonnet-4-5',
      pace: {
        orchestrator: {
          sessionTimeout: 5000,
          maxSessions: 1,
        },
      },
    };

    await writeFile(join(testDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));
    await writeFile(join(testDir, 'pace.json'), JSON.stringify(config, null, 2));

    const { spawn } = await import('child_process');
    const proc = spawn('bun', ['run', 'cli.ts', '--verbose'], {
      cwd: join(import.meta.dir, '..'),
      env: { ...process.env, PWD: testDir },
    });

    let stdout = '';
    let stderr = '';
    let timeoutTriggered = false;

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (text.includes('Session timeout')) {
        timeoutTriggered = true;
      }
    });

    await new Promise<number>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        resolve(-1);
      }, 15000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code || 0);
      });
    });

    await rm(testDir, { recursive: true, force: true });

    expect(timeoutTriggered).toBe(true);
  }, 20000);

  test('should complete normally when session finishes before timeout', async () => {
    await mkdir(testDir, { recursive: true });

    const featureList = {
      metadata: {
        project_name: 'Test No Timeout',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: new Date().toISOString(),
      },
      features: [
        {
          id: 'F001',
          category: 'test',
          description: 'Simple test that should complete quickly',
          priority: 'critical',
          steps: ['Just complete quickly'],
          passes: false,
        },
      ],
    };

    const config = {
      model: 'anthropic/claude-sonnet-4-5',
      pace: {
        orchestrator: {
          sessionTimeout: 300000,
          maxSessions: 1,
        },
      },
    };

    await writeFile(join(testDir, 'feature_list.json'), JSON.stringify(featureList, null, 2));
    await writeFile(join(testDir, 'pace.json'), JSON.stringify(config, null, 2));

    const { spawn } = await import('child_process');
    const proc = spawn('bun', ['run', 'cli.ts'], {
      cwd: join(import.meta.dir, '..'),
      env: { ...process.env, PWD: testDir },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    await new Promise<number>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        resolve(-1);
      }, 60000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code || 0);
      });
    });

    await rm(testDir, { recursive: true, force: true });

    expect(stderr).not.toContain('Session timeout');
  }, 70000);
});
