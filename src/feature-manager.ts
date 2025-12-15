/**
 * feature-manager.ts - Feature list operations (load, save, update, query)
 */

import { readFile, writeFile, copyFile } from 'fs/promises';
import { join } from 'path';
import type { Feature, FeatureList, Priority } from './types';

export class FeatureManager {
  constructor(private projectDir: string) {}

  /**
   * Get the full path to feature_list.json
   */
  private getFeatureFilePath(): string {
    return join(this.projectDir, 'feature_list.json');
  }

  /**
   * Load feature list from feature_list.json
   */
  async load(): Promise<FeatureList> {
    try {
      const content = await readFile(this.getFeatureFilePath(), 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      if ((e as any).code === 'ENOENT') {
        return { features: [], metadata: {} };
      }
      throw new Error(`Failed to load feature list: ${e}`);
    }
  }

  /**
   * Save feature list to feature_list.json with optional backup
   */
  async save(data: FeatureList, backup: boolean = true): Promise<void> {
    const filePath = this.getFeatureFilePath();

    if (backup) {
      try {
        await copyFile(filePath, filePath + '.bak');
      } catch (e) {
        // Ignore if backup fails (file might not exist yet)
      }
    }

    // Update metadata
    const updatedData = this.updateMetadata(data);

    await writeFile(filePath, JSON.stringify(updatedData, null, 2) + '\n');
  }

  /**
   * Update metadata counts based on features
   */
  private updateMetadata(data: FeatureList): FeatureList {
    const passing = data.features.filter((f) => f.passes).length;
    const failing = data.features.filter((f) => !f.passes).length;
    const total = data.features.length;

    return {
      ...data,
      metadata: {
        ...data.metadata,
        total_features: total,
        passing,
        failing,
        last_updated: new Date().toISOString(),
      },
    };
  }

  /**
   * Get current progress as [passing, total]
   */
  async getProgress(): Promise<[number, number]> {
    const data = await this.load();
    const passing = data.features.filter((f) => f.passes).length;
    return [passing, data.features.length];
  }

  /**
   * Check if all features are passing
   */
  async isComplete(): Promise<boolean> {
    const [passing, total] = await this.getProgress();
    return total === 0 || passing === total;
  }

  /**
   * Find a feature by ID
   */
  async findFeature(featureId: string): Promise<Feature | null> {
    const data = await this.load();
    return data.features.find((f) => f.id === featureId) || null;
  }

  /**
   * Get all failing features sorted by priority
   */
  async getFailingFeatures(): Promise<Feature[]> {
    const data = await this.load();
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    const failing = data.features.filter((f) => !f.passes);
    failing.sort((a, b) => {
      const aPriority = priorityOrder[a.priority] ?? 4;
      const bPriority = priorityOrder[b.priority] ?? 4;
      return aPriority - bPriority;
    });

    return failing;
  }

  /**
   * Get the next feature to work on (highest priority failing)
   */
  async getNextFeature(): Promise<Feature | null> {
    const failing = await this.getFailingFeatures();
    return failing[0] || null;
  }

  /**
   * Update a feature's pass status
   */
  async updateFeatureStatus(featureId: string, passes: boolean): Promise<boolean> {
    const data = await this.load();
    const index = data.features.findIndex((f) => f.id === featureId);

    if (index === -1) {
      return false;
    }

    const feature = data.features[index];
    const currentStatus = feature.passes;

    // Check if this is actually a change
    if (currentStatus === passes) {
      return true; // No change needed
    }

    // Update only the passes field
    data.features[index] = { ...feature, passes };

    // Save with backup
    await this.save(data, true);

    return true;
  }

  /**
   * Check if a specific feature was completed (is passing)
   */
  async wasFeatureCompleted(featureId: string): Promise<boolean> {
    const feature = await this.findFeature(featureId);
    return feature?.passes === true;
  }

  /**
   * Get features grouped by category
   */
  async getFeaturesByCategory(): Promise<Record<string, Feature[]>> {
    const data = await this.load();
    const byCategory: Record<string, Feature[]> = {};

    for (const feature of data.features) {
      const cat = feature.category || 'uncategorized';
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat].push(feature);
    }

    return byCategory;
  }

  /**
   * Get features grouped by priority
   */
  async getFeaturesByPriority(): Promise<Record<Priority, Feature[]>> {
    const data = await this.load();
    const byPriority: Record<string, Feature[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const feature of data.features) {
      const pri = feature.priority || 'low';
      byPriority[pri].push(feature);
    }

    return byPriority as Record<Priority, Feature[]>;
  }

  /**
   * Get statistics about features
   */
  async getStats(): Promise<{
    total: number;
    passing: number;
    failing: number;
    byCategory: Record<string, { passing: number; failing: number }>;
    byPriority: Record<Priority, { passing: number; failing: number }>;
  }> {
    const data = await this.load();

    const stats = {
      total: data.features.length,
      passing: 0,
      failing: 0,
      byCategory: {} as Record<string, { passing: number; failing: number }>,
      byPriority: {
        critical: { passing: 0, failing: 0 },
        high: { passing: 0, failing: 0 },
        medium: { passing: 0, failing: 0 },
        low: { passing: 0, failing: 0 },
      } as Record<Priority, { passing: number; failing: number }>,
    };

    for (const feature of data.features) {
      // Total stats
      if (feature.passes) {
        stats.passing++;
      } else {
        stats.failing++;
      }

      // Category stats
      const cat = feature.category || 'uncategorized';
      if (!stats.byCategory[cat]) {
        stats.byCategory[cat] = { passing: 0, failing: 0 };
      }
      if (feature.passes) {
        stats.byCategory[cat].passing++;
      } else {
        stats.byCategory[cat].failing++;
      }

      // Priority stats
      const pri = feature.priority || 'low';
      if (feature.passes) {
        stats.byPriority[pri].passing++;
      } else {
        stats.byPriority[pri].failing++;
      }
    }

    return stats;
  }
}
