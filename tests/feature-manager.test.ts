/**
 * feature-manager.test.ts - Unit tests for FeatureManager
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FeatureManager } from '../src/feature-manager';
import type { FeatureList } from '../src/types';

describe('FeatureManager', () => {
	let testDir: string;
	let manager: FeatureManager;

	beforeEach(async () => {
		// Create a temporary directory for each test
		testDir = await mkdtemp(join(tmpdir(), 'pace-test-'));
		manager = new FeatureManager(testDir);
	});

	afterEach(async () => {
		// Clean up test directory
		await rm(testDir, { recursive: true, force: true });
	});

	describe('load()', () => {
		test('should return empty feature list if file does not exist', async () => {
			const result = await manager.load();
			expect(result).toEqual({ features: [], metadata: {} });
		});

		test('should load valid feature list', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'auth',
						description: 'User authentication',
						priority: 'high',
						steps: ['Step 1', 'Step 2'],
						passes: false
					}
				],
				metadata: { project_name: 'Test Project' }
			};

			await writeFile(join(testDir, 'feature_list.json'), JSON.stringify(data));

			const result = await manager.load();
			expect(result.features.length).toBe(1);
			expect(result.features[0].id).toBe('F001');
			expect(result.metadata?.project_name).toBe('Test Project');
		});

		test('should throw error for invalid JSON', async () => {
			await writeFile(join(testDir, 'feature_list.json'), 'invalid json{');
			
			await expect(manager.load()).rejects.toThrow();
		});
	});

	describe('save()', () => {
		test('should save feature list and update metadata', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'auth',
						description: 'User authentication',
						priority: 'high',
						steps: ['Step 1'],
						passes: false
					},
					{
						id: 'F002',
						category: 'ui',
						description: 'Dark mode',
						priority: 'medium',
						steps: ['Step 1'],
						passes: true
					}
				]
			};

			await manager.save(data);

			const loaded = await manager.load();
			expect(loaded.features.length).toBe(2);
			expect(loaded.metadata?.total_features).toBe(2);
			expect(loaded.metadata?.passing).toBe(1);
			expect(loaded.metadata?.failing).toBe(1);
			expect(loaded.metadata?.last_updated).toBeDefined();
		});

		test('should create backup when requested', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Test feature',
						priority: 'low',
						steps: ['Step 1'],
						passes: false
					}
				]
			};

			// Save initial version
			await manager.save(data, false);

			// Modify and save with backup
			data.features[0].passes = true;
			await manager.save(data, true);

			// Check backup exists
			const backupPath = join(testDir, 'feature_list.json.bak');
			const { existsSync } = await import('fs');
			expect(existsSync(backupPath)).toBe(true);
		});
	});

	describe('getProgress()', () => {
		test('should return correct progress', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Feature 1',
						priority: 'high',
						steps: ['Step 1'],
						passes: true
					},
					{
						id: 'F002',
						category: 'test',
						description: 'Feature 2',
						priority: 'high',
						steps: ['Step 1'],
						passes: true
					},
					{
						id: 'F003',
						category: 'test',
						description: 'Feature 3',
						priority: 'high',
						steps: ['Step 1'],
						passes: false
					}
				]
			};

			await manager.save(data);

			const [passing, total] = await manager.getProgress();
			expect(passing).toBe(2);
			expect(total).toBe(3);
		});

		test('should return [0, 0] for empty feature list', async () => {
			const [passing, total] = await manager.getProgress();
			expect(passing).toBe(0);
			expect(total).toBe(0);
		});
	});

	describe('isComplete()', () => {
		test('should return true when all features pass', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Feature 1',
						priority: 'high',
						steps: ['Step 1'],
						passes: true
					},
					{
						id: 'F002',
						category: 'test',
						description: 'Feature 2',
						priority: 'high',
						steps: ['Step 1'],
						passes: true
					}
				]
			};

			await manager.save(data);

			const result = await manager.isComplete();
			expect(result).toBe(true);
		});

		test('should return false when some features fail', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Feature 1',
						priority: 'high',
						steps: ['Step 1'],
						passes: true
					},
					{
						id: 'F002',
						category: 'test',
						description: 'Feature 2',
						priority: 'high',
						steps: ['Step 1'],
						passes: false
					}
				]
			};

			await manager.save(data);

			const result = await manager.isComplete();
			expect(result).toBe(false);
		});

		test('should return true for empty feature list', async () => {
			const result = await manager.isComplete();
			expect(result).toBe(true);
		});
	});

	describe('findFeature()', () => {
		test('should find existing feature by ID', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Feature 1',
						priority: 'high',
						steps: ['Step 1'],
						passes: false
					},
					{
						id: 'F002',
						category: 'test',
						description: 'Feature 2',
						priority: 'medium',
						steps: ['Step 1'],
						passes: false
					}
				]
			};

			await manager.save(data);

			const feature = await manager.findFeature('F002');
			expect(feature).not.toBeNull();
			expect(feature?.id).toBe('F002');
			expect(feature?.description).toBe('Feature 2');
		});

		test('should return null for non-existent feature', async () => {
			const feature = await manager.findFeature('NONEXISTENT');
			expect(feature).toBeNull();
		});
	});

	describe('getFailingFeatures()', () => {
		test('should return failing features sorted by priority', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Low priority',
						priority: 'low',
						steps: ['Step 1'],
						passes: false
					},
					{
						id: 'F002',
						category: 'test',
						description: 'Critical priority',
						priority: 'critical',
						steps: ['Step 1'],
						passes: false
					},
					{
						id: 'F003',
						category: 'test',
						description: 'High priority',
						priority: 'high',
						steps: ['Step 1'],
						passes: false
					},
					{
						id: 'F004',
						category: 'test',
						description: 'Passing feature',
						priority: 'critical',
						steps: ['Step 1'],
						passes: true
					}
				]
			};

			await manager.save(data);

			const failing = await manager.getFailingFeatures();
			expect(failing.length).toBe(3);
			expect(failing[0].priority).toBe('critical');
			expect(failing[1].priority).toBe('high');
			expect(failing[2].priority).toBe('low');
		});

		test('should return empty array when all features pass', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Feature 1',
						priority: 'high',
						steps: ['Step 1'],
						passes: true
					}
				]
			};

			await manager.save(data);

			const failing = await manager.getFailingFeatures();
			expect(failing.length).toBe(0);
		});
	});

	describe('getNextFeature()', () => {
		test('should return highest priority failing feature', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Low priority',
						priority: 'low',
						steps: ['Step 1'],
						passes: false
					},
					{
						id: 'F002',
						category: 'test',
						description: 'Critical priority',
						priority: 'critical',
						steps: ['Step 1'],
						passes: false
					}
				]
			};

			await manager.save(data);

			const next = await manager.getNextFeature();
			expect(next).not.toBeNull();
			expect(next?.id).toBe('F002');
			expect(next?.priority).toBe('critical');
		});

		test('should return null when no features fail', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Feature 1',
						priority: 'high',
						steps: ['Step 1'],
						passes: true
					}
				]
			};

			await manager.save(data);

			const next = await manager.getNextFeature();
			expect(next).toBeNull();
		});
	});

	describe('updateFeatureStatus()', () => {
		test('should update feature status and create backup', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Feature 1',
						priority: 'high',
						steps: ['Step 1'],
						passes: false
					}
				]
			};

			await manager.save(data, false);

			const success = await manager.updateFeatureStatus('F001', true);
			expect(success).toBe(true);

			const updated = await manager.load();
			expect(updated.features[0].passes).toBe(true);

			// Check backup was created
			const backupPath = join(testDir, 'feature_list.json.bak');
			const { existsSync } = await import('fs');
			expect(existsSync(backupPath)).toBe(true);
		});

		test('should return false for non-existent feature', async () => {
			const success = await manager.updateFeatureStatus('NONEXISTENT', true);
			expect(success).toBe(false);
		});

		test('should return true when status unchanged', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'test',
						description: 'Feature 1',
						priority: 'high',
						steps: ['Step 1'],
						passes: true
					}
				]
			};

			await manager.save(data);

			// Try to set to same status
			const success = await manager.updateFeatureStatus('F001', true);
			expect(success).toBe(true);
		});
	});

	describe('getStats()', () => {
		test('should return correct statistics', async () => {
			const data: FeatureList = {
				features: [
					{
						id: 'F001',
						category: 'auth',
						description: 'Feature 1',
						priority: 'critical',
						steps: ['Step 1'],
						passes: true
					},
					{
						id: 'F002',
						category: 'auth',
						description: 'Feature 2',
						priority: 'high',
						steps: ['Step 1'],
						passes: false
					},
					{
						id: 'F003',
						category: 'ui',
						description: 'Feature 3',
						priority: 'medium',
						steps: ['Step 1'],
						passes: true
					}
				]
			};

			await manager.save(data);

			const stats = await manager.getStats();
			expect(stats.total).toBe(3);
			expect(stats.passing).toBe(2);
			expect(stats.failing).toBe(1);
			expect(stats.byCategory['auth'].passing).toBe(1);
			expect(stats.byCategory['auth'].failing).toBe(1);
			expect(stats.byCategory['ui'].passing).toBe(1);
			expect(stats.byPriority.critical.passing).toBe(1);
			expect(stats.byPriority.high.failing).toBe(1);
		});

		test('should handle empty feature list', async () => {
			const stats = await manager.getStats();
			expect(stats.total).toBe(0);
			expect(stats.passing).toBe(0);
			expect(stats.failing).toBe(0);
		});
	});
});
