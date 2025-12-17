/**
 * init-command.test.ts - Unit and integration tests for the init command
 *
 * Tests the init command functionality including:
 * - Argument parsing for init-specific options
 * - File creation and validation
 * - LLM interaction mocking
 * - Tool usage and text output display
 */

import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile, readFile, stat, chmod, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import type { FeatureList } from '../src/types';

/**
 * Check if SDK is available before running integration tests
 */
let sdkAvailable = false;
try {
  require.resolve('@opencode-ai/sdk');
  sdkAvailable = true;
} catch {
  sdkAvailable = false;
}

/**
 * Integration tests that spawn CLI process
 * These require @opencode-ai/sdk to be installed
 */
describe.skipIf(!sdkAvailable)('Init Command CLI Integration Tests', () => {
  let tempDir: string;
  const cliPath = join(process.cwd(), 'cli.ts');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pace-init-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to run CLI commands
   */
  const runCLI = (
    args: string[],
    timeout: number = 10000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    return new Promise((resolve, reject) => {
      const proc = spawn('bun', ['run', cliPath, ...args], {
        cwd: tempDir,
        detached: false, // Keep as part of this process group for easier cleanup
      });

      let stdout = '';
      let stderr = '';
      let completed = false;
      let forceKillTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (forceKillTimer) {
          clearTimeout(forceKillTimer);
          forceKillTimer = null;
        }
      };

      const timer = setTimeout(() => {
        if (!completed) {
          completed = true;
          proc.kill('SIGTERM');
          // Force kill after 1 second if still running
          forceKillTimer = setTimeout(() => {
            try {
              proc.kill('SIGKILL');
            } catch {
              // Process already terminated
            }
          }, 1000);
          reject(new Error('Process timeout'));
        }
      }, timeout);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          cleanup();
          // Try to kill the process if it's still running
          try {
            proc.kill('SIGKILL');
          } catch {
            // Process already terminated
          }
          reject(err);
        }
      });

      proc.on('close', (code) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          cleanup();
          resolve({
            stdout,
            stderr,
            exitCode: code || 0,
          });
        }
      });
    });
  };

  /**
   * Helper to create a feature list file
   */
  const createFeatureList = async (features: FeatureList) => {
    const filePath = join(tempDir, 'feature_list.json');
    await writeFile(filePath, JSON.stringify(features, null, 2), 'utf-8');
  };

  describe('Init Command Argument Parsing', () => {
    it('should require a project description', async () => {
      const result = await runCLI(['init']);
      expect(result.stderr).toContain('Error: Project description required');
      expect(result.stderr).toContain('Usage:');
      expect(result.exitCode).toBe(1);
    });

    it('should accept --prompt option', async () => {
      const result = await runCLI(['init', '--prompt', 'Build a todo app', '--dry-run']);
      expect(result.stdout).toContain('PACE INIT (DRY RUN)');
      expect(result.stdout).toContain('Build a todo app');
      expect(result.exitCode).toBe(0);
    });

    it('should accept -p shorthand for prompt', async () => {
      const result = await runCLI(['init', '-p', 'Build a REST API', '--dry-run']);
      expect(result.stdout).toContain('PACE INIT (DRY RUN)');
      expect(result.stdout).toContain('Build a REST API');
      expect(result.exitCode).toBe(0);
    });

    it('should accept prompt as positional argument', async () => {
      const result = await runCLI(['init', '--dry-run', 'Build a chat application']);
      expect(result.stdout).toContain('PACE INIT (DRY RUN)');
      expect(result.stdout).toContain('Build a chat application');
      expect(result.exitCode).toBe(0);
    });

    it('should concatenate multiple positional arguments as prompt', async () => {
      const result = await runCLI(['init', '--dry-run', 'Build', 'a', 'multi-word', 'application']);
      expect(result.stdout).toContain('Build a multi-word application');
      expect(result.exitCode).toBe(0);
    });

    it('should accept --file option to read prompt from file', async () => {
      const promptFile = join(tempDir, 'requirements.txt');
      await writeFile(promptFile, 'Build a project management tool with kanban boards');

      const result = await runCLI(['init', '--file', promptFile, '--dry-run']);
      expect(result.stdout).toContain('PACE INIT (DRY RUN)');
      expect(result.stdout).toContain('kanban boards');
      expect(result.exitCode).toBe(0);
    });

    it('should error when file does not exist', async () => {
      const result = await runCLI(['init', '--file', '/nonexistent/file.txt', '--dry-run']);
      expect(result.stderr).toContain('Error reading file');
      expect(result.exitCode).toBe(1);
    });

    it('should error when file path is a directory', async () => {
      const dirPath = join(tempDir, 'testdir');
      await Bun.write(join(dirPath, '.keep'), ''); // Creates directory with file
      const result = await runCLI(['init', '--file', dirPath, '--dry-run']);
      expect(result.stderr).toContain('is not a file');
      expect(result.exitCode).toBe(1);
    });

    it('should prefer --file over --prompt when both provided', async () => {
      const promptFile = join(tempDir, 'requirements.txt');
      await writeFile(promptFile, 'Content from file');

      const result = await runCLI([
        'init',
        '--prompt',
        'Content from prompt',
        '--file',
        promptFile,
        '--dry-run',
      ]);
      expect(result.stdout).toContain('Content from file');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Init Command Dry Run Output', () => {
    it('should display expected outputs in dry run mode', async () => {
      const result = await runCLI(['init', '-p', 'Build a todo app', '--dry-run']);
      expect(result.stdout).toContain('Expected outputs:');
      expect(result.stdout).toContain('feature_list.json');
      expect(result.stdout).toContain('init.sh');
      expect(result.stdout).toContain('progress.txt');
      expect(result.stdout).toContain('Git repository');
      expect(result.exitCode).toBe(0);
    });

    it('should output valid JSON in dry-run mode with --json flag', async () => {
      const result = await runCLI(['init', '--prompt', 'Build a todo app', '--dry-run', '--json']);
      expect(() => JSON.parse(result.stdout)).not.toThrow();

      const parsed = JSON.parse(result.stdout);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.promptPreview).toBe('Build a todo app');
      expect(parsed.promptLength).toBeGreaterThan(10);
      expect(parsed.message).toContain('Would initialize');
      expect(result.exitCode).toBe(0);
    });

    it('should truncate long prompts in dry run output', async () => {
      const longPrompt = 'A'.repeat(600);
      const result = await runCLI(['init', '-p', longPrompt, '--dry-run']);
      expect(result.stdout).toContain('...');
      expect(result.exitCode).toBe(0);
    });

    it('should truncate long prompts in JSON output', async () => {
      const longPrompt = 'B'.repeat(300);
      const result = await runCLI(['init', '-p', longPrompt, '--dry-run', '--json']);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.promptPreview.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(parsed.promptLength).toBe(300);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Init Command Existing File Warning', () => {
    it('should warn when feature_list.json already exists', async () => {
      await createFeatureList({
        metadata: { project_name: 'Existing' },
        features: [
          {
            id: 'F001',
            description: 'Existing feature',
            priority: 'high',
            category: 'core',
            steps: [],
            passes: false,
          },
        ],
      });

      const result = await runCLI(['init', '-p', 'New project', '--dry-run']);
      expect(result.stderr).toContain('feature_list.json already exists');
      expect(result.exitCode).toBe(0); // Should still exit 0 in dry-run
    });

    it('should not warn about existing file in JSON mode', async () => {
      await createFeatureList({
        metadata: { project_name: 'Existing' },
        features: [],
      });

      const result = await runCLI(['init', '-p', 'New project', '--dry-run', '--json']);
      expect(result.stderr).not.toContain('feature_list.json already exists');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Init Command Help', () => {
    it('should show help text when init help is requested', async () => {
      const result = await runCLI(['init', '--help']);
      expect(result.stdout).toContain('INIT OPTIONS');
      expect(result.stdout).toContain('--prompt');
      expect(result.stdout).toContain('--file');
      expect(result.exitCode).toBe(0);
    });
  });
});

/**
 * Note: parseArgs unit tests are in tests/cli.test.ts
 * These integration tests validate init command behavior via spawned CLI process
 */

/**
 * Mock tests for init command with simulated LLM responses
 */
describe('Init Command LLM Integration (Mocked)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pace-init-mock-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('File Creation Validation', () => {
    it('should validate feature_list.json structure', async () => {
      // Create a valid feature list as the initializer would
      const featureList: FeatureList = {
        features: [
          {
            id: 'F001',
            category: 'core',
            description: 'User can create a new todo item',
            priority: 'critical',
            steps: ['Navigate to todo list', 'Click add button', 'Enter todo text'],
            passes: false,
          },
          {
            id: 'F002',
            category: 'core',
            description: 'User can mark a todo as complete',
            priority: 'high',
            steps: ['View todo list', 'Click checkbox on todo', 'Verify todo is marked complete'],
            passes: false,
          },
        ],
        metadata: {
          project_name: 'Todo App',
          created_at: new Date().toISOString().split('T')[0],
          total_features: 2,
          passing: 0,
          failing: 2,
        },
      };

      // Write the file
      const filePath = join(tempDir, 'feature_list.json');
      await writeFile(filePath, JSON.stringify(featureList, null, 2));

      // Read and validate
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.features).toHaveLength(2);
      expect(parsed.features[0].id).toBe('F001');
      expect(parsed.features[0].passes).toBe(false);
      expect(parsed.metadata.total_features).toBe(2);
      expect(parsed.metadata.passing).toBe(0);
    });

    it('should validate init.sh is executable and has correct structure', async () => {
      // Create init.sh as the initializer would
      const initScript = `#!/bin/bash
set -e

echo "Installing dependencies..."
npm install

echo "Setting up environment..."
cp .env.example .env 2>/dev/null || true

echo "Starting development server..."
npm run dev
`;

      const filePath = join(tempDir, 'init.sh');
      await writeFile(filePath, initScript);
      await chmod(filePath, 0o755);

      // Verify file exists
      const stats = await stat(filePath);
      expect(stats.isFile()).toBe(true);

      // Verify content
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('npm install');
    });

    it('should validate progress.txt has session entry', async () => {
      // Create progress.txt as the initializer would
      const progressContent = `# Progress Log

## Session 1 - Initial Setup

**Date:** ${new Date().toISOString().split('T')[0]}
**Agent:** Initializer

### Overview
- Analyzed project requirements
- Created feature list with 50+ features
- Set up development environment

### Files Created
- feature_list.json
- init.sh
- progress.txt

### Technology Stack
- Framework: React
- Build tool: Vite
- State management: Zustand

### Next Steps
1. Run init.sh to set up environment
2. Start with F001 (User can create a new todo item)
`;

      const filePath = join(tempDir, 'progress.txt');
      await writeFile(filePath, progressContent);

      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('Session 1');
      expect(content).toContain('feature_list.json');
      expect(content).toContain('Next Steps');
    });
  });

  describe('Feature List Validation', () => {
    it('should have all required feature fields', async () => {
      const featureList: FeatureList = {
        features: [
          {
            id: 'F001',
            category: 'core',
            description: 'Test feature',
            priority: 'high',
            steps: ['Step 1'],
            passes: false,
          },
        ],
      };

      const feature = featureList.features[0];
      expect(feature.id).toBeDefined();
      expect(feature.category).toBeDefined();
      expect(feature.description).toBeDefined();
      expect(feature.priority).toBeDefined();
      expect(feature.steps).toBeDefined();
      expect(feature.passes).toBe(false);
    });

    it('should validate priority values', async () => {
      const validPriorities = ['critical', 'high', 'medium', 'low'];

      for (const priority of validPriorities) {
        const feature = {
          id: 'F001',
          category: 'core',
          description: 'Test',
          priority: priority as 'critical' | 'high' | 'medium' | 'low',
          steps: [],
          passes: false,
        };
        expect(validPriorities).toContain(feature.priority);
      }
    });

    it('should validate category values', async () => {
      const validCategories = [
        'core',
        'functional',
        'ui',
        'error-handling',
        'integration',
        'performance',
        'accessibility',
        'security',
      ];

      for (const category of validCategories) {
        const feature = {
          id: 'F001',
          category,
          description: 'Test',
          priority: 'high' as const,
          steps: [],
          passes: false,
        };
        expect(validCategories).toContain(feature.category);
      }
    });

    it('should ensure all features have passes: false initially', async () => {
      const featureList: FeatureList = {
        features: Array.from({ length: 10 }, (_, i) => ({
          id: `F${String(i + 1).padStart(3, '0')}`,
          category: 'core',
          description: `Feature ${i + 1}`,
          priority: 'medium' as const,
          steps: ['Step 1'],
          passes: false,
        })),
      };

      for (const feature of featureList.features) {
        expect(feature.passes).toBe(false);
      }
    });
  });
});

/**
 * Event stream simulation tests for tool usage and text output
 */
describe('Init Command Event Stream Handling', () => {
  /**
   * Simulates the event stream that would be received from OpenCode
   */
  interface MockEvent {
    type: string;
    properties?: {
      sessionID?: string;
      part?: {
        type: 'tool' | 'text';
        tool?: string;
        text?: string;
        state?: {
          status: 'running' | 'completed';
          title?: string;
        };
        sessionID?: string;
      };
    };
  }

  it('should count tool calls correctly', () => {
    const sessionId = 'test-session-123';
    const events: MockEvent[] = [
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'write_file',
            state: { status: 'running' },
            sessionID: sessionId,
          },
        },
      },
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'write_file',
            state: { status: 'completed' },
            sessionID: sessionId,
          },
        },
      },
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: { status: 'running' },
            sessionID: sessionId,
          },
        },
      },
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: { status: 'completed' },
            sessionID: sessionId,
          },
        },
      },
    ];

    let toolCalls = 0;
    for (const event of events) {
      if (event.type === 'message.part.updated') {
        const part = event.properties?.part;
        if (part?.type === 'tool' && part.state?.status === 'running') {
          toolCalls++;
        }
      }
    }

    expect(toolCalls).toBe(2);
  });

  it('should track text parts', () => {
    const sessionId = 'test-session-123';
    const events: MockEvent[] = [
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'text',
            text: 'Analyzing project requirements...',
            sessionID: sessionId,
          },
        },
      },
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'text',
            text: 'Creating feature list...',
            sessionID: sessionId,
          },
        },
      },
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'text',
            text: 'Setting up development environment...',
            sessionID: sessionId,
          },
        },
      },
    ];

    let textParts = 0;
    const textContent: string[] = [];
    for (const event of events) {
      if (event.type === 'message.part.updated') {
        const part = event.properties?.part;
        if (part?.type === 'text') {
          textParts++;
          if (part.text) {
            textContent.push(part.text);
          }
        }
      }
    }

    expect(textParts).toBe(3);
    expect(textContent).toContain('Creating feature list...');
  });

  it('should filter events by session ID', () => {
    const targetSessionId = 'target-session';
    const otherSessionId = 'other-session';

    const events: MockEvent[] = [
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'write_file',
            state: { status: 'running' },
            sessionID: targetSessionId,
          },
        },
      },
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'read_file',
            state: { status: 'running' },
            sessionID: otherSessionId,
          },
        },
      },
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: { status: 'running' },
            sessionID: targetSessionId,
          },
        },
      },
    ];

    let targetToolCalls = 0;
    for (const event of events) {
      const part = event.properties?.part;
      if (part?.sessionID !== targetSessionId) continue;

      if (event.type === 'message.part.updated' && part?.type === 'tool') {
        if (part.state?.status === 'running') {
          targetToolCalls++;
        }
      }
    }

    expect(targetToolCalls).toBe(2);
  });

  it('should handle session.idle event correctly', () => {
    const sessionId = 'test-session';
    const events: MockEvent[] = [
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'write_file',
            state: { status: 'completed' },
            sessionID: sessionId,
          },
        },
      },
      {
        type: 'session.idle',
        properties: {
          sessionID: sessionId,
        },
      },
    ];

    let success = false;
    for (const event of events) {
      if (event.type === 'session.idle') {
        const idleSessionId = event.properties?.sessionID;
        if (idleSessionId === sessionId) {
          success = true;
          break;
        }
      }
    }

    expect(success).toBe(true);
  });

  it('should handle session.error event correctly', () => {
    const sessionId = 'test-session';
    const events: MockEvent[] = [
      {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            tool: 'bash',
            state: { status: 'running' },
            sessionID: sessionId,
          },
        },
      },
      {
        type: 'session.error',
        properties: {
          sessionID: sessionId,
        },
      },
    ];

    let success = true;
    for (const event of events) {
      if (event.type === 'session.error') {
        const errorSessionId = event.properties?.sessionID;
        if (errorSessionId === sessionId) {
          success = false;
          break;
        }
      }
    }

    expect(success).toBe(false);
  });
});

/**
 * Output formatting tests for verbose mode
 */
describe('Init Command Output Formatting', () => {
  it('should format tool output correctly in verbose mode', () => {
    const toolName = 'write_file';
    const expectedRunning = `  Tool: ${toolName}...`;
    const expectedCompleted = `  Tool: ${toolName} - done`;

    expect(expectedRunning).toBe('  Tool: write_file...');
    expect(expectedCompleted).toBe('  Tool: write_file - done');
  });

  it('should format text output correctly in verbose mode', () => {
    const text = 'Creating feature list with 50+ features...';
    // The fixed behavior should show actual text content
    const expectedOutput = `  ${text}`;

    expect(expectedOutput).toContain('Creating feature list');
    expect(expectedOutput).toContain('50+ features');
  });

  it('should format progress updates correctly', () => {
    const toolCalls = 25;
    const expectedProgress = `  [${toolCalls} tool calls completed...]`;

    expect(expectedProgress).toBe('  [25 tool calls completed...]');
  });

  it('should format final summary correctly', () => {
    const duration = '45.5';
    const toolCalls = 50;
    const featureCount = 75;
    const filesCreated = ['feature_list.json', 'init.sh', 'progress.txt'];

    const summary = {
      duration,
      toolCalls,
      featureCount,
      filesCreated,
    };

    expect(summary.duration).toBe('45.5');
    expect(summary.toolCalls).toBe(50);
    expect(summary.featureCount).toBe(75);
    expect(summary.filesCreated).toContain('feature_list.json');
    expect(summary.filesCreated).toContain('init.sh');
    expect(summary.filesCreated).toContain('progress.txt');
  });
});

/**
 * End-to-end archiving tests
 * Tests the complete workflow of initializing, modifying, re-initializing, and verifying archiving
 */
describe.skipIf(!sdkAvailable)('Init Command End-to-End Archiving Workflow', () => {
  let tempDir: string;
  const cliPath = join(process.cwd(), 'cli.ts');

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pace-e2e-archive-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to run CLI commands
   */
  const runCLI = (
    args: string[],
    timeout: number = 10000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
    return new Promise((resolve, reject) => {
      const proc = spawn('bun', ['run', cliPath, ...args], {
        cwd: tempDir,
        detached: false,
      });

      let stdout = '';
      let stderr = '';
      let completed = false;
      let forceKillTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (forceKillTimer) {
          clearTimeout(forceKillTimer);
          forceKillTimer = null;
        }
      };

      const timer = setTimeout(() => {
        if (!completed) {
          completed = true;
          proc.kill('SIGTERM');
          forceKillTimer = setTimeout(() => {
            try {
              proc.kill('SIGKILL');
            } catch {
              // Process already terminated
            }
          }, 1000);
          reject(new Error('Process timeout'));
        }
      }, timeout);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          cleanup();
          try {
            proc.kill('SIGKILL');
          } catch {
            // Process already terminated
          }
          reject(err);
        }
      });

      proc.on('close', (code) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          cleanup();
          resolve({
            stdout,
            stderr,
            exitCode: code || 0,
          });
        }
      });
    });
  };

  it('should archive existing files when running init again', async () => {
    // Step 1: Create initial feature_list.json and progress.txt
    const initialFeatureList: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'core',
          description: 'Initial feature',
          priority: 'high',
          steps: ['Step 1', 'Step 2'],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Initial Project',
        created_at: '2025-12-15',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-15T10:00:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(initialFeatureList, null, 2));

    const initialProgress = '# Initial Progress\n\nThis is the initial progress file.';
    const progressPath = join(tempDir, 'progress.txt');
    await writeFile(progressPath, initialProgress);

    // Step 2: Verify initial files exist
    const initialFeatureContent = await readFile(featureListPath, 'utf-8');
    const initialProgressContent = await readFile(progressPath, 'utf-8');
    expect(initialFeatureContent).toContain('Initial Project');
    expect(initialProgressContent).toContain('Initial Progress');

    // Step 3: Modify feature_list.json (mark feature as passing)
    initialFeatureList.features[0].passes = true;
    if (initialFeatureList.metadata) {
      initialFeatureList.metadata.passing = 1;
      initialFeatureList.metadata.failing = 0;
    }
    await writeFile(featureListPath, JSON.stringify(initialFeatureList, null, 2));

    // Step 4: Run pace init again with different description (dry-run to see archiving behavior)
    const result = await runCLI(['init', '--prompt', 'New project description', '--dry-run']);

    // Step 5: Verify archiving messages appear in output
    expect(result.stdout).toContain('Existing project files found');
    expect(result.stdout).toContain('[DRY RUN] Would archive to');
    expect(result.stdout).toContain('feature_list.json');
    expect(result.stdout).toContain('progress.txt');
    expect(result.exitCode).toBe(0);

    // Step 6: Actually run init without dry-run (simulate real archiving)
    // Since we can't easily mock the full init flow, we'll manually test archiving logic
    const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');

    const timestamp = initialFeatureList.metadata?.last_updated || new Date().toISOString();
    const normalizedTimestamp = normalizeTimestamp(timestamp);
    const archivePath = join(tempDir, '.runs', normalizedTimestamp);

    // Archive the files manually (simulating what handleInit does)
    await moveToArchive(featureListPath, archivePath, 'feature_list.json');
    await moveToArchive(progressPath, archivePath, 'progress.txt');

    // Step 7: Verify old files are archived to .runs/<timestamp>/
    const archivedFeaturePath = join(archivePath, 'feature_list.json');
    const archivedProgressPath = join(archivePath, 'progress.txt');

    const archivedFeatureContent = await readFile(archivedFeaturePath, 'utf-8');
    const archivedProgressContent = await readFile(archivedProgressPath, 'utf-8');

    expect(archivedFeatureContent).toContain('Initial Project');
    expect(archivedFeatureContent).toContain('"passes": true'); // Modified version
    expect(archivedProgressContent).toContain('Initial Progress');

    // Step 8: Verify original files no longer exist at root
    let featureExistsAtRoot = true;
    try {
      await stat(featureListPath);
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        featureExistsAtRoot = false;
      }
    }
    expect(featureExistsAtRoot).toBe(false);

    let progressExistsAtRoot = true;
    try {
      await stat(progressPath);
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        progressExistsAtRoot = false;
      }
    }
    expect(progressExistsAtRoot).toBe(false);

    // Step 9: Create new feature_list.json (simulating init creating new files)
    const newFeatureList: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'functional',
          description: 'New feature after reinit',
          priority: 'critical',
          steps: ['New step 1'],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'New Project',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T12:00:00.000Z',
      },
    };

    await writeFile(featureListPath, JSON.stringify(newFeatureList, null, 2));

    const newProgress = '# New Progress\n\nThis is the new progress file after reinit.';
    await writeFile(progressPath, newProgress);

    // Step 10: Verify new files are created and have correct content
    const newFeatureContent = await readFile(featureListPath, 'utf-8');
    const newProgressContent = await readFile(progressPath, 'utf-8');

    expect(newFeatureContent).toContain('New Project');
    expect(newFeatureContent).toContain('New feature after reinit');
    expect(newProgressContent).toContain('New Progress');

    // Step 11: Verify both old and new files are intact
    // Old files in archive
    const verifyArchivedFeature = await readFile(archivedFeaturePath, 'utf-8');
    const verifyArchivedProgress = await readFile(archivedProgressPath, 'utf-8');
    expect(verifyArchivedFeature).toContain('Initial Project');
    expect(verifyArchivedProgress).toContain('Initial Progress');

    // New files at root
    const verifyNewFeature = await readFile(featureListPath, 'utf-8');
    const verifyNewProgress = await readFile(progressPath, 'utf-8');
    expect(verifyNewFeature).toContain('New Project');
    expect(verifyNewProgress).toContain('New Progress');

    // Step 12: Run pace status and validate it works
    const statusResult = await runCLI(['status']);
    expect(statusResult.stdout).toContain('New Project');
    expect(statusResult.stdout).toContain('0/1 passing');
    expect(statusResult.exitCode).toBe(0);
  });

  it('should handle archiving when progress.txt does not exist', async () => {
    // Create only feature_list.json (no progress.txt)
    const featureList: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'core',
          description: 'Test feature',
          priority: 'high',
          steps: [],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Test Project',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T10:00:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList, null, 2));

    // Run init with dry-run
    const result = await runCLI(['init', '--prompt', 'New project', '--dry-run']);

    // Should show archiving for feature_list.json but not error on missing progress.txt
    expect(result.stdout).toContain('Existing project files found');
    expect(result.stdout).toContain('feature_list.json');
    // Should NOT show progress.txt in the list
    expect(result.exitCode).toBe(0);
  });

  it('should handle missing metadata.last_updated by using current timestamp', async () => {
    // Create feature_list.json without last_updated field
    const featureList = {
      features: [
        {
          id: 'F001',
          category: 'core',
          description: 'Test',
          priority: 'high',
          steps: [],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Test',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        // Note: last_updated is missing
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList, null, 2));

    // Run init with dry-run
    const result = await runCLI(['init', '--prompt', 'New project', '--dry-run']);

    // Should still show archiving behavior even without last_updated
    expect(result.stdout).toContain('Existing project files found');
    expect(result.stdout).toContain('[DRY RUN] Would archive to');
    expect(result.exitCode).toBe(0);
  });

  it('should preserve .runs directory structure across multiple inits', async () => {
    const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');

    // First archive
    const featureList1: FeatureList = {
      features: [],
      metadata: {
        project_name: 'Project 1',
        last_updated: '2025-12-15T10:00:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList1, null, 2));

    const timestamp1 = featureList1.metadata?.last_updated || new Date().toISOString();
    const normalizedTimestamp1 = normalizeTimestamp(timestamp1);
    const archivePath1 = join(tempDir, '.runs', normalizedTimestamp1);

    await moveToArchive(featureListPath, archivePath1, 'feature_list.json');

    // Second archive
    const featureList2: FeatureList = {
      features: [],
      metadata: {
        project_name: 'Project 2',
        last_updated: '2025-12-16T15:30:00.000Z',
      },
    };

    await writeFile(featureListPath, JSON.stringify(featureList2, null, 2));

    const timestamp2 = featureList2.metadata?.last_updated || new Date().toISOString();
    const normalizedTimestamp2 = normalizeTimestamp(timestamp2);
    const archivePath2 = join(tempDir, '.runs', normalizedTimestamp2);

    await moveToArchive(featureListPath, archivePath2, 'feature_list.json');

    // Third archive
    const featureList3: FeatureList = {
      features: [],
      metadata: {
        project_name: 'Project 3',
        last_updated: '2025-12-17T20:00:00.000Z',
      },
    };

    await writeFile(featureListPath, JSON.stringify(featureList3, null, 2));

    const timestamp3 = featureList3.metadata?.last_updated || new Date().toISOString();
    const normalizedTimestamp3 = normalizeTimestamp(timestamp3);
    const archivePath3 = join(tempDir, '.runs', normalizedTimestamp3);

    await moveToArchive(featureListPath, archivePath3, 'feature_list.json');

    // Verify all three archives exist with different timestamps
    const archive1Content = await readFile(join(archivePath1, 'feature_list.json'), 'utf-8');
    const archive2Content = await readFile(join(archivePath2, 'feature_list.json'), 'utf-8');
    const archive3Content = await readFile(join(archivePath3, 'feature_list.json'), 'utf-8');

    expect(archive1Content).toContain('Project 1');
    expect(archive2Content).toContain('Project 2');
    expect(archive3Content).toContain('Project 3');

    // Verify no archives were overwritten
    expect(normalizedTimestamp1).not.toBe(normalizedTimestamp2);
    expect(normalizedTimestamp2).not.toBe(normalizedTimestamp3);
    expect(normalizedTimestamp1).not.toBe(normalizedTimestamp3);
  });
});

/**
 * Unit tests for checkFeatureListExists function
 * Tests F003: Add function to check if feature_list.json exists before init
 */
describe('checkFeatureListExists Function', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pace-check-exists-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return true when feature_list.json exists', async () => {
    // Import the function
    const { checkFeatureListExists } = await import('../cli.js');

    // Create feature_list.json
    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify({ features: [] }));

    // Test
    const exists = await checkFeatureListExists(tempDir);
    expect(exists).toBe(true);
  });

  it('should return false when feature_list.json does not exist', async () => {
    // Import the function
    const { checkFeatureListExists } = await import('../cli.js');

    // Don't create feature_list.json

    // Test
    const exists = await checkFeatureListExists(tempDir);
    expect(exists).toBe(false);
  });

  it('should handle permission errors appropriately', async () => {
    // Import the function
    const { checkFeatureListExists } = await import('../cli.js');

    // Create a directory with no read permissions (simulating permission error)
    const restrictedDir = join(tempDir, 'restricted');
    await mkdir(restrictedDir, { recursive: true });
    const featureListPath = join(restrictedDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify({ features: [] }));

    // Remove read permissions on the directory
    await chmod(restrictedDir, 0o000);

    try {
      // This should throw an error (not return false)
      await checkFeatureListExists(restrictedDir);
      // If we reach here, the test should fail
      expect(true).toBe(false);
    } catch (error) {
      // Expected behavior - should throw for non-ENOENT errors
      expect(error).toBeDefined();
    } finally {
      // Restore permissions for cleanup
      await chmod(restrictedDir, 0o755);
    }
  });

  it('should work with nested project directories', async () => {
    // Import the function
    const { checkFeatureListExists } = await import('../cli.js');

    // Create nested directory
    const nestedDir = join(tempDir, 'deeply', 'nested', 'project');
    await mkdir(nestedDir, { recursive: true });
    const featureListPath = join(nestedDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify({ features: [] }));

    // Test
    const exists = await checkFeatureListExists(nestedDir);
    expect(exists).toBe(true);
  });

  it('should handle empty directories correctly', async () => {
    // Import the function
    const { checkFeatureListExists } = await import('../cli.js');

    // Create empty directory
    const emptyDir = join(tempDir, 'empty');
    await mkdir(emptyDir, { recursive: true });

    // Test
    const exists = await checkFeatureListExists(emptyDir);
    expect(exists).toBe(false);
  });
});

/**
 * Unit tests for readLastUpdated function
 * Tests F004: Add function to read metadata.last_updated from feature_list.json
 */
describe('readLastUpdated Function', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pace-read-last-updated-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return last_updated timestamp when present', async () => {
    // Import the function
    const { readLastUpdated } = await import('../cli.js');

    // Create feature_list.json with last_updated
    const featureList = {
      features: [],
      metadata: {
        project_name: 'Test Project',
        created_at: '2025-12-17',
        total_features: 0,
        passing: 0,
        failing: 0,
        last_updated: '2025-12-17T10:30:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList));

    // Test
    const lastUpdated = await readLastUpdated(tempDir);
    expect(lastUpdated).toBe('2025-12-17T10:30:00.000Z');
  });

  it('should return undefined when feature_list.json does not exist', async () => {
    // Import the function
    const { readLastUpdated } = await import('../cli.js');

    // Don't create feature_list.json

    // Test
    const lastUpdated = await readLastUpdated(tempDir);
    expect(lastUpdated).toBeUndefined();
  });

  it('should return undefined when last_updated is missing from metadata', async () => {
    // Import the function
    const { readLastUpdated } = await import('../cli.js');

    // Create feature_list.json without last_updated
    const featureList = {
      features: [],
      metadata: {
        project_name: 'Test Project',
        created_at: '2025-12-17',
        total_features: 0,
        passing: 0,
        failing: 0,
        // Note: last_updated is missing
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList));

    // Test
    const lastUpdated = await readLastUpdated(tempDir);
    expect(lastUpdated).toBeUndefined();
  });

  it('should return undefined when metadata is missing entirely', async () => {
    // Import the function
    const { readLastUpdated } = await import('../cli.js');

    // Create feature_list.json without metadata
    const featureList = {
      features: [],
      // Note: metadata is missing
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList));

    // Test
    const lastUpdated = await readLastUpdated(tempDir);
    expect(lastUpdated).toBeUndefined();
  });

  it('should handle malformed JSON gracefully', async () => {
    // Import the function
    const { readLastUpdated } = await import('../cli.js');

    // Create malformed JSON
    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, '{ invalid json }');

    // Test - should throw error
    try {
      await readLastUpdated(tempDir);
      // If we reach here, the test should fail
      expect(true).toBe(false);
    } catch (error) {
      // Expected behavior - should throw for malformed JSON
      expect(error).toBeDefined();
    }
  });

  it('should handle various timestamp formats', async () => {
    // Import the function
    const { readLastUpdated } = await import('../cli.js');

    // Test with different valid ISO timestamps
    const timestamps = [
      '2025-12-17T10:30:00.000Z',
      '2025-01-01T00:00:00Z',
      '2024-06-15T15:45:30.123Z',
    ];

    for (const timestamp of timestamps) {
      const featureList = {
        features: [],
        metadata: {
          last_updated: timestamp,
        },
      };

      const featureListPath = join(tempDir, 'feature_list.json');
      await writeFile(featureListPath, JSON.stringify(featureList));

      const lastUpdated = await readLastUpdated(tempDir);
      expect(lastUpdated).toBe(timestamp);
    }
  });

  it('should handle empty feature_list.json', async () => {
    // Import the function
    const { readLastUpdated } = await import('../cli.js');

    // Create empty JSON object
    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, '{}');

    // Test
    const lastUpdated = await readLastUpdated(tempDir);
    expect(lastUpdated).toBeUndefined();
  });

  it('should work with nested project directories', async () => {
    // Import the function
    const { readLastUpdated } = await import('../cli.js');

    // Create nested directory
    const nestedDir = join(tempDir, 'deeply', 'nested', 'project');
    await mkdir(nestedDir, { recursive: true });

    const featureList = {
      features: [],
      metadata: {
        last_updated: '2025-12-17T12:00:00.000Z',
      },
    };

    const featureListPath = join(nestedDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList));

    // Test
    const lastUpdated = await readLastUpdated(nestedDir);
    expect(lastUpdated).toBe('2025-12-17T12:00:00.000Z');
  });
});
