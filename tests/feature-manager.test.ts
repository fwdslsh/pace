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
            passes: false,
          },
        ],
        metadata: { project_name: 'Test Project' },
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
            passes: false,
          },
          {
            id: 'F002',
            category: 'ui',
            description: 'Dark mode',
            priority: 'medium',
            steps: ['Step 1'],
            passes: true,
          },
        ],
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
            passes: false,
          },
        ],
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
            passes: true,
          },
          {
            id: 'F002',
            category: 'test',
            description: 'Feature 2',
            priority: 'high',
            steps: ['Step 1'],
            passes: true,
          },
          {
            id: 'F003',
            category: 'test',
            description: 'Feature 3',
            priority: 'high',
            steps: ['Step 1'],
            passes: false,
          },
        ],
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
            passes: true,
          },
          {
            id: 'F002',
            category: 'test',
            description: 'Feature 2',
            priority: 'high',
            steps: ['Step 1'],
            passes: true,
          },
        ],
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
            passes: true,
          },
          {
            id: 'F002',
            category: 'test',
            description: 'Feature 2',
            priority: 'high',
            steps: ['Step 1'],
            passes: false,
          },
        ],
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
            passes: false,
          },
          {
            id: 'F002',
            category: 'test',
            description: 'Feature 2',
            priority: 'medium',
            steps: ['Step 1'],
            passes: false,
          },
        ],
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
            passes: false,
          },
          {
            id: 'F002',
            category: 'test',
            description: 'Critical priority',
            priority: 'critical',
            steps: ['Step 1'],
            passes: false,
          },
          {
            id: 'F003',
            category: 'test',
            description: 'High priority',
            priority: 'high',
            steps: ['Step 1'],
            passes: false,
          },
          {
            id: 'F004',
            category: 'test',
            description: 'Passing feature',
            priority: 'critical',
            steps: ['Step 1'],
            passes: true,
          },
        ],
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
            passes: true,
          },
        ],
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
            passes: false,
          },
          {
            id: 'F002',
            category: 'test',
            description: 'Critical priority',
            priority: 'critical',
            steps: ['Step 1'],
            passes: false,
          },
        ],
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
            passes: true,
          },
        ],
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
            passes: false,
          },
        ],
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
            passes: true,
          },
        ],
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
            passes: true,
          },
          {
            id: 'F002',
            category: 'auth',
            description: 'Feature 2',
            priority: 'high',
            steps: ['Step 1'],
            passes: false,
          },
          {
            id: 'F003',
            category: 'ui',
            description: 'Feature 3',
            priority: 'medium',
            steps: ['Step 1'],
            passes: true,
          },
        ],
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

  describe('Integration: Archiving with FeatureManager', () => {
    test('FeatureManager.load() works correctly after archiving', async () => {
      // Step 1: Create initial feature list
      const initialData: FeatureList = {
        features: [
          {
            id: 'F001',
            category: 'core',
            description: 'Initial Feature 1',
            priority: 'high',
            steps: ['Step 1'],
            passes: true,
          },
          {
            id: 'F002',
            category: 'core',
            description: 'Initial Feature 2',
            priority: 'medium',
            steps: ['Step 1'],
            passes: false,
          },
        ],
        metadata: {
          project_name: 'Test Project',
          last_updated: '2025-12-15T10:00:00.000Z',
        },
      };

      await manager.save(initialData);

      // Step 2: Simulate archiving by moving files to .runs directory
      const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');
      const timestamp = initialData.metadata?.last_updated || '2025-12-15T10:00:00.000Z';
      const normalizedTimestamp = normalizeTimestamp(timestamp);
      const archivePath = join(testDir, '.runs', normalizedTimestamp);

      const featureListPath = join(testDir, 'feature_list.json');
      await moveToArchive(featureListPath, archivePath, 'feature_list.json');

      // Step 3: Verify FeatureManager.load() returns empty list after archiving
      const emptyList = await manager.load();
      expect(emptyList.features).toEqual([]);
      expect(emptyList.metadata).toEqual({});

      // Step 4: Create new feature list
      const newData: FeatureList = {
        features: [
          {
            id: 'F003',
            category: 'ui',
            description: 'New Feature 1',
            priority: 'critical',
            steps: ['Step 1'],
            passes: false,
          },
        ],
        metadata: {
          project_name: 'New Project',
        },
      };

      await manager.save(newData);

      // Step 5: Verify FeatureManager.load() returns new list
      const loadedNewData = await manager.load();
      expect(loadedNewData.features.length).toBe(1);
      expect(loadedNewData.features[0].id).toBe('F003');
      expect(loadedNewData.features[0].description).toBe('New Feature 1');
    });

    test('archived files do not interfere with new files', async () => {
      // Create initial feature list
      const initialData: FeatureList = {
        features: [
          {
            id: 'F001',
            category: 'core',
            description: 'Archived Feature',
            priority: 'high',
            steps: ['Step 1'],
            passes: true,
          },
        ],
        metadata: {
          project_name: 'Archived Project',
          last_updated: '2025-12-15T12:00:00.000Z',
        },
      };

      await manager.save(initialData);

      // Archive the files
      const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');
      const timestamp = initialData.metadata?.last_updated || '2025-12-15T16:00:00.000Z';
      const normalizedTimestamp = normalizeTimestamp(timestamp);
      const archivePath = join(testDir, '.runs', normalizedTimestamp);

      const featureListPath = join(testDir, 'feature_list.json');
      await moveToArchive(featureListPath, archivePath, 'feature_list.json');

      // Create new feature list
      const newData: FeatureList = {
        features: [
          {
            id: 'F002',
            category: 'ui',
            description: 'New Feature',
            priority: 'medium',
            steps: ['Step 1'],
            passes: false,
          },
        ],
      };

      await manager.save(newData);

      // Test update operations
      const updateSuccess = await manager.updateFeatureStatus('F002', true);
      expect(updateSuccess).toBe(true);

      // Verify update was applied
      const updated = await manager.load();
      expect(updated.features[0].passes).toBe(true);

      // Test finding feature
      const found = await manager.findFeature('F002');
      expect(found).not.toBeNull();
      expect(found?.passes).toBe(true);

      // Test getting next feature (should be null since all pass)
      const next = await manager.getNextFeature();
      expect(next).toBeNull();
    });

    test('multiple archive operations preserve all previous runs', async () => {
      // First feature list
      const firstData: FeatureList = {
        features: [
          {
            id: 'F001',
            category: 'core',
            description: 'First Run Feature',
            priority: 'high',
            steps: ['Step 1'],
            passes: false,
          },
        ],
        metadata: {
          project_name: 'First Run',
          last_updated: '2025-12-15T10:00:00.000Z',
        },
      };

      await manager.save(firstData);

      // Archive first run
      const { normalizeTimestamp, moveToArchive } = await import('../src/archive-utils.js');
      const firstTimestamp = normalizeTimestamp(
        firstData.metadata?.last_updated || '2025-12-15T10:00:00.000Z',
      );
      const firstArchivePath = join(testDir, '.runs', firstTimestamp);
      await moveToArchive(
        join(testDir, 'feature_list.json'),
        firstArchivePath,
        'feature_list.json',
      );

      // Second feature list
      const secondData: FeatureList = {
        features: [
          {
            id: 'F002',
            category: 'ui',
            description: 'Second Run Feature',
            priority: 'medium',
            steps: ['Step 1'],
            passes: false,
          },
        ],
        metadata: {
          project_name: 'Second Run',
          last_updated: '2025-12-15T11:00:00.000Z',
        },
      };

      await manager.save(secondData);

      // Archive second run
      const secondTimestamp = normalizeTimestamp(
        secondData.metadata?.last_updated || '2025-12-15T11:00:00.000Z',
      );
      const secondArchivePath = join(testDir, '.runs', secondTimestamp);
      await moveToArchive(
        join(testDir, 'feature_list.json'),
        secondArchivePath,
        'feature_list.json',
      );

      // Third feature list (current)
      const thirdData: FeatureList = {
        features: [
          {
            id: 'F003',
            category: 'api',
            description: 'Third Run Feature',
            priority: 'critical',
            steps: ['Step 1'],
            passes: false,
          },
        ],
        metadata: {
          project_name: 'Third Run',
        },
      };

      await manager.save(thirdData);

      // Verify all archives exist and contain correct data
      const { readFile, readdir } = await import('fs/promises');

      const runsDir = join(testDir, '.runs');
      const archiveDirs = await readdir(runsDir);
      expect(archiveDirs.length).toBe(2);
      expect(archiveDirs).toContain(firstTimestamp);
      expect(archiveDirs).toContain(secondTimestamp);

      // Verify first archive
      const firstArchived = JSON.parse(
        await readFile(join(firstArchivePath, 'feature_list.json'), 'utf-8'),
      );
      expect(firstArchived.features[0].id).toBe('F001');
      expect(firstArchived.metadata?.project_name).toBe('First Run');

      // Verify second archive
      const secondArchived = JSON.parse(
        await readFile(join(secondArchivePath, 'feature_list.json'), 'utf-8'),
      );
      expect(secondArchived.features[0].id).toBe('F002');
      expect(secondArchived.metadata?.project_name).toBe('Second Run');

      // Verify current state
      const current = await manager.load();
      expect(current.features[0].id).toBe('F003');
      expect(current.metadata?.project_name).toBe('Third Run');
    });
  });
});
