#!/usr/bin/env bun
/**
 * pace-lib.ts - Core library for PACE plugin
 *
 * Provides shared functionality for all PACE scripts and commands.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

// ============================================================================
// Types
// ============================================================================

export type Priority = "critical" | "high" | "medium" | "low";

export interface Feature {
  id: string;
  category: string;
  description: string;
  priority: Priority;
  steps: string[];
  passes: boolean;
  tags?: string[];
}

export interface FeatureListMetadata {
  project_name?: string;
  total_features?: number;
  passing?: number;
  failing?: number;
  last_updated?: string;
  [key: string]: unknown;
}

export interface FeatureList {
  features: Feature[];
  metadata?: FeatureListMetadata;
}

export interface ProgressResult {
  passing: number;
  failing: number;
  total: number;
  percentage: number;
  isComplete: boolean;
  projectName?: string;
  nextFeature: Feature | null;
  remainingFeatures: Feature[];
}

export interface ValidationError {
  featureId: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  stats: {
    total: number;
    passing: number;
    failing: number;
    byCategory: Record<string, number>;
    byPriority: Record<Priority, number>;
  };
}

export interface UpdateResult {
  success: boolean;
  changed: boolean;
  featureId: string;
  oldStatus: "passing" | "failing";
  newStatus: "passing" | "failing";
  description?: string;
  category?: string;
  priority?: Priority;
  progress: {
    passing: number;
    total: number;
    percentage: number;
  };
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const VALID_PRIORITIES: Set<Priority> = new Set([
  "critical",
  "high",
  "medium",
  "low",
]);

// ============================================================================
// File Operations
// ============================================================================

/**
 * Find feature_list.json by searching current and parent directories
 */
export function findFeatureList(startDir: string = process.cwd()): string {
  let current = resolve(startDir);
  for (let i = 0; i < 10; i++) {
    const candidate = resolve(current, "feature_list.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(startDir, "feature_list.json");
}

/**
 * Load feature list from file
 */
export function loadFeatureList(filePath?: string): FeatureList {
  const path = filePath || findFeatureList();

  if (!existsSync(path)) {
    throw new Error(`feature_list.json not found at ${path}`);
  }

  const content = readFileSync(path, "utf-8");
  return JSON.parse(content) as FeatureList;
}

/**
 * Save feature list to file with optional backup
 */
export function saveFeatureList(
  data: FeatureList,
  filePath?: string,
  backup: boolean = true
): void {
  const path = filePath || findFeatureList();

  if (backup && existsSync(path)) {
    copyFileSync(path, `${path}.bak`);
  }

  // Update metadata
  const passing = data.features.filter((f) => f.passes).length;
  const failing = data.features.length - passing;

  data.metadata = {
    ...data.metadata,
    total_features: data.features.length,
    passing,
    failing,
    last_updated: new Date().toISOString(),
  };

  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

// ============================================================================
// Feature Operations
// ============================================================================

/**
 * Sort features by priority (critical first)
 */
export function sortByPriority(features: Feature[]): Feature[] {
  return [...features].sort((a, b) => {
    const aOrder = PRIORITY_ORDER[a.priority] ?? 4;
    const bOrder = PRIORITY_ORDER[b.priority] ?? 4;
    return aOrder - bOrder;
  });
}

/**
 * Get failing features sorted by priority
 */
export function getFailingFeatures(data: FeatureList): Feature[] {
  const failing = data.features.filter((f) => !f.passes);
  return sortByPriority(failing);
}

/**
 * Get progress information
 */
export function getProgress(data: FeatureList): ProgressResult {
  const total = data.features.length;
  const passing = data.features.filter((f) => f.passes).length;
  const failing = total - passing;
  const percentage = total > 0 ? (passing / total) * 100 : 0;

  const remainingFeatures = getFailingFeatures(data);
  const nextFeature = remainingFeatures[0] || null;

  return {
    passing,
    failing,
    total,
    percentage: Math.round(percentage * 10) / 10,
    isComplete: failing === 0,
    projectName: data.metadata?.project_name,
    nextFeature,
    remainingFeatures,
  };
}

/**
 * Find a feature by ID
 */
export function findFeature(data: FeatureList, featureId: string): Feature | null {
  return data.features.find((f) => f.id === featureId) || null;
}

/**
 * Update a feature's status
 */
export function updateFeatureStatus(
  featureId: string,
  passes: boolean,
  filePath?: string
): UpdateResult {
  const path = filePath || findFeatureList();

  try {
    const data = loadFeatureList(path);
    const featureIndex = data.features.findIndex((f) => f.id === featureId);

    if (featureIndex === -1) {
      return {
        success: false,
        changed: false,
        featureId,
        oldStatus: "failing",
        newStatus: passes ? "passing" : "failing",
        progress: { passing: 0, total: 0, percentage: 0 },
        error: `Feature '${featureId}' not found`,
      };
    }

    const feature = data.features[featureIndex];
    const oldStatus = feature.passes ? "passing" : "failing";
    const newStatus = passes ? "passing" : "failing";

    if (feature.passes === passes) {
      const progress = getProgress(data);
      return {
        success: true,
        changed: false,
        featureId,
        oldStatus,
        newStatus,
        description: feature.description,
        category: feature.category,
        priority: feature.priority,
        progress: {
          passing: progress.passing,
          total: progress.total,
          percentage: progress.percentage,
        },
      };
    }

    // Update the feature
    data.features[featureIndex] = { ...feature, passes };

    // Save with backup
    saveFeatureList(data, path, true);

    const progress = getProgress(data);

    return {
      success: true,
      changed: true,
      featureId,
      oldStatus,
      newStatus,
      description: feature.description,
      category: feature.category,
      priority: feature.priority,
      progress: {
        passing: progress.passing,
        total: progress.total,
        percentage: progress.percentage,
      },
    };
  } catch (error) {
    return {
      success: false,
      changed: false,
      featureId,
      oldStatus: "failing",
      newStatus: passes ? "passing" : "failing",
      progress: { passing: 0, total: 0, percentage: 0 },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate feature list structure
 */
export function validateFeatureList(data: FeatureList): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const seenIds = new Set<string>();

  const requiredFields = ["id", "category", "description", "priority", "passes"];

  for (let i = 0; i < data.features.length; i++) {
    const feature = data.features[i];
    const fid = feature.id || `index_${i}`;

    // Check required fields
    for (const field of requiredFields) {
      if (!(field in feature)) {
        errors.push({ featureId: fid, field, message: `Missing required field` });
      } else if ((feature as Record<string, unknown>)[field] === null) {
        errors.push({ featureId: fid, field, message: `Field is null` });
      }
    }

    // Check priority
    if (feature.priority && !VALID_PRIORITIES.has(feature.priority as Priority)) {
      errors.push({
        featureId: fid,
        field: "priority",
        message: `Invalid priority '${feature.priority}'. Must be: critical, high, medium, low`,
      });
    }

    // Check passes is boolean
    if ("passes" in feature && typeof feature.passes !== "boolean") {
      errors.push({
        featureId: fid,
        field: "passes",
        message: `'passes' must be boolean, got ${typeof feature.passes}`,
      });
    }

    // Check description
    if (feature.description !== undefined) {
      if (typeof feature.description !== "string") {
        errors.push({ featureId: fid, field: "description", message: "Must be string" });
      } else if (feature.description.trim().length === 0) {
        errors.push({ featureId: fid, field: "description", message: "Empty description" });
      }
    }

    // Check steps
    if (!feature.steps || feature.steps.length === 0) {
      warnings.push({ featureId: fid, field: "steps", message: "No verification steps" });
    } else if (!Array.isArray(feature.steps)) {
      errors.push({ featureId: fid, field: "steps", message: "Steps must be array" });
    }

    // Check duplicate IDs
    if (feature.id) {
      if (seenIds.has(feature.id)) {
        errors.push({ featureId: fid, field: "id", message: "Duplicate feature ID" });
      }
      seenIds.add(feature.id);
    }
  }

  // Calculate stats
  const passing = data.features.filter((f) => f.passes).length;
  const byCategory: Record<string, number> = {};
  const byPriority: Record<Priority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const feature of data.features) {
    const cat = feature.category || "uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + 1;

    const pri = feature.priority || "low";
    if (pri in byPriority) {
      byPriority[pri as Priority]++;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      total: data.features.length,
      passing,
      failing: data.features.length - passing,
      byCategory,
      byPriority,
    },
  };
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format a progress bar
 */
export function formatProgressBar(passing: number, total: number, width: number = 40): string {
  if (total === 0) return "";
  const pct = passing / total;
  const filled = Math.floor(width * pct);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${passing}/${total} (${(pct * 100).toFixed(1)}%)`;
}

/**
 * Get priority icon
 */
export function getPriorityIcon(priority: Priority): string {
  const icons: Record<Priority, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
  };
  return icons[priority] || "⚪";
}
