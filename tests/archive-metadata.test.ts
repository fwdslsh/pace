import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, stat, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { ArchiveManager } from '../src/archive-manager';

describe('F039: Archive Metadata Creation', () => {
  let tempDir: string;
  let featureListPath: string;
  let archiveManager: ArchiveManager;

  beforeEach(async () => {
    // Create temporary test directory
    tempDir = join(process.cwd(), 'test-' + Date.now());
    await mkdir(tempDir, { recursive: true });

    // Initialize ArchiveManager
    archiveManager = new ArchiveManager();

    // Create test feature_list.json with metadata
    featureListPath = join(tempDir, 'feature_list.json');
    const testFeatureList = {
      features: [
        {
          id: 'F001',
          category: 'test',
          description: 'Test feature',
          priority: 'low',
          steps: ['Step 1', 'Step 2'],
          passes: true,
        },
      ],
      metadata: {
        project_name: 'test-project',
        created_at: '2025-12-17',
        total_features: 1,
        passing: 1,
        failing: 0,
        last_updated: '2025-12-17T12:00:00.000Z',
      },
    };
    await writeFile(featureListPath, JSON.stringify(testFeatureList, null, 2));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create .archive-info.json file by default', async () => {
    const result = await archiveManager.archive({
      projectDir: tempDir,
      createArchiveMetadata: true,
      reason: 'test archive',
    });

    expect(result.archived).toBe(true);
    expect(result.archivePath).toBeTruthy();
    expect(result.archivedFiles).toContain('feature_list.json');

    // Check metadata file exists
    const metadataPath = join(result.archivePath!, '.archive-info.json');
    const metadataExists = await stat(metadataPath);
    expect(metadataExists.isFile()).toBe(true);

    // Check metadata content
    const metadataContent = await readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // Verify archive section
    expect(metadata.archive).toBeDefined();
    expect(metadata.archive.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    expect(metadata.archive.reason).toBe('test archive');
    expect(metadata.archive.files).toContain('feature_list.json');

    // Verify original metadata
    expect(metadata.originalMetadata).toBeDefined();
    expect(metadata.originalMetadata.project_name).toBe('test-project');
    expect(metadata.originalMetadata.total_features).toBe(1);
    expect(metadata.originalMetadata.passing).toBe(1);
    expect(metadata.originalMetadata.failing).toBe(0);
  });

  it('should skip .archive-info.json when disabled', async () => {
    const result = await archiveManager.archive({
      projectDir: tempDir,
      createArchiveMetadata: false,
      reason: 'test archive without metadata',
    });

    expect(result.archived).toBe(true);
    expect(result.archivePath).toBeTruthy();

    // Check metadata file does not exist
    const metadataPath = join(result.archivePath!, '.archive-info.json');
    await expect(stat(metadataPath)).rejects.toThrow('ENOENT');
  });

  it('should include correct reason in metadata', async () => {
    const result = await archiveManager.archive({
      projectDir: tempDir,
      createArchiveMetadata: true,
      reason: 'pace init --force',
    });

    const metadataPath = join(result.archivePath!, '.archive-info.json');
    const metadataContent = await readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    expect(metadata.archive.reason).toBe('pace init --force');
  });

  it('should handle missing original metadata gracefully', async () => {
    // Create feature_list.json without metadata
    const noMetadataList = {
      features: [
        {
          id: 'F001',
          category: 'test',
          description: 'Test feature',
          priority: 'low',
          steps: ['Step 1'],
          passes: true,
        },
      ],
    };
    await writeFile(featureListPath, JSON.stringify(noMetadataList, null, 2));

    const result = await archiveManager.archive({
      projectDir: tempDir,
      createArchiveMetadata: true,
      reason: 'test with no metadata',
    });

    const metadataPath = join(result.archivePath!, '.archive-info.json');
    const metadataContent = await readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    expect(metadata.originalMetadata).toBeNull();
  });

  it('should show metadata file in dry-run mode', async () => {
    // Capture console output
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };

    await archiveManager.archive({
      projectDir: tempDir,
      dryRun: true,
      createArchiveMetadata: true,
      reason: 'dry run test',
    });

    // Restore console.log
    console.log = originalLog;

    // Check that metadata file is mentioned in dry-run output
    const dryRunOutput = logs.join('\n');
    expect(dryRunOutput).toContain('.archive-info.json (metadata)');
  });

  it('should not show metadata file in dry-run when disabled', async () => {
    // Capture console output
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };

    await archiveManager.archive({
      projectDir: tempDir,
      dryRun: true,
      createArchiveMetadata: false,
      reason: 'dry run test',
    });

    // Restore console.log
    console.log = originalLog;

    // Check that metadata file is NOT mentioned in dry-run output
    const dryRunOutput = logs.join('\n');
    expect(dryRunOutput).not.toContain('.archive-info.json (metadata)');
  });
});
