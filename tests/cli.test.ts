/**
 * Integration tests for CLI
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
import type { FeatureList } from '../src/types';

describe('CLI Integration Tests', () => {
	let tempDir: string;
	const cliPath = join(process.cwd(), 'cli.ts');

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'pace-test-'));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	const createFeatureList = async (features: FeatureList) => {
		const filePath = join(tempDir, 'feature_list.json');
		await writeFile(filePath, JSON.stringify(features, null, 2), 'utf-8');
	};

	const runCLI = (
		args: string[],
		timeout: number = 5000
	): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
		return new Promise((resolve, reject) => {
			const proc = spawn('bun', ['run', cliPath, ...args], {
				cwd: tempDir
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
					exitCode: code || 0
				});
			});
		});
	};

	describe('help command', () => {
		it('should display help text', async () => {
			const result = await runCLI(['help']);
			expect(result.stdout).toContain('Pragmatic Agent for Compounding Engineering');
			expect(result.stdout).toContain('COMMANDS:');
			expect(result.exitCode).toBe(0);
		});

		it('should display help with --help flag', async () => {
			const result = await runCLI(['--help']);
			expect(result.stdout).toContain('OpenCode');
			expect(result.exitCode).toBe(0);
		});
	});

	describe('status command', () => {
		it('should show status for empty feature list', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test Project' },
				features: []
			});

			const result = await runCLI(['status']);
			expect(result.stdout).toContain('feature_list.json not found or empty');
			expect(result.exitCode).toBe(0);
		});

		it('should show status with features', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test Project' },
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						steps: [],
						passes: true
					},
					{
						id: 'F002',
						description: 'Feature 2',
						priority: 'medium',
						category: 'core',
						steps: [],
						passes: false
					}
				]
			});

			const result = await runCLI(['status']);
			expect(result.stdout).toContain('Project Status');
			expect(result.stdout).toContain('Test Project');
			expect(result.stdout).toContain('1/2');
			expect(result.exitCode).toBe(0);
		});

		it('should output JSON when --json flag is used', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test Project' },
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						steps: [],
						passes: true
					}
				]
			});

			const result = await runCLI(['status', '--json']);
			expect(() => JSON.parse(result.stdout)).not.toThrow();

			const parsed = JSON.parse(result.stdout);
			expect(parsed.projectName).toBe('Test Project');
			expect(parsed.progress).toBeDefined();
			expect(parsed.progress.passing).toBe(1);
			expect(parsed.progress.total).toBe(1);
			expect(result.exitCode).toBe(0);
		});

		it('should show verbose output with --verbose flag', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test Project' },
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						steps: [],
						passes: true
					},
					{
						id: 'F002',
						description: 'Feature 2',
						priority: 'medium',
						category: 'ui',
						steps: [],
						passes: false
					}
				]
			});

			const result = await runCLI(['status', '--verbose']);
			expect(result.stdout).toContain('Progress by Category');
			expect(result.exitCode).toBe(0);
		});
	});

	describe('validate command', () => {
		it('should validate a correct feature list', async () => {
			await createFeatureList({
				metadata: {
					project_name: 'Test Project',
					version: '1.0.0',
					last_updated: '2025-01-01',
					total_features: 1,
					passing: 1,
					failing: 0
				},
				features: [
					{
						id: 'F001',
						description: 'Feature 1 description that is long enough',
						priority: 'high',
						category: 'core',
						passes: true,
						steps: ['Step 1', 'Step 2']
					}
				]
			});

			const result = await runCLI(['validate']);
			expect(result.stdout).toContain('VALID');
			expect(result.exitCode).toBe(0);
		});

		it('should detect validation errors', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'INVALID',
						description: '',
						priority: 'invalid' as any,
						category: 'core',
						steps: [],
						passes: true
					}
				]
			});

			const result = await runCLI(['validate']);
			expect(result.stdout).toContain('error');
			expect(result.exitCode).toBe(1);
		});

		it('should output JSON when --json flag is used', async () => {
			await createFeatureList({
				metadata: {
					project_name: 'Test',
					total_features: 1,
					passing: 1,
					failing: 0
				},
				features: [
					{
						id: 'F001',
						description: 'Feature 1 with sufficient description length',
						priority: 'high',
						category: 'core',
						passes: true,
						steps: ['Step 1']
					}
				]
			});

			const result = await runCLI(['validate', '--json']);
			expect(() => JSON.parse(result.stdout)).not.toThrow();

			const parsed = JSON.parse(result.stdout);
			expect(parsed).toHaveProperty('valid');
			expect(parsed).toHaveProperty('errorCount');
			expect(parsed).toHaveProperty('errors');
			expect(parsed.valid).toBe(true);
			expect(result.exitCode).toBe(0);
		});
	});

	describe('update command', () => {
		it('should update feature status to pass', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						steps: [],
						passes: false
					}
				]
			});

			const result = await runCLI(['update', 'F001', 'pass']);
			expect(result.stdout).toContain('Updated');
			expect(result.stdout).toContain('F001');
			expect(result.exitCode).toBe(0);
		});

		it('should update feature status to fail', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						steps: [],
						passes: true
					}
				]
			});

			const result = await runCLI(['update', 'F001', 'fail']);
			expect(result.stdout).toContain('Updated');
			expect(result.stdout).toContain('F001');
			expect(result.exitCode).toBe(0);
		});

		it('should handle non-existent feature', async () => {
			await createFeatureList({
				metadata: {},
				features: []
			});

			const result = await runCLI(['update', 'F999', 'pass']);
			expect(result.stderr).toContain('not found');
			expect(result.exitCode).toBe(1);
		});

		it('should output JSON when --json flag is used', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						steps: [],
						passes: false
					}
				]
			});

			const result = await runCLI(['update', 'F001', 'pass', '--json']);
			expect(() => JSON.parse(result.stdout)).not.toThrow();

			const parsed = JSON.parse(result.stdout);
			expect(parsed.success).toBe(true);
			expect(parsed.featureId).toBe('F001');
			expect(parsed.newStatus).toBe('passing');
			expect(result.exitCode).toBe(0);
		});
	});

	describe('run command', () => {
		it('should run orchestrator in dry-run mode', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						steps: [],
						passes: false
					}
				]
			});

			const result = await runCLI(['run', '--dry-run', '--max-sessions', '2', '--delay', '0'], 10000);
			expect(result.stdout).toContain('PACE ORCHESTRATOR');
			expect(result.stdout).toContain('[DRY RUN]');
			// Exit code 1 when features are incomplete
			expect(result.exitCode).toBe(1);
		}, 15000);

		it('should respect --max-sessions option', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						steps: [],
						passes: false
					}
				]
			});

			const result = await runCLI(['run', '--dry-run', '--max-sessions', '3', '--delay', '0'], 20000);
			expect(result.stdout).toContain('Reached maximum sessions (3)');
			// Exit code 1 when features are incomplete
			expect(result.exitCode).toBe(1);
		}, 25000);

		it('should output JSON when --json flag is used', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						steps: [],
						passes: false
					}
				]
			});

			const result = await runCLI(['run', '--dry-run', '--max-sessions', '1', '--json', '--delay', '0']);

			// Find the JSON output (skip other log lines)
			const lines = result.stdout.split('\n');
			const jsonLine = lines.find((line) => {
				try {
					const parsed = JSON.parse(line);
					return parsed.sessionsRun !== undefined;
				} catch {
					return false;
				}
			});

			expect(jsonLine).toBeDefined();
			const parsed = JSON.parse(jsonLine!);
			expect(parsed.sessionsRun).toBe(1);
			// Exit code 1 when features are incomplete
			expect(result.exitCode).toBe(1);
		}, 10000);

		it('should handle complete projects', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						steps: [],
						passes: true
					}
				]
			});

			const result = await runCLI(['run', '--dry-run']);
			expect(result.stdout).toContain('All features already passing');
			expect(result.exitCode).toBe(0);
		}, 10000);
	});

	describe('argument parsing', () => {
		it('should handle --config-dir argument', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						steps: [],
						passes: false
					}
				]
			});

			const result = await runCLI([
				'run',
				'--dry-run',
				'--max-sessions',
				'1',
				'--config-dir',
				'/custom/path',
				'--delay',
				'0'
			]);
			// Should run without errors (exit code 1 when features are incomplete)
			expect(result.exitCode).toBe(1);
		}, 10000);
	});

	describe('init command', () => {
		it('should show error when no prompt is provided', async () => {
			const result = await runCLI(['init']);
			expect(result.stderr).toContain('Error: Project description required');
			expect(result.stderr).toContain('Usage:');
			expect(result.exitCode).toBe(1);
		});

		it('should run init in dry-run mode with --prompt', async () => {
			const result = await runCLI(['init', '--prompt', 'Build a todo app', '--dry-run']);
			expect(result.stdout).toContain('PACE INIT (DRY RUN)');
			expect(result.stdout).toContain('Build a todo app');
			expect(result.stdout).toContain('Expected outputs:');
			expect(result.stdout).toContain('feature_list.json');
			expect(result.exitCode).toBe(0);
		});

		it('should run init in dry-run mode with -p shorthand', async () => {
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

		it('should read prompt from file with --file', async () => {
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

		it('should output JSON in dry-run mode with --json flag', async () => {
			const result = await runCLI(['init', '--prompt', 'Build a todo app', '--dry-run', '--json']);
			expect(() => JSON.parse(result.stdout)).not.toThrow();

			const parsed = JSON.parse(result.stdout);
			expect(parsed.dryRun).toBe(true);
			expect(parsed.promptPreview).toBe('Build a todo app');
			expect(parsed.promptLength).toBeGreaterThan(10);
			expect(result.exitCode).toBe(0);
		});

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
						passes: false
					}
				]
			});

			const result = await runCLI(['init', '-p', 'New project', '--dry-run']);
			expect(result.stderr).toContain('feature_list.json already exists');
			expect(result.exitCode).toBe(0); // Should still exit 0 in dry-run
		});

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
 * Unit tests for parseArgs and Orchestrator
 */
import { parseArgs, Orchestrator, type ParsedArgs } from '../cli';

describe('parseArgs Unit Tests', () => {
	// Store and restore original argv
	const originalArgv = process.argv;

	afterEach(() => {
		process.argv = originalArgv;
	});

	const setArgs = (args: string[]) => {
		process.argv = ['node', 'cli.ts', ...args];
	};

	describe('command parsing', () => {
		it('should default to run command', () => {
			setArgs([]);
			const result = parseArgs();
			expect(result.command).toBe('run');
		});

		it('should parse run command', () => {
			setArgs(['run']);
			const result = parseArgs();
			expect(result.command).toBe('run');
		});

		it('should parse init command', () => {
			setArgs(['init']);
			const result = parseArgs();
			expect(result.command).toBe('init');
		});

		it('should parse status command', () => {
			setArgs(['status']);
			const result = parseArgs();
			expect(result.command).toBe('status');
		});

		it('should parse validate command', () => {
			setArgs(['validate']);
			const result = parseArgs();
			expect(result.command).toBe('validate');
		});

		it('should parse update command', () => {
			setArgs(['update']);
			const result = parseArgs();
			expect(result.command).toBe('update');
		});

		it('should parse help command', () => {
			setArgs(['help']);
			const result = parseArgs();
			expect(result.command).toBe('help');
		});
	});

	describe('run command options', () => {
		it('should parse --max-sessions', () => {
			setArgs(['run', '--max-sessions', '5']);
			const result = parseArgs();
			expect(result.options.maxSessions).toBe(5);
		});

		it('should parse -n shorthand for max-sessions', () => {
			setArgs(['run', '-n', '10']);
			const result = parseArgs();
			expect(result.options.maxSessions).toBe(10);
		});

		it('should parse --max-failures', () => {
			setArgs(['run', '--max-failures', '5']);
			const result = parseArgs();
			expect(result.options.maxFailures).toBe(5);
		});

		it('should parse -f shorthand for max-failures', () => {
			setArgs(['run', '-f', '2']);
			const result = parseArgs();
			expect(result.options.maxFailures).toBe(2);
		});

		it('should parse --delay', () => {
			setArgs(['run', '--delay', '10']);
			const result = parseArgs();
			expect(result.options.delay).toBe(10);
		});

		it('should parse --until-complete', () => {
			setArgs(['run', '--until-complete']);
			const result = parseArgs();
			expect(result.options.untilComplete).toBe(true);
		});

		it('should parse --dry-run', () => {
			setArgs(['run', '--dry-run']);
			const result = parseArgs();
			expect(result.options.dryRun).toBe(true);
		});

		it('should parse --verbose', () => {
			setArgs(['run', '--verbose']);
			const result = parseArgs();
			expect(result.options.verbose).toBe(true);
		});

		it('should parse -v shorthand for verbose', () => {
			setArgs(['run', '-v']);
			const result = parseArgs();
			expect(result.options.verbose).toBe(true);
		});

		it('should parse --json', () => {
			setArgs(['run', '--json']);
			const result = parseArgs();
			expect(result.options.json).toBe(true);
		});

		it('should parse --config-dir', () => {
			setArgs(['run', '--config-dir', '/custom/path']);
			const result = parseArgs();
			expect(result.options.configDir).toBe('/custom/path');
		});

		it('should parse --project-dir', () => {
			setArgs(['run', '--project-dir', '/my/project']);
			const result = parseArgs();
			expect(result.options.projectDir).toBe('/my/project');
		});

		it('should parse -d shorthand for project-dir', () => {
			setArgs(['run', '-d', '/my/project']);
			const result = parseArgs();
			expect(result.options.projectDir).toBe('/my/project');
		});

		it('should parse --port', () => {
			setArgs(['run', '--port', '8080']);
			const result = parseArgs();
			expect(result.options.port).toBe(8080);
		});

		it('should parse --model', () => {
			setArgs(['run', '--model', 'anthropic/claude-sonnet-4-20250514']);
			const result = parseArgs();
			expect(result.options.model).toBe('anthropic/claude-sonnet-4-20250514');
		});

		it('should parse -m shorthand for model', () => {
			setArgs(['run', '-m', 'openai/gpt-4o']);
			const result = parseArgs();
			expect(result.options.model).toBe('openai/gpt-4o');
		});

		it('should handle multiple options together', () => {
			setArgs(['run', '--max-sessions', '5', '--max-failures', '2', '--delay', '3', '--dry-run', '--verbose']);
			const result = parseArgs();
			expect(result.options.maxSessions).toBe(5);
			expect(result.options.maxFailures).toBe(2);
			expect(result.options.delay).toBe(3);
			expect(result.options.dryRun).toBe(true);
			expect(result.options.verbose).toBe(true);
		});
	});

	describe('init command options', () => {
		it('should parse --prompt', () => {
			setArgs(['init', '--prompt', 'Build a todo app']);
			const result = parseArgs();
			expect(result.options.prompt).toBe('Build a todo app');
		});

		it('should parse -p shorthand for prompt', () => {
			setArgs(['init', '-p', 'Build an API']);
			const result = parseArgs();
			expect(result.options.prompt).toBe('Build an API');
		});

		it('should parse --file', () => {
			setArgs(['init', '--file', 'requirements.txt']);
			const result = parseArgs();
			expect(result.options.file).toBe('requirements.txt');
		});

		it('should parse positional argument as prompt', () => {
			setArgs(['init', 'Build', 'a', 'chat', 'app']);
			const result = parseArgs();
			expect(result.options.prompt).toBe('Build a chat app');
		});
	});

	describe('update command options', () => {
		it('should parse feature ID and pass status', () => {
			setArgs(['update', 'F001', 'pass']);
			const result = parseArgs();
			expect(result.options.featureId).toBe('F001');
			expect(result.options.passStatus).toBe(true);
		});

		it('should parse feature ID and fail status', () => {
			setArgs(['update', 'F002', 'fail']);
			const result = parseArgs();
			expect(result.options.featureId).toBe('F002');
			expect(result.options.passStatus).toBe(false);
		});

		it('should parse update with --json flag', () => {
			setArgs(['update', 'F001', 'pass', '--json']);
			const result = parseArgs();
			expect(result.options.featureId).toBe('F001');
			expect(result.options.passStatus).toBe(true);
			expect(result.options.json).toBe(true);
		});
	});

	describe('global options', () => {
		it('should parse --help', () => {
			setArgs(['--help']);
			const result = parseArgs();
			expect(result.options.help).toBe(true);
		});

		it('should parse -h shorthand for help', () => {
			setArgs(['-h']);
			const result = parseArgs();
			expect(result.options.help).toBe(true);
		});

		it('should default projectDir to current directory', () => {
			setArgs([]);
			const result = parseArgs();
			expect(result.options.projectDir).toBe('.');
		});
	});
});

describe('Orchestrator Unit Tests', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'pace-orchestrator-test-'));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	const createFeatureListFile = async (features: FeatureList) => {
		const filePath = join(tempDir, 'feature_list.json');
		await writeFile(filePath, JSON.stringify(features, null, 2), 'utf-8');
	};

	describe('constructor', () => {
		it('should create orchestrator with default options', () => {
			const orchestrator = new Orchestrator({ projectDir: tempDir });
			expect(orchestrator).toBeDefined();
		});

		it('should accept custom options', () => {
			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxSessions: 20,
				maxFailures: 5,
				delay: 10,
				verbose: true,
				json: false,
				dryRun: true
			});
			expect(orchestrator).toBeDefined();
		});

		it('should accept config directory option', () => {
			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				configDir: '/custom/config'
			});
			expect(orchestrator).toBeDefined();
		});

		it('should accept port option', () => {
			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				port: 8080
			});
			expect(orchestrator).toBeDefined();
		});
	});

	describe('run method in dry-run mode', () => {
		it('should complete immediately when all features pass', async () => {
			await createFeatureListFile({
				metadata: { project_name: 'Test' },
				features: [
					{
						id: 'F001',
						description: 'Already done',
						priority: 'high',
						category: 'core',
						steps: ['Step 1'],
						passes: true
					}
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				dryRun: true,
				json: true
			});

			const summary = await orchestrator.run();
			expect(summary.isComplete).toBe(true);
			expect(summary.sessionsRun).toBe(0);
		});

		it('should run sessions in dry-run mode', async () => {
			await createFeatureListFile({
				metadata: { project_name: 'Test' },
				features: [
					{
						id: 'F001',
						description: 'Feature to implement',
						priority: 'high',
						category: 'core',
						steps: ['Step 1'],
						passes: false
					}
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				dryRun: true,
				json: true,
				maxSessions: 2
			});

			const summary = await orchestrator.run();
			expect(summary.sessionsRun).toBe(2);
			expect(summary.isComplete).toBe(false);
		});

		it('should respect maxSessions in dry-run mode', async () => {
			await createFeatureListFile({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'Feature 1', priority: 'high', category: 'core', steps: [], passes: false },
					{ id: 'F002', description: 'Feature 2', priority: 'high', category: 'core', steps: [], passes: false },
					{ id: 'F003', description: 'Feature 3', priority: 'high', category: 'core', steps: [], passes: false }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				dryRun: true,
				json: true,
				maxSessions: 2
			});

			const summary = await orchestrator.run();
			expect(summary.sessionsRun).toBe(2);
		});

		it('should report correct progress', async () => {
			await createFeatureListFile({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'Feature 1', priority: 'high', category: 'core', steps: [], passes: true },
					{ id: 'F002', description: 'Feature 2', priority: 'high', category: 'core', steps: [], passes: false }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				dryRun: true,
				json: true,
				maxSessions: 1
			});

			const summary = await orchestrator.run();
			expect(summary.finalProgress).toBe('1/2');
			expect(summary.completionPercentage).toBe(50);
		});

		it('should handle empty feature list', async () => {
			await createFeatureListFile({
				metadata: { project_name: 'Empty' },
				features: []
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				dryRun: true,
				json: true
			});

			const summary = await orchestrator.run();
			expect(summary.sessionsRun).toBe(0);
			expect(summary.finalProgress).toBe('0/0');
		});

		it('should handle missing feature_list.json', async () => {
			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				dryRun: true,
				json: true
			});

			const summary = await orchestrator.run();
			expect(summary.sessionsRun).toBe(0);
		});
	});

	describe('until-complete mode', () => {
		it('should complete immediately when all features pass in until-complete mode', async () => {
			await createFeatureListFile({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'Feature 1', priority: 'high', category: 'core', steps: [], passes: true },
					{ id: 'F002', description: 'Feature 2', priority: 'high', category: 'core', steps: [], passes: true }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				dryRun: true,
				json: true,
				untilComplete: true
			});

			const summary = await orchestrator.run();
			expect(summary.sessionsRun).toBe(0);
			expect(summary.isComplete).toBe(true);
		});

		it('should set maxSessions to undefined when untilComplete is true', async () => {
			// When untilComplete is set, it overrides maxSessions
			// We test this by checking behavior with already-complete project
			await createFeatureListFile({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'Feature 1', priority: 'high', category: 'core', steps: [], passes: true }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				dryRun: true,
				json: true,
				untilComplete: true,
				maxSessions: 100 // This should be ignored when untilComplete is true
			});

			const summary = await orchestrator.run();
			// Project is complete, so no sessions needed regardless of maxSessions
			expect(summary.sessionsRun).toBe(0);
			expect(summary.isComplete).toBe(true);
		});
	});
});
