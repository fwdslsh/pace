#!/usr/bin/env node

// Simple debug script for F039
import { ArchiveManager } from './src/archive-manager.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

async function debug() {
  try {
    const manager = new ArchiveManager();
    const result = await manager.archive({
      projectDir: process.cwd(),
      createArchiveMetadata: true,
      reason: 'debug test',
      silent: false,
      verbose: true,
    });

    console.log('Archive result:', result);

    // Check if metadata file exists
    if (result.archivePath) {
      const metadataPath = join(result.archivePath, '.archive-info.json');
      try {
        const metadata = await readFile(metadataPath, 'utf-8');
        console.log('Metadata file content:', metadata);
      } catch (error) {
        console.log('Metadata file not found:', error.message);
      }
    }
  } catch (error) {
    console.error('Debug error:', error);
  }
}

debug();
