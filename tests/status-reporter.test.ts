/* eslint-disable no-console */
/**
 * Tests for StatusReporter
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { StatusReporter } from '../src/status-reporter';
import type { FeatureList } from '../src/types';

describe('StatusReporter', () => {
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

	const createProgressFile = async (content: string) => {
		const filePath = join(tempDir, 'progress.txt');
		await writeFile(filePath, content, 'utf-8');
	};

	describe('getStatusData', () => {
		it('should return basic status data', async () => {
			await createFeatureList({
				metadata: {
					project_name: 'Test Project',
					version: '1.0.0',
					last_updated: '2025-01-01'
				},
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

			const reporter = new StatusReporter(tempDir);
			const data = await reporter.getStatusData({ showGitLog: false });

			expect(data.progress).toEqual({
				passing: 1,
				failing: 1,
				total: 2,
				percentage: 50
			});
			expect(data.projectName).toBe('Test Project');
			expect(data.workingDirectory).toBe(tempDir);
			expect(data.nextFeatures).toHaveLength(1);
			expect(data.nextFeatures[0].id).toBe('F002');
		});

		it('should handle empty feature list', async () => {
			await createFeatureList({
				metadata: { project_name: 'Empty Project' },
				features: []
			});

			const reporter = new StatusReporter(tempDir);
			const data = await reporter.getStatusData({ showGitLog: false });

			expect(data.progress).toEqual({
				passing: 0,
				failing: 0,
				total: 0,
				percentage: 0
			});
			expect(data.nextFeatures).toHaveLength(0);
		});

		it('should limit next features by showNextFeatures', async () => {
			const features = [];
			for (let i = 1; i <= 10; i++) {
				features.push({
					id: `F${String(i).padStart(3, '0')}`,
					description: `Feature ${i}`,
					priority: 'medium' as const,
					category: 'test',
					passes: false
				});
			}

			await createFeatureList({ metadata: {}, features });

			const reporter = new StatusReporter(tempDir);
			const data = await reporter.getStatusData({ showNextFeatures: 3, showGitLog: false });

			expect(data.nextFeatures).toHaveLength(3);
			expect(data.nextFeatures[0].id).toBe('F001');
			expect(data.nextFeatures[2].id).toBe('F003');
		});

		it('should include category breakdown in verbose mode', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Core Feature',
						priority: 'high',
						category: 'core',
						passes: true
					},
					{
						id: 'F002',
						description: 'UI Feature',
						priority: 'medium',
						category: 'ui',
						passes: false
					},
					{
						id: 'F003',
						description: 'UI Feature 2',
						priority: 'low',
						category: 'ui',
						passes: true
					}
				]
			});

			const reporter = new StatusReporter(tempDir);
			const data = await reporter.getStatusData({ verbose: true, showGitLog: false });

			expect(data.byCategory).toBeDefined();
			expect(data.byCategory!['core']).toEqual({
				passing: 1,
				failing: 0,
				total: 1
			});
			expect(data.byCategory!['ui']).toEqual({
				passing: 1,
				failing: 1,
				total: 2
			});
		});

		it('should not include category breakdown in non-verbose mode', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature',
						priority: 'high',
						category: 'core',
						passes: true
					}
				]
			});

			const reporter = new StatusReporter(tempDir);
			const data = await reporter.getStatusData({ verbose: false, showGitLog: false });

			expect(data.byCategory).toBeUndefined();
		});

		it('should parse last session from progress file', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature',
						priority: 'high',
						category: 'core',
						passes: true
					}
				]
			});

			const progressContent = `# Progress Log

### Session 1
Started at: 2025-01-01
Working on: F001
Result: pass

### Session 2
Started at: 2025-01-02
Working on: F002
Result: fail
More details here`;

			await createProgressFile(progressContent);

			const reporter = new StatusReporter(tempDir);
			const data = await reporter.getStatusData({ showGitLog: false });

			expect(data.lastSession).toBeDefined();
			expect(data.lastSession).toContain('2');
			expect(data.lastSession).toContain('2025-01-02');
		});

		it('should handle missing progress file', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'Feature',
						priority: 'high',
						category: 'core',
						passes: true
					}
				]
			});

			const reporter = new StatusReporter(tempDir);
			const data = await reporter.getStatusData({ showGitLog: false });

			expect(data.lastSession).toBeUndefined();
		});

		it('should include next features with correct properties', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{
						id: 'F001',
						description: 'High priority feature',
						priority: 'critical',
						category: 'security',
						passes: false
					},
					{
						id: 'F002',
						description: 'Medium priority feature',
						priority: 'medium',
						category: 'ui',
						passes: false
					}
				]
			});

			const reporter = new StatusReporter(tempDir);
			const data = await reporter.getStatusData({ showGitLog: false });

			expect(data.nextFeatures).toHaveLength(2);
			expect(data.nextFeatures[0]).toEqual({
				id: 'F001',
				description: 'High priority feature',
				priority: 'critical',
				category: 'security'
			});
			expect(data.nextFeatures[1]).toEqual({
				id: 'F002',
				description: 'Medium priority feature',
				priority: 'medium',
				category: 'ui'
			});
		});

		it('should calculate percentage correctly', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: true },
					{ id: 'F002', description: 'F2', priority: 'high', category: 'core', passes: true },
					{ id: 'F003', description: 'F3', priority: 'high', category: 'core', passes: true },
					{ id: 'F004', description: 'F4', priority: 'high', category: 'core', passes: false }
				]
			});

			const reporter = new StatusReporter(tempDir);
			const data = await reporter.getStatusData({ showGitLog: false });

			expect(data.progress.percentage).toBe(75);
		});
	});

	describe('printStatus with JSON output', () => {
		it('should output JSON when json option is true', async () => {
			await createFeatureList({
				metadata: { project_name: 'JSON Test' },
				features: [
					{
						id: 'F001',
						description: 'Feature',
						priority: 'high',
						category: 'core',
						passes: true
					}
				]
			});

			const reporter = new StatusReporter(tempDir);

			// Capture console.log output
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(' '));
			};

			await reporter.printStatus({ json: true, showGitLog: false });

			console.log = originalLog;

			// Should output JSON
			expect(logs.length).toBeGreaterThan(0);
			const jsonOutput = logs.join('\n');
			expect(() => JSON.parse(jsonOutput)).not.toThrow();

			const parsed = JSON.parse(jsonOutput);
			expect(parsed.projectName).toBe('JSON Test');
			expect(parsed.progress).toBeDefined();
		});
	});

	describe('printCompactStatus', () => {
		it('should print compact status line', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{ id: 'F001', description: 'F1', priority: 'high', category: 'core', passes: true },
					{ id: 'F002', description: 'F2', priority: 'high', category: 'core', passes: true },
					{ id: 'F003', description: 'F3', priority: 'high', category: 'core', passes: false }
				]
			});

			const reporter = new StatusReporter(tempDir);

			// Capture console output
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(' '));
			};

			await reporter.printCompactStatus();

			console.log = originalLog;

			expect(logs.length).toBe(1);
			expect(logs[0]).toContain('2/3');
			expect(logs[0]).toContain('66.7%');
		});
	});

	describe('printNextFeature', () => {
		it('should print next failing feature', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{ id: 'F001', description: 'Passing feature', priority: 'high', category: 'core', passes: true },
					{
						id: 'F002',
						description: 'Failing feature',
						priority: 'critical',
						category: 'core',
						passes: false
					}
				]
			});

			const reporter = new StatusReporter(tempDir);

			// Capture console output
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(' '));
			};

			await reporter.printNextFeature();

			console.log = originalLog;

			expect(logs.length).toBe(1);
			expect(logs[0]).toContain('F002');
			expect(logs[0]).toContain('Failing feature');
		});

		it('should print completion message when all features pass', async () => {
			await createFeatureList({
				metadata: {},
				features: [
					{ id: 'F001', description: 'Feature 1', priority: 'high', category: 'core', passes: true },
					{ id: 'F002', description: 'Feature 2', priority: 'high', category: 'core', passes: true }
				]
			});

			const reporter = new StatusReporter(tempDir);

			// Capture console output
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(' '));
			};

			await reporter.printNextFeature();

			console.log = originalLog;

			expect(logs.length).toBe(1);
			expect(logs[0]).toContain('complete');
		});
	});
});
