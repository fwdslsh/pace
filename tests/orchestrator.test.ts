/**
 * Tests for Orchestrator
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { Orchestrator } from '../src/orchestrator';
import type { FeatureList, AgentSessionRunner, AgentSessionParams, SessionResult } from '../src/types';

describe('Orchestrator', () => {
	let tempDir: string;

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

	describe('constructor', () => {
		it('should initialize with required options', () => {
			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxFailures: 3,
				delay: 5,
				dryRun: false,
				sdk: 'claude'
			});

			expect(orchestrator).toBeDefined();
		});

		it('should initialize with all optional parameters', () => {
			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				homeDir: '/custom/home',
				maxSessions: 10,
				maxFailures: 5,
				delay: 10,
				dryRun: true,
				sdk: 'opencode',
				json: true
			});

			expect(orchestrator).toBeDefined();
		});
	});

	describe('run', () => {
		it('should handle empty feature list', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: []
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			const summary = await orchestrator.run();

			expect(summary.sessionsRun).toBe(0);
			expect(summary.featuresCompleted).toBe(0);
			expect(summary.isComplete).toBe(true);
		});

		it('should stop when all features are passing', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: true },
					{ id: 'F002', description: 'F2', priority: 'high', category: 'core', passes: true }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			const summary = await orchestrator.run();

			expect(summary.sessionsRun).toBe(0);
			expect(summary.isComplete).toBe(true);
		});

		it('should stop after maxSessions in dry run mode', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: false },
					{ id: 'F002', description: 'F2', priority: 'high', category: 'core', passes: false }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxSessions: 3,
				maxFailures: 10,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			const summary = await orchestrator.run();

			expect(summary.sessionsRun).toBe(3);
			expect(summary.isComplete).toBe(false);
		});

		it('should calculate completion percentage correctly', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: true },
					{ id: 'F002', description: 'F2', priority: 'high', category: 'core', passes: true },
					{ id: 'F003', description: 'F3', priority: 'high', category: 'core', passes: false },
					{ id: 'F004', description: 'F4', priority: 'high', category: 'core', passes: false }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxSessions: 1,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			const summary = await orchestrator.run();

			expect(summary.completionPercentage).toBe(50);
			expect(summary.finalProgress).toBe('2/4');
		});
	});

	describe('summary', () => {
		it('should output JSON when json option is true', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: true }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude',
				json: true
			});

			// Capture console.log output
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: any[]) => {
				logs.push(args.join(' '));
			};

			await orchestrator.summary();

			console.log = originalLog;

			// Find JSON output (skip other log lines)
			const jsonLine = logs.find((line) => {
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
			expect(parsed.progress).toBeDefined();
			expect(parsed.progress.passing).toBe(1);
			expect(parsed.progress.total).toBe(1);
		});

		it('should format duration correctly', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: true }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			const summary = await orchestrator.summary();

			expect(summary.elapsedTime).toBeDefined();
			// Should be in seconds format since test runs quickly
			expect(summary.elapsedTime).toMatch(/^\d+s$/);
		});

		it('should include all summary fields', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: true },
					{ id: 'F002', description: 'F2', priority: 'high', category: 'core', passes: false }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxSessions: 1,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			await orchestrator.run();
			const summary = await orchestrator.summary();

			expect(summary).toHaveProperty('sessionsRun');
			expect(summary).toHaveProperty('featuresCompleted');
			expect(summary).toHaveProperty('finalProgress');
			expect(summary).toHaveProperty('completionPercentage');
			expect(summary).toHaveProperty('elapsedTime');
			expect(summary).toHaveProperty('isComplete');
		});
	});

	describe('SDK selection', () => {
		it('should support claude SDK', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: false }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxSessions: 1,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			const summary = await orchestrator.run();
			expect(summary).toBeDefined();
		});

		it('should support opencode SDK', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: false }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxSessions: 1,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'opencode'
			});

			const summary = await orchestrator.run();
			expect(summary).toBeDefined();
		});
	});

	describe('dry run mode', () => {
		it('should not invoke actual SDK runners in dry run', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: false }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxSessions: 2,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			// Capture console output to verify dry run message
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: any[]) => {
				logs.push(args.join(' '));
			};

			await orchestrator.run();

			console.log = originalLog;

			const hasDryRunMessage = logs.some((line) => line.includes('[DRY RUN]'));
			expect(hasDryRunMessage).toBe(true);
		});
	});

	describe('home directory override', () => {
		it('should accept homeDir in options', () => {
			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				homeDir: '/custom/home/.claude',
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			expect(orchestrator).toBeDefined();
		});
	});

	describe('completion detection', () => {
		it('should detect when project is complete', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: true },
					{ id: 'F002', description: 'F2', priority: 'high', category: 'core', passes: true }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			const summary = await orchestrator.run();

			expect(summary.isComplete).toBe(true);
			expect(summary.sessionsRun).toBe(0);
		});

		it('should detect when project is incomplete', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: true },
					{ id: 'F002', description: 'F2', priority: 'high', category: 'core', passes: false }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxSessions: 1,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			const summary = await orchestrator.run();

			expect(summary.isComplete).toBe(false);
		});
	});

	describe('progress tracking', () => {
		it('should track session count', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: false },
					{ id: 'F002', description: 'F2', priority: 'high', category: 'core', passes: false }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxSessions: 5,
				maxFailures: 10,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			const summary = await orchestrator.run();

			expect(summary.sessionsRun).toBe(5);
		});

		it('should format final progress correctly', async () => {
			await createFeatureList({
				metadata: { project_name: 'Test' },
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: true },
					{ id: 'F002', description: 'F2', priority: 'high', category: 'core', passes: true },
					{ id: 'F003', description: 'F3', priority: 'high', category: 'core', passes: false }
				]
			});

			const orchestrator = new Orchestrator({
				projectDir: tempDir,
				maxSessions: 1,
				maxFailures: 3,
				delay: 0,
				dryRun: true,
				sdk: 'claude'
			});

			const summary = await orchestrator.run();

			expect(summary.finalProgress).toBe('2/3');
			expect(summary.completionPercentage).toBeCloseTo(66.67, 1);
		});
	});
});
