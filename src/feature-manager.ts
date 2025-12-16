/**
 * feature-manager.ts - Feature list operations (load, save, update, query)
 */

import { readFile, writeFile, copyFile } from 'fs/promises';
import { join } from 'path';

import type { Feature, FeatureList, Priority } from './types';

/**
 * Priority ordering constant used for sorting features
 */
const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * All priority values in order
 */
const PRIORITY_VALUES: Priority[] = ['critical', 'high', 'medium', 'low'];

/**
 * Helper to increment passing or failing count on a stats object
 */
function incrementPassFail(target: { passing: number; failing: number }, passes: boolean): void {
  if (passes) {
    target.passing++;
  } else {
    target.failing++;
  }
}

export class FeatureManager {
  constructor(private projectDir: string) {}

  /**
   * Get the full path to feature_list.json
   */
  private getFeatureFilePath(): string {
    return join(this.projectDir, 'feature_list.json');
  }

  /**
   * Load feature list from feature_list.json.
   * Returns an empty feature list if the file does not exist.
   * @returns A promise that resolves to the loaded FeatureList
   * @throws Error if the file exists but cannot be parsed
   */
  async load(): Promise<FeatureList> {
    try {
      const content = await readFile(this.getFeatureFilePath(), 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code: string }).code === 'ENOENT'
      ) {
        return { features: [], metadata: {} };
      }
      throw new Error(`Failed to load feature list: ${e}`);
    }
  }

  /**
   * Save feature list to feature_list.json.
   * Automatically updates metadata counts before saving.
   * @param data - The FeatureList to save
   * @param backup - Whether to create a .bak backup file (default: true)
   * @returns A promise that resolves when the file is saved
   */
  async save(data: FeatureList, backup: boolean = true): Promise<void> {
    const filePath = this.getFeatureFilePath();

    if (backup) {
      try {
        await copyFile(filePath, filePath + '.bak');
      } catch {
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
   * Get current progress as a tuple of passing and total counts.
   * @returns A promise that resolves to a tuple [passing, total]
   */
  async getProgress(): Promise<[number, number]> {
    const data = await this.load();
    const passing = data.features.filter((f) => f.passes).length;
    return [passing, data.features.length];
  }

  /**
   * Check if all features are passing.
   * Returns true if there are no features or if all features pass.
   * @returns A promise that resolves to true if all features pass, false otherwise
   */
  async isComplete(): Promise<boolean> {
    const [passing, total] = await this.getProgress();
    return total === 0 || passing === total;
  }

  /**
   * Find a feature by its ID.
   * @param featureId - The unique identifier of the feature to find
   * @returns A promise that resolves to the Feature if found, or null if not found
   */
  async findFeature(featureId: string): Promise<Feature | null> {
    const data = await this.load();
    return data.features.find((f) => f.id === featureId) || null;
  }

  /**
   * Get all failing features sorted by priority.
   * Features are sorted from critical to low priority.
   * @returns A promise that resolves to an array of failing features sorted by priority
   */
  async getFailingFeatures(): Promise<Feature[]> {
    const data = await this.load();

    const failing = data.features.filter((f) => !f.passes);
    failing.sort((a, b) => {
      const aPriority = PRIORITY_ORDER[a.priority] ?? 4;
      const bPriority = PRIORITY_ORDER[b.priority] ?? 4;
      return aPriority - bPriority;
    });

    return failing;
  }

  /**
   * Get the next feature to work on.
   * Returns the highest priority failing feature.
   * @returns A promise that resolves to the next Feature to work on, or null if all features pass
   */
  async getNextFeature(): Promise<Feature | null> {
    const failing = await this.getFailingFeatures();
    return failing[0] || null;
  }

  /**
   * Update a feature's pass status.
   * Creates a backup before saving changes.
   * @param featureId - The unique identifier of the feature to update
   * @param passes - The new pass status (true for passing, false for failing)
   * @returns A promise that resolves to true if the feature was found and updated, false if not found
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
   * Check if a specific feature was completed (is passing).
   * @param featureId - The unique identifier of the feature to check
   * @returns A promise that resolves to true if the feature passes, false otherwise
   */
  async wasFeatureCompleted(featureId: string): Promise<boolean> {
    const feature = await this.findFeature(featureId);
    return feature?.passes === true;
  }

  /**
   * Get features grouped by category.
   * Features without a category are placed in 'uncategorized'.
   * @returns A promise that resolves to an object mapping category names to arrays of features
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
   * Get features grouped by priority.
   * All priority levels are included, even if empty.
   * @returns A promise that resolves to an object mapping priorities to arrays of features
   */
  async getFeaturesByPriority(): Promise<Record<Priority, Feature[]>> {
    const data = await this.load();
    const byPriority: Record<string, Feature[]> = {};

    // Initialize all priority buckets using the constant
    for (const pri of PRIORITY_VALUES) {
      byPriority[pri] = [];
    }

    for (const feature of data.features) {
      const pri = feature.priority || 'low';
      byPriority[pri].push(feature);
    }

    return byPriority as Record<Priority, Feature[]>;
  }

  /**
   * Get statistics about features.
   * Provides counts of passing/failing features overall and grouped by category and priority.
   * @returns A promise that resolves to an object containing:
   *   - total: Total number of features
   *   - passing: Number of passing features
   *   - failing: Number of failing features
   *   - byCategory: Pass/fail counts grouped by category
   *   - byPriority: Pass/fail counts grouped by priority
   */
  async getStats(): Promise<{
    total: number;
    passing: number;
    failing: number;
    byCategory: Record<string, { passing: number; failing: number }>;
    byPriority: Record<Priority, { passing: number; failing: number }>;
  }> {
    const data = await this.load();

    // Initialize byPriority stats using the constant
    const byPriority = {} as Record<Priority, { passing: number; failing: number }>;
    for (const pri of PRIORITY_VALUES) {
      byPriority[pri] = { passing: 0, failing: 0 };
    }

    const stats = {
      total: data.features.length,
      passing: 0,
      failing: 0,
      byCategory: {} as Record<string, { passing: number; failing: number }>,
      byPriority,
    };

    for (const feature of data.features) {
      // Total stats - use helper
      incrementPassFail(stats, feature.passes);

      // Category stats
      const cat = feature.category || 'uncategorized';
      if (!stats.byCategory[cat]) {
        stats.byCategory[cat] = { passing: 0, failing: 0 };
      }
      incrementPassFail(stats.byCategory[cat], feature.passes);

      // Priority stats - use helper
      const pri = feature.priority || 'low';
      incrementPassFail(stats.byPriority[pri], feature.passes);
    }

    return stats;
  }
}
