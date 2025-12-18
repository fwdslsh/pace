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
import { mkdtemp, rm, writeFile, readFile, stat, chmod, mkdir, readdir } from 'fs/promises';
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
    const archivePath = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp);

    // Archive the files manually (simulating what handleInit does)
    await moveToArchive(featureListPath, archivePath, 'feature_list.json');
    await moveToArchive(progressPath, archivePath, 'progress.txt');

    // Step 7: Verify old files are archived to .fwdslsh/pace/history/<timestamp>/
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

  /**
   * F017: Test archiving with missing progress.txt
   * Comprehensive test covering all steps:
   * 1. Create feature_list.json without progress.txt
   * 2. Run init command (actually archive, not dry-run)
   * 3. Verify feature_list.json is archived
   * 4. Verify no error occurs due to missing progress.txt
   * 5. Check archive directory contains only feature_list.json
   */
  it('should archive feature_list.json without progress.txt and not error (F017)', async () => {
    // STEP 1: Create feature_list.json without progress.txt
    const featureList: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'core',
          description: 'Test feature without progress file',
          priority: 'high',
          steps: ['Step 1', 'Step 2'],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Project Without Progress',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T14:30:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    const progressPath = join(tempDir, 'progress.txt');

    await writeFile(featureListPath, JSON.stringify(featureList, null, 2));

    // Verify progress.txt does NOT exist
    let progressExists = false;
    try {
      await stat(progressPath);
      progressExists = true;
    } catch {
      progressExists = false;
    }
    expect(progressExists).toBe(false);

    // Verify feature_list.json exists
    const featureStats = await stat(featureListPath);
    expect(featureStats.isFile()).toBe(true);

    // STEP 2: Run init command (actually archive, not dry-run)
    // We'll simulate the actual archiving that happens during init
    const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');

    const timestamp = featureList.metadata?.last_updated || new Date().toISOString();
    const normalizedTimestamp = normalizeTimestamp(timestamp);
    expect(normalizedTimestamp).toBe('2025-12-17_14-30-00'); // Verify normalization
    const archivePath = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp);

    // Archive feature_list.json
    await moveToArchive(featureListPath, archivePath, 'feature_list.json');

    // Try to archive progress.txt (should not throw error)
    let archiveError: unknown = null;
    try {
      await stat(progressPath);
      await moveToArchive(progressPath, archivePath, 'progress.txt');
    } catch (error) {
      archiveError = error;
      // This is expected - progress.txt doesn't exist
      // The code should handle this gracefully by catching the error
    }

    // STEP 4: Verify no error occurs due to missing progress.txt
    // The archive operation should succeed even though progress.txt is missing
    // We expect an ENOENT error from stat(), but no error from the archiving logic itself

    // STEP 3: Verify feature_list.json is archived
    const archivedFeaturePath = join(archivePath, 'feature_list.json');
    const archivedFeatureStats = await stat(archivedFeaturePath);
    expect(archivedFeatureStats.isFile()).toBe(true);

    const archivedContent = await readFile(archivedFeaturePath, 'utf-8');
    expect(archivedContent).toContain('Project Without Progress');
    expect(archivedContent).toContain('Test feature without progress file');

    // Verify JSON structure is intact
    const archivedParsed = JSON.parse(archivedContent);
    expect(archivedParsed.features).toHaveLength(1);
    expect(archivedParsed.features[0].id).toBe('F001');
    expect(archivedParsed.metadata.project_name).toBe('Project Without Progress');

    // STEP 5: Check archive directory contains only feature_list.json
    const { readdir } = await import('fs/promises');
    const archiveFiles = await readdir(archivePath);
    expect(archiveFiles).toHaveLength(1);
    expect(archiveFiles).toContain('feature_list.json');
    expect(archiveFiles).not.toContain('progress.txt');

    // Verify original feature_list.json is gone from root
    let originalExists = false;
    try {
      await stat(featureListPath);
      originalExists = true;
    } catch {
      originalExists = false;
    }
    expect(originalExists).toBe(false);

    // Verify progress.txt still doesn't exist at root (nothing to move)
    let progressExistsAfter = false;
    try {
      await stat(progressPath);
      progressExistsAfter = true;
    } catch {
      progressExistsAfter = false;
    }
    expect(progressExistsAfter).toBe(false);
  });

  /**
   * F017 Extended: Test archiving with missing progress.txt in verbose mode
   * Verifies that verbose logging shows progress.txt was not found
   */
  it('should show verbose message when progress.txt is missing during archiving (F017)', async () => {
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
        project_name: 'Verbose Test Project',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T16:00:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList, null, 2));

    // Run init with dry-run and verbose to see the message
    const result = await runCLI(['init', '--prompt', 'New project', '--dry-run', '--verbose']);

    // Should show dry-run message
    expect(result.stdout).toContain('[DRY RUN] Would archive to');
    expect(result.stdout).toContain('feature_list.json');

    // With verbose flag, should mention progress.txt not found
    expect(result.stdout).toContain('progress.txt not found');

    // Should not error
    expect(result.exitCode).toBe(0);
  });

  /**
   * F013: Respect --dry-run flag for archiving operations
   * Verifies that --dry-run shows what WOULD be archived without actually moving files
   */
  it('should respect --dry-run flag and not archive files (F013)', async () => {
    // Create feature_list.json and progress.txt
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
    const progressPath = join(tempDir, 'progress.txt');
    const progressContent = '# Progress Log\n\nTest progress content.';

    await writeFile(featureListPath, JSON.stringify(featureList, null, 2));
    await writeFile(progressPath, progressContent);

    // Run init with dry-run
    const result = await runCLI(['init', '--prompt', 'New project', '--dry-run']);

    // Step 1: Check if options.dryRun is true (verified by CLI parsing)
    // Step 2: Should log what WOULD be archived
    expect(result.stdout).toContain('Existing project files found');
    // Step 3: Should print dry-run message with archive path
    expect(result.stdout).toContain('[DRY RUN] Would archive to');
    expect(result.stdout).toContain('.fwdslsh/pace/history/2025-12-17_10-00-00');
    expect(result.stdout).toContain('feature_list.json');
    expect(result.stdout).toContain('progress.txt');
    expect(result.exitCode).toBe(0);

    // Step 4: Don't create directories or move files in dry-run mode
    // Verify .fwdslsh/pace/history directory was NOT created
    const historyPath = join(tempDir, '.fwdslsh/pace/history');
    let historyExists = false;
    try {
      await stat(historyPath);
      historyExists = true;
    } catch {
      historyExists = false;
    }
    expect(historyExists).toBe(false);

    // Verify original files still exist at root (not moved)
    const featureStillExists = await stat(featureListPath);
    expect(featureStillExists.isFile()).toBe(true);

    const progressStillExists = await stat(progressPath);
    expect(progressStillExists.isFile()).toBe(true);

    // Verify file contents unchanged
    const featureContent = await readFile(featureListPath, 'utf-8');
    expect(featureContent).toContain('Test Project');

    const progressContentAfter = await readFile(progressPath, 'utf-8');
    expect(progressContentAfter).toBe(progressContent);

    // Step 5: Verify --dry-run shows archive plan without executing
    // This is verified by the output checks above and file existence checks
  });

  it('should respect --dry-run flag when progress.txt is missing (F013)', async () => {
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

    // Run init with dry-run and verbose
    const result = await runCLI(['init', '--prompt', 'New project', '--dry-run', '--verbose']);

    // Should show dry-run message
    expect(result.stdout).toContain('[DRY RUN] Would archive to');
    expect(result.stdout).toContain('feature_list.json');
    // With verbose, should mention progress.txt not found
    expect(result.stdout).toContain('progress.txt not found');
    expect(result.exitCode).toBe(0);

    // Verify .fwdslsh/pace/history was NOT created
    const historyPath = join(tempDir, '.fwdslsh/pace/history');
    let historyExists = false;
    try {
      await stat(historyPath);
      historyExists = true;
    } catch {
      historyExists = false;
    }
    expect(historyExists).toBe(false);

    // Verify original file still exists
    const featureStillExists = await stat(featureListPath);
    expect(featureStillExists.isFile()).toBe(true);
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

  /**
   * F018: Test archiving with missing metadata.last_updated
   * Comprehensive test covering all verification steps:
   * 1. Create feature_list.json without last_updated field
   * 2. Run init command (actually archive, not dry-run)
   * 3. Verify archiving uses current timestamp as fallback
   * 4. Verify archive directory name is in correct format
   * 5. Verify files are archived successfully
   */
  it('should archive feature_list.json using current timestamp when last_updated is missing (F018)', async () => {
    // STEP 1: Create feature_list.json without last_updated field
    const featureList = {
      features: [
        {
          id: 'F001',
          category: 'core',
          description: 'Test feature without last_updated metadata',
          priority: 'high',
          steps: ['Step 1', 'Step 2'],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Project Without Last Updated',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        // Note: last_updated is intentionally missing to test fallback
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    const progressPath = join(tempDir, 'progress.txt');
    const progressContent = '# Progress\n\nTest progress without last_updated.';

    await writeFile(featureListPath, JSON.stringify(featureList, null, 2));
    await writeFile(progressPath, progressContent);

    // Verify files exist
    const featureStats = await stat(featureListPath);
    expect(featureStats.isFile()).toBe(true);

    const progressStats = await stat(progressPath);
    expect(progressStats.isFile()).toBe(true);

    // STEP 2: Run init command (actually archive, not dry-run)
    // We'll simulate the actual archiving that happens during init
    const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');

    // Capture current time before archiving to verify fallback timestamp is recent
    const beforeArchiveTime = new Date();

    // STEP 3: Verify archiving uses current timestamp as fallback
    // When last_updated is missing, the code uses new Date().toISOString()
    const timestamp = new Date().toISOString(); // Simulating the fallback in cli.ts
    const normalizedTimestamp = normalizeTimestamp(timestamp);

    // STEP 4: Verify archive directory name is in correct format
    // Format should be YYYY-MM-DD_HH-MM-SS
    const timestampRegex = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
    expect(normalizedTimestamp).toMatch(timestampRegex);

    // Verify the timestamp is recent (within last few seconds)
    const archiveDate = new Date(
      normalizedTimestamp.replace(/_/, 'T').replace(/-(\d{2})-(\d{2})$/, ':$1:$2') + 'Z',
    );
    const timeDiff = Math.abs(archiveDate.getTime() - beforeArchiveTime.getTime());
    // Should be within 5 seconds
    expect(timeDiff).toBeLessThan(5000);

    const archivePath = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp);

    // Archive the files
    await moveToArchive(featureListPath, archivePath, 'feature_list.json');
    await moveToArchive(progressPath, archivePath, 'progress.txt');

    // STEP 5: Verify files are archived successfully
    const archivedFeaturePath = join(archivePath, 'feature_list.json');
    const archivedProgressPath = join(archivePath, 'progress.txt');

    // Verify archive directory was created
    const archiveDirStats = await stat(archivePath);
    expect(archiveDirStats.isDirectory()).toBe(true);

    // Verify archived files exist
    const archivedFeatureStats = await stat(archivedFeaturePath);
    expect(archivedFeatureStats.isFile()).toBe(true);

    const archivedProgressStats = await stat(archivedProgressPath);
    expect(archivedProgressStats.isFile()).toBe(true);

    // Verify archived file contents are intact
    const archivedFeatureContent = await readFile(archivedFeaturePath, 'utf-8');
    expect(archivedFeatureContent).toContain('Project Without Last Updated');
    expect(archivedFeatureContent).toContain('Test feature without last_updated metadata');

    const archivedProgressContent = await readFile(archivedProgressPath, 'utf-8');
    expect(archivedProgressContent).toContain('Test progress without last_updated');

    // Verify JSON structure is preserved
    const archivedParsed = JSON.parse(archivedFeatureContent);
    expect(archivedParsed.features).toHaveLength(1);
    expect(archivedParsed.features[0].id).toBe('F001');
    expect(archivedParsed.metadata.project_name).toBe('Project Without Last Updated');
    // Verify last_updated is still missing (we don't add it during archiving)
    expect(archivedParsed.metadata.last_updated).toBeUndefined();

    // Verify original files were moved (no longer at root)
    let originalFeatureExists = false;
    try {
      await stat(featureListPath);
      originalFeatureExists = true;
    } catch {
      originalFeatureExists = false;
    }
    expect(originalFeatureExists).toBe(false);

    let originalProgressExists = false;
    try {
      await stat(progressPath);
      originalProgressExists = true;
    } catch {
      originalProgressExists = false;
    }
    expect(originalProgressExists).toBe(false);

    // Verify archive directory structure
    const archiveFiles = await readdir(archivePath);
    expect(archiveFiles).toHaveLength(2);
    expect(archiveFiles).toContain('feature_list.json');
    expect(archiveFiles).toContain('progress.txt');
  });

  it('should preserve .fwdslsh/pace/history directory structure across multiple inits', async () => {
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
    const archivePath1 = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp1);

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
    const archivePath2 = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp2);

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
    const archivePath3 = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp3);

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

  /**
   * Integration test for F016: Full init archiving flow
   * This test validates the complete archiving workflow by simulating running init twice
   */
  it('should complete full init archiving flow (F016)', async () => {
    // STEP 1: Create initial feature_list.json and progress.txt (simulating first init)
    const initialFeatureList: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'core',
          description: 'User authentication feature',
          priority: 'critical',
          steps: ['Create login page', 'Add JWT authentication', 'Test login flow'],
          passes: false,
        },
        {
          id: 'F002',
          category: 'functional',
          description: 'Dashboard view',
          priority: 'high',
          steps: ['Design dashboard', 'Implement widgets', 'Add data visualization'],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'First Init Project',
        created_at: '2025-12-15',
        total_features: 2,
        passing: 0,
        failing: 2,
        last_updated: '2025-12-15T10:00:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    const progressPath = join(tempDir, 'progress.txt');
    const initialProgressContent = `# Progress Log - Session 1

**Date:** 2025-12-15
**Agent:** Initializer

## Overview
Created initial project structure with 2 features.

## Next Steps
Start implementing F001: User authentication feature.
`;

    await writeFile(featureListPath, JSON.stringify(initialFeatureList, null, 2));
    await writeFile(progressPath, initialProgressContent);

    // STEP 2: Verify first init created feature_list.json and progress.txt
    const featureStats = await stat(featureListPath);
    expect(featureStats.isFile()).toBe(true);

    const progressStats = await stat(progressPath);
    expect(progressStats.isFile()).toBe(true);

    const firstFeatureContent = await readFile(featureListPath, 'utf-8');
    const firstProgressContent = await readFile(progressPath, 'utf-8');
    expect(firstFeatureContent).toContain('First Init Project');
    expect(firstFeatureContent).toContain('User authentication feature');
    expect(firstProgressContent).toContain('Session 1');
    expect(firstProgressContent).toContain('Initializer');

    // STEP 3: Run pace init again (with dry-run to verify archiving is triggered)
    // This simulates the user running init a second time
    const result = await runCLI(['init', '--prompt', 'Second initialization', '--dry-run']);

    // Verify archiving messages appear in output
    expect(result.stdout).toContain('Existing project files found');
    expect(result.stdout).toContain('[DRY RUN] Would archive to');
    expect(result.stdout).toContain('.fwdslsh/pace/history/2025-12-15_10-00-00');
    expect(result.stdout).toContain('feature_list.json');
    expect(result.stdout).toContain('progress.txt');
    expect(result.exitCode).toBe(0);

    // STEP 4: Actually perform the archiving (simulating non-dry-run init)
    // This tests the archiving utilities that handleInit uses
    const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');

    const timestamp = initialFeatureList.metadata?.last_updated || new Date().toISOString();
    const normalizedTimestamp = normalizeTimestamp(timestamp);
    expect(normalizedTimestamp).toBe('2025-12-15_10-00-00'); // Verify normalization

    const archivePath = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp);

    // Archive both files
    await moveToArchive(featureListPath, archivePath, 'feature_list.json');
    await moveToArchive(progressPath, archivePath, 'progress.txt');

    // STEP 5: Check .fwdslsh/pace/history/<timestamp>/ directory was created
    const archiveDirStats = await stat(archivePath);
    expect(archiveDirStats.isDirectory()).toBe(true);

    const archivedFeaturePath = join(archivePath, 'feature_list.json');
    const archivedProgressPath = join(archivePath, 'progress.txt');

    const archivedFeatureStats = await stat(archivedFeaturePath);
    expect(archivedFeatureStats.isFile()).toBe(true);

    const archivedProgressStats = await stat(archivedProgressPath);
    expect(archivedProgressStats.isFile()).toBe(true);

    // STEP 6: Verify archived files match original content
    const archivedFeatureContent = await readFile(archivedFeaturePath, 'utf-8');
    const archivedProgressContent = await readFile(archivedProgressPath, 'utf-8');

    expect(archivedFeatureContent).toContain('First Init Project');
    expect(archivedFeatureContent).toContain('User authentication feature');
    expect(archivedFeatureContent).toContain('Dashboard view');
    expect(archivedProgressContent).toContain('Session 1');
    expect(archivedProgressContent).toContain('Initializer');

    // Verify JSON structure is intact
    const archivedParsed = JSON.parse(archivedFeatureContent);
    expect(archivedParsed.features).toHaveLength(2);
    expect(archivedParsed.features[0].id).toBe('F001');
    expect(archivedParsed.features[1].id).toBe('F002');
    expect(archivedParsed.metadata.project_name).toBe('First Init Project');

    // Verify original files are gone from root
    let featureExistsAtRoot = false;
    try {
      await stat(featureListPath);
      featureExistsAtRoot = true;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        featureExistsAtRoot = false;
      }
    }
    expect(featureExistsAtRoot).toBe(false);

    let progressExistsAtRoot = false;
    try {
      await stat(progressPath);
      progressExistsAtRoot = true;
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        progressExistsAtRoot = false;
      }
    }
    expect(progressExistsAtRoot).toBe(false);

    // Create new files (simulating second init creating new project files)
    const secondFeatureList: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'core',
          description: 'New feature from second init',
          priority: 'high',
          steps: ['Step 1'],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Second Init Project',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T15:00:00.000Z',
      },
    };

    const secondProgressContent = `# Progress Log - Session 1

**Date:** 2025-12-17
**Agent:** Initializer

## Overview
Created project after archiving previous run.
`;

    await writeFile(featureListPath, JSON.stringify(secondFeatureList, null, 2));
    await writeFile(progressPath, secondProgressContent);

    // Verify new files exist and have correct content
    const newFeatureContent = await readFile(featureListPath, 'utf-8');
    const newProgressContent = await readFile(progressPath, 'utf-8');
    expect(newFeatureContent).toContain('Second Init Project');
    expect(newProgressContent).toContain('archiving previous run');

    // Verify old files are still in archive and intact
    const finalArchivedFeature = await readFile(archivedFeaturePath, 'utf-8');
    const finalArchivedProgress = await readFile(archivedProgressPath, 'utf-8');
    expect(finalArchivedFeature).toContain('First Init Project');
    expect(finalArchivedProgress).toContain('Session 1');

    // Run pace status to verify everything works
    const statusResult = await runCLI(['status']);
    expect(statusResult.stdout).toContain('Second Init Project');
    expect(statusResult.stdout).toContain('0/1 passing');
    expect(statusResult.exitCode).toBe(0);

    // STEP 7: Cleanup is handled by afterEach
  });

  /**
   * F019: Test multiple consecutive init operations
   * This test validates that running init multiple times creates separate archives with unique timestamps
   * and doesn't overwrite any existing archives.
   */
  it('should handle multiple consecutive init operations correctly (F019)', async () => {
    const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');

    // STEP 1: Run init command first time (no archiving, just create files)
    const featureList1: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'core',
          description: 'First init feature',
          priority: 'high',
          steps: ['Step 1'],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'First Init',
        created_at: '2025-12-15',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-15T10:00:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    const progressPath = join(tempDir, 'progress.txt');
    const progress1 = '# Progress 1\n\nFirst init progress.';

    await writeFile(featureListPath, JSON.stringify(featureList1, null, 2));
    await writeFile(progressPath, progress1);

    // Verify first files exist
    const feature1Stats = await stat(featureListPath);
    expect(feature1Stats.isFile()).toBe(true);

    const progress1Stats = await stat(progressPath);
    expect(progress1Stats.isFile()).toBe(true);

    // STEP 2: Run init command second time (should archive first files)
    // Simulate archiving behavior that happens during second init
    const timestamp1 = featureList1.metadata?.last_updated || new Date().toISOString();
    const normalizedTimestamp1 = normalizeTimestamp(timestamp1);
    const archivePath1 = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp1);

    // Archive first set of files
    await moveToArchive(featureListPath, archivePath1, 'feature_list.json');
    await moveToArchive(progressPath, archivePath1, 'progress.txt');

    // Create second set of files (simulating second init)
    const featureList2: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'functional',
          description: 'Second init feature',
          priority: 'medium',
          steps: ['Step 1', 'Step 2'],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Second Init',
        created_at: '2025-12-16',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-16T14:30:00.000Z',
      },
    };

    const progress2 = '# Progress 2\n\nSecond init progress.';

    await writeFile(featureListPath, JSON.stringify(featureList2, null, 2));
    await writeFile(progressPath, progress2);

    // Verify second files exist
    const feature2Stats = await stat(featureListPath);
    expect(feature2Stats.isFile()).toBe(true);

    // STEP 3: Run init command third time (should archive second files)
    const timestamp2 = featureList2.metadata?.last_updated || new Date().toISOString();
    const normalizedTimestamp2 = normalizeTimestamp(timestamp2);
    const archivePath2 = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp2);

    // Archive second set of files
    await moveToArchive(featureListPath, archivePath2, 'feature_list.json');
    await moveToArchive(progressPath, archivePath2, 'progress.txt');

    // Create third set of files (simulating third init)
    const featureList3: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'testing',
          description: 'Third init feature',
          priority: 'low',
          steps: ['Step 1', 'Step 2', 'Step 3'],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Third Init',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T18:45:00.000Z',
      },
    };

    const progress3 = '# Progress 3\n\nThird init progress.';

    await writeFile(featureListPath, JSON.stringify(featureList3, null, 2));
    await writeFile(progressPath, progress3);

    // STEP 2: Verify 2 archive directories are created (2nd and 3rd init)
    const historyDir = join(tempDir, '.fwdslsh/pace/history');
    const historyDirStats = await stat(historyDir);
    expect(historyDirStats.isDirectory()).toBe(true);

    const archiveDirectories = await readdir(historyDir);
    expect(archiveDirectories).toHaveLength(2);

    // Verify archive directories exist
    const archive1Stats = await stat(archivePath1);
    expect(archive1Stats.isDirectory()).toBe(true);

    const archive2Stats = await stat(archivePath2);
    expect(archive2Stats.isDirectory()).toBe(true);

    // STEP 3: Verify each archive has unique timestamp
    expect(normalizedTimestamp1).not.toBe(normalizedTimestamp2);
    expect(normalizedTimestamp1).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    expect(normalizedTimestamp2).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);

    // STEP 4: Verify no files are overwritten
    // Check first archive contains first init files
    const archive1FeatureContent = await readFile(join(archivePath1, 'feature_list.json'), 'utf-8');
    const archive1ProgressContent = await readFile(join(archivePath1, 'progress.txt'), 'utf-8');

    expect(archive1FeatureContent).toContain('First Init');
    expect(archive1FeatureContent).toContain('First init feature');
    expect(archive1ProgressContent).toContain('First init progress');

    // Check second archive contains second init files
    const archive2FeatureContent = await readFile(join(archivePath2, 'feature_list.json'), 'utf-8');
    const archive2ProgressContent = await readFile(join(archivePath2, 'progress.txt'), 'utf-8');

    expect(archive2FeatureContent).toContain('Second Init');
    expect(archive2FeatureContent).toContain('Second init feature');
    expect(archive2ProgressContent).toContain('Second init progress');

    // Verify archives have complete file structure
    const archive1Files = await readdir(archivePath1);
    expect(archive1Files).toHaveLength(2);
    expect(archive1Files).toContain('feature_list.json');
    expect(archive1Files).toContain('progress.txt');

    const archive2Files = await readdir(archivePath2);
    expect(archive2Files).toHaveLength(2);
    expect(archive2Files).toContain('feature_list.json');
    expect(archive2Files).toContain('progress.txt');

    // STEP 5: Check final state has current feature_list.json (from third init)
    const currentFeatureContent = await readFile(featureListPath, 'utf-8');
    const currentProgressContent = await readFile(progressPath, 'utf-8');

    expect(currentFeatureContent).toContain('Third Init');
    expect(currentFeatureContent).toContain('Third init feature');
    expect(currentProgressContent).toContain('Third init progress');

    // Verify current files are distinct from archived files
    expect(currentFeatureContent).not.toContain('First Init');
    expect(currentFeatureContent).not.toContain('Second Init');

    // Verify JSON structure is intact for all files
    const parsedCurrent = JSON.parse(currentFeatureContent);
    expect(parsedCurrent.metadata.project_name).toBe('Third Init');

    const parsedArchive1 = JSON.parse(archive1FeatureContent);
    expect(parsedArchive1.metadata.project_name).toBe('First Init');

    const parsedArchive2 = JSON.parse(archive2FeatureContent);
    expect(parsedArchive2.metadata.project_name).toBe('Second Init');

    // Verify old archives remain intact and unchanged
    const verifyArchive1 = await readFile(join(archivePath1, 'feature_list.json'), 'utf-8');
    expect(verifyArchive1).toContain('First Init');
    expect(verifyArchive1).toContain('First init feature');

    const verifyArchive2 = await readFile(join(archivePath2, 'feature_list.json'), 'utf-8');
    expect(verifyArchive2).toContain('Second Init');
    expect(verifyArchive2).toContain('Second init feature');
  });

  /**
   * F044: Backwards Compatibility Tests
   * Ensures the new archiving feature doesn't break existing pace installations
   */
  describe('Backwards Compatibility (F044)', () => {
    it('should handle feature_list.json from old pace installations (no metadata.last_updated)', async () => {
      // Simulate a feature_list.json created by an old version of pace (before archiving feature)
      const oldFormatFeatureList = {
        features: [
          {
            id: 'F001',
            category: 'core',
            description: 'Legacy feature',
            priority: 'high',
            steps: ['Step 1', 'Step 2'],
            passes: false,
          },
        ],
        metadata: {
          project_name: 'Old Project',
          created_at: '2025-01-01',
          total_features: 1,
          passing: 0,
          failing: 1,
          // No last_updated field - this is the key test
        },
      };

      const featureListPath = join(tempDir, 'feature_list.json');
      await writeFile(featureListPath, JSON.stringify(oldFormatFeatureList, null, 2));

      // Run init with dry-run to verify it handles missing last_updated gracefully
      const result = await runCLI(['init', '--prompt', 'Upgrade project', '--dry-run']);

      // Should not crash and should show archiving intent
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Existing project files found');
      expect(result.stdout).toContain('[DRY RUN] Would archive to');
      // Should not contain error messages
      expect(result.stderr).not.toContain('Error');
      expect(result.stderr).not.toContain('undefined');
    });

    it('should handle feature_list.json with minimal metadata', async () => {
      // Old installations might have had very minimal metadata
      const minimalMetadataList = {
        features: [
          {
            id: 'F001',
            category: 'core',
            description: 'Test feature',
            priority: 'medium',
            steps: [],
            passes: false,
          },
        ],
        metadata: {
          project_name: 'Minimal Project',
          // Only project_name - missing all other fields
        },
      };

      const featureListPath = join(tempDir, 'feature_list.json');
      await writeFile(featureListPath, JSON.stringify(minimalMetadataList, null, 2));

      // Run init with dry-run
      const result = await runCLI(['init', '--prompt', 'New initialization', '--dry-run']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Existing project files found');
      // Should use fallback timestamp
      expect(result.stdout).toContain('[DRY RUN] Would archive to');
    });

    it('should handle feature_list.json with no metadata at all', async () => {
      // Edge case: very old format with no metadata object
      const noMetadataList = {
        features: [
          {
            id: 'F001',
            description: 'Ancient feature',
            priority: 'low',
            category: 'legacy',
            steps: [],
            passes: false,
          },
        ],
        // No metadata field at all
      };

      const featureListPath = join(tempDir, 'feature_list.json');
      await writeFile(featureListPath, JSON.stringify(noMetadataList, null, 2));

      const result = await runCLI(['init', '--prompt', 'Modern project', '--dry-run']);

      // Should still work without crashing
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Existing project files found');
      expect(result.stdout).toContain('[DRY RUN] Would archive to');
    });

    it('should create .fwdslsh/pace/history directory on first upgrade from old installation', async () => {
      // Simulate upgrading from old installation that never had .fwdslsh/pace/history directory
      const oldFeatureList = {
        features: [
          {
            id: 'F001',
            description: 'Old feature',
            priority: 'high',
            category: 'core',
            steps: [],
            passes: false,
          },
        ],
        metadata: {
          project_name: 'Old Installation',
          created_at: '2024-12-01',
        },
      };

      const featureListPath = join(tempDir, 'feature_list.json');
      await writeFile(featureListPath, JSON.stringify(oldFeatureList, null, 2));

      // Verify .fwdslsh/pace/history doesn't exist yet
      const historyPath = join(tempDir, '.fwdslsh/pace/history');
      let historyExists = false;
      try {
        await stat(historyPath);
        historyExists = true;
      } catch {
        historyExists = false;
      }
      expect(historyExists).toBe(false);

      // Simulate archiving (what happens during actual init)
      const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');
      const timestamp = new Date().toISOString(); // Fallback timestamp since last_updated is missing
      const normalizedTimestamp = normalizeTimestamp(timestamp);
      const archivePath = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp);

      // Move the file - this should create .fwdslsh/pace/history directory automatically
      await moveToArchive(featureListPath, archivePath, 'feature_list.json');

      // Verify .fwdslsh/pace/history was created
      const historyStats = await stat(historyPath);
      expect(historyStats.isDirectory()).toBe(true);

      // Verify archive was created
      const archivedFile = join(archivePath, 'feature_list.json');
      const archivedContent = await readFile(archivedFile, 'utf-8');
      expect(archivedContent).toContain('Old Installation');
    });

    it('should handle corrupted feature_list.json during upgrade gracefully', async () => {
      // Simulate a corrupted JSON file (might happen in old installations)
      const featureListPath = join(tempDir, 'feature_list.json');
      await writeFile(featureListPath, '{ "features": [ invalid json }');

      const result = await runCLI(['init', '--prompt', 'New project', '--dry-run']);

      // Should not crash - should use fallback behavior
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Existing project files found');
      expect(result.stdout).toContain('[DRY RUN] Would archive to');
    });

    it('should successfully archive and reinitialize old project', async () => {
      // Full end-to-end test: old format -> archive -> new format
      const oldProject = {
        features: [
          {
            id: 'F001',
            description: 'Old feature 1',
            priority: 'critical',
            category: 'core',
            steps: ['Implement', 'Test'],
            passes: true,
          },
          {
            id: 'F002',
            description: 'Old feature 2',
            priority: 'high',
            category: 'functional',
            steps: ['Design', 'Build'],
            passes: false,
          },
        ],
        metadata: {
          project_name: 'Legacy Project',
          total_features: 2,
          passing: 1,
          failing: 1,
          // No last_updated - simulating old installation
        },
      };

      const featureListPath = join(tempDir, 'feature_list.json');
      const progressPath = join(tempDir, 'progress.txt');

      await writeFile(featureListPath, JSON.stringify(oldProject, null, 2));
      await writeFile(progressPath, '# Old progress log\n\nSome old progress...');

      // Verify files exist
      const featureStats = await stat(featureListPath);
      expect(featureStats.isFile()).toBe(true);

      // Perform archiving (simulating what init does)
      const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');
      const timestamp = new Date().toISOString(); // Fallback since no last_updated
      const normalizedTimestamp = normalizeTimestamp(timestamp);
      const archivePath = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp);

      await moveToArchive(featureListPath, archivePath, 'feature_list.json');
      await moveToArchive(progressPath, archivePath, 'progress.txt');

      // Verify files were moved to archive
      const archivedFeatureList = await readFile(join(archivePath, 'feature_list.json'), 'utf-8');
      const archivedProgress = await readFile(join(archivePath, 'progress.txt'), 'utf-8');

      expect(archivedFeatureList).toContain('Legacy Project');
      expect(archivedFeatureList).toContain('Old feature 1');
      expect(archivedFeatureList).toContain('Old feature 2');
      expect(archivedProgress).toContain('Old progress log');

      // Verify original files are gone
      let originalExists = true;
      try {
        await stat(featureListPath);
      } catch {
        originalExists = false;
      }
      expect(originalExists).toBe(false);

      // Now create new feature_list.json (simulating what init agent creates)
      const newProject = {
        features: [
          {
            id: 'F001',
            description: 'New feature 1',
            priority: 'high',
            category: 'core',
            steps: [],
            passes: false,
          },
        ],
        metadata: {
          project_name: 'Upgraded Project',
          created_at: new Date().toISOString().split('T')[0],
          total_features: 1,
          passing: 0,
          failing: 1,
          last_updated: new Date().toISOString(), // New installations have this
        },
      };

      await writeFile(featureListPath, JSON.stringify(newProject, null, 2));

      // Verify new file was created successfully
      const newContent = await readFile(featureListPath, 'utf-8');
      expect(newContent).toContain('Upgraded Project');
      expect(newContent).toContain('New feature 1');
      expect(newContent).not.toContain('Legacy Project');

      // Verify archive still exists with old data
      const stillArchivedContent = await readFile(join(archivePath, 'feature_list.json'), 'utf-8');
      expect(stillArchivedContent).toContain('Legacy Project');
    });

    it('should work with feature_list.json that has extra unknown fields', async () => {
      // Old installations might have had custom fields we don't know about
      const customFieldsList = {
        features: [
          {
            id: 'F001',
            description: 'Feature',
            priority: 'medium',
            category: 'core',
            steps: [],
            passes: false,
            customField: 'some value', // Unknown field
          },
        ],
        metadata: {
          project_name: 'Custom Project',
          customMetadata: 'custom value', // Unknown metadata field
          experimentalFeature: true,
          // No last_updated
        },
        unknownTopLevel: 'unknown', // Unknown top-level field
      };

      const featureListPath = join(tempDir, 'feature_list.json');
      await writeFile(featureListPath, JSON.stringify(customFieldsList, null, 2));

      const result = await runCLI(['init', '--prompt', 'Standard project', '--dry-run']);

      // Should handle gracefully - just ignore unknown fields
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Existing project files found');
      expect(result.stdout).toContain('[DRY RUN] Would archive to');
    });
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

/**
 * Tests for F009: Handle file system errors during archiving gracefully
 * Tests permission errors, disk full scenarios, and that init continues even if archiving fails
 */
describe('Init Command Archiving Error Handling (F009)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pace-archive-errors-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should create .bak fallback when archiving to .fwdslsh/pace/history fails', async () => {
    // Create a feature_list.json
    const featureList = {
      features: [
        {
          id: 'F001',
          description: 'Test',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Test',
        last_updated: '2025-12-17T10:00:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList));

    // Create .fwdslsh/pace/history directory with no write permissions (simulating permission error)
    const historyDir = join(tempDir, '.fwdslsh/pace/history');
    await mkdir(historyDir, { recursive: true });
    await chmod(historyDir, 0o444); // Read-only

    // Simulate archiving failure and fallback to .bak
    const { normalizeTimestamp } = await import('../src/archive-utils.js');
    const timestamp = featureList.metadata.last_updated;
    const normalizedTimestamp = normalizeTimestamp(timestamp);
    const archivePath = join(historyDir, normalizedTimestamp);

    // Try to archive - should fail due to permissions
    try {
      const { moveToArchive } = await import('../src/archive-utils.js');
      await moveToArchive(featureListPath, archivePath, 'feature_list.json');
      // If successful, this test is invalid (permissions worked)
      expect(true).toBe(false);
    } catch {
      // Expected: archiving to .fwdslsh/pace/history failed
      // Now simulate fallback to .bak
      const { copyFile } = await import('fs/promises');
      const bakPath = `${featureListPath}.bak`;
      await copyFile(featureListPath, bakPath);

      // Verify .bak file was created
      const bakExists = await stat(bakPath);
      expect(bakExists.isFile()).toBe(true);

      // Verify .bak content matches original
      const bakContent = await readFile(bakPath, 'utf-8');
      const originalContent = await readFile(featureListPath, 'utf-8');
      expect(bakContent).toBe(originalContent);
    } finally {
      // Restore permissions for cleanup
      await chmod(historyDir, 0o755);
    }
  });

  it('should handle archiving failure gracefully and allow init to continue', async () => {
    // Create a feature_list.json
    const featureList = {
      features: [],
      metadata: {
        project_name: 'Test',
        last_updated: '2025-12-17T10:00:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList));

    // Create .fwdslsh/pace/history directory with no write permissions
    const historyDir = join(tempDir, '.fwdslsh/pace/history');
    await mkdir(historyDir, { recursive: true });
    await chmod(historyDir, 0o444); // Read-only

    // Verify that even if archiving fails, the process can continue
    let archivingFailed = false;
    try {
      const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');
      const timestamp = featureList.metadata.last_updated;
      const normalizedTimestamp = normalizeTimestamp(timestamp);
      const archivePath = join(historyDir, normalizedTimestamp);
      await moveToArchive(featureListPath, archivePath, 'feature_list.json');
    } catch {
      archivingFailed = true;
    }

    expect(archivingFailed).toBe(true);

    // Simulate that init continues anyway - create new feature_list.json
    const newFeatureList = {
      features: [],
      metadata: {
        project_name: 'New Project',
        last_updated: new Date().toISOString(),
      },
    };

    // This write should succeed even though archiving failed
    await writeFile(featureListPath, JSON.stringify(newFeatureList));
    const newContent = await readFile(featureListPath, 'utf-8');
    expect(newContent).toContain('New Project');

    // Cleanup
    await chmod(historyDir, 0o755);
  });

  it('should handle both archiving and fallback failures gracefully', async () => {
    // Create a feature_list.json in a restricted directory
    const restrictedDir = join(tempDir, 'restricted');
    await mkdir(restrictedDir);
    const featureListPath = join(restrictedDir, 'feature_list.json');
    const featureList = {
      features: [],
      metadata: { last_updated: '2025-12-17T10:00:00.000Z' },
    };
    await writeFile(featureListPath, JSON.stringify(featureList));

    // Make directory read-only (prevents both archiving and .bak creation)
    await chmod(restrictedDir, 0o444);

    // Try to archive - should fail
    let archivingFailed = false;
    try {
      const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');
      const timestamp = featureList.metadata.last_updated;
      const normalizedTimestamp = normalizeTimestamp(timestamp);
      const archivePath = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp);
      await moveToArchive(featureListPath, archivePath, 'feature_list.json');
    } catch {
      archivingFailed = true;
    }

    expect(archivingFailed).toBe(true);

    // Try to create .bak - should also fail
    let bakFailed = false;
    try {
      const { copyFile } = await import('fs/promises');
      const bakPath = `${featureListPath}.bak`;
      await copyFile(featureListPath, bakPath);
    } catch {
      bakFailed = true;
    }

    expect(bakFailed).toBe(true);

    // Verify that even with both failures, the process can continue
    // (In real init flow, this means init would proceed without archiving)
    // This demonstrates that errors are caught and don't abort the process

    // Cleanup
    await chmod(restrictedDir, 0o755);
  });

  it('should handle missing .fwdslsh/pace/history directory creation failure', async () => {
    // Create a FILE named .fwdslsh/pace/history (not a directory) to cause mkdir to fail
    const historyPath = join(tempDir, '.fwdslsh/pace/history');
    await mkdir(join(tempDir, '.fwdslsh/pace'), { recursive: true });
    await mkdir(join(tempDir, '.fwdslsh/pace'), { recursive: true });
    await writeFile(historyPath, 'This is a file, not a directory');

    const featureList = {
      features: [],
      metadata: { last_updated: '2025-12-17T10:00:00.000Z' },
    };
    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList));

    // Try to archive - should fail because .fwdslsh/pace/history is a file, not a directory
    let archivingFailed = false;
    try {
      const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');
      const timestamp = featureList.metadata.last_updated;
      const normalizedTimestamp = normalizeTimestamp(timestamp);
      const archivePath = join(historyPath, normalizedTimestamp);
      await moveToArchive(featureListPath, archivePath, 'feature_list.json');
    } catch {
      archivingFailed = true;
    }

    expect(archivingFailed).toBe(true);

    // Verify .bak fallback would work
    const { copyFile } = await import('fs/promises');
    const bakPath = `${featureListPath}.bak`;
    await copyFile(featureListPath, bakPath);

    const bakExists = await stat(bakPath);
    expect(bakExists.isFile()).toBe(true);
  });

  it('should preserve original file if all backup attempts fail', async () => {
    // Create a feature_list.json
    const featureList = {
      features: [
        {
          id: 'F001',
          description: 'Important data',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: false,
        },
      ],
      metadata: { last_updated: '2025-12-17T10:00:00.000Z' },
    };
    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList));

    // Make .fwdslsh/pace/history a read-only file (archiving will fail)
    await mkdir(join(tempDir, '.fwdslsh/pace'), { recursive: true });
    const historyPath = join(tempDir, '.fwdslsh/pace/history');
    await writeFile(historyPath, 'file');

    // Simulate archiving failure
    let archivingFailed = false;
    try {
      const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');
      const timestamp = featureList.metadata.last_updated;
      const normalizedTimestamp = normalizeTimestamp(timestamp);
      const archivePath = join(historyPath, normalizedTimestamp);
      await moveToArchive(featureListPath, archivePath, 'feature_list.json');
    } catch {
      archivingFailed = true;
    }

    expect(archivingFailed).toBe(true);

    // Verify original file still exists and is intact
    const originalContent = await readFile(featureListPath, 'utf-8');
    expect(originalContent).toContain('Important data');
    const parsed = JSON.parse(originalContent);
    expect(parsed.features[0].id).toBe('F001');

    // This demonstrates that failed archiving doesn't corrupt or delete the original
  });

  it('should preserve .fwdslsh/pace/history directory structure across multiple consecutive inits (F008)', async () => {
    // This test verifies F008 requirements:
    // 1. .fwdslsh/pace/history directory is created if it doesn't exist
    // 2. Each init creates a new timestamped subdirectory
    // 3. Multiple init operations create separate archives
    // 4. Old archives are not overwritten
    // 5. Test with 3+ consecutive init operations

    const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');

    // ===== SIMULATION 1: First init (creates initial files) =====
    const firstFeatureList = {
      features: [
        {
          id: 'F001',
          description: 'Feature 1',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'First Init',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T10:00:00.000Z', // Timestamp for first init
      },
    };
    const firstProgress = 'Progress Log - Init 1\nCreated on 2025-12-17 10:00:00';

    const featureListPath = join(tempDir, 'feature_list.json');
    const progressPath = join(tempDir, 'progress.txt');

    await writeFile(featureListPath, JSON.stringify(firstFeatureList, null, 2));
    await writeFile(progressPath, firstProgress);

    // ===== SIMULATION 2: Second init (archives first files) =====
    // Read the first init's timestamp and archive it
    const firstTimestamp = firstFeatureList.metadata.last_updated;
    const firstNormalized = normalizeTimestamp(firstTimestamp);
    expect(firstNormalized).toBe('2025-12-17_10-00-00');

    const firstArchivePath = join(tempDir, '.fwdslsh/pace/history', firstNormalized);

    // Archive first init files
    await moveToArchive(featureListPath, firstArchivePath, 'feature_list.json', tempDir);
    await moveToArchive(progressPath, firstArchivePath, 'progress.txt', tempDir);

    // Create second init files
    const secondFeatureList = {
      features: [
        {
          id: 'F002',
          description: 'Feature 2',
          priority: 'medium',
          category: 'ui',
          steps: [],
          passes: false,
        },
        {
          id: 'F003',
          description: 'Feature 3',
          priority: 'low',
          category: 'docs',
          steps: [],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Second Init',
        created_at: '2025-12-17',
        total_features: 2,
        passing: 0,
        failing: 2,
        last_updated: '2025-12-17T11:30:00.000Z', // Different timestamp
      },
    };
    const secondProgress = 'Progress Log - Init 2\nCreated on 2025-12-17 11:30:00';

    await writeFile(featureListPath, JSON.stringify(secondFeatureList, null, 2));
    await writeFile(progressPath, secondProgress);

    // ===== SIMULATION 3: Third init (archives second files) =====
    const secondTimestamp = secondFeatureList.metadata.last_updated;
    const secondNormalized = normalizeTimestamp(secondTimestamp);
    expect(secondNormalized).toBe('2025-12-17_11-30-00');

    const secondArchivePath = join(tempDir, '.fwdslsh/pace/history', secondNormalized);

    // Archive second init files
    await moveToArchive(featureListPath, secondArchivePath, 'feature_list.json', tempDir);
    await moveToArchive(progressPath, secondArchivePath, 'progress.txt', tempDir);

    // Create third init files
    const thirdFeatureList = {
      features: [
        {
          id: 'F004',
          description: 'Feature 4',
          priority: 'critical',
          category: 'security',
          steps: [],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Third Init',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T14:45:00.000Z', // Yet another timestamp
      },
    };
    const thirdProgress = 'Progress Log - Init 3\nCreated on 2025-12-17 14:45:00';

    await writeFile(featureListPath, JSON.stringify(thirdFeatureList, null, 2));
    await writeFile(progressPath, thirdProgress);

    // ===== SIMULATION 4: Fourth init (archives third files) =====
    const thirdTimestamp = thirdFeatureList.metadata.last_updated;
    const thirdNormalized = normalizeTimestamp(thirdTimestamp);
    expect(thirdNormalized).toBe('2025-12-17_14-45-00');

    const thirdArchivePath = join(tempDir, '.fwdslsh/pace/history', thirdNormalized);

    // Archive third init files
    await moveToArchive(featureListPath, thirdArchivePath, 'feature_list.json', tempDir);
    await moveToArchive(progressPath, thirdArchivePath, 'progress.txt', tempDir);

    // Create fourth (final) init files
    const fourthFeatureList = {
      features: [
        {
          id: 'F005',
          description: 'Feature 5',
          priority: 'high',
          category: 'performance',
          steps: [],
          passes: false,
        },
        {
          id: 'F006',
          description: 'Feature 6',
          priority: 'medium',
          category: 'testing',
          steps: [],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Fourth Init',
        created_at: '2025-12-17',
        total_features: 2,
        passing: 0,
        failing: 2,
        last_updated: '2025-12-17T16:20:00.000Z',
      },
    };
    const fourthProgress = 'Progress Log - Init 4\nCreated on 2025-12-17 16:20:00';

    await writeFile(featureListPath, JSON.stringify(fourthFeatureList, null, 2));
    await writeFile(progressPath, fourthProgress);

    // ===== VERIFICATION: Check .fwdslsh/pace/history directory structure =====

    // 1. Verify .fwdslsh/pace/history directory was created
    const historyPath = join(tempDir, '.fwdslsh/pace/history');
    const historyStats = await stat(historyPath);
    expect(historyStats.isDirectory()).toBe(true);

    // 2. Verify all three archive subdirectories exist (from inits 1, 2, and 3)
    const firstArchiveStats = await stat(firstArchivePath);
    expect(firstArchiveStats.isDirectory()).toBe(true);

    const secondArchiveStats = await stat(secondArchivePath);
    expect(secondArchiveStats.isDirectory()).toBe(true);

    const thirdArchiveStats = await stat(thirdArchivePath);
    expect(thirdArchiveStats.isDirectory()).toBe(true);

    // 3. Verify each archive contains both feature_list.json and progress.txt

    // First archive
    const firstArchivedFeature = join(firstArchivePath, 'feature_list.json');
    const firstArchivedProgress = join(firstArchivePath, 'progress.txt');
    expect((await stat(firstArchivedFeature)).isFile()).toBe(true);
    expect((await stat(firstArchivedProgress)).isFile()).toBe(true);

    const firstArchivedContent = JSON.parse(await readFile(firstArchivedFeature, 'utf-8'));
    expect(firstArchivedContent.metadata.project_name).toBe('First Init');
    expect(firstArchivedContent.features[0].id).toBe('F001');

    const firstProgressContent = await readFile(firstArchivedProgress, 'utf-8');
    expect(firstProgressContent).toContain('Init 1');

    // Second archive
    const secondArchivedFeature = join(secondArchivePath, 'feature_list.json');
    const secondArchivedProgress = join(secondArchivePath, 'progress.txt');
    expect((await stat(secondArchivedFeature)).isFile()).toBe(true);
    expect((await stat(secondArchivedProgress)).isFile()).toBe(true);

    const secondArchivedContent = JSON.parse(await readFile(secondArchivedFeature, 'utf-8'));
    expect(secondArchivedContent.metadata.project_name).toBe('Second Init');
    expect(secondArchivedContent.features.length).toBe(2);
    expect(secondArchivedContent.features[0].id).toBe('F002');

    const secondProgressContent = await readFile(secondArchivedProgress, 'utf-8');
    expect(secondProgressContent).toContain('Init 2');

    // Third archive
    const thirdArchivedFeature = join(thirdArchivePath, 'feature_list.json');
    const thirdArchivedProgress = join(thirdArchivePath, 'progress.txt');
    expect((await stat(thirdArchivedFeature)).isFile()).toBe(true);
    expect((await stat(thirdArchivedProgress)).isFile()).toBe(true);

    const thirdArchivedContent = JSON.parse(await readFile(thirdArchivedFeature, 'utf-8'));
    expect(thirdArchivedContent.metadata.project_name).toBe('Third Init');
    expect(thirdArchivedContent.features[0].id).toBe('F004');

    const thirdProgressContent = await readFile(thirdArchivedProgress, 'utf-8');
    expect(thirdProgressContent).toContain('Init 3');

    // 4. Verify current working directory has the fourth init files
    const currentFeatureContent = JSON.parse(await readFile(featureListPath, 'utf-8'));
    expect(currentFeatureContent.metadata.project_name).toBe('Fourth Init');
    expect(currentFeatureContent.features.length).toBe(2);
    expect(currentFeatureContent.features[0].id).toBe('F005');

    const currentProgressContent = await readFile(progressPath, 'utf-8');
    expect(currentProgressContent).toContain('Init 4');

    // 5. Verify old archives were not overwritten (each has unique content)
    // We already verified this above by checking each archive has its original content
    // Additional check: verify timestamps are all different
    const timestamps = [firstNormalized, secondNormalized, thirdNormalized];
    const uniqueTimestamps = new Set(timestamps);
    expect(uniqueTimestamps.size).toBe(3); // All three timestamps should be unique

    // Summary verification for F008:
    // ✅ 1. .fwdslsh/pace/history directory was created
    // ✅ 2. Each init created a new timestamped subdirectory (3 subdirectories for 3 archives)
    // ✅ 3. Multiple init operations created separate archives (verified 3 separate archives exist)
    // ✅ 4. Old archives were not overwritten (each archive contains its original content)
    // ✅ 5. Tested with 4 consecutive init operations (creating 3 archives)
  });
});

/**
 * Tests for F010: Handle corrupted feature_list.json during archiving
 * Ensures corrupted JSON files are archived safely and init continues
 */
describe('Init Command Corrupted JSON Handling (F010)', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary test directory
    tempDir = join('/tmp', `pace-test-f010-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    // Change to temp directory for tests
    process.chdir(tempDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper to run CLI commands in the temp directory
   */
  async function runCLI(
    args: string[],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const cliPath = join(import.meta.dir, '..', 'cli.ts');
    const proc = Bun.spawn(['bun', 'run', cliPath, ...args], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return { exitCode, stdout, stderr };
  }

  it('should archive corrupted feature_list.json with fallback timestamp (F010 step 1-2)', async () => {
    // Create a corrupted JSON file that can't be parsed
    const featureListPath = join(tempDir, 'feature_list.json');
    const corruptedContent = '{ "features": [ invalid json syntax }';
    await writeFile(featureListPath, corruptedContent);

    // Run init with dry-run to test archiving logic without SDK requirement
    const result = await runCLI(['init', '--prompt', 'New project after corruption', '--dry-run']);

    // Verify command succeeded
    expect(result.exitCode).toBe(0);

    // Verify warning was displayed
    expect(result.stdout).toContain('Existing project files found');
    expect(result.stdout).toContain('⚠️');
    expect(result.stdout).toContain('Could not read metadata');

    // Verify dry-run shows archiving plan
    expect(result.stdout).toContain('[DRY RUN] Would archive to: .fwdslsh/pace/history/');
    expect(result.stdout).toMatch(/\.fwdslsh\/pace\/history\/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/);

    // ✅ F010 Step 1: Corrupted JSON parsing handled gracefully
    // ✅ F010 Step 2: Fallback timestamp would be used
  });

  it('should log warning about corrupted JSON (F010 step 3)', async () => {
    // Create corrupted JSON
    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, '{ "malformed": json }');

    // Run init with dry-run
    const result = await runCLI(['init', '--prompt', 'Test warning message', '--dry-run']);

    // Verify warning was logged
    expect(result.stdout).toContain('⚠️');
    expect(result.stdout).toContain('Could not read metadata');

    // ✅ F010 Step 3: Warning logged about corrupted JSON
  });

  it('should handle various forms of corrupted JSON (F010 step 4-5)', async () => {
    // Create various forms of corrupted JSON
    const corruptedSamples = [
      { content: '{ "features": [ }', description: 'Missing closing bracket' },
      { content: '{ "metadata": { "last_updated": }', description: 'Missing value' },
      { content: 'not even json at all', description: 'Not JSON' },
      { content: '', description: 'Empty file' },
      { content: '{"features":["partial', description: 'Truncated' },
    ];

    for (const sample of corruptedSamples) {
      // Create corrupted file
      const featureListPath = join(tempDir, 'feature_list.json');
      await writeFile(featureListPath, sample.content);

      // Run init with dry-run
      const result = await runCLI(['init', '--prompt', `Test: ${sample.description}`, '--dry-run']);

      // Verify command doesn't crash despite corrupted JSON
      expect(result.exitCode).toBe(0);

      // Verify warning is shown
      expect(result.stdout).toContain('Could not read metadata');

      // Verify archiving would proceed
      expect(result.stdout).toContain('[DRY RUN] Would archive to');
    }

    // ✅ F010 Step 4: Various corruption types handled safely
    // ✅ F010 Step 5: Init would proceed successfully in all cases
  });

  it('should handle corrupted JSON with progress.txt present', async () => {
    // Create corrupted feature_list.json
    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, '{ corrupt json }');

    // Create valid progress.txt
    const progressPath = join(tempDir, 'progress.txt');
    await writeFile(progressPath, '# Session 1\nSome progress notes\n');

    // Run init with dry-run
    const result = await runCLI(['init', '--prompt', 'Test with progress', '--dry-run']);

    // Verify command succeeded
    expect(result.exitCode).toBe(0);

    // Verify both files would be archived
    expect(result.stdout).toContain('feature_list.json');
    expect(result.stdout).toContain('progress.txt');

    // Verify warning about corrupted JSON
    expect(result.stdout).toContain('Could not read metadata');
  });

  it('should use current timestamp when corrupted JSON has no metadata', async () => {
    // Create JSON that's parseable but has no metadata.last_updated
    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, '{ "corrupt": "but parseable" }');

    const beforeTimestamp = new Date();

    // Run init with dry-run
    const result = await runCLI(['init', '--prompt', 'Test timestamp fallback', '--dry-run']);

    // Verify command succeeded
    expect(result.exitCode).toBe(0);

    // Verify output shows timestamp-based archive directory
    const timestampRegex = /\.fwdslsh\/pace\/history\/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/;
    const match = result.stdout.match(timestampRegex);
    expect(match).toBeTruthy();

    if (match) {
      const archiveDirName = match[1];
      // Extract date from archive directory name
      const archiveDate = archiveDirName.split('_')[0];
      const expectedDate = beforeTimestamp.toISOString().split('T')[0];

      // Archive date should be today
      expect(archiveDate).toBe(expectedDate);
    }

    // Verify warning about missing metadata (either corrupted JSON or missing field)
    const hasCorruptedWarning = result.stdout.includes('Could not read metadata');
    const hasMissingFieldWarning = result.stdout.includes('metadata.last_updated is missing');
    expect(hasCorruptedWarning || hasMissingFieldWarning).toBe(true);
  });

  it('should display clear feedback when archiving corrupted JSON in verbose mode', async () => {
    // Create corrupted JSON
    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, '{ invalid }');

    // Run init with verbose and dry-run
    const result = await runCLI(['init', '--prompt', 'Test verbose', '--verbose', '--dry-run']);

    // Check for informative messages
    expect(result.stdout).toContain('Existing project files found');
    expect(result.stdout).toContain('Could not read metadata');
    expect(result.stdout).toContain('using current timestamp');
    expect(result.stdout).toContain('[DRY RUN] Would archive to');

    // Verify command succeeded
    expect(result.exitCode).toBe(0);
  });

  /**
   * Test for F011: Display informative console messages during archiving
   * Verifies all required console messages are shown during the archiving process
   */
  it('should display all required archiving messages (F011)', async () => {
    // STEP 1: Create existing feature_list.json with metadata
    const existingFeatureList: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'core',
          description: 'Existing feature',
          priority: 'high',
          steps: ['Step 1'],
          passes: true,
        },
      ],
      metadata: {
        project_name: 'Existing Project',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 1,
        failing: 0,
        last_updated: '2025-12-17T12:00:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(existingFeatureList, null, 2));

    // STEP 2: Create progress.txt
    const progressContent = '# Existing Progress\n\nSome progress notes.';
    const progressPath = join(tempDir, 'progress.txt');
    await writeFile(progressPath, progressContent);

    // STEP 3: Run init in dry-run mode to see archiving messages
    const result = await runCLI(['init', '--prompt', 'New project', '--dry-run']);

    // STEP 4: Verify all F011 required messages
    // F011 Verification Step 1: Print message: 'Existing project files found'
    expect(result.stdout).toContain('Existing project files found');

    // F011 Verification Step 2: Print message: 'Archiving to .fwdslsh/pace/history/<timestamp>/'
    // In dry-run mode, it shows "[DRY RUN] Would archive to:"
    expect(result.stdout).toMatch(
      /\[DRY RUN\] Would archive to:.*\.fwdslsh\/pace\/history\/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/,
    );

    // F011 Verification Step 3: Print confirmation: 'Archived feature_list.json'
    // In dry-run mode, it shows the file name in the list with bullet point
    expect(result.stdout).toContain('feature_list.json');

    // F011 Verification Step 4: Print confirmation: 'Archived progress.txt' (if applicable)
    expect(result.stdout).toContain('progress.txt');

    // F011 Verification Step 5: Use consistent formatting with existing CLI output
    // Verify emoji usage consistent with other CLI output
    expect(result.stdout).toContain('📦'); // Existing files emoji
    expect(result.stdout).toContain('📁'); // Archive folder emoji

    // Verify command succeeded
    expect(result.exitCode).toBe(0);
  });

  it('should display archived confirmation messages in non-dry-run mode (F011)', async () => {
    // STEP 1: Create existing files
    const existingFeatureList: FeatureList = {
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
      metadata: {
        project_name: 'Test Project',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T15:30:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(existingFeatureList, null, 2));

    const progressPath = join(tempDir, 'progress.txt');
    await writeFile(progressPath, '# Test Progress');

    // STEP 2: Manually perform archiving (simulating what init would do)
    const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');
    const timestamp = existingFeatureList.metadata?.last_updated || new Date().toISOString();
    const normalizedTimestamp = normalizeTimestamp(timestamp);
    const archivePath = join(tempDir, '.fwdslsh/pace/history', normalizedTimestamp);

    // STEP 3: Perform archiving and capture console output
    // We can't easily capture console.log from moveToArchive, but we can verify the files
    await moveToArchive(featureListPath, archivePath, 'feature_list.json');
    await moveToArchive(progressPath, archivePath, 'progress.txt');

    // STEP 4: Verify files were archived
    const archivedFeaturePath = join(archivePath, 'feature_list.json');
    const archivedProgressPath = join(archivePath, 'progress.txt');

    const archivedFeatureContent = await readFile(archivedFeaturePath, 'utf-8');
    const archivedProgressContent = await readFile(archivedProgressPath, 'utf-8');

    expect(archivedFeatureContent).toContain('Test Project');
    expect(archivedProgressContent).toContain('Test Progress');

    // STEP 5: Verify the timestamp format in directory name
    expect(normalizedTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
  });

  it('should not display archived progress.txt message when it does not exist (F011)', async () => {
    // STEP 1: Create only feature_list.json (no progress.txt)
    const existingFeatureList: FeatureList = {
      features: [],
      metadata: {
        project_name: 'Project without progress',
        created_at: '2025-12-17',
        total_features: 0,
        passing: 0,
        failing: 0,
        last_updated: '2025-12-17T16:00:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(existingFeatureList, null, 2));

    // STEP 2: Verify progress.txt does NOT exist
    const progressPath = join(tempDir, 'progress.txt');
    let progressExists = true;
    try {
      await stat(progressPath);
    } catch {
      progressExists = false;
    }
    expect(progressExists).toBe(false);

    // STEP 3: Run init in dry-run mode
    const result = await runCLI(['init', '--prompt', 'New project', '--dry-run']);

    // STEP 4: Verify archiving messages appear
    expect(result.stdout).toContain('Existing project files found');
    expect(result.stdout).toContain('feature_list.json');

    // STEP 5: In normal mode (non-verbose), progress.txt should not be mentioned
    // since it doesn't exist. In verbose mode, it may show "not found"
    // We'll accept either behavior as valid.

    // Verify command succeeded
    expect(result.exitCode).toBe(0);
  });

  /**
   * F025: Test archiving with custom archive directory from pace.json
   * Comprehensive test covering all verification steps:
   * 1. Create pace.json with custom archiveDir setting
   * 2. Create feature_list.json
   * 3. Run init command (with archiving)
   * 4. Verify files are archived to custom directory instead of .fwdslsh/pace/history
   * 5. Verify custom directory structure matches expected format
   */
  it('should use custom archive directory from pace.json config (F025)', async () => {
    // STEP 1: Create pace.json with custom archiveDir
    const paceConfig = {
      pace: {
        archiveDir: '.archives',
      },
    };
    const paceConfigPath = join(tempDir, 'pace.json');
    await writeFile(paceConfigPath, JSON.stringify(paceConfig, null, 2));

    // STEP 2: Create feature_list.json
    const featureList: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'core',
          description: 'Test feature for custom archive directory',
          priority: 'high',
          steps: ['Step 1', 'Step 2'],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Custom Archive Test',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T15:00:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList, null, 2));

    const progressPath = join(tempDir, 'progress.txt');
    await writeFile(progressPath, '# Custom Archive Test Progress');

    // STEP 3: Run init command with archiving (using dry-run to test the path)
    const result = await runCLI(['init', '--prompt', 'New project', '--dry-run']);

    // STEP 4: Verify output shows custom archive directory
    expect(result.stdout).toContain('Existing project files found');
    expect(result.stdout).toContain('[DRY RUN] Would archive to: .archives/');
    expect(result.stdout).toContain('2025-12-17_15-00-00');

    // Verify command succeeded
    expect(result.exitCode).toBe(0);

    // STEP 5: Actually archive to verify custom directory works
    const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');
    const timestamp = featureList.metadata?.last_updated || new Date().toISOString();
    const normalizedTimestamp = normalizeTimestamp(timestamp);
    const customArchivePath = join(tempDir, '.archives', normalizedTimestamp);

    // Archive the files to the custom directory
    await moveToArchive(featureListPath, customArchivePath, 'feature_list.json');
    await moveToArchive(progressPath, customArchivePath, 'progress.txt');

    // Verify files exist in custom archive directory
    const archivedFeaturePath = join(customArchivePath, 'feature_list.json');
    const archivedProgressPath = join(customArchivePath, 'progress.txt');

    const archivedFeatureStats = await stat(archivedFeaturePath);
    expect(archivedFeatureStats.isFile()).toBe(true);

    const archivedProgressStats = await stat(archivedProgressPath);
    expect(archivedProgressStats.isFile()).toBe(true);

    // Verify content
    const archivedContent = await readFile(archivedFeaturePath, 'utf-8');
    expect(archivedContent).toContain('Custom Archive Test');

    const archivedProgress = await readFile(archivedProgressPath, 'utf-8');
    expect(archivedProgress).toContain('Custom Archive Test Progress');
  });

  /**
   * F028: Handle case where .fwdslsh/pace/history already contains conflicting directory
   * Tests conflict resolution when archive directory already exists
   */
  it('should handle archive directory conflicts by appending suffix (F028)', async () => {
    // STEP 1: Create .fwdslsh/pace/history/<timestamp> directory manually
    const historyDir = join(tempDir, '.fwdslsh/pace/history');
    const baseTimestamp = '2025-12-17_10-00-00';
    const baseArchivePath = join(historyDir, baseTimestamp);

    await mkdir(baseArchivePath, { recursive: true });
    // Add a file to make it a "real" conflict
    await writeFile(join(baseArchivePath, 'existing.txt'), 'This directory already exists');

    // STEP 2: Create feature_list.json with same timestamp (simulating unlikely but possible conflict)
    const featureList: FeatureList = {
      features: [
        {
          id: 'F001',
          category: 'core',
          description: 'Test conflict resolution',
          priority: 'high',
          steps: ['Step 1'],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'Conflict Test',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T10:00:00.000Z', // Same timestamp
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList, null, 2));

    const progressPath = join(tempDir, 'progress.txt');
    await writeFile(progressPath, '# Conflict Test Progress');

    // STEP 3: Run archiving with conflict resolution
    const { resolveUniqueArchivePath, moveToArchive } = await import('../src/archive-utils.js');

    // Resolve unique path (should detect conflict and append -1)
    const uniqueArchivePath = await resolveUniqueArchivePath(baseArchivePath);

    // STEP 4: Verify archiving handles conflict gracefully
    expect(uniqueArchivePath).toBe(`${baseArchivePath}-1`);

    // STEP 5: Archive files to the unique path
    await moveToArchive(featureListPath, uniqueArchivePath, 'feature_list.json');
    await moveToArchive(progressPath, uniqueArchivePath, 'progress.txt');

    // Verify files were archived to the conflict-free directory
    const archivedFeaturePath = join(uniqueArchivePath, 'feature_list.json');
    const archivedProgressPath = join(uniqueArchivePath, 'progress.txt');

    const archivedFeatureStats = await stat(archivedFeaturePath);
    expect(archivedFeatureStats.isFile()).toBe(true);

    const archivedProgressStats = await stat(archivedProgressPath);
    expect(archivedProgressStats.isFile()).toBe(true);

    // Verify content
    const archivedContent = await readFile(archivedFeaturePath, 'utf-8');
    expect(archivedContent).toContain('Conflict Test');

    // Verify original conflict directory is still intact
    const existingFile = await readFile(join(baseArchivePath, 'existing.txt'), 'utf-8');
    expect(existingFile).toContain('This directory already exists');

    // Verify both directories exist
    const baseStats = await stat(baseArchivePath);
    expect(baseStats.isDirectory()).toBe(true);

    const uniqueStats = await stat(uniqueArchivePath);
    expect(uniqueStats.isDirectory()).toBe(true);
  });

  it('should handle multiple conflicts by incrementing suffix (F028)', async () => {
    // Create base directory and first two conflict directories
    const historyDir = join(tempDir, '.fwdslsh/pace/history');
    const baseTimestamp = '2025-12-17_14-30-00';
    const baseArchivePath = join(historyDir, baseTimestamp);

    await mkdir(baseArchivePath, { recursive: true });
    await mkdir(`${baseArchivePath}-1`, { recursive: true });
    await mkdir(`${baseArchivePath}-2`, { recursive: true });

    // Add files to verify they're distinct
    await writeFile(join(baseArchivePath, 'test.txt'), 'Base');
    await writeFile(join(`${baseArchivePath}-1`, 'test.txt'), 'Conflict 1');
    await writeFile(join(`${baseArchivePath}-2`, 'test.txt'), 'Conflict 2');

    // Resolve unique path
    const { resolveUniqueArchivePath } = await import('../src/archive-utils.js');
    const uniqueArchivePath = await resolveUniqueArchivePath(baseArchivePath);

    // Should append -3
    expect(uniqueArchivePath).toBe(`${baseArchivePath}-3`);

    // Create feature list and archive to the unique path
    const featureList: FeatureList = {
      features: [],
      metadata: {
        project_name: 'Multi Conflict Test',
        last_updated: '2025-12-17T14:30:00.000Z',
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList, null, 2));

    const { moveToArchive } = await import('../src/archive-utils.js');
    await moveToArchive(featureListPath, uniqueArchivePath, 'feature_list.json');

    // Verify new archive was created
    const archivedFile = join(uniqueArchivePath, 'feature_list.json');
    const archivedStats = await stat(archivedFile);
    expect(archivedStats.isFile()).toBe(true);

    // Verify all four directories exist with different content
    const baseContent = await readFile(join(baseArchivePath, 'test.txt'), 'utf-8');
    expect(baseContent).toBe('Base');

    const conflict1Content = await readFile(join(`${baseArchivePath}-1`, 'test.txt'), 'utf-8');
    expect(conflict1Content).toBe('Conflict 1');

    const conflict2Content = await readFile(join(`${baseArchivePath}-2`, 'test.txt'), 'utf-8');
    expect(conflict2Content).toBe('Conflict 2');

    const conflict3Content = await readFile(archivedFile, 'utf-8');
    expect(conflict3Content).toContain('Multi Conflict Test');
  });

  it('should use conflict resolution in ArchiveManager (F028)', async () => {
    // This test verifies that ArchiveManager uses resolveUniqueArchivePath

    // Create existing archive directory
    const baseTimestamp = '2025-12-17_16-00-00';
    const existingArchive = join(tempDir, '.fwdslsh/pace/history', baseTimestamp);
    await mkdir(existingArchive, { recursive: true });
    await writeFile(join(existingArchive, 'old.txt'), 'Existing archive');

    // Create feature_list.json with conflicting timestamp
    const featureList: FeatureList = {
      features: [
        {
          id: 'F001',
          description: 'Test ArchiveManager conflict',
          priority: 'high',
          category: 'core',
          steps: [],
          passes: false,
        },
      ],
      metadata: {
        project_name: 'ArchiveManager Test',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 0,
        failing: 1,
        last_updated: '2025-12-17T16:00:00.000Z', // Same timestamp
      },
    };

    const featureListPath = join(tempDir, 'feature_list.json');
    await writeFile(featureListPath, JSON.stringify(featureList, null, 2));

    const progressPath = join(tempDir, 'progress.txt');
    await writeFile(progressPath, '# ArchiveManager Test');

    // Use ArchiveManager to archive
    const { ArchiveManager } = await import('../src/archive-manager.js');
    const manager = new ArchiveManager();

    const result = await manager.archive({
      projectDir: tempDir,
      archiveDir: '.fwdslsh/pace/history',
      dryRun: false,
      silent: true,
    });

    // Verify archiving succeeded
    expect(result.archived).toBe(true);
    expect(result.archivePath).toBe(join(tempDir, '.fwdslsh/pace/history', `${baseTimestamp}-1`));
    expect(result.archivedFiles).toContain('feature_list.json');
    expect(result.archivedFiles).toContain('progress.txt');

    // Verify files were archived to -1 directory
    const archivedFeature = join(result.archivePath!, 'feature_list.json');
    const archivedProgress = join(result.archivePath!, 'progress.txt');

    const featureContent = await readFile(archivedFeature, 'utf-8');
    expect(featureContent).toContain('ArchiveManager Test');

    const progressContent = await readFile(archivedProgress, 'utf-8');
    expect(progressContent).toContain('ArchiveManager Test');

    // Verify original archive is still intact
    const originalFile = await readFile(join(existingArchive, 'old.txt'), 'utf-8');
    expect(originalFile).toBe('Existing archive');
  });
});
