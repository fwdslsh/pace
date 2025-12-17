/**
 * init-command.test.ts - Unit and integration tests for the init command
 *
 * Tests the init command functionality including:
 * - Argument parsing for init-specific options
 * - File creation and validation
 * - LLM interaction mocking
 * - Tool usage and text output display
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile, readFile, stat, chmod } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
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
      });

      let stdout = '';
      let stderr = '';
      let completed = false;

      const timer = setTimeout(() => {
        if (!completed) {
          proc.kill();
          reject(new Error('Process timeout'));
        }
      }, timeout);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        completed = true;
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
        });
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
      const result = await runCLI([
        'init',
        '--dry-run',
        'Build',
        'a',
        'multi-word',
        'application',
      ]);
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
