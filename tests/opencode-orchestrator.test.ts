/**
 * Tests for the OpenCode-native orchestrator
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { OpencodeOrchestrator, type OrchestratorCliConfig } from '../opencode-orchestrator';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('OpencodeOrchestrator', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'opencode-orchestrator-test-'));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	async function createFeatureList(content: object): Promise<void> {
		await writeFile(join(tempDir, 'feature_list.json'), JSON.stringify(content, null, 2));
	}

	describe('constructor', () => {
		it('should create an orchestrator with default config', () => {
			const config: OrchestratorCliConfig = {
				projectDir: tempDir,
				verbose: false,
				dryRun: true
			};

			const orchestrator = new OpencodeOrchestrator(config);
			expect(orchestrator).toBeDefined();
		});

		it('should accept optional maxSessions', () => {
			const config: OrchestratorCliConfig = {
				projectDir: tempDir,
				maxSessions: 10,
				verbose: false,
				dryRun: true
			};

			const orchestrator = new OpencodeOrchestrator(config);
			expect(orchestrator).toBeDefined();
		});

		it('should accept optional port', () => {
			const config: OrchestratorCliConfig = {
				projectDir: tempDir,
				port: 8080,
				verbose: false,
				dryRun: true
			};

			const orchestrator = new OpencodeOrchestrator(config);
			expect(orchestrator).toBeDefined();
		});
	});

	describe('run (dry-run mode)', () => {
		it('should handle empty feature list', async () => {
			await createFeatureList({ features: [], metadata: {} });

			const config: OrchestratorCliConfig = {
				projectDir: tempDir,
				verbose: false,
				dryRun: true
			};

			const orchestrator = new OpencodeOrchestrator(config);

			// Capture console output
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(' '));
			};

			await orchestrator.run();

			console.log = originalLog;

			// Should indicate no features
			const output = logs.join('\n');
			expect(output).toContain('No features found');
			expect(output).toContain('0/0');
		});

		it('should handle all features passing', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'Feature 1', priority: 'high', category: 'core', passes: true },
					{ id: 'F002', description: 'Feature 2', priority: 'medium', category: 'core', passes: true }
				]
			});

			const config: OrchestratorCliConfig = {
				projectDir: tempDir,
				verbose: false,
				dryRun: true
			};

			const orchestrator = new OpencodeOrchestrator(config);

			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(' '));
			};

			await orchestrator.run();

			console.log = originalLog;

			const output = logs.join('\n');
			expect(output).toContain('All features already passing');
			expect(output).toContain('2/2');
		});

		it('should show dry-run message when features are pending', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'Feature 1', priority: 'high', category: 'core', passes: false }
				]
			});

			const config: OrchestratorCliConfig = {
				projectDir: tempDir,
				verbose: false,
				dryRun: true
			};

			const orchestrator = new OpencodeOrchestrator(config);

			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(' '));
			};

			await orchestrator.run();

			console.log = originalLog;

			const output = logs.join('\n');
			expect(output).toContain('DRY RUN');
			expect(output).toContain('0/1');
		});
	});

	describe('configuration', () => {
		it('should respect verbose setting', async () => {
			await createFeatureList({ features: [], metadata: {} });

			const config: OrchestratorCliConfig = {
				projectDir: tempDir,
				verbose: true,
				dryRun: true
			};

			const orchestrator = new OpencodeOrchestrator(config);
			expect(orchestrator).toBeDefined();
		});

		it('should respect maxSessions limit', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'Feature 1', priority: 'high', category: 'core', passes: false }
				]
			});

			const config: OrchestratorCliConfig = {
				projectDir: tempDir,
				maxSessions: 5,
				verbose: false,
				dryRun: true
			};

			const orchestrator = new OpencodeOrchestrator(config);

			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(' '));
			};

			await orchestrator.run();

			console.log = originalLog;

			const output = logs.join('\n');
			expect(output).toContain('Max sessions: 5');
		});
	});

	describe('summary output', () => {
		it('should show correct statistics in summary', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'Feature 1', priority: 'high', category: 'core', passes: true },
					{ id: 'F002', description: 'Feature 2', priority: 'medium', category: 'core', passes: false }
				]
			});

			const config: OrchestratorCliConfig = {
				projectDir: tempDir,
				verbose: false,
				dryRun: true
			};

			const orchestrator = new OpencodeOrchestrator(config);

			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(' '));
			};

			await orchestrator.run();

			console.log = originalLog;

			const output = logs.join('\n');
			expect(output).toContain('ORCHESTRATION SUMMARY');
			expect(output).toContain('Sessions run: 0');
			expect(output).toContain('Features completed: 0');
			expect(output).toContain('1/2');
		});
	});
});
