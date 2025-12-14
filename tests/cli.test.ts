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

	const runCLI = (args: string[], timeout: number = 5000): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
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
			expect(result.stdout).toContain('orchestrator');
			expect(result.stdout).toContain('COMMANDS:');
			expect(result.exitCode).toBe(0);
		});

		it('should display help with --help flag', async () => {
			const result = await runCLI(['--help']);
			expect(result.stdout).toContain('orchestrator');
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
						passes: true
					},
					{
						id: 'F002',
						description: 'Feature 2',
						priority: 'medium',
						category: 'core',
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
						passes: true
					},
					{
						id: 'F002',
						description: 'Feature 2',
						priority: 'medium',
						category: 'ui',
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
						passes: false
					}
				]
			});

			const result = await runCLI(['run', '--dry-run', '--max-sessions', '2', '--delay', '0'], 10000);
			expect(result.stdout).toContain('LONG-RUNNING AGENT ORCHESTRATOR');
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
						passes: false
					}
				]
			});

			const result = await runCLI(['run', '--dry-run', '--max-sessions', '3', '--delay', '0'], 20000);
			expect(result.stdout).toContain('Reached maximum sessions (3)');
			// Exit code 1 when features are incomplete
			expect(result.exitCode).toBe(1);
		}, 25000);

		it('should use claude SDK by default', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						passes: false
					}
				]
			});

			const result = await runCLI(['run', '--dry-run', '--max-sessions', '1', '--delay', '0']);
			expect(result.stdout).toContain('SDK: CLAUDE');
			// Exit code 1 when features are incomplete
			expect(result.exitCode).toBe(1);
		}, 10000);

		it('should support --sdk opencode option', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						passes: false
					}
				]
			});

			const result = await runCLI(['run', '--dry-run', '--max-sessions', '1', '--sdk', 'opencode', '--delay', '0']);
			expect(result.stdout).toContain('SDK: OPENCODE');
			// Exit code 1 when features are incomplete
			expect(result.exitCode).toBe(1);
		}, 10000);

		it('should output JSON when --json flag is used', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
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
					return parsed.sdk !== undefined;
				} catch {
					return false;
				}
			});

			expect(jsonLine).toBeDefined();
			const parsed = JSON.parse(jsonLine!);
			expect(parsed.sdk).toBe('claude');
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
		it('should handle --home-dir argument', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature 1',
						priority: 'high',
						category: 'core',
						passes: false
					}
				]
			});

			const result = await runCLI([
				'run',
				'--dry-run',
				'--max-sessions',
				'1',
				'--home-dir',
				'/custom/path',
				'--delay',
				'0'
			]);
			// Should run without errors (exit code 1 when features are incomplete)
			expect(result.exitCode).toBe(1);
		}, 10000);
	});
});
